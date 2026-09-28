"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PairStudentPicker } from "@/components/padel/pair-student-picker"
import {
  applySharedSelection,
  computePairTotals,
  isSharedCategory,
  syncPairScores,
  validatePairPublish,
  type PairScore,
} from "@/lib/padel/pair"

type Level = { id: string; name: string; score: number; sortOrder: number }
type Criterion = { id: string; name: string; sortOrder: number }
type Descriptor = { criteriaId: string; levelId: string; text: string }
type RubricDetail = {
  rubric: { id: string; title: string; category: string; status: string }
  levels: Level[]
  criteria: Criterion[]
  descriptors: Descriptor[]
}

interface PairScoringCanvasProps {
  courseId?: string
}

/**
 * Canvas de evaluación en pareja 2v2 (SPEC-01): 2 alumnos del mismo curso,
 * criterios compartidos (fila única sincronizada) vs individuales (columnas
 * A/B), score en vivo por alumno y duración medida desde el mount.
 */
export function PairScoringCanvas({ courseId }: PairScoringCanvasProps) {
  const router = useRouter()
  const startRef = React.useRef<number | null>(null)
  const [durationSeconds, setDurationSeconds] = React.useState(0)

  const [loading, setLoading] = React.useState(true)
  const [rubrics, setRubrics] = React.useState<RubricDetail[]>([])
  const [rubricId, setRubricId] = React.useState<string>("")

  const [studentAId, setStudentAId] = React.useState<string | null>(null)
  const [studentBId, setStudentBId] = React.useState<string | null>(null)
  const [scoresA, setScoresA] = React.useState<PairScore[]>([])
  const [scoresB, setScoresB] = React.useState<PairScore[]>([])
  const [sharedCriteriaIds, setSharedCriteriaIds] = React.useState<Set<string>>(new Set())
  const [globalCommentA, setGlobalCommentA] = React.useState("")
  const [globalCommentB, setGlobalCommentB] = React.useState("")

  const [evaluationAId, setEvaluationAId] = React.useState<string | null>(null)
  const [evaluationBId, setEvaluationBId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)

  const rubric = rubrics.find((r) => r.rubric.id === rubricId) ?? null
  const levelScoreById = new Map(rubric?.levels.map((l) => [l.id, l.score]) ?? [])
  const { totalA, totalB, maxScore } = computePairTotals(scoresA, scoresB, levelScoreById)
  const publishCheck = rubric
    ? validatePairPublish(scoresA, scoresB, rubric.criteria.length)
    : { valid: false, missingA: 0, missingB: 0 }

  // Carga inicial: rúbricas del coach + timer de duración.
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rubricsRes = await fetch("/api/rubrics", { cache: "no-store" })
        if (!rubricsRes.ok) throw new Error("No se pudieron cargar las rúbricas")
        const rubricsBody = await rubricsRes.json()
        const details = await Promise.all(
          rubricsBody.items.map(async (r: { id: string }) => {
            const res = await fetch(`/api/rubrics/${r.id}`, { cache: "no-store" })
            return res.ok ? res.json() : null
          })
        )
        if (!cancelled) setRubrics(details.filter(Boolean))
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error al cargar")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    const timer = setInterval(() => {
      setDurationSeconds(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000))
    }, 1000)
    startRef.current = Date.now()
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const toggleShared = (criteriaId: string) => {
    if (sharedCriteriaIds.has(criteriaId)) {
      setSharedCriteriaIds((prev) => {
        const next = new Set(prev)
        next.delete(criteriaId)
        return next
      })
      return
    }
    setSharedCriteriaIds((prev) => {
      const next = new Set(prev)
      next.add(criteriaId)
      return next
    })
    // Al activar el toggle, sincroniza A → B (y B → A si A no lo tiene).
    const synced = syncPairScores(scoresA, scoresB, [criteriaId])
    setScoresA(synced.scoresA)
    setScoresB(synced.scoresB)
  }

  const selectSharedLevel = (criteriaId: string, levelId: string) => {
    const synced = applySharedSelection(scoresA, scoresB, criteriaId, levelId)
    setScoresA(synced.scoresA)
    setScoresB(synced.scoresB)
  }

  const selectLevel = (side: "A" | "B", criteriaId: string, levelId: string) => {
    const setter = side === "A" ? setScoresA : setScoresB
    setter((prev) => {
      const idx = prev.findIndex((s) => s.criteriaId === criteriaId)
      if (idx >= 0) return prev.map((s) => (s.criteriaId === criteriaId ? { ...s, levelId } : s))
      return [...prev, { criteriaId, levelId }]
    })
  }

  const updateComment = (side: "A" | "B", criteriaId: string, comment: string) => {
    const setter = side === "A" ? setScoresA : setScoresB
    setter((prev) => {
      const idx = prev.findIndex((s) => s.criteriaId === criteriaId)
      if (idx >= 0) return prev.map((s) => (s.criteriaId === criteriaId ? { ...s, comment } : s))
      return [...prev, { criteriaId, levelId: "", comment }]
    })
  }

  const ensureDrafts = async (): Promise<{ evaluationAId: string; evaluationBId: string } | null> => {
    if (evaluationAId && evaluationBId) return { evaluationAId, evaluationBId }
    if (!studentAId || !studentBId || !rubricId || !courseId) {
      toast.error("Selecciona 2 alumnos y una rúbrica")
      return null
    }
    const res = await fetch("/api/evaluations/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentAId, studentBId, rubricId, courseId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error ?? "No se pudo crear la evaluación en pareja")
    }
    const body = await res.json()
    setEvaluationAId(body.evaluationA.id)
    setEvaluationBId(body.evaluationB.id)
    return { evaluationAId: body.evaluationA.id, evaluationBId: body.evaluationB.id }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const drafts = await ensureDrafts()
      if (!drafts) return
      const res = await fetch("/api/evaluations/pair", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluationAId: drafts.evaluationAId,
          evaluationBId: drafts.evaluationBId,
          scoresA: scoresA
            .filter((s) => s.levelId)
            .map((s) => ({ criteriaId: s.criteriaId, levelId: s.levelId, comment: s.comment?.trim() || undefined })),
          scoresB: scoresB
            .filter((s) => s.levelId)
            .map((s) => ({ criteriaId: s.criteriaId, levelId: s.levelId, comment: s.comment?.trim() || undefined })),
          globalCommentA: globalCommentA.trim() || undefined,
          globalCommentB: globalCommentB.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "No se pudo guardar")
      }
      toast.success("Borradores guardados")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!evaluationAId || !evaluationBId) {
      toast.error("Guarda los borradores antes de publicar")
      return
    }
    setPublishing(true)
    try {
      const res = await fetch("/api/evaluations/pair/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluationAId,
          evaluationBId,
          durationSeconds: Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "No se pudo publicar")
      }
      toast.success("Evaluación en pareja publicada")
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

  if (!courseId) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Selecciona un curso para evaluar en pareja.
      </p>
    )
  }

  const studentsReady = Boolean(studentAId && studentBId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Evaluar en pareja</h1>
        <p className="text-sm text-muted-foreground">
          Evalúa a 2 alumnos juntos. Los criterios compartidos se sincronizan; los individuales se puntúan por columna.
        </p>
      </div>

      {!studentsReady && (
        <PairStudentPicker
          courseId={courseId}
          studentAId={studentAId}
          studentBId={studentBId}
          onChange={(a, b) => {
            setStudentAId(a)
            setStudentBId(b)
          }}
          onContinue={() => {
            if (!rubricId && rubrics.length > 0) setRubricId(rubrics[0].rubric.id)
          }}
        />
      )}

      {studentsReady && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Rúbrica</Label>
              <Select value={rubricId} onValueChange={setRubricId}>
                <SelectTrigger id="pair-rubric">
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
            <div className="flex items-end justify-between gap-2 rounded-xl border border-border p-4">
              <div className="text-sm">
                <p className="font-medium">Duración</p>
                <p className="text-muted-foreground">{durationSeconds}s</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Score en vivo</p>
                <p className="text-sm font-semibold">
                  A: {totalA} · B: {totalB}
                  <span className="text-xs font-normal text-muted-foreground"> / {maxScore}</span>
                </p>
              </div>
            </div>
          </div>

          {rubric && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4">
                <p className="font-semibold">{rubric.rubric.title}</p>
                <p className="text-sm text-muted-foreground">
                  {rubric.criteria.length} criterios · niveles fijos ·{" "}
                  {isSharedCategory(rubric.rubric.category) ? "categoría compartida por defecto" : "categoría individual por defecto"}
                </p>
              </div>

              {rubric.criteria.map((criterion) => {
                const isShared = sharedCriteriaIds.has(criterion.id)
                const selectedA = scoresA.find((s) => s.criteriaId === criterion.id)
                const selectedB = scoresB.find((s) => s.criteriaId === criterion.id)
                const levelButton = (
                  level: Level,
                  isSelected: boolean,
                  onSelect: () => void
                ) => {
                  const descriptor =
                    rubric.descriptors.find(
                      (d) => d.criteriaId === criterion.id && d.levelId === level.id
                    )?.text ?? "—"
                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={onSelect}
                      aria-pressed={isSelected}
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        isSelected ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                      }`}
                    >
                      <span className="flex items-center justify-between font-medium">
                        {level.name}
                        <span className="text-xs text-muted-foreground">{level.score}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{descriptor}</span>
                    </button>
                  )
                }

                return (
                  <div key={criterion.id} className="rounded-xl border border-border p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{criterion.name}</p>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Switch
                          checked={isShared}
                          onCheckedChange={() => toggleShared(criterion.id)}
                          aria-label={`Evaluar ${criterion.name} en pareja`}
                        />
                        Evaluar en Pareja
                      </label>
                    </div>

                    {isShared ? (
                      <div className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-4">
                          {rubric.levels.map((level) =>
                            levelButton(level, selectedA?.levelId === level.id, () =>
                              selectSharedLevel(criterion.id, level.id)
                            )
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Nivel sincronizado para ambos alumnos.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase text-muted-foreground">Alumno A</p>
                          <div className="grid gap-2 sm:grid-cols-4">
                            {rubric.levels.map((level) =>
                              levelButton(level, selectedA?.levelId === level.id, () =>
                                selectLevel("A", criterion.id, level.id)
                              )
                            )}
                          </div>
                          <Textarea
                            value={selectedA?.comment ?? ""}
                            onChange={(e) => updateComment("A", criterion.id, e.target.value)}
                            placeholder="Comentario del criterio (opcional)"
                            maxLength={2000}
                            rows={2}
                            aria-label={`Comentario de ${criterion.name} (Alumno A)`}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase text-muted-foreground">Alumno B</p>
                          <div className="grid gap-2 sm:grid-cols-4">
                            {rubric.levels.map((level) =>
                              levelButton(level, selectedB?.levelId === level.id, () =>
                                selectLevel("B", criterion.id, level.id)
                              )
                            )}
                          </div>
                          <Textarea
                            value={selectedB?.comment ?? ""}
                            onChange={(e) => updateComment("B", criterion.id, e.target.value)}
                            placeholder="Comentario del criterio (opcional)"
                            maxLength={2000}
                            rows={2}
                            aria-label={`Comentario de ${criterion.name} (Alumno B)`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pair-global-comment-a">Comentario global — Alumno A</Label>
                  <Textarea
                    id="pair-global-comment-a"
                    value={globalCommentA}
                    onChange={(e) => setGlobalCommentA(e.target.value)}
                    placeholder="Resumen de la evaluación (opcional)"
                    maxLength={5000}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pair-global-comment-b">Comentario global — Alumno B</Label>
                  <Textarea
                    id="pair-global-comment-b"
                    value={globalCommentB}
                    onChange={(e) => setGlobalCommentB(e.target.value)}
                    placeholder="Resumen de la evaluación (opcional)"
                    maxLength={5000}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar borradores"}
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={publishing || !publishCheck.valid}
                  title={
                    publishCheck.valid
                      ? undefined
                      : `Faltan criterios — A: ${publishCheck.missingA}, B: ${publishCheck.missingB}`
                  }
                >
                  {publishing ? "Publicando…" : "Publicar evaluación en pareja"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}