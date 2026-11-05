/**
 * Despacho del job de agenda al background function (§6.4.1).
 *
 * Fire-and-forget: el route handler hace `void dispatchRun(...)` y responde 202
 * en < 2 s. En Vercel una promesa pendiente tras el `return` puede morir con la
 * invocación, por eso la entrega es *at-least-once* sobre un claim *atómico*:
 * el worker reclama con `UPDATE … WHERE status='queued'`, así que un despacho
 * duplicado es inofensivo (`409 not_claimed`) y un despacho perdido lo cubre el
 * reaper (re-dispatch ≤ 2, luego `failed(dispatch_failed)`).
 *
 * Nunca lanza: cualquier fallo se registra y el run queda `queued` a merced del
 * reaper perezoso (`lib/db/queries/torneos/runs.ts`).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tournamentRuns } from "@/lib/db/schema";

/** Timeout corto: el worker responde cuando **termina**, así que no se espera. */
export const DISPATCH_TIMEOUT_MS = 5_000;

const WORKER_PATH = "/api/internal/tournament-worker";

export type DispatchFailure =
  | "not_queued"
  | "no_worker_url"
  | "dispatch_error";

export type DispatchRunResult = {
  ok: boolean;
  /** HTTP status del worker (`202`/`200`/`409`/`401`…), si hubo respuesta. */
  status?: number;
  dispatchAttempts?: number;
  reason?: DispatchFailure;
};

export type DispatchRunOptions = {
  /** Origen de la invocación actual (`request.nextUrl.origin`) como fallback. */
  baseUrl?: string;
  /** Override del secreto (tests); por defecto `TOURNAMENT_WORKER_SECRET`. */
  secret?: string;
  timeoutMs?: number;
  /** Override de la URL (plan B contenedor); por defecto env. */
  workerUrl?: string;
};

/**
 * URL absoluta del worker: `TOURNAMENT_WORKER_URL` (override) o
 * `${NEXT_PUBLIC_BASE_URL|baseUrl}/api/internal/tournament-worker`.
 * `null` si no hay forma de construirla ⇒ el reaper cierra el run.
 */
export function resolveWorkerUrl(
  baseUrl?: string,
  override: string | undefined = process.env.TOURNAMENT_WORKER_URL,
): string | null {
  const explicit = override?.trim();
  if (explicit) return explicit;

  const base = (process.env.NEXT_PUBLIC_BASE_URL?.trim() || baseUrl?.trim() || "")
    .replace(/\/+$/, "");
  return base ? `${base}${WORKER_PATH}` : null;
}

/**
 * Suma `dispatchAttempts` + `lastDispatchAt` y dispara `POST {runId}` al worker.
 * Solo incrementa si el run sigue `queued` (un claim del worker no cobra un
 * intento).
 */
export async function dispatchRun(
  runId: string,
  options: DispatchRunOptions = {},
): Promise<DispatchRunResult> {
  const [queued] = await db
    .update(tournamentRuns)
    .set({
      dispatchAttempts: sql`${tournamentRuns.dispatchAttempts} + 1`,
      lastDispatchAt: new Date(),
    })
    .where(
      and(eq(tournamentRuns.id, runId), eq(tournamentRuns.status, "queued")),
    )
    .returning({
      id: tournamentRuns.id,
      dispatchAttempts: tournamentRuns.dispatchAttempts,
    });

  if (!queued) return { ok: false, reason: "not_queued" };

  const url = resolveWorkerUrl(options.baseUrl, options.workerUrl);
  if (!url) {
    console.error(
      "[torneos/dispatch] Sin URL de worker (TOURNAMENT_WORKER_URL/NEXT_PUBLIC_BASE_URL)",
      runId,
    );
    return {
      ok: false,
      reason: "no_worker_url",
      dispatchAttempts: queued.dispatchAttempts,
    };
  }

  const secret = options.secret ?? process.env.TOURNAMENT_WORKER_SECRET;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) headers["x-worker-secret"] = secret;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ runId }),
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? DISPATCH_TIMEOUT_MS),
    });
    // No se consume el body: el worker devuelve al terminar el solve.
    return {
      ok: response.ok,
      status: response.status,
      dispatchAttempts: queued.dispatchAttempts,
    };
  } catch (error) {
    console.error("[torneos/dispatch] Fallo al despachar el run", runId, error);
    return {
      ok: false,
      reason: "dispatch_error",
      dispatchAttempts: queued.dispatchAttempts,
    };
  }
}
