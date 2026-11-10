"use client"

import * as React from "react"
import { AlertTriangleIcon, Loader2Icon, PlayIcon, RefreshCwIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AgendaGrid, type AgendaGridBlock } from "@/components/torneos/agenda-grid"
import { useTournamentRun, type TournamentRunView } from "@/hooks/use-tournament-run"
import type { SemaforoColor, SemaforoPhase } from "@/lib/motor-torneo/types"

const ENGINE_LABELS: Record<string, string> = {
  optimal: "Óptimo",
  feasible_time_limit: "Factible (límite de tiempo)",
  infeasible: "Infactible",
  unbounded: "No acotado",
  error: "Error",
}

const SEMAPHORE_DOT: Record<SemaforoColor, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-500",
  rojo: "bg-destructive",
}

const SEMAPHORE_LABEL: Record<SemaforoColor, string> = {
  verde: "Verde",
  amarillo: "Amarillo (sin margen)",
  rojo: "Rojo (infactible)",
}

function seconds(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`
}

function SemaphoreRow({ phase }: { phase: SemaforoPhase }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="capitalize">{phase.phase}</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        <span
          aria-hidden="true"
          className={`size-2.5 rounded-full ${SEMAPHORE_DOT[phase.color]}`}
        />
        <span>{SEMAPHORE_LABEL[phase.color]}</span>
        <span className="tabular-nums">
          {phase.matches}/{phase.capacity}
        </span>
      </span>
    </li>
  )
}

function Indicator({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function RunBanner({
  run,
  phase,
  error,
  needsForce,
  generating,
  onForce,
}: {
  run: TournamentRunView | null
  phase: string
  error: string | null
  needsForce: boolean
  generating: boolean
  onForce: () => void
}) {
  if (phase === "error" && error) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
        {needsForce ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={onForce}>
            Generar de todos modos
          </Button>
        ) : null}
      </div>
    )
  }

  if (generating || phase === "queued" || phase === "running") {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        <span>{phase === "running" || run?.status === "running" ? "Generando agenda…" : "Corrida en cola…"}</span>
        <span className="text-muted-foreground">El motor puede tardar hasta 4 minutos.</span>
      </div>
    )
  }

  if (!run) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Este torneo aún no tiene agenda generada.
      </p>
    )
  }

  if (run.status === "succeeded") {
    return (
      <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
        Agenda generada en {seconds(run.timeMs)} · {run.slotsCount} partidos agendados.
      </p>
    )
  }

  if (run.status === "invalid") {
    const errors = run.diagnostics?.verificationErrors.length ?? 0
    return (
      <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium">La agenda se guardó, pero la verificación encontró {errors} errores.</p>
        <p className="text-muted-foreground">Revisa el diagnóstico antes de usarla.</p>
      </div>
    )
  }

  if (run.status === "infeasible") {
    return (
      <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium">El modelo no encontró una agenda factible.</p>
        <p className="text-muted-foreground">
          Amplía la extensión, reduce partidos por bloque o revisa las restricciones duras del torneo.
        </p>
      </div>
    )
  }

  return (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">
        La corrida falló{run.error?.code ? ` (${run.error.code})` : ""}.
      </p>
      {run.error?.message ? <p className="text-muted-foreground">{run.error.message}</p> : null}
    </div>
  )
}

/**
 * Panel de la corrida de agenda (F4b): dispara `POST .../agenda`, hace polling
 * del run y pinta estado + diagnóstico + grilla. El servidor es la autoridad:
 * el hook no guarda cache espejo de los datos.
 */
export function DiagnosticsPanel({
  tournamentId,
  tournamentStatus,
  courts,
  blocks,
  initialRun,
}: {
  tournamentId: string
  tournamentStatus: "draft" | "agenda_draft" | "archived"
  courts: number
  blocks: readonly AgendaGridBlock[]
  initialRun: TournamentRunView | null
}) {
  const { run, phase, error, needsForce, generating, generate, refresh } = useTournamentRun({
    tournamentId,
    initialRun,
  })

  const archived = tournamentStatus === "archived"
  const busy = generating || phase === "queued" || phase === "running"
  const diagnostics = run?.diagnostics ?? null
  const semaforo = diagnostics?.semaforo
  const slots = run?.slots ?? []
  const timeLimitReached = run?.engineStatus === "feasible_time_limit"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void generate()}
          disabled={archived || busy}
          aria-busy={busy}
          aria-label={run ? "Regenerar agenda del torneo" : "Generar agenda del torneo"}
        >
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <PlayIcon className="size-4" aria-hidden="true" />
          )}
          {run ? "Regenerar agenda" : "Generar agenda"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void refresh()}
          disabled={!run || busy}
          aria-label="Actualizar estado de la corrida"
        >
          <RefreshCwIcon className="size-4" aria-hidden="true" />
          Actualizar
        </Button>
        {archived ? <span className="text-xs text-muted-foreground">Torneo archivado: solo lectura.</span> : null}
      </div>

      <RunBanner
        run={run}
        phase={phase}
        error={error}
        needsForce={needsForce}
        generating={generating}
        onForce={() => void generate({ force: true })}
      />

      <section aria-labelledby="diagnostico-titulo" className="space-y-3">
        <h2 id="diagnostico-titulo" className="text-lg font-semibold">
          Diagnóstico del run
        </h2>

        {!diagnostics ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {busy ? "Calculando diagnóstico…" : "Sin diagnóstico: el torneo no tiene una corrida terminada."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={run?.status === "succeeded" ? "default" : "outline"}>
                {run?.status ?? "—"}
              </Badge>
              <span className="text-muted-foreground">
                Motor: {ENGINE_LABELS[diagnostics.status] ?? diagnostics.status} · {seconds(diagnostics.timeMs)}
                {timeLimitReached ? " · límite de tiempo alcanzado" : ""}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Indicator label="Objetivo" value={diagnostics.objective === null ? "—" : diagnostics.objective.toFixed(0)} />
              <Indicator label="Gap MIP" value={diagnostics.mipGap === null ? "—" : `${(diagnostics.mipGap * 100).toFixed(1)}%`} />
              <Indicator label="Partidos en extensión" value={String(diagnostics.extensionMatches)} />
              <Indicator
                label="Grupos como unidad"
                value={`${diagnostics.gruposComoUnidad.count}/${diagnostics.gruposComoUnidad.total}`}
              />
              <Indicator
                label="Grupos mismo día"
                value={`${diagnostics.gruposMismoDia.count}/${diagnostics.gruposMismoDia.total}`}
              />
              <Indicator
                label="Grupos misma cancha"
                value={`${diagnostics.gruposMismaCancha.count}/${diagnostics.gruposMismaCancha.total}`}
              />
              <Indicator
                label="Parejas en un solo día"
                value={`${diagnostics.parejasUnDia.count}/${diagnostics.parejasUnDia.total} · ${diagnostics.parejasDosDias} en dos`}
              />
              <Indicator
                label="Máx. bloques seguidos"
                value={String(diagnostics.maxBloquesSeguidos)}
              />
              <Indicator
                label="Partidos en horario laboral"
                value={String(diagnostics.partidosHorarioLaboral)}
              />
            </dl>

            {semaforo ? (
              <div className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-medium">Semáforo de ocupación</h3>
                <ul className="space-y-1 text-sm">
                  <SemaphoreRow phase={semaforo.previa} />
                  <SemaphoreRow phase={semaforo.final} />
                </ul>
              </div>
            ) : null}

            <div className="rounded-lg border p-3">
              <h3 className="mb-2 text-sm font-medium">Verificación independiente</h3>
              {diagnostics.verificationErrors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin errores: la agenda cumple todas las reglas duras.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {diagnostics.verificationErrors.slice(0, 20).map((item, index) => (
                    <li key={`${item.code}-${index}`} className="text-destructive">
                      <span className="font-medium">{item.code}</span>
                      {item.matchId ? <span className="text-muted-foreground"> · {item.matchId}</span> : null}
                      {item.message ? <span className="text-muted-foreground"> · {item.message}</span> : null}
                    </li>
                  ))}
                  {diagnostics.verificationErrors.length > 20 ? (
                    <li className="text-muted-foreground">
                      +{diagnostics.verificationErrors.length - 20} errores más
                    </li>
                  ) : null}
                </ul>
              )}
            </div>

            {diagnostics.availabilityViolations?.length ? (
              <div className="rounded-lg border border-amber-500/40 p-3">
                <h3 className="mb-2 text-sm font-medium">Violaciones de disponibilidad</h3>
                <ul className="space-y-1 text-sm">
                  {diagnostics.availabilityViolations.map((item, index) => (
                    <li key={`${item.matchId}-${index}`} className="text-amber-700 dark:text-amber-400">
                      {item.matchId} · {item.dayLabel} {item.startTime}
                      {item.teams.length > 0 ? <span className="text-muted-foreground"> · {item.teams.join(", ")}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-lg border p-3">
              <h3 className="mb-2 text-sm font-medium">Ocupación por tramo</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {diagnostics.occupancyByTramo.map((tramo) => (
                  <li key={`${tramo.dayLabel}-${tramo.phase}-${tramo.isExtension}`}>
                    {tramo.dayLabel} · {tramo.phase}
                    {tramo.isExtension ? " (extensión)" : ""}: {tramo.matches}/{tramo.capacity}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="agenda-titulo" className="space-y-3">
        <h2 id="agenda-titulo" className="text-lg font-semibold">
          Agenda propuesta
        </h2>
        <AgendaGrid slots={slots} blocks={blocks} courts={courts} />
      </section>
    </div>
  )
}
