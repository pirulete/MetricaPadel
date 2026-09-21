"use client"

import * as React from "react"
import { Section } from "@/components/ui/section"
import { EmptyState } from "@/components/padel/empty-state"
import {
  EvaluationCard,
  type StudentEvaluationListItem,
} from "@/components/padel/evaluation-card"

/** A03 — Lista de evaluaciones publicadas del alumno (protegida por layout validateUser). */
export default function EvaluacionesPage() {
  const [evaluations, setEvaluations] = React.useState<StudentEvaluationListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/student/evaluations", { cache: "no-store" })
        if (!res.ok) throw new Error("No se pudieron cargar las evaluaciones")
        const body = await res.json()
        if (!cancelled) setEvaluations(body.evaluations)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Mis evaluaciones</h1>
          <p className="text-sm text-muted-foreground">
            Evaluaciones publicadas por tu coach.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : evaluations.length === 0 ? (
          <EmptyState
            title="Todavía no tienes evaluaciones"
            description="Cuando tu coach publique una evaluación, aparecerá aquí."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {evaluations.map((evaluation) => (
              <EvaluationCard key={evaluation.id} evaluation={evaluation} />
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}