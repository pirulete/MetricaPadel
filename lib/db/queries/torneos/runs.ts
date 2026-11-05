/**
 * Ciclo de vida de `tournament_runs` (technical-design §4.4).
 *
 * Máquina de estados:
 *   —→ queued → running → succeeded | infeasible | invalid | failed
 *   queued → queued   (re-dispatch, ≤ 2 intentos)
 *   queued → failed   (reaper: dispatch_failed)
 *   running → failed  (reaper: worker_crash)
 *
 * Garantías:
 * - 1 solo run activo por torneo: índice UNIQUE **parcial** en DB ⇒ 23505 ⇒
 *   `run_active` (409). No se valida con un SELECT previo (carrera).
 * - `claimRun` es atómico e idempotente (`UPDATE … WHERE status='queued'`).
 * - `finishRun` es UNA transacción: estado terminal + slots + `tournaments`
 *   a `agenda_draft`. Nunca queda una agenda parcial.
 * - El reaper es perezoso (sin cron) e idempotente: solo escribe si el run
 *   está vencido y vuelve a filtrar por estado en el WHERE.
 */
import { db } from "@/lib/db";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import {
  REAPER_ABANDON_TIMEOUT_MS,
  REAPER_CLAIM_TIMEOUT_MS,
  REAPER_MAX_DISPATCH_ATTEMPTS,
  REAPER_WORKER_CRASH_TIMEOUT_MS,
} from "@/lib/torneos/limits";
import {
  tournamentAgendaSlots,
  tournamentBlocks,
  tournamentCategories,
  tournamentMatches,
  tournamentRuns,
  tournaments,
} from "@/lib/db/schema";
import type { TournamentRun, TournamentRunStatus } from "@/lib/db/schema";
import type { Diagnosis } from "@/lib/motor-torneo/types";
import { resolveLimit } from "../padel/pagination";
import { getTournamentById } from "./tournaments";

// ---------------------------------------------------------------------------
// Constantes de la máquina de estados / reaper
// ---------------------------------------------------------------------------

export const TERMINAL_RUN_STATUSES = [
  "succeeded",
  "infeasible",
  "failed",
  "invalid",
] as const;

export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<
  TournamentRunStatus,
  readonly TournamentRunStatus[]
> = {
  queued: ["queued", "running", "failed"],
  running: ["succeeded", "infeasible", "invalid", "failed"],
  succeeded: [],
  infeasible: [],
  failed: [],
  invalid: [],
};

