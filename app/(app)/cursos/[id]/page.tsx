"use client"

import * as React from "react"
import { toast } from "sonner"
import { Section } from "@/components/ui/section"
import { CourseDetail, type CourseDetailData } from "@/components/padel/course-detail"

/** /cursos/[id] — P07 detalle de curso (tabs Alumnos/Rúbricas). */
export default function CursoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [id, setId] = React.useState<string | null>(null)
  const [course, setCourse] = React.useState<CourseDetailData | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    params.then((p) => {
      if (!cancelled) setId(p.id)
    })
    return () => {
      cancelled = true
    }
  }, [params])

  React.useEffect(() => {
    if (!id) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/courses/${id}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "Error al cargar el curso")
          return
        }
        if (!cancelled) setCourse(data.course)
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
  }, [id])

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-4xl">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando curso…</p>
        ) : course ? (
          <CourseDetail course={course} />
        ) : (
          <p className="text-sm text-muted-foreground">Curso no encontrado.</p>
        )}
      </div>
    </Section>
  )
}