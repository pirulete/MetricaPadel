"use client"

import * as React from "react"
import { Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/padel/empty-state"
import { CLASS_STATUS_META, whenLabel, type StudentClassDto } from "@/components/padel/upcoming-classes-card"

type Aggregates = {
  scheduled: number
  completed: number
  cancelled: number
  attended: number
  missed: number
  total: number
  attendanceRate: number | null
}

const HISTORY_PAGE_SIZE = 10

function historyNote(item: StudentClassDto): string {
  if (item.blockStatus === "cancelled") return "Cancelada por el coach"
  if (item.attended === true) return "Asististe"
  if (item.attended === false) return "No asististe"
  return "Asistencia sin marcar"
}

function ClassRow({
  item,
  todayIso,
  note,
}: {
  item: StudentClassDto
  todayIso: string | null
  note?: string
}) {
  const status = CLASS_STATUS_META[item.blockStatus]
  return (
    <li className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{whenLabel(item, todayIso)}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            {item.durationMinutes} min
            {item.label ? ` · ${item.label}` : ""}
          </p>
        </div>
        <Badge variant={status.variant} className="shrink-0">
          {status.label}
        </Badge>
      </div>
      {note && (
        <p
          className={
            note === "Asististe"
              ? "mt-1 text-[11px] font-medium text-primary"
              : "mt-1 text-[11px] text-muted-foreground"
          }
        >
          {note}
        </p>
      )}
    </li>
  )
}

/** A01/G8 — "Mis clases" del curso: agregados, próximas y anteriores con cursor (AC-06). */
export function StudentCourseAgenda({ courseId }: { courseId: string }) {
  const [upcoming, setUpcoming] = React.useState<StudentClassDto[]>([])
  const [history, setHistory] = React.useState<StudentClassDto[]>([])
  const [aggregates, setAggregates] = React.useState<Aggregates | null>(null)
  const [todayIso, setTodayIso] = React.useState<string | null>(null)
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [moreError, setMoreError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ courseId, limit: String(HISTORY_PAGE_SIZE) })
        const [agendaRes, historyRes] = await Promise.all([
          fetch(`/api/student/agenda?${new URLSearchParams({ courseId }).toString()}`, {
            cache: "no-store",
          }),
          fetch(`/api/student/agenda/history?${params.toString()}`, { cache: "no-store" }),
        ])
        const agendaData = await agendaRes.json()
        const historyData = await historyRes.json()
        if (cancelled) return
        if (!agendaRes.ok || !historyRes.ok) {
          setError(agendaData.error ?? historyData.error ?? "No se pudieron cargar tus clases")
          return
        }
        setUpcoming(agendaData.upcoming ?? [])
        setAggregates(agendaData.aggregates ?? null)
        setTodayIso(agendaData.todayIso ?? null)
        setHistory(historyData.items ?? [])
        setNextCursor(historyData.nextCursor ?? null)
      } catch {
        if (!cancelled) setError("Error de conexión")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [courseId, reloadKey])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const params = new URLSearchParams({
        courseId,
        limit: String(HISTORY_PAGE_SIZE),
        cursor: nextCursor,
      })
      const res = await fetch(`/api/student/agenda/history?${params.toString()}`, {
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) {
        setMoreError(data.error ?? "No se pudo cargar más historial")
        return
      }
      setHistory((prev) => [...prev, ...(data.items ?? [])])
      setNextCursor(data.nextCursor ?? null)
    } catch {
      setMoreError("Error de conexión")
    } finally {
      setLoadingMore(false)
    }
  }

  const attendanceLabel =
    aggregates?.attendanceRate == null
      ? "—"
      : `${Math.round(aggregates.attendanceRate * 100)} %`

  return (
    <section className="space-y-3" aria-labelledby="mis-clases-title">
      <h2 id="mis-clases-title" className="text-lg font-semibold">
        Mis clases
      </h2>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <p className="sr-only">Cargando tus clases…</p>
          <div className="h-20 rounded-lg border bg-muted/40" />
          <div className="h-16 rounded-lg border bg-muted/40" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5"
        >
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="h-11" onClick={() => setReloadKey((k) => k + 1)}>
            Reintentar
          </Button>
        </div>
      ) : upcoming.length === 0 && history.length === 0 ? (
        <EmptyState
          title="No tienes clases programadas"
          description="Cuando tu coach habilite la semana de este curso verás aquí tus sesiones."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Programadas", value: String(aggregates?.scheduled ?? 0) },
              { label: "Asistidas", value: String(aggregates?.attended ?? 0) },
              { label: "Asistencia", value: attendanceLabel },
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg border bg-card px-2 py-2 text-center">
                <p className="text-base font-bold">{metric.value}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">{metric.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Próximas
            </h3>
            {upcoming.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                No tienes clases próximas en este curso.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((item) => (
                  <ClassRow key={item.blockId} item={item} todayIso={todayIso} />
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Anteriores
            </h3>
            {history.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                Todavía no hay clases anteriores registradas.
              </p>
            ) : (
              <ul className="space-y-2">
                {history.map((item) => (
                  <ClassRow
                    key={item.blockId}
                    item={item}
                    todayIso={todayIso}
                    note={historyNote(item)}
                  />
                ))}
              </ul>
            )}
            {moreError && (
              <p role="alert" className="text-xs text-destructive">
                {moreError}
              </p>
            )}
            {nextCursor && (
              <Button
                variant="outline"
                className="h-11 w-full text-sm"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                aria-label="Cargar más clases anteriores"
              >
                {loadingMore ? "Cargando…" : "Cargar más"}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