export function isTerminalRunStatus(
  status: TournamentRunStatus,
): status is TerminalRunStatus {
  return (TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}

/** Validación de transición (defensa en profundidad: no triggers en DB). */
export function canTransitionRun(
  from: TournamentRunStatus,
  to: TournamentRunStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type RunError = { code: string; message?: string };

/** `numeric` de Postgres llega como string ⇒ se normaliza a `number`. */
function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * DTO de polling **congelado** al contrato §6.6 (`technical-design-v2` §a.9,
 * O-m11-ii): sin `tournamentId`/`createdAt`/`dispatchAttempts` y con
 * `diagnostics` tipado. `slots` solo aparece en `GET .../runs/[runId]?include=slots`.
 */
export type RunSummary = {
  runId: string;
  status: TournamentRunStatus;
  engineStatus: string | null;
  objective: number | null;
  mipGap: number | null;
  timeMs: number | null;
  slotsCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: RunError | null;
  diagnostics: Diagnosis | null;
};

/** Mapper puro fila → DTO de polling (`GET .../runs/[runId]`, §6.6). */
export function toRunSummary(run: TournamentRun): RunSummary {
  const error = run.error as RunError | null;
  return {
    runId: run.id,
    status: run.status,
    engineStatus: run.engineStatus,
    objective: toNumber(run.objective),
    mipGap: toNumber(run.mipGap),
    timeMs: run.timeMs,
    slotsCount: run.slotsCount,
    error: error && typeof error.code === "string" ? error : null,
    diagnostics: (run.diagnostics ?? null) as Diagnosis | null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

export type RunSlot = {
  matchId: string;
  code: string;
  categoryCode: string;
  phase: string;
  round: string;
  blockIdx: number;
  court: number;
  /** Día del bloque (`Jue`, `Vie`…) — la grilla pinta día/hora, no el idx. */
  dayLabel: string;
  /** Hora de inicio del bloque (`HH:mm`). */
  startTime: string;
};

export type RunDetail = RunSummary & { slots?: RunSlot[] };

// ---------------------------------------------------------------------------
// createRun
// ---------------------------------------------------------------------------

export type CreateRunInput = {
  tournamentId: string;
  requestedBy: string;
  /** Snapshot completo del torneo + `timeLimitMs` + `mipRelGap` (§4.2). */
  params: Record<string, unknown>;
};

export type CreateRunResult =
  | { ok: true; run: TournamentRun }
  | { ok: false; reason: "run_active"; message?: string };

/** Código SQLSTATE del primer `code` de la cadena de causas (drizzle envuelve). */
function sqlState(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Encola una corrida. El índice parcial `tournament_runs_active_uq` es la
 * garantía real del 409: si ya hay `queued`/`running`, el INSERT falla con
 * 23505 y se traduce a `run_active`. Cualquier otro error se propaga.
 */
export async function createRun(
  input: CreateRunInput,
): Promise<CreateRunResult> {
  try {
    const [run] = await db
      .insert(tournamentRuns)
      .values({
        tournamentId: input.tournamentId,
        requestedBy: input.requestedBy,
        status: "queued",
        params: input.params,
      })
      .returning();
    return { ok: true, run };
  } catch (error) {
    if (sqlState(error) === "23505") {
      // Solo la UNIQUE parcial (1 run activo) es esperable aquí.
      return {
        ok: false,
        reason: "run_active",
        message: "Ya hay una corrida en curso para este torneo.",
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// claimRun
// ---------------------------------------------------------------------------

/**
 * Claim atómico del worker: `queued → running`. Devuelve la fila reclamada, o
 * `null` si el run ya no estaba `queued` (idempotente: reintentar es seguro y
 * el handler responde 409 `not_claimed`).
 */
export async function claimRun(runId: string): Promise<TournamentRun | null> {
  const [run] = await db
    .update(tournamentRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(
      and(eq(tournamentRuns.id, runId), eq(tournamentRuns.status, "queued")),
    )
    .returning();
  return run ?? null;
}

// ---------------------------------------------------------------------------
// finishRun
// ---------------------------------------------------------------------------

export type FinishRunInput = {
  status: TerminalRunStatus;
  engineStatus?: string | null;
  objective?: number | string | null;
  mipGap?: number | string | null;
  timeMs?: number | null;
  diagnostics?: unknown;
  error?: RunError | null;
  /** Solo `succeeded`/`invalid` traen slots (`infeasible`/`failed` ⇒ 0). */
  slots?: Array<{ matchId: string; blockIdx: number; court: number }>;
};

export type FinishRunResult =
  | { ok: true; run: TournamentRun; slotsCount: number }
  | { ok: false; reason: "not_running" | "invalid_transition" };

/**
 * Cierre del run en UNA transacción: estado terminal + métricas + batch de
 * slots + `tournaments.status = 'agenda_draft'` (solo `succeeded`/`invalid`,
 * §4.3). Si el UPDATE no encuentra la fila (ya cerrada por el reaper) ⇒
 * `not_running`: nunca se escriben slots huérfanos.
 */
export async function finishRun(
  runId: string,
  input: FinishRunInput,
): Promise<FinishRunResult> {
  if (!canTransitionRun("running", input.status)) {
    return { ok: false, reason: "invalid_transition" };
  }
  const slots = input.slots ?? [];
  const now = new Date();

  const run = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tournamentRuns)
      .set({
        status: input.status,
        engineStatus: input.engineStatus ?? null,
        objective:
          input.objective === undefined || input.objective === null
            ? null
            : String(input.objective),
        mipGap:
          input.mipGap === undefined || input.mipGap === null
            ? null
            : String(input.mipGap),
        timeMs: input.timeMs ?? null,
        diagnostics: input.diagnostics ?? null,
        error: input.error ?? null,
        slotsCount: slots.length,
        finishedAt: now,
      })
      .where(
        and(
          eq(tournamentRuns.id, runId),
          eq(tournamentRuns.status, "running"),
        ),
      )
      .returning();
    if (!updated) return null;

    if (slots.length > 0) {
      await tx.insert(tournamentAgendaSlots).values(
        slots.map((slot) => ({
          runId: updated.id,
          matchId: slot.matchId,
          blockIdx: slot.blockIdx,
          court: slot.court,
        })),
      );
    }

    if (updated.status === "succeeded" || updated.status === "invalid") {
      await tx
        .update(tournaments)
        .set({ status: "agenda_draft", updatedAt: now })
        .where(
          and(
            eq(tournaments.id, updated.tournamentId),
            ne(tournaments.status, "archived"),
          ),
        );
    }

    return updated;
  });

  if (!run) return { ok: false, reason: "not_running" };
  return { ok: true, run, slotsCount: slots.length };
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/** Clamp del listado de runs (1..50): nunca 0 filas por `limit=0`. */
export function clampRunListLimit(limit?: number): number {
  return Math.max(1, resolveLimit(limit));
}

export type GetRunOptions = {
  /** Filtro anti-IDOR: el run debe pertenecer a este torneo. */
  tournamentId?: string;
  /** Anti-IDOR real: el torneo debe ser del owner (404 si no). */
  ownerId?: string;
  includeSlots?: boolean;
};

/** Run + (opcional) slots con los campos que pinta la grilla (`§6.6`). */
export async function getRun(
  runId: string,
  options: GetRunOptions = {},
): Promise<RunDetail | null> {
  const conditions = [eq(tournamentRuns.id, runId)];
  if (options.tournamentId) {
    conditions.push(eq(tournamentRuns.tournamentId, options.tournamentId));
  }

  const [run] = await db
    .select()
    .from(tournamentRuns)
    .where(and(...conditions))
    .limit(1);
  if (!run) return null;

  if (options.ownerId) {
    const tournament = await getTournamentById(run.tournamentId, options.ownerId);
    if (!tournament) return null;
  }

  const summary = toRunSummary(run);
  if (!options.includeSlots) return summary;

  const slots = await db
    .select({
      matchId: tournamentAgendaSlots.matchId,
      code: tournamentMatches.code,
      categoryCode: tournamentCategories.code,
      phase: tournamentMatches.phase,
      round: tournamentMatches.round,
      blockIdx: tournamentAgendaSlots.blockIdx,
      court: tournamentAgendaSlots.court,
      dayLabel: tournamentBlocks.dayLabel,
      startTime: tournamentBlocks.startTime,
    })
    .from(tournamentAgendaSlots)
    .innerJoin(
      tournamentMatches,
      eq(tournamentAgendaSlots.matchId, tournamentMatches.id),
    )
    .innerJoin(
      tournamentCategories,
      eq(tournamentMatches.categoryId, tournamentCategories.id),
    )
    .innerJoin(
      tournamentBlocks,
      and(
        eq(tournamentBlocks.tournamentId, run.tournamentId),
        eq(tournamentBlocks.idx, tournamentAgendaSlots.blockIdx),
      ),
    )
    .where(eq(tournamentAgendaSlots.runId, runId))
    .orderBy(
      asc(tournamentAgendaSlots.blockIdx),
      asc(tournamentAgendaSlots.court),
    );

  return { ...summary, slots };
}

/** Últimos runs del torneo (sin slots), más recientes primero. */
export async function listRecentRuns(
  tournamentId: string,
  limit?: number,
): Promise<RunSummary[]> {
  const rows = await db
    .select()
    .from(tournamentRuns)
    .where(eq(tournamentRuns.tournamentId, tournamentId))
    .orderBy(desc(tournamentRuns.createdAt))
    .limit(clampRunListLimit(limit));
  return rows.map(toRunSummary);
}

/** Estados de un run con agenda publicable (`agenda_draft`, §4.3). */
export const CURRENT_RUN_STATUSES = ["succeeded", "invalid"] as const;

/**
 * `currentRun` del detalle (§6.3): último `succeeded|invalid` por query directa.
 * No se deriva de `listRecentRuns(limit 20)`: con ≥20 corridas posteriores el
 * run vigente quedaba fuera de la ventana (`technical-design-v2` §a.8, O-m6).
 */
export async function getCurrentRun(
  tournamentId: string,
): Promise<RunSummary | null> {
  const [run] = await db
    .select()
    .from(tournamentRuns)
    .where(
      and(
        eq(tournamentRuns.tournamentId, tournamentId),
        inArray(tournamentRuns.status, [...CURRENT_RUN_STATUSES]),
      ),
    )
    .orderBy(desc(tournamentRuns.createdAt))
    .limit(1);
  return run ? toRunSummary(run) : null;
}

/**
 * `activeRun` del detalle (§6.3): el `queued|running` del torneo (a lo sumo 1,
 * índice UNIQUE parcial). Query directa: no depende de ninguna ventana de filas.
 */
export async function getActiveRun(
  tournamentId: string,
): Promise<RunSummary | null> {
  const [run] = await db
    .select()
    .from(tournamentRuns)
    .where(
      and(
        eq(tournamentRuns.tournamentId, tournamentId),
        inArray(tournamentRuns.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(tournamentRuns.createdAt))
    .limit(1);
  return run ? toRunSummary(run) : null;
}

// ---------------------------------------------------------------------------
// Reaper (perezoso, idempotente)
// ---------------------------------------------------------------------------

export type ActiveRunSnapshot = {
  id: string;
  status: "queued" | "running";
  dispatchAttempts: number;
  createdAt: Date | string;
  startedAt: Date | string | null;
};

export type ReapAction =
  | "none"
  | "redispatch"
  | "dispatch_failed"
  | "worker_crash";

export type ReapDecision = { runId: string; action: ReapAction };

export type ReapOptions = {
  claimTimeoutMs?: number;
  abandonTimeoutMs?: number;
  maxDispatchAttempts?: number;
  workerCrashTimeoutMs?: number;
};

function toMillis(value: Date | string | null): number | null {
  if (value === null) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * Decisión pura (sin DB) del reaper para un run activo.
 *
 * | Desde | Condición | Acción |
 * |---|---|---|
 * | queued | attempts ≥ 2 **o** edad > 300 s | `dispatch_failed` |
 * | queued | edad > 90 s | `redispatch` |
 * | running | `startedAt` > maxDuration + 60 s | `worker_crash` |
 */
export function decideReapAction(
  run: ActiveRunSnapshot,
  now: Date,
  options: ReapOptions = {},
): ReapDecision {
  const nowMs = now.getTime();

  if (run.status === "running") {
    const startedAt = toMillis(run.startedAt) ?? toMillis(run.createdAt);
    const crashTimeoutMs =
      options.workerCrashTimeoutMs ?? REAPER_WORKER_CRASH_TIMEOUT_MS;
    const action: ReapAction =
      startedAt !== null && nowMs - startedAt > crashTimeoutMs
        ? "worker_crash"
        : "none";
    return { runId: run.id, action };
  }

  const createdAt = toMillis(run.createdAt);
  if (createdAt === null) return { runId: run.id, action: "none" };

  const age = nowMs - createdAt;
  const maxAttempts = options.maxDispatchAttempts ?? REAPER_MAX_DISPATCH_ATTEMPTS;
  const abandonTimeoutMs = options.abandonTimeoutMs ?? REAPER_ABANDON_TIMEOUT_MS;
  const claimTimeoutMs = options.claimTimeoutMs ?? REAPER_CLAIM_TIMEOUT_MS;

  if (run.dispatchAttempts >= maxAttempts || age > abandonTimeoutMs) {
    return { runId: run.id, action: "dispatch_failed" };
  }
  if (age > claimTimeoutMs) return { runId: run.id, action: "redispatch" };
  return { runId: run.id, action: "none" };
}

export type ReapResult = {
  /** Runs que el caller debe re-despachar (`lib/torneos/dispatch.ts`). */
  redispatched: string[];
  /** Runs marcados terminales por el reaper. */
  failed: string[];
};

/**
 * Reaper perezoso: se invoca desde los `GET` de detalle/run (§4.4). Barato si
 * no hay nada vencido (1 SELECT sobre el índice `(tournamentId, status)`) e
 * idempotente (cada UPDATE vuelve a filtrar por el estado de origen).
 */
export async function reapStaleRuns(
  tournamentId: string,
  options: { now?: Date } & ReapOptions = {},
): Promise<ReapResult> {
  const now = options.now ?? new Date();
  const active = await db
    .select({
      id: tournamentRuns.id,
      status: tournamentRuns.status,
      dispatchAttempts: tournamentRuns.dispatchAttempts,
      createdAt: tournamentRuns.createdAt,
      startedAt: tournamentRuns.startedAt,
    })
    .from(tournamentRuns)
    .where(
      and(
        eq(tournamentRuns.tournamentId, tournamentId),
        inArray(tournamentRuns.status, ["queued", "running"]),
      ),
    );

  const result: ReapResult = { redispatched: [], failed: [] };

  for (const run of active) {
    if (run.status !== "queued" && run.status !== "running") continue;
    const snapshot: ActiveRunSnapshot = {
      id: run.id,
      status: run.status,
      dispatchAttempts: run.dispatchAttempts,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
    };
    const decision = decideReapAction(snapshot, now, options);
    if (decision.action === "none") continue;

    if (decision.action === "redispatch") {
      const [updated] = await db
        .update(tournamentRuns)
        .set({
          dispatchAttempts: run.dispatchAttempts + 1,
          lastDispatchAt: now,
        })
        .where(
          and(
            eq(tournamentRuns.id, run.id),
            eq(tournamentRuns.status, "queued"),
          ),
        )
        .returning({ id: tournamentRuns.id });
      if (updated) {
        result.redispatched.push(updated.id);
      }
      continue;
    }

    const error: RunError = { code: decision.action };
    const [updated] = await db
      .update(tournamentRuns)
      .set({ status: "failed", error, finishedAt: now })
      .where(
        and(
          eq(tournamentRuns.id, run.id),
          eq(tournamentRuns.status, run.status),
        ),
      )
      .returning({ id: tournamentRuns.id });
    if (updated) {
      result.failed.push(updated.id);
    }
  }

  return result;
}
