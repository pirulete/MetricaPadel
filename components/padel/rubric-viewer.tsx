"use client"

import * as React from "react"
import { toast } from "sonner"
import { FileDownIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type StudentScore = {
  criteriaId: string
  criterionName: string | null
  levelId: string
  levelName: string | null
  score: number
  descriptor: string | null
  comment: string | null
}

type StudentEvaluationDetail = {
  evaluation: {
    id: string
    totalScore: number | null
    maxScore: number | null
    globalComment: string | null
    publishedAt: string | null
    readAt: string | null
  }
  rubric: { id: string; title: string; category: string } | null
  scores: StudentScore[]
  academy?: { id: string; name: string; logoUrl: string | null; primaryColor: string } | null
}

/** Vista read-only de evaluación publicada para el alumno (A03). */
export function RubricViewer({ evaluationId }: { evaluationId: string }) {
  const [detail, setDetail] = React.useState<StudentEvaluationDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // La página es compartida (coach y alumno). El coach usa el endpoint
        // propio; si 403 (no es coach), cae al endpoint alumno.
        let res = await fetch(`/api/evaluations/${evaluationId}`, {
          cache: "no-store",
        })
        if (res.status === 403) {
          res = await fetch(`/api/student/evaluations/${evaluationId}`, {
            cache: "no-store",
          })
        }
        if (!res.ok) throw new Error("No se pudo cargar la evaluación")
        const body = await res.json()
        if (cancelled) return
        setDetail(body)
        // Marca como leída (idempotente) en segundo plano (solo aplica al alumno).
        void fetch(`/api/student/evaluations/${evaluationId}/read`, { method: "POST" })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar")
          toast.error(e instanceof Error ? e.message : "Error al cargar")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [evaluationId])

  const handleExportPdf = () => {
    window.open(`/api/evaluations/${evaluationId}/pdf`, "_blank")
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
  }

  if (error || !detail) {
    return <p className="py-10 text-center text-sm text-destructive">{error ?? "Sin datos"}</p>
  }

  const { evaluation, rubric, scores, academy } = detail

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{rubric?.title ?? "Evaluación"}</h1>
          <p className="text-sm text-muted-foreground">
            {evaluation.publishedAt
              ? `Publicada el ${new Date(evaluation.publishedAt).toLocaleDateString("es-ES")}`
              : "Sin fecha de publicación"}
          </p>
          {academy && (
            <p className="mt-1 text-sm font-medium" style={{ color: academy.primaryColor }}>
              {academy.name}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-3xl font-bold">
              {evaluation.totalScore ?? "—"}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {evaluation.maxScore ?? "—"}
              </span>
            </p>
            <Badge variant={evaluation.readAt ? "outline" : "secondary"} className="mt-1">
              {evaluation.readAt ? "Leída" : "Nueva"}
            </Badge>
          </div>
          {/* Exportar PDF: solo si la evaluación tiene academia (rúbrica
              institucional o membresía del teacher). */}
          {academy && (
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <FileDownIcon className="size-4" />
              Exportar PDF
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {scores.map((score) => (
          <div key={score.criteriaId} className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{score.criterionName ?? "Criterio"}</p>
              <Badge variant="secondary">
                {score.levelName ?? "—"} · {score.score}
              </Badge>
            </div>
            {score.descriptor && (
              <p className="mt-2 text-sm text-muted-foreground">{score.descriptor}</p>
            )}
            {score.comment && (
              <p className="mt-2 rounded-md bg-accent/50 p-2 text-sm">{score.comment}</p>
            )}
          </div>
        ))}
      </div>

      {evaluation.globalComment && (
        <div className="rounded-xl border border-border p-4">
          <p className="mb-1 font-medium">Comentario global</p>
          <p className="text-sm text-muted-foreground">{evaluation.globalComment}</p>
        </div>
      )}
    </div>
  )
}