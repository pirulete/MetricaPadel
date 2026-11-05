"use client"

import * as React from "react"
import Link from "next/link"
import { Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/padel/empty-state"
import { formatBlockDateTime } from "@/lib/padel/class-agenda"

/** Clase tal como la devuelve `GET /api/student/agenda` (U1). */
export type StudentClassDto = {
  blockId: string
  courseId: string
  courseName: string
  blockDate: string
  startTime: string
  durationMinutes: number
  label: string | null
  blockStatus: "scheduled" | "completed" | "cancelled"
  enrollmentStatus: "scheduled" | "attended" | "missed" | "cancelled"
  attended: boolean | null
}

export const CLASS_STATUS_META: Record<
  StudentClassDto["blockStatus"],
  { label: string; variant: "secondary" | "outline" | "destructive" }
> = {
  scheduled: { label: "Programada", variant: "secondary" },
  completed: { label: "Completada", variant: "outline" },
  cancelled: { label: "Cancelada", variant: "destructive" },
}

export function whenLabel(item: StudentClassDto, todayIso: string | null): string {
  if (todayIso && item.blockDate === todayIso) return `Hoy · ${item.startTime}`
  return formatBlockDateTime(item.blockDate, item.startTime)
}

/** A01 — "Próximas clases" del alumno en el dashboard (AC-06/AC-07). */
export function UpcomingClassesCard() {
  const [classes, setClasses] = React.useState<StudentClassDto[]>([])
  const [todayIso, setTodayIso] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/student/agenda", { cache: "no-store" })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? "No se pudieron cargar tus clases")
          return
        }
        setClasses(data.upcoming ?? [])
        setTodayIso(data.todayIso ?? null)
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
  }, [reloadKey])

  return (
    <section
      id="proximas-clases"
      aria-labelledby="proximas-clases-title"
      className="scroll-mt-24 space-y-3 rounded-xl [&:target]:ring-2 [&:target]:ring-primary/60 [&:target]:ring-offset-2 [&:target]:ring-offset-background"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="proximas-clases-title" className="text-lg font-semibold">
          Próximas clases
        </h2>
        <Link href="/cursos" className="text-sm font-medium text-primary">
          Ver mis cursos
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <p className="sr-only">Cargando próximas clases…</p>
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-lg border bg-muted/40" />
          ))}
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
      ) : classes.length === 0 ? (
        <EmptyState
          title="No tienes clases programadas"
          description="Cuando tu coach habilite la semana, verás aquí tus próximas sesiones."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/cursos">Ver mis cursos</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {classes.map((item) => {
            const status = CLASS_STATUS_META[item.blockStatus]
            return (
              <li key={item.blockId} className="rounded-lg border bg-card px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{whenLabel(item, todayIso)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.courseName}</p>
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
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
