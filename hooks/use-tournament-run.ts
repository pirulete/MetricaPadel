"use client"

import * as React from "react"

import type { AvailabilityViolation } from "@/lib/motor-torneo/diagnostics"
import type { Diagnosis, Semaforo } from "@/lib/motor-torneo/types"

/** Estados de `tournament_runs` (§4.4). */
export type TournamentRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "infeasible"
  | "failed"
  | "invalid"

export const TERMINAL_RUN_STATUSES: readonly TournamentRunStatus[] = [
  "succeeded",
  "infeasible",
  "failed",
  "invalid",
]

export function isTerminalRunStatus(status: RunStatusLike): boolean {
  return status !== null && (TERMINAL_RUN_STATUSES as readonly string[]).includes(status)
}

type RunStatusLike = TournamentRunStatus | string | null

/** Slot de `GET .../runs/[runId]?include=slots` (§6.6). */
export type TournamentRunSlot = {
  matchId: string
  code: string
  categoryCode: string
  phase: string
  round: string
  blockIdx: number
  court: number
  dayLabel: string
  startTime: string
}

/**
 * Diagnóstico persistido por el worker: `DiagnosisReport` (extiende `Diagnosis`).
 * `semaforo` y `availabilityViolations` son opcionales porque el DTO de polling
 * los tipa como `Diagnosis` a secas.
 */
export type RunDiagnostics = Diagnosis & {
  semaforo?: Semaforo
  availabilityViolations?: AvailabilityViolation[]
}

/** DTO de `GET /api/torneos/[id]/runs/[runId]` (§6.6). */
export type TournamentRunView = {
  runId: string
  status: TournamentRunStatus
  engineStatus: string | null
  objective: number | null
  mipGap: number | null
  timeMs: number | null
  slotsCount: number
  /** `Date` cuando llega del RSC, ISO cuando llega del polling. */
  startedAt: Date | string | null
  finishedAt: Date | string | null
  error: { code: string; message?: string } | null
  diagnostics: RunDiagnostics | null
  slots?: TournamentRunSlot[]
}

/** Fase de la UI: `idle` = sin corrida, `done` = corrida terminal. */
export type TournamentRunPhase = "idle" | "queued" | "running" | "done" | "error"

export type GenerateRunInput = { force?: boolean; timeLimitMs?: number }

/** Backoff del polling: 1 s con factor 1,5 hasta 5 s (§6.6). */
const POLL_START_MS = 1000
const POLL_MAX_MS = 5000
/** Fallos de red consecutivos tolerados antes de abandonar el polling. */
const MAX_NETWORK_FAILURES = 6

/** Respuesta HTTP de error del endpoint de la corrida (4xx/5xx). */
class RunReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "RunReadError"
  }
}

const MESSAGES: Record<string, string> = {
  run_active: "Ya hay una corrida en curso para este torneo. Se muestra su progreso.",
  archived: "El torneo está archivado: no se puede generar una agenda nueva.",
  infeasible_occupancy:
    "La ocupación declarada excede las casillas disponibles. Revisa el semáforo o fuerza la corrida.",
}

type AgendaResponse = {
  runId?: string
  status?: string
  code?: string
  error?: string
  activeRunId?: string | null
}

function emptyQueuedRun(runId: string): TournamentRunView {
  return {
    runId,
    status: "queued",
    engineStatus: null,
    objective: null,
    mipGap: null,
    timeMs: null,
    slotsCount: 0,
    startedAt: null,
    finishedAt: null,
    error: null,
    diagnostics: null,
  }
}

/**
 * Corrida de agenda de un torneo: `generate()` → `POST .../agenda` (202) y
 * polling con backoff hasta estado terminal. El servidor es la única autoridad
 * (no hay cache espejo): cada tick reemplaza el run con la respuesta.
 */
