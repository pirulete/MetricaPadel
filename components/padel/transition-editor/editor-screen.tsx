"use client"

/**
 * Pantalla del editor de transiciones (T10): orquesta canvas, filmstrip y barra
 * contextual sobre un historial undo/redo (`lib/padel/court/history.ts`).
 *
 * - Estado: documento (`initialStepIndex` + `steps`) en `HistoryState`, paso
 *   activo, jugador seleccionado, título local (fuera del historial: escribir
 *   no llena la pila de undo) y modo Probar.
 * - EC-05: borrar el último paso se bloquea con toast.
 * - EC-07: título vacío ⇒ Guardar deshabilitado.
 * - EC-11: salir con cambios sin guardar pide confirmación (`AlertDialog`) y
 *   `beforeunload` cubre refresh/cierre.
 * - Probar: monta `ScenarioPreview` (motor `CourtStage` existente) con el
 *   escenario EN MEMORIA; no requiere guardar.
 *
 * No fetchea el documento: lo entrega la página (T11).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ScenarioPreview from "@/components/court/ScenarioPreview"
import { useTransitions } from "@/hooks/use-transitions"
import {
  addStep,
  clearShot,
  duplicateStep,
  movePlayer,
  moveShotControl,
  moveShotTo,
  nudgePlayer,
  removeStep,
  reorderSteps,
  setShot,
  type Delta,
} from "@/lib/padel/court/editor"
import { canRedo, canUndo, commit, createHistory, redo, undo } from "@/lib/padel/court/history"
import { clampStepIndex } from "@/lib/padel/court/steps"
import { emptyTransitionDoc, type TransitionRow } from "@/lib/padel/court/transition"
import type { CourtPoint, Paso, PlayerId } from "@/lib/padel/court/types"
import { ContextBar } from "./context-bar"
import { ScenarioCanvas, type ShotPatch } from "./scenario-canvas"
import { StepFilmstrip } from "./step-filmstrip"

/** Avance del preview entre pasos (ms). */
const TWEEN_MS = 1000
const TITLE_MAX = 200

/** Documento editable (lo que va al historial). */
type EditorDoc = { initialStepIndex: number; steps: Paso[] }

/** Documento inicial que entrega la página (create o edit). */
export type EditorInitialDoc = EditorDoc & { id: string; title: string }

export type EditorScreenProps = {
  initial?: EditorInitialDoc
}

