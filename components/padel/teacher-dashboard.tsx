"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/padel/empty-state"
import { DashboardMetrics, type TeacherMetrics } from "@/components/padel/dashboard-metrics"
import { CourseCard, type CourseListItem } from "@/components/padel/course-card"
import { CreateCourseModal } from "@/components/padel/create-course-modal"

/** Home del coach (P01): métricas + cursos + CTA evaluar. */
export function TeacherDashboard() {
  const [metrics, setMetrics] = React.useState<TeacherMetrics | null>(null)
  const [courses, setCourses] = React.useState<CourseListItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/teacher", { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "Error al cargar el dashboard")
          return
        }
        if (!cancelled) {
          setMetrics(data.metrics)
          setCourses(data.courses ?? [])
        }
      } catch {
        toast.error("Error de conexión")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando dashboard…</p>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hola, coach</h1>
          <p className="text-sm text-muted-foreground">Resumen de tu actividad</p>
        </div>
        <Button asChild>
          <Link href="/evaluar">Evaluar ahora</Link>
        </Button>
      </div>

      {metrics && <DashboardMetrics metrics={metrics} />}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mis cursos</h2>
          <CreateCourseModal />
        </div>
        {courses.length === 0 ? (
          <EmptyState
            title="No tienes cursos todavía"
            description="Crea tu primer curso para empezar a evaluar."
            action={<CreateCourseModal />}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}