import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { importTournament, listTournaments } from "@/lib/db/queries/torneos";
import { parseTournamentInput } from "@/lib/motor-torneo/loader";
import {
  ACADEMY_INVITE_MAX,
  ACADEMY_INVITE_WINDOW_MS,
  checkPublicRateLimit,
  extractIP,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { paginationQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Techo del import: el JSON viaja entero antes de que R6 lo evalúe (§5). */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Códigos del cargador que no son un error de forma sino una instancia
 * imposible de agendar (R0/R6) ⇒ 422 en lugar de 400 (§6.1).
 */
const UNPROCESSABLE_CODES: ReadonlySet<string> = new Set([
  "instance_too_large",
  "match_without_allowed_block",
]);

/**
 * GET /api/torneos — lista torneos del coach (scoped por `ownerId`).
 * Paginación por cursor (G15): `?limit=&cursor=` ⇒ `{ items, nextCursor }`.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const query = paginationQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listTournaments(session!.user.id as string, {
      limit: query.limit,
      cursor: query.cursor,
    });

    return NextResponse.json(
      { items: result.items, nextCursor: result.nextCursor },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[torneos] Error en GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/torneos — import del JSON canónico §6.
 *
 * Pipeline: cargador puro (`parseTournamentInput`) → persistencia atómica
 * (`importTournament`, 1 transacción) → auditoría. El cargador es la autoridad
 * de negocio; `importTournament` revalida por defensa en profundidad.
 *
 * 201 `{ tournamentId, counts }` · 400 forma/reglas · 422 R0/R6.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const ip = extractIP(request);
    const rate = checkPublicRateLimit(`torneos-import:${ip}`, {
      max: ACADEMY_INVITE_MAX,
      windowMs: ACADEMY_INVITE_WINDOW_MS,
    });
    if (!rate.allowed) return rateLimitedResponse(rate.resetTime, ACADEMY_INVITE_MAX);

    const declaredBytes = Number(request.headers.get("content-length") ?? 0);
    if (declaredBytes > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        { error: "Payload demasiado grande", code: "payload_too_large" },
        { status: 413 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "JSON inválido", code: "invalid_json" },
        { status: 400 },
      );
    }

    const loaded = parseTournamentInput(body);
    if (!loaded.ok) {
      // O-m5: el `code` debe pertenecer a la clase del status. Con errores
      // mezclados se expone el primer 422; sin ninguno, `invalid_instance`.
      const firstUnprocessable = loaded.errors.find((error) =>
        UNPROCESSABLE_CODES.has(error.code),
      );
      const unprocessable = firstUnprocessable !== undefined;
      return NextResponse.json(
        {
          error: unprocessable
            ? "El torneo no se puede agendar con este calendario"
            : "El torneo no es válido",
          code: firstUnprocessable?.code ?? "invalid_instance",
          details: loaded.errors,
        },
        { status: unprocessable ? 422 : 400 },
      );
    }

    const ownerId = session!.user.id as string;
    const imported = await importTournament(ownerId, loaded.data);
    if (!imported.ok) {
      return NextResponse.json(
        { error: "El torneo no es válido", details: imported.errors },
        { status: 400 },
      );
    }

    await auditCreate(
      "tournament",
      imported.tournamentId,
      { name: loaded.data.meta.name, ...imported.counts },
      { userId: ownerId, ...extractRequestContext(request) },
    );

    return NextResponse.json(
      { tournamentId: imported.tournamentId, counts: imported.counts },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[torneos] Error en POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
