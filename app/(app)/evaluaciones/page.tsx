"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Section } from "@/components/ui/section"
import { EmptyState } from "@/components/padel/empty-state"
import { Button } from "@/components/ui/button"
import {
  EvaluationCard,
  type StudentEvaluationListItem,
} from "@/components/padel/evaluation-card"

const PAGE_SIZE = 20

/** A03 — Lista de evaluaciones publicadas del alumno. Solo USER. Paginada por cursor (G15). */
export default function EvaluacionesPage() {
  const router = useRouter()
  const [evaluations, setEvaluations] = React.useState<StudentEvaluationListItem[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/student/evaluations?limit=${PAGE_SIZE}`, { cache: "no-store" })
        if (res.status === 403) {
          router.replace("/dashboard")
          return
        }
        if (!res.ok) throw new Error("No se pudieron cargar las evaluaciones")
        const body = await res.json()
        if (!cancelled) {
          setEvaluations(body.items ?? [])
          setNextCursor(body.nextCursor ?? null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/student/evaluations?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`, { cache: "no-store" })
      if (!res.ok) throw new Error("No se pudieron cargar más evaluaciones")
      const body = await res.json()
      setEvaluations((prev) => [...prev, ...(body.items ?? [])])
      setNextCursor(body.nextCursor ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar más")
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore])

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
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {evaluations.map((evaluation) => (
                <EvaluationCard key={evaluation.id} evaluation={evaluation} />
              ))}
            </div>
            {nextCursor && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Cargando…" : "Cargar más"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  )
}