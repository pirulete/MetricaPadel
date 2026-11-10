/**
 * Límites del módulo Torneos (M1) — Jest-testeables, sin DB ni Next.
 *
 * `clampTimeLimit` es la **única** fuente del techo de tiempo del solver:
 * un `timeLimitMs` del body nunca lo bypassa (AC-09). El rango efectivo es
 * `[30_000, min(240_000, TOURNAMENT_MAX_TIME_LIMIT_MS)]`.
 *
 * Los `REAPER_*` son la fuente única de los tiempos del ciclo
 * `tournament_runs` (technical-design §4.4); `lib/db/queries/torneos/runs.ts`
 * los consume desde aquí.
 */

/** Suelo del presupuesto de solve. */
export const MIN_TIME_LIMIT_MS = 30_000;
/** Techo absoluto (AC-09, decisión D4). */
export const DEFAULT_MAX_TIME_LIMIT_MS = 240_000;

/** `queued` sin claim durante este tiempo ⇒ re-dispatch. */
export const REAPER_CLAIM_TIMEOUT_MS = 90_000;
/** `queued` sin claim durante este tiempo ⇒ `failed(dispatch_failed)`. */
export const REAPER_ABANDON_TIMEOUT_MS = 300_000;
/** Intentos de dispatch (1 inicial + 1 re-dispatch). */
export const REAPER_MAX_DISPATCH_ATTEMPTS = 2;
/** `maxDuration` del route del worker. */
export const REAPER_WORKER_MAX_DURATION_MS = 300_000;
/** Gracia antes de declarar `running` colgado. */
export const REAPER_WORKER_CRASH_GRACE_MS = 60_000;
/** Umbral total de `running` colgado ⇒ `failed(worker_crash)`. */
export const REAPER_WORKER_CRASH_TIMEOUT_MS =
  REAPER_WORKER_MAX_DURATION_MS + REAPER_WORKER_CRASH_GRACE_MS;

/**
 * Techo efectivo: `TOURNAMENT_MAX_TIME_LIMIT_MS` recortado a
 * `[MIN_TIME_LIMIT_MS, DEFAULT_MAX_TIME_LIMIT_MS]`. Una env ausente, no
 * numérica o no positiva cae al default (240 s), nunca a 0.
 */
export function resolveMaxTimeLimitMs(
  raw: string | number | null | undefined = process.env
    .TOURNAMENT_MAX_TIME_LIMIT_MS,
): number {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_TIME_LIMIT_MS;
  return Math.min(
    DEFAULT_MAX_TIME_LIMIT_MS,
    Math.max(MIN_TIME_LIMIT_MS, Math.floor(parsed)),
  );
}

/**
 * Clamp del presupuesto de solve. Ausente/NaN ⇒ techo completo (el run usa
 * todo el presupuesto disponible); fuera de rango ⇒ recortado a `[min, max]`.
 */
export function clampTimeLimit(
  requested?: number | null,
  maxMs: number = resolveMaxTimeLimitMs(),
): number {
  const ceiling = Math.min(
    DEFAULT_MAX_TIME_LIMIT_MS,
    Math.max(MIN_TIME_LIMIT_MS, maxMs),
  );
  if (requested === undefined || requested === null) return ceiling;
  if (!Number.isFinite(requested)) return ceiling;
  return Math.min(Math.max(Math.round(requested), MIN_TIME_LIMIT_MS), ceiling);
}