export function useTournamentRun({
  tournamentId,
  initialRun = null,
}: {
  tournamentId: string
  initialRun?: TournamentRunView | null
}) {
  const [run, setRun] = React.useState<TournamentRunView | null>(initialRun)
  const [phase, setPhase] = React.useState<TournamentRunPhase>(() => {
    if (initialRun === null) return "idle"
    if (isTerminalRunStatus(initialRun.status)) return "done"
    return initialRun.status === "running" ? "running" : "queued"
  })
  const [error, setError] = React.useState<string | null>(null)
  const [needsForce, setNeedsForce] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)

  const cancelledRef = React.useRef(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const sleep = React.useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        timerRef.current = setTimeout(resolve, ms)
      }),
    [],
  )

  const readRun = React.useCallback(
    async (runId: string): Promise<TournamentRunView> => {
      const res = await fetch(
        `/api/torneos/${tournamentId}/runs/${runId}?include=slots`,
        { cache: "no-store" },
      )
      const body = (await res.json().catch(() => null)) as
        | { run?: TournamentRunView; error?: string }
        | null
      if (!res.ok || !body?.run) {
        throw new RunReadError(
          body?.error ?? `No se pudo consultar la corrida (${res.status})`,
          res.status,
        )
      }
      return body.run
    },
    [tournamentId],
  )

  const pollUntilTerminal = React.useCallback(
    async (runId: string) => {
      let delay = POLL_START_MS
      let networkFailures = 0
      while (!cancelledRef.current) {
        await sleep(delay)
        if (cancelledRef.current) return
        try {
          const next = await readRun(runId)
          if (cancelledRef.current) return
          networkFailures = 0
          setRun(next)
          setError(null)
          if (isTerminalRunStatus(next.status)) {
            setPhase("done")
            return
          }
          setPhase(next.status === "running" ? "running" : "queued")
        } catch (err) {
          if (cancelledRef.current) return
          const message = err instanceof Error ? err.message : "Error de conexión"
          // Error HTTP (401/403/404/5xx): no es recuperable ⇒ se detiene el polling.
          if (err instanceof RunReadError) {
            setPhase("error")
            setError(message)
            return
          }
          // Sólo los fallos de red reintentan con backoff, y con tope.
          networkFailures += 1
          setError(message)
          if (networkFailures >= MAX_NETWORK_FAILURES) {
            setPhase("error")
            return
          }
          delay = POLL_MAX_MS
          continue
        }
        delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.5))
      }
    },
    [readRun, sleep],
  )

  const initialRunId = initialRun?.runId ?? null
  const initialStatus = initialRun?.status ?? null

  React.useEffect(() => {
    if (!initialRunId || isTerminalRunStatus(initialStatus)) return
    // Arranque diferido: el polling no debe setear estado durante el montaje.
    const kickoff = setTimeout(() => void pollUntilTerminal(initialRunId), 0)
    return () => {
      clearTimeout(kickoff)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [initialRunId, initialStatus, pollUntilTerminal])

  const generate = React.useCallback(
    async (input: GenerateRunInput = {}) => {
      setGenerating(true)
      setError(null)
      setNeedsForce(false)
      try {
        const res = await fetch(`/api/torneos/${tournamentId}/agenda`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        })
        const body = (await res.json().catch(() => null)) as AgendaResponse | null
        if (res.status === 202 && body?.runId) {
          setRun(emptyQueuedRun(body.runId))
          setPhase("queued")
          void pollUntilTerminal(body.runId)
          return
        }
        const code = body?.code ?? ""
        setPhase("error")
        setError(MESSAGES[code] ?? body?.error ?? "No se pudo generar la agenda")
        if (code === "infeasible_occupancy") setNeedsForce(true)
        if (code === "run_active" && body?.activeRunId) {
          void pollUntilTerminal(body.activeRunId)
        }
      } catch {
        setPhase("error")
        setError("Error de conexión al generar la agenda")
      } finally {
        setGenerating(false)
      }
    },
    [pollUntilTerminal, tournamentId],
  )

  /** Lectura puntual sin esperar al próximo tick (botón "Actualizar"). */
  const refresh = React.useCallback(async () => {
    if (!run?.runId) return
    try {
      const next = await readRun(run.runId)
      setRun(next)
      setError(null)
      setPhase(
        isTerminalRunStatus(next.status)
          ? "done"
          : next.status === "running"
            ? "running"
            : "queued",
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión")
      // Fallo HTTP al refrescar: no hay corrida consultable ⇒ se abandona el progreso.
      if (err instanceof RunReadError) setPhase("error")
    }
  }, [readRun, run])

  return { run, phase, error, needsForce, generating, generate, refresh }
}
