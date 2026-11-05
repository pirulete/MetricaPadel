import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { getTournamentById } from "@/lib/db/queries/torneos";
import { buildInstance } from "@/lib/db/queries/torneos/instance";
import { createRun, listRecentRuns } from "@/lib/db/queries/torneos/runs";
import { computeSemaforo } from "@/lib/motor-torneo/diagnostics";
import { dispatchRun } from "@/lib/torneos/dispatch";
import { clampTimeLimit } from "@/lib/torneos/limits";
import { padelIdParamsSchema } from "@/lib/validations/padel";
import {
  ACADEMY_INVITE_MAX,
  ACADEMY_INVITE_WINDOW_MS,
  checkPublicRateLimit,
  extractIP,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { generateAgendaSchema } from "@/lib/validations/torneos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/torneos/[id]/agenda — encola la generación de la agenda (§6.4).
 *
 * 404 torneo ajeno/inexistente (anti-IDOR) · 409 `archived` (EC-13) ·
 * 422 `infeasible_occupancy` **sin crear run** (EC-01) · 409 `run_active`
 * (índice UNIQUE parcial ⇒ 23505, EC-11) · 202 `{ runId, status:'queued' }`.
 *
 * `timeLimitMs` se clampa server-side (`lib/torneos/limits.ts`): el body nunca
 * bypassa el techo (AC-09). El run persiste el snapshot completo de params.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const ip = extractIP(request);
    const rate = checkPublicRateLimit(`torneos-agenda:${ip}`, {
      max: ACADEMY_INVITE_MAX,
      windowMs: ACADEMY_INVITE_WINDOW_MS,
    });
    if (!rate.allowed) return rateLimitedResponse(rate.resetTime, ACADEMY_INVITE_MAX);

    const { id } = padelIdParamsSchema.parse(await params);
    const ownerId = session!.user.id as string;

    const tournament = await getTournamentById(id, ownerId);
    if (!tournament) {
      return NextResponse.json(
        { error: "Torneo no encontrado" },
        { status: 404 },
      );
    }
    if (tournament.status === "archived") {
      return NextResponse.json(
        { error: "El torneo está archivado", code: "archived" },
        { status: 409 },
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
    const { timeLimitMs: requestedTimeLimit, mipRelGap, force } =
      generateAgendaSchema.parse(body);

    const inst = await buildInstance(id, ownerId);
    if (!inst) {
      return NextResponse.json(
        { error: "Torneo no encontrado" },
        { status: 404 },
      );
    }

    // Pre-check sin escribir: ρ > 1 en cualquier fase ⇒ 422 sin crear run.
    const semaforo = computeSemaforo(inst);
    const overflow =
      semaforo.previa.occupancy > 1 || semaforo.final.occupancy > 1;
    if (overflow && force !== true) {
      return NextResponse.json(
        {
          error:
            "La ocupación declarada excede las casillas disponibles. Usa force para intentarlo igualmente.",
          code: "infeasible_occupancy",
          semaforo,
        },
        { status: 422 },
      );
    }

    const timeLimitMs = clampTimeLimit(requestedTimeLimit);
    const baseParams =
      tournament.params && typeof tournament.params === "object"
        ? (tournament.params as Record<string, unknown>)
        : {};
    const runParams: Record<string, unknown> = { ...baseParams, timeLimitMs };
    if (mipRelGap !== undefined) runParams.mipRelGap = mipRelGap;

    const created = await createRun({
      tournamentId: id,
      requestedBy: ownerId,
      params: runParams,
    });
    if (!created.ok) {
      const active = (await listRecentRuns(id, 5)).find(
        (run) => run.status === "queued" || run.status === "running",
      );
      return NextResponse.json(
        {
          error: "Ya hay una corrida en curso para este torneo",
          code: "run_active",
          activeRunId: active?.runId ?? null,
        },
        { status: 409 },
      );
    }

    await auditCreate(
      "tournament_run",
      created.run.id,
      { tournamentId: id, timeLimitMs, mipRelGap: mipRelGap ?? null },
      { userId: ownerId, ...extractRequestContext(request) },
    );

    // Fire-and-forget: el 202 no espera al solver (§6.4.1).
    void dispatchRun(created.run.id, { baseUrl: request.nextUrl.origin });

    return NextResponse.json(
      { runId: created.run.id, status: "queued" },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[torneos/[id]/agenda] Error en POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