export function EditorScreen({ initial }: EditorScreenProps) {
  const router = useRouter()
  const { create, update } = useTransitions()

  const [id, setId] = React.useState<string | null>(initial?.id ?? null)
  const [title, setTitle] = React.useState(() => initial?.title ?? emptyTransitionDoc().title)
  const [savedTitle, setSavedTitle] = React.useState(() => initial?.title ?? emptyTransitionDoc().title)
  const [history, setHistory] = React.useState(() =>
    createHistory<EditorDoc>({
      initialStepIndex: initial?.initialStepIndex ?? 0,
      steps: initial?.steps ?? emptyTransitionDoc().steps,
    })
  )
  const [activeRaw, setActiveRaw] = React.useState(() =>
    clampStepIndex(initial?.initialStepIndex ?? 0, initial?.steps.length ?? 1)
  )
  const [selected, setSelected] = React.useState<PlayerId | null>(null)
  const [collapsed, setCollapsed] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [previewing, setPreviewing] = React.useState(false)
  const [previewIndex, setPreviewIndex] = React.useState(0)
  const [confirmExit, setConfirmExit] = React.useState(false)

  const doc = history.present
  const steps = doc.steps
  const activeIndex = clampStepIndex(activeRaw, steps.length)
  const step = steps[activeIndex]
  const dirty = canUndo(history) || title.trim() !== savedTitle.trim()
  const canSave = title.trim().length > 0 && steps.length > 0 && !saving

  const commitDoc = (next: EditorDoc) => setHistory((current) => commit(current, next))

  const replaceActiveStep = (next: Paso) =>
    commitDoc({ ...doc, steps: steps.map((item, index) => (index === activeIndex ? next : item)) })

  const handleMovePlayer = (playerId: PlayerId, point: CourtPoint) =>
    replaceActiveStep(movePlayer(step, playerId, point))

  const handleMoveShot = (patch: ShotPatch) => {
    let next = step
    if (patch.to) next = moveShotTo(next, patch.to)
    if (patch.control) next = moveShotControl(next, patch.control)
    replaceActiveStep(next)
  }

  const handleNudge = (delta: Delta) => {
    if (!selected) return
    replaceActiveStep(nudgePlayer(step, selected, delta))
  }

  const handleAdd = () => {
    const next = addStep(steps)
    commitDoc({ ...doc, steps: next })
    setActiveRaw(next.length - 1)
    setCollapsed(false)
  }

  const handleDuplicate = () => {
    const next = duplicateStep(steps, activeIndex)
    commitDoc({ ...doc, steps: next })
    setActiveRaw(activeIndex + 1)
    setCollapsed(false)
  }

  const handleRemove = () => {
    const result = removeStep(steps, activeIndex)
    if (!result.ok) {
      toast.error("El escenario necesita al menos un paso")
      return
    }
    commitDoc({ ...doc, steps: result.steps })
    setActiveRaw(clampStepIndex(activeIndex, result.steps.length))
  }

  const handleMoveStep = (from: number, to: number) => {
    commitDoc({ ...doc, steps: reorderSteps(steps, from, to) })
    setActiveRaw(to)
  }

  const togglePreview = () => {
    if (previewing) {
      setPreviewing(false)
      return
    }
    setSelected(null)
    setPreviewIndex(activeIndex)
    setPreviewing(true)
  }

  React.useEffect(() => {
    if (!previewing) return
    const total = steps.length
    if (total <= 1) return
    const timer = window.setTimeout(() => {
      const next = previewIndex + 1
      if (next >= total) setPreviewing(false)
      else setPreviewIndex(next)
    }, TWEEN_MS)
    return () => window.clearTimeout(timer)
  }, [previewing, previewIndex, steps.length])

  React.useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const handleSave = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      toast.error("El título es obligatorio")
      return
    }
    setSaving(true)
    const payload = {
      title: trimmed,
      initialStepIndex: clampStepIndex(doc.initialStepIndex, steps.length),
      steps,
    }
    const result = id ? await update(id, payload) : await create(payload)
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setId(result.transition.id)
    setTitle(result.transition.title)
    setSavedTitle(result.transition.title)
    setHistory(
      createHistory<EditorDoc>({
        initialStepIndex: result.transition.initialStepIndex,
        steps: result.transition.steps,
      })
    )
    setActiveRaw((current) => clampStepIndex(current, result.transition.steps.length))
    toast.success("Transición guardada")
    if (!id) router.replace(`/transiciones/${result.transition.id}`)
  }

  const requestExit = () => {
    if (dirty) {
      setConfirmExit(true)
      return
    }
    router.push("/transiciones")
  }

  const previewRow = React.useMemo<TransitionRow>(
    () => ({
      id: id ?? "draft",
      title: title.trim() || "Transición",
      scenario: { initialStepIndex: doc.initialStepIndex, steps },
    }),
    [id, title, doc.initialStepIndex, steps]
  )

  const originPositions = steps[activeIndex - 1]?.positions ?? step.positions

  const filmstrip = (
    <StepFilmstrip
      steps={steps}
      activeIndex={activeIndex}
      dirty={dirty}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((value) => !value)}
      onSelect={setActiveRaw}
      onAdd={handleAdd}
      onDuplicate={handleDuplicate}
      onRemove={handleRemove}
      onMove={handleMoveStep}
    />
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          onClick={requestExit}
          aria-label="Volver a transiciones"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={TITLE_MAX}
          placeholder="Título de la transición"
          aria-label="Título de la transición"
          className="h-11"
        />
        {saving && (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px] md:items-start">
        <div className="min-w-0 space-y-2">
          {previewing ? (
            <div
              className="relative overflow-hidden rounded-xl border bg-muted"
              style={{ height: "clamp(300px, 54vh, 520px)" }}
            >
              <ScenarioPreview row={previewRow} index={previewIndex} className="h-full w-full" />
              <p
                role="status"
                className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm"
              >
                Reproduciendo paso {previewIndex + 1} de {steps.length}
              </p>
            </div>
          ) : (
            <ScenarioCanvas
              step={step}
              originPositions={originPositions}
              selected={selected}
              onSelect={setSelected}
              onMovePlayer={handleMovePlayer}
              onMoveShot={handleMoveShot}
            />
          )}

          <div className="md:hidden">{filmstrip}</div>

          <ContextBar
            selection={selected}
            stepNumber={activeIndex + 1}
            hasShot={step.shot !== null}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            dirty={dirty}
            saving={saving}
            canSave={canSave}
            previewing={previewing}
            onNudge={handleNudge}
            onSetShot={() => replaceActiveStep(setShot(step))}
            onClearShot={() => replaceActiveStep(clearShot(step))}
            onUndo={() => setHistory((current) => undo(current))}
            onRedo={() => setHistory((current) => redo(current))}
            onPreview={togglePreview}
            onSave={() => void handleSave()}
          />
        </div>

        <aside className="hidden md:sticky md:top-2 md:block">{filmstrip}</aside>
      </div>

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar en esta transición. Si sales ahora se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push("/transiciones")}>
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
