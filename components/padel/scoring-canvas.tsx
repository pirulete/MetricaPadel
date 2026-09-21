"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StudentPicker } from "@/components/padel/student-picker"
import { computeMaxScore, computeTotalScore, validatePublish } from "@/lib/padel/score"

type Level = { id: string; name: string; score: number; sortOrder: number }
type Criterion = { id: string; name: string; sortOrder: number }
type Descriptor = { criteriaId: string; levelId: string; text: string }
type RubricDetail = {
  rubric: { id: string; title: string; category: string; status: string }
  levels: Level[]
  criteria: Criterion[]
  descriptors: Descriptor[]
}
type ScoreSelection = { criteriaId: string; levelId: string; comment?: string }

interface ScoringCanvasProps {
  evaluationId?: string
}

/** Canvas de evaluación P09: score en vivo por criterio + persistencia en borrador. */
export function ScoringCanvas({ evaluationId }: ScoringCanvasProps) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(Boolean(evaluationId))
  const [rubrics, setRubrics] = React.useState<RubricDetail[]>([])
  const [rubricId, setRubricId] = React.useState<string>("")
  const [studentId, setStudentId] = React.useState<string | null>(null)
  const [scores, setScores] = React.useState<ScoreSelection[]>([])
  const [globalComment, setGlobalComment] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [version, setVersion] = React.useState<number | null>(null)

  const rubric = rubrics.find((r) => r.rubric.id === rubricId) ?? null
  const totalScore = computeTotalScore(
    scores.map((s) => ({
      criteriaId: s.criteriaId,
      score: rubric?.levels.find((l) => l.id === s.levelId)?.score ?? 0,
    }))
  )
  const maxScore = rubric ? computeMaxScore(rubric.criteria.length) : 0
  const canPublish = rubric ? validatePublish(scores, rubric.criteria.length) : false

  // Carga inicial: rúbricas del coach + (si aplica) evaluación existente.
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [rubricsRes] = await Promise.all([
          fetch("/api/rubrics", { cache: "no-store" }),
          evaluationId
            ? fetch(`/api/evaluations/${evaluationId}`, { cache: "no-store" })
            : Promise.resolve(null),
        ])
        if (!rubricsRes.ok) throw new Error("No se pudieron cargar las rúbricas")
        const rubricsBody = await rubricsRes.json()

        const details = await Promise.all(
          rubricsBody.rubrics.map(async (r: { id: string }) => {
            const res = await fetch(`/api/rubrics/${r.id}`, { cache: "no-store" })
            return res.ok ? res.json() : null
          })
        )
        if (cancelled) return
        setRubrics(details.filter(Boolean))

        if (evaluationId) {
          const evRes = await fetch(`/api/evaluations/${evaluationId}`, { cache: "no-store" })
          if (!evRes.ok) throw new Error("No se pudo cargar la evaluación")
          const evBody = await evRes.json()
          setRubricId(evBody.evaluation.rubricId)
          setStudentId(evBody.evaluation.studentId)
          setVersion(evBody.evaluation.version ?? null)
          setGlobalComment(evBody.evaluation.globalComment ?? "")
          setScores(
            evBody.scores.map((s: { criteriaId: string; levelId: string; comment?: string }) => ({
              criteriaId: s.criteriaId,
              levelId: s.levelId,
              comment: s.comment ?? undefined,
            }))
          )
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error al cargar")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [evaluationId])

  const selectLevel = (criteriaId: string, levelId: string) => {
    setScores((prev) => {
      const existing = prev.find((s) => s.criteriaId === criteriaId)
      if (existing) {
        return prev.map((s) =>
          s.criteriaId === criteriaId ? { ...s, levelId } : s
        )
      }
      return [...prev, { criteriaId, levelId }]
    })
  }

  const updateComment = (criteriaId: string, comment: string) => {
    setScores((prev) => {
      const existing = prev.find((s) => s.criteriaId === criteriaId)
      if (existing) {
        return prev.map((s) =>
          s.criteriaId === criteriaId ? { ...s, comment } : s
        )
      }
      return [...prev, { criteriaId, levelId: "", comment }]
    })
  }

  const ensureDraft = async (): Promise<string | null> => {
    if (evaluationId) return evaluationId
    if (!studentId || !rubricId) {
      toast.error("Selecciona alumno y rúbrica")
      return null
    }
    const res = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, rubricId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error ?? "No se pudo crear la evaluación")
    }
    const body = await res.json()
    return body.evaluation.id
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const draftId = await ensureDraft()
      if (!draftId) return
      const res = await fetch(`/api/evaluations/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scores: scores
            .filter((s) => s.levelId)
            .map((s) => ({
              criteriaId: s.criteriaId,
              levelId: s.levelId,
              comment: s.comment?.trim() || undefined,
            })),
          globalComment: globalComment.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "No se pudo guardar")
      }
      toast.success("Borrador guardado")
      if (!evaluationId) {
        const body = await res.json()
        router.replace(`/evaluar/${body.evaluation.id}`)
        router.refresh()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!evaluationId) {
      toast.error("Guarda el borrador antes de publicar")
      return
    }
    setPublishing(true)
    try {
      const res = await fetch(`/api/evaluations/${evaluationId}/publish`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "No se pudo publicar")
      }
      const body = await res.json()
      if (body.alreadyEvaluated && rubric) {
        toast.warning(
          `Ya evaluaste ${rubric.rubric.category} para este alumno. Puedes publicar pero considera evaluar otras dimensiones.`
        )
      } else {
        toast.success("Evaluación publicada")
      }
      router.push("/evaluaciones")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al publicar")
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {evaluationId ? "Evaluación en curso" : "Evaluar alumno"}
          {version && version > 1 && (
            <span className="ml-2 align-middle text-sm font-medium text-muted-foreground">
              v{version}
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          Selecciona nivel por criterio. El score se calcula en vivo.
        </p>
      </div>

      {!evaluationId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Alumno</Label>
            <StudentPicker value={studentId} onChange={setStudentId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eval-rubric">Rúbrica</Label>
            <Select value={rubricId} onValueChange={setRubricId}>
              <SelectTrigger id="eval-rubric">
                <SelectValue placeholder="Selecciona rúbrica" />
              </SelectTrigger>
              <SelectContent>
                {rubrics.map((r) => (
                  <SelectItem key={r.rubric.id} value={r.rubric.id}>
                    {r.rubric.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {rubric && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-4">
            <div>
              <p className="font-semibold">{rubric.rubric.title}</p>
              <p className="text-sm text-muted-foreground">
                {rubric.criteria.length} criterios · niveles fijos
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {totalScore}
                <span className="text-sm font-normal text-muted-foreground"> / {maxScore}</span>
              </p>
              <p className="text-xs text-muted-foreground">Score en vivo</p>
            </div>
          </div>

          {rubric.criteria.map((criterion) => {
            const selected = scores.find((s) => s.criteriaId === criterion.id)
            return (
              <div key={criterion.id} className="rounded-xl border border-border p-4">
                <p className="mb-3 font-medium">{criterion.name}</p>
                <div className="grid gap-2 sm:grid-cols-4">
                  {rubric.levels.map((level) => {
                    const descriptor =
                      rubric.descriptors.find(
                        (d) => d.criteriaId === criterion.id && d.levelId === level.id
                      )?.text ?? "—"
                    const isSelected = selected?.levelId === level.id
                    return (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => selectLevel(criterion.id, level.id)}
                        aria-pressed={isSelected}
                        className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-accent"
                        }`}
                      >
                        <span className="flex items-center justify-between font-medium">
                          {level.name}
                          <span className="text-xs text-muted-foreground">{level.score}</span>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {descriptor}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <Textarea
                  className="mt-3"
                  value={selected?.comment ?? ""}
                  onChange={(e) => updateComment(criterion.id, e.target.value)}
                  placeholder="Comentario del criterio (opcional)"
                  maxLength={2000}
                  rows={2}
                  aria-label={`Comentario de ${criterion.name}`}
                />
              </div>
            )
          })}

          <div className="space-y-2">
            <Label htmlFor="eval-global-comment">Comentario global</Label>
            <Textarea
              id="eval-global-comment"
              value={globalComment}
              onChange={(e) => setGlobalComment(e.target.value)}
              placeholder="Resumen de la evaluación (opcional)"
              maxLength={5000}
              rows={3}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar borrador"}
            </Button>
            <Button
              onClick={handlePublish}
              disabled={publishing || !canPublish}
              title={canPublish ? undefined : "Faltan criterios por evaluar"}
            >
              {publishing ? "Publicando…" : "Publicar evaluación"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}