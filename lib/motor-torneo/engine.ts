/**
 * Orquestador puro del motor (puerto de `correr.py:main`, sin CSV/HTML).
 *
 *   buildModel → solveMilp → assignCourts → verify
 *
 * Devuelve la agenda en los nombres que usa el verificador
 * (`bloqueDe`/`canchaDe`) más el diagnóstico del solver y los errores de
 * verificación. **Sin imports de DB/Next**: el glue server (`lib/torneos/*`,
 * `lib/db/queries/torneos/*`) es quien persiste.
 *
 * Estados:
 * - `optimal` / `feasible_time_limit` → agenda completa, se verifica.
 * - `infeasible` / `unbounded` / `error` → sin agenda (`ok: false`) y
 *   `verificationSkipped: true`: verificar un mapa vacío solo produce 247
 *   "sin bloque", que escondería la causa real.
 * - Verificación con errores ⇒ `flagged: true` (el run se persiste como
 *   `invalid`, EC-04), `ok: false`.
 */
import { assignCourts } from "./courts";
import { buildModel } from "./model";
import { DEFAULT_PARAMS } from "./objective";
import { clampTimeLimitMs, solveMilp } from "./solver";
import type {
  CourtAssignment,
  EngineStatus,
  Instancia,
  MilpModelStats,
  TournamentParams,
  VerificationError,
} from "./types";
import { verify } from "./verify";

export interface EngineOptions {
  /** Presupuesto del solver en ms; se clampa a `[30_000, 240_000]`. */
  timeLimitMs?: number;
  /** `mip_rel_gap`; default `params.gap`. */
  mipRelGap?: number;
}

export interface EngineDiagnostics {
  status: EngineStatus;
  objective: number | null;
  mipGap: number | null;
  /** Tiempo del solver en ms (`performance.now`, nunca `Date`). */
  timeMs: number;
  message: string;
}

export interface EngineMeta {
  ok: boolean;
  /** `true` si el verificador encontró al menos un error (§4.4: run `invalid`). */
  flagged: boolean;
  engineStatus: EngineStatus;
  verificationSkipped: boolean;
  matches: number;
  assigned: number;
  courtsAssigned: number;
  buildMs: number;
  solveMs: number;
  totalMs: number;
  /** Presupuesto efectivo tras el clamp (el que vio el solver). */
  timeLimitMs: number;
  mipRelGap: number;
  model: MilpModelStats;
}

export interface EngineRunResult {
  /** `partido → bloque` (vacío si el solver no dio agenda). */
  bloqueDe: Record<string, number>;
  /** `partido → cancha (1..N)` (vacío si el solver no dio agenda). */
  canchaDe: CourtAssignment;
  diagnostico: EngineDiagnostics;
  verificacion: { errores: VerificationError[] };
  meta: EngineMeta;
}

const SOLVED: ReadonlySet<EngineStatus> = new Set<EngineStatus>([
  "optimal",
  "feasible_time_limit",
]);

export async function runEngine(
  inst: Instancia,
  params: TournamentParams = DEFAULT_PARAMS,
  options: EngineOptions = {},
): Promise<EngineRunResult> {
  const startedAt = performance.now();

  const buildStart = performance.now();
  const model = buildModel(inst, params);
  const buildMs = Math.round(performance.now() - buildStart);

  const timeLimitMs = clampTimeLimitMs(
    options.timeLimitMs ?? params.tiempoMax * 1000,
  );
  const mipRelGap = options.mipRelGap ?? params.gap;

  const solveStart = performance.now();
  const solve = await solveMilp(model, { timeLimitMs, mipRelGap });
  const solveMs = Math.round(performance.now() - solveStart);

  const solved = SOLVED.has(solve.status);
  const bloqueDe = solved ? solve.assignment : {};
  const canchaDe = solved ? assignCourts(inst, bloqueDe) : {};
  const errores = solved ? verify(inst, bloqueDe, canchaDe, params) : [];
  const matches = Object.keys(inst.partidos).length;
  const flagged = errores.length > 0;

  return {
    bloqueDe,
    canchaDe,
    diagnostico: {
      status: solve.status,
      objective: solve.objective,
      mipGap: solve.mipGap,
      timeMs: solve.timeMs,
      message: solve.message,
    },
    verificacion: { errores },
    meta: {
      ok: solved && !flagged,
      flagged,
      engineStatus: solve.status,
      verificationSkipped: !solved,
      matches,
      assigned: Object.keys(bloqueDe).length,
      courtsAssigned: Object.keys(canchaDe).length,
      buildMs,
      solveMs,
      totalMs: Math.round(performance.now() - startedAt),
      timeLimitMs,
      mipRelGap,
      model: model.stats,
    },
  };
}
