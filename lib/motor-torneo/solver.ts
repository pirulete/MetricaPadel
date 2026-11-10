/**
 * Solver MILP sobre HiGHS WASM (puerto de `Modelo.resolver`,
 * `motor_torneo/modelo.py:285` + `scipy.optimize.milp`).
 *
 * **Único** archivo de `lib/motor-torneo/` que importa `highs`
 * (technical-design §3). El `timeLimitMs` se clampa aquí al rango
 * `[30_000, 240_000]`; el techo por entorno (`TOURNAMENT_MAX_TIME_LIMIT_MS`)
 * se aplica en `lib/torneos/limits.ts` (F3a) antes de llamar.
 */
import loadHighs, { type Highs, type Model } from "highs";
import type { BuiltModel } from "./model";
import { toCSC } from "./model";
import type { EngineStatus, SolveResult } from "./types";

export const MIN_TIME_LIMIT_MS = 30_000;
export const MAX_TIME_LIMIT_MS = 240_000;

export interface SolveOptions {
  /** Presupuesto de tiempo en ms (se clampa a `[30_000, 240_000]`). */
  timeLimitMs?: number;
  /** `mip_rel_gap` (default `0.01`, igual que `PARAMS.gap`). */
  mipRelGap?: number;
}

/** Clamp del presupuesto de solver. Ausente/inválido ⇒ máximo permitido. */
export function clampTimeLimitMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return MAX_TIME_LIMIT_MS;
  }
  return Math.min(MAX_TIME_LIMIT_MS, Math.max(MIN_TIME_LIMIT_MS, Math.round(value)));
}

const toHiGHSBound = (value: number, highs: Highs): number => {
  if (value === Number.POSITIVE_INFINITY) return highs.infinity;
  if (value === Number.NEGATIVE_INFINITY) return -highs.infinity;
  return value;
};

/** `ModelStatusCode` → `EngineStatus` (nomenclatura del motor, §4.1). */
function mapStatus(
  modelStatus: number,
  hasSolution: boolean,
  status: { optimal: number; infeasible: number; unbounded: number; unboundedOrInfeasible: number; timeLimit: number; objectiveBound: number; objectiveTarget: number; solutionLimit: number },
): EngineStatus {
  if (modelStatus === status.optimal) return "optimal";
  if (modelStatus === status.infeasible) return "infeasible";
  if (modelStatus === status.unbounded || modelStatus === status.unboundedOrInfeasible) {
    return "unbounded";
  }
  if (
    modelStatus === status.timeLimit ||
    modelStatus === status.objectiveBound ||
    modelStatus === status.objectiveTarget ||
    modelStatus === status.solutionLimit
  ) {
    return hasSolution ? "feasible_time_limit" : "error";
  }
  return "error";
}

function readNumber(
  model: Model,
  name: string,
): number | null {
  try {
    const value = model.info.get(name);
    return typeof value === "bigint" ? Number(value) : value;
  } catch {
    return null;
  }
}

function errorResult(message: string, timeMs: number): SolveResult {
  return {
    status: "error",
    objective: null,
    mipGap: null,
    timeMs,
    assignment: {},
    message,
  };
}

/**
 * Resuelve el modelo y devuelve `matchId → bloque`.
 *
 * - `optimal` / `feasible_time_limit`: `assignment` con todos los partidos.
 * - `infeasible`: `assignment` vacío.
 * - `error`: WASM no disponible, fallo de construcción o límite sin incumbente.
 */
export async function solveMilp(
  model: BuiltModel,
  options: SolveOptions = {},
): Promise<SolveResult> {
  const timeLimitMs = clampTimeLimitMs(options.timeLimitMs);
  const mipRelGap = options.mipRelGap ?? 0.01;
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);

  let highs: Highs;
  try {
    highs = await loadHighs();
  } catch (error) {
    return errorResult(
      `No se pudo cargar HiGHS WASM: ${error instanceof Error ? error.message : String(error)}`,
      elapsed(),
    );
  }

  const csc = toCSC(model);
  let solver: Model;
  try {
    solver = highs.createModel({
      numCols: csc.numCols,
      numRows: csc.numRows,
      sense: highs.constants.objectiveSense.minimize,
      colCost: Float64Array.from(model.cost),
      colLower: Float64Array.from(model.lb, (value) => toHiGHSBound(value, highs)),
      colUpper: Float64Array.from(model.ub, (value) => toHiGHSBound(value, highs)),
      rowLower: Float64Array.from(model.rowLo, (value) => toHiGHSBound(value, highs)),
      rowUpper: Float64Array.from(model.rowHi, (value) => toHiGHSBound(value, highs)),
      matrix: csc,
      integrality: Int32Array.from(model.integrality),
      colNames: model.colNames,
      rowNames: model.rowNames,
    });
  } catch (error) {
    return errorResult(
      `No se pudo construir el modelo en HiGHS: ${error instanceof Error ? error.message : String(error)}`,
      elapsed(),
    );
  }

  try {
    solver.options.set({
      time_limit: timeLimitMs / 1000,
      mip_rel_gap: mipRelGap,
      presolve: "on",
    });

    const run = solver.run();
    const modelStatus = run.modelStatus;
    const solutionStatus = readNumber(solver, "primal_solution_status") ?? 0;
    const hasSolution = solutionStatus === 2;

    const status = mapStatus(modelStatus, hasSolution, highs.constants.modelStatus);
    const timeMs = elapsed();

    if (!hasSolution) {
      return {
        status,
        objective: null,
        mipGap: status === "infeasible" ? null : readNumber(solver, "mip_gap"),
        timeMs,
        assignment: {},
        message: `HiGHS modelStatus=${modelStatus} sin solución primal`,
      };
    }

    const colValue = solver.getSolution().colValue;
    const assignment: Record<string, number> = {};
    for (const { matchId, block, col } of model.xVars) {
      if (colValue[col] > 0.5) assignment[matchId] = block;
    }

    const objective = solver.getObjectiveValue();
    const gap = readNumber(solver, "mip_gap");

    return {
      status,
      objective: Number.isFinite(objective) ? objective : null,
      mipGap: gap,
      timeMs,
      assignment,
      message: `HiGHS modelStatus=${modelStatus} solución=${solutionStatus}`,
    };
  } catch (error) {
    return errorResult(
      `Error del solver: ${error instanceof Error ? error.message : String(error)}`,
      elapsed(),
    );
  } finally {
    solver.dispose();
  }
}
