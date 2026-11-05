import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { getRun, isTerminalRunStatus, reapStaleRuns } from "@/lib/db/queries/torneos/runs";
import { getTournamentById } from "@/lib/db/queries/torneos";
import { dispatchRun } from "@/lib/torneos/dispatch";
import { padelIdParamsSchema } from "@/lib/validations/padel";
import { runQuerySchema } from "@/lib/validations/torneos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runParamsSchema = padelIdParamsSchema.extend({
  runId: z.string().uuid("runId debe ser un uuid válido"),
});

/**
 * GET /api/torneos/[id]/runs/[runId] — polling del job (§6.6).
 *
 * `{ run }` con estado/métricas/diagnóstico; `?include=slots` añade la agenda
 * del run (partido, bloque, cancha, día y hora del bloque). Un run no terminal
 * devuelve `slots: []` y `slotsCount: 0`.
 *
 * Anti-IDOR: el torneo debe ser del owner **y** el run debe pertenecer a ese
 * torneo ⇒ ajeno/inexistente = 404 (nunca 403). Efecto lateral: reaper perezoso
 * de runs vencidos (§4.4) antes de leer, con re-despacho fire-and-forget.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id, runId } = runParamsSchema.parse(await params);
    const ownerId = session!.user.id as string;
    const { include } = runQuerySchema.parse({
      include: request.nextUrl.searchParams.get("include") ?? undefined,
    });

    // Ownership primero: el reaper escribe, nunca sobre un torneo ajeno.
    const tournament = await getTournamentById(id, ownerId);
    if (!tournament) {
      return NextResponse.json(
        { error: "Torneo no encontrado" },
        { status: 404 },
      );
    }

    const reaped = await reapStaleRuns(id);
    for (const runIdToRedispatch of reaped.redispatched) {
      void dispatchRun(runIdToRedispatch, { baseUrl: request.nextUrl.origin });
    }

    const run = await getRun(runId, {
      tournamentId: id,
      includeSlots: include === "slots",
    });
    if (!run) {
      return NextResponse.json({ error: "Run no encontrado" }, { status: 404 });
    }

    const finished = isTerminalRunStatus(run.status);
    return NextResponse.json(
      {
        run: {
          ...run,
          slotsCount: finished ? run.slotsCount : 0,
          ...(include === "slots" && !finished ? { slots: [] } : {}),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[torneos/[id]/runs/[runId]] Error en GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
