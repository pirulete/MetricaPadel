import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { db } from "@/lib/db";
import { tournamentMatches } from "@/lib/db/schema";
import { buildInstance } from "@/lib/db/queries/torneos/instance";
import { claimRun, finishRun } from "@/lib/db/queries/torneos/runs";
import { computeDiagnosis } from "@/lib/motor-torneo/diagnostics";
import { runEngine } from "@/lib/motor-torneo/engine";
import { DEFAULT_PARAMS } from "@/lib/motor-torneo/objective";
import type { TournamentParams } from "@/lib/motor-torneo/types";
import { clampTimeLimit } from "@/lib/torneos/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** El solve puede usar hasta 240 s + build/persistencia (§6.5). */
export const maxDuration = 300;

const workerBodySchema = z.object({ runId: z.string().uuid() });

/** Digests de longitud constante ⇒ `timingSafeEqual` sin `RangeError`. */
function secretsMatch(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

/**
 * POST /api/internal/tournament-worker — worker del motor (§6.5).
 *
 * Secreto (`x-worker-secret`) → claim atómico → `buildInstance` → `runEngine`
 * → `finishRun` (1 transacción). Sin sesión ni `guardAdmin`: no acepta cookie
 * como alternativa al secreto. Nunca loguea ni devuelve el secreto.
 *
 * 200 `{ runId, status, timeMs }` · 400 `invalid_body` · 401 · 409
 * `not_claimed` · 503 `worker_not_configured` (fail-closed).
 */
export async function POST(request: NextRequest) {
  const expected = process.env.TOURNAMENT_WORKER_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Worker no configurado", code: "worker_not_configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-worker-secret") ?? "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido", code: "invalid_body" },
      { status: 400 },
    );
  }

  const parsed = workerBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", code: "invalid_body", details: parsed.error.errors },
      { status: 400 },
    );
  }

  const run = await claimRun(parsed.data.runId);
  if (!run) {
    return NextResponse.json(
      { error: "La corrida no estaba en cola", code: "not_claimed" },
      { status: 409 },
    );
  }

  const failRun = async (code: string, message?: string) => {
    const finished = await finishRun(run.id, {
      status: "failed",
      error: { code, message },
      slots: [],
    });
    return finished;
  };

  try {
    const inst = await buildInstance(run.tournamentId, run.requestedBy);
    if (!inst) {
      await failRun("instance_build_failed");
      return NextResponse.json(
        { error: "No se pudo construir la instancia", code: "instance_build_failed" },
        { status: 500 },
      );
    }

    const runParams = (run.params ?? {}) as Record<string, unknown>;
    const params: TournamentParams = {
      ...DEFAULT_PARAMS,
      ...(runParams as Partial<TournamentParams>),
    };

    const result = await runEngine(inst, params, {
      timeLimitMs: clampTimeLimit(
        typeof runParams.timeLimitMs === "number" ? runParams.timeLimitMs : undefined,
      ),
      mipRelGap:
        typeof runParams.mipRelGap === "number" ? runParams.mipRelGap : undefined,
    });

    const { status: engineStatus, objective, mipGap, timeMs } = result.diagnostico;
    const diagnostics = computeDiagnosis(inst, {
      status: engineStatus,
      objective,
      mipGap,
      timeMs,
      bloqueDe: result.bloqueDe,
      canchaDe: result.canchaDe,
      params,
      verificationErrors: result.verificacion.errores,
    });

    // `bloqueDe` viene indexado por código de partido; los slots guardan la FK.
    const matchRows = await db
      .select({ id: tournamentMatches.id, code: tournamentMatches.code })
      .from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, run.tournamentId));
    const idByCode = new Map(matchRows.map((row) => [row.code, row.id]));

    const slots = Object.entries(result.bloqueDe).flatMap(([code, blockIdx]) => {
      const matchId = idByCode.get(code);
      const court = result.canchaDe[code];
      return matchId === undefined || court === undefined
        ? []
        : [{ matchId, blockIdx, court }];
    });

    const solved =
      engineStatus === "optimal" || engineStatus === "feasible_time_limit";
    const verifyErrors = result.verificacion.errores;

    const terminal =
      solved && verifyErrors.length === 0
        ? { status: "succeeded" as const, error: null }
        : solved
          ? {
              status: "invalid" as const,
              error: {
                code: "verification_failed",
                message: `${verifyErrors.length} errores del verificador`,
              },
            }
          : engineStatus === "infeasible"
            ? { status: "infeasible" as const, error: null }
            : {
                status: "failed" as const,
                error: { code: "solver_error", message: result.diagnostico.message },
              };

    const withSlots = terminal.status === "succeeded" || terminal.status === "invalid";
    const finished = await finishRun(run.id, {
      status: terminal.status,
      engineStatus,
      objective,
      mipGap,
      timeMs,
      diagnostics,
      error: terminal.error,
      slots: withSlots ? slots : [],
    });

    if (!finished.ok) {
      // El reaper ya cerró el run: no hay nada que persistir (idempotente).
      return NextResponse.json(
        { error: "La corrida ya no está en ejecución", code: "not_claimed" },
        { status: 409 },
      );
    }

    // El cierre del run es la mutación sensible; la fila es el rastro principal
    // (§4.3). H8: auditoría fuera de la transacción — patrón aceptado del repo.
    try {
      await auditUpdate(
        "tournament_run",
        run.id,
        { status: "running" },
        {
          status: finished.run.status,
          slotsCount: finished.slotsCount,
          timeMs,
          error: terminal.error?.code ?? null,
        },
        { userId: run.requestedBy, ...extractRequestContext(request) },
      );
    } catch (auditError) {
      console.error("[tournament-worker] Auditoría falló", run.id, auditError);
    }

    return NextResponse.json(
      {
        runId: run.id,
        status: finished.run.status,
        timeMs,
        slotsCount: finished.slotsCount,
        verifyErrors: verifyErrors.length,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[tournament-worker] Error al ejecutar el run", run.id, error);
    try {
      await failRun("engine_unavailable");
    } catch (finishError) {
      console.error("[tournament-worker] No se pudo cerrar el run", run.id, finishError);
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
