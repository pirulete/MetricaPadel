"use client"

/**
 * Barra inferior fija del editor: controles contextuales según la selección
 * (layout C de `design-approved.md`), undo/redo y acciones de documento.
 *
 * - Nada seleccionado → nudges y tiro deshabilitados con la pista del gesto.
 * - Jugador seleccionado → nudges ±0,5 m + fijar/quitar tiro.
 * - Con tiro en el paso → «Quitar tiro» habilitado.
 *
 * Presentacional: el estado y las mutaciones viven en `editor-screen` (T10).
 * Targets ≥44 px (`size-11` / `h-11`).
 *
 * Modelo mental (G3 de `design-exploration.md`): «Probar» reproduce en memoria
 * (no persiste) y «Guardar» escribe en la biblioteca. La distinción va por
 * `aria-describedby` — nunca por el nombre accesible, que debe seguir siendo
 * exactamente «Probar» / «Guardar» (locators E2E en strict mode).
 */

import * as React from "react"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Loader2,
  Play,
  Redo2,
  Target,
  Trash2,
  Undo2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { NUDGE_M, type Delta } from "@/lib/padel/court/editor"
import type { PlayerId } from "@/lib/padel/court/types"

/** Etiqueta del paso de nudge, derivada de la constante del editor. */
const NUDGE_LABEL = `±${String(NUDGE_M).replace(".", ",")} m`

/**
 * Ids fijos: sólo hay un editor montado a la vez, así que son únicos y dan
 * selectores estables en E2E (`useId()` genera ids con `:` imposibles en CSS).
 */
const PREVIEW_HINT_ID = "transition-preview-hint"
const SAVE_HINT_ID = "transition-save-hint"

/** El feedback «Guardado ✓» vive 2 s y no renombra el botón. */
const SAVED_FEEDBACK_MS = 2000

const NUDGES = [
  { key: "left", icon: ArrowLeft, delta: { x: -NUDGE_M, y: 0 }, label: "Mover a la izquierda" },
  { key: "up", icon: ArrowUp, delta: { x: 0, y: -NUDGE_M }, label: "Mover arriba" },
  { key: "down", icon: ArrowDown, delta: { x: 0, y: NUDGE_M }, label: "Mover abajo" },
  { key: "right", icon: ArrowRight, delta: { x: NUDGE_M, y: 0 }, label: "Mover a la derecha" },
] as const satisfies readonly { key: string; icon: typeof ArrowLeft; delta: Delta; label: string }[]

export type ContextBarProps = {
  selection: PlayerId | null
  /** Paso activo, 1-based (sólo para la etiqueta). */
  stepNumber: number
  hasShot: boolean
  canUndo: boolean
  canRedo: boolean
  dirty?: boolean
  saving?: boolean
  /** `false` con título vacío (EC-07). */
  canSave?: boolean
  previewing?: boolean
  onNudge: (delta: Delta) => void
  onSetShot: () => void
  onClearShot: () => void
  onUndo: () => void
  onRedo: () => void
  onPreview: () => void
  onSave: () => void
}

export function ContextBar({
  selection,
  stepNumber,
  hasShot,
  canUndo,
  canRedo,
  dirty = false,
  saving = false,
  canSave = true,
  previewing = false,
  onNudge,
  onSetShot,
  onClearShot,
  onUndo,
  onRedo,
  onPreview,
  onSave,
}: ContextBarProps) {
  const disabled = selection === null
  const label = disabled ? "Toca un jugador en la cancha" : `Jugador ${selection} · Paso ${stepNumber}`

  // «Guardado ✓» tras un guardado OK: se detecta la transición `saving → false`
  // y el temporizador se limpia si el documento vuelve a ensuciarse (C5).
  const wasSaving = React.useRef(false)
  const [justSaved, setJustSaved] = React.useState(false)

  React.useEffect(() => {
    const finished = wasSaving.current && !saving
    wasSaving.current = saving
    if (!finished || dirty) {
      setJustSaved(false)
      return
    }
    setJustSaved(true)
    const timer = window.setTimeout(() => setJustSaved(false), SAVED_FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [saving, dirty])

  const saveLabel = saving ? "Guardando…" : justSaved ? "Guardado ✓" : "Guardar"

  return (
    <div className="sticky bottom-0 z-20 mt-2 rounded-t-xl border border-b-0 bg-card/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <p className="truncate text-xs font-medium" aria-live="polite">
          {label}
        </p>
        <Badge
          variant={dirty ? "secondary" : "outline"}
          role="status"
          title={dirty ? "Tienes cambios sin guardar" : "Todo guardado"}
          className="shrink-0"
        >
          <span aria-hidden>{dirty ? "●" : "✓"}</span>
          {dirty ? "Cambios sin guardar" : "Guardado"}
        </Badge>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {disabled ? "nudges" : NUDGE_LABEL}
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-2 py-2">
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Ajuste fino de posición">
          {NUDGES.map((nudge) => (
            <Button
              key={nudge.key}
              variant="outline"
              size="icon"
              className="size-11"
              disabled={disabled}
              onClick={() => onNudge(nudge.delta)}
              aria-label={nudge.label}
            >
              <nudge.icon className="size-4" />
            </Button>
          ))}
        </div>
        <Separator orientation="vertical" className="mx-0.5 h-9" />
        <div className="flex flex-1 gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="size-11 flex-1"
            disabled={disabled}
            onClick={onSetShot}
            aria-label="Fijar tiro desde el jugador seleccionado"
          >
            <Target className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11 flex-1"
            disabled={disabled || !hasShot}
            onClick={onClearShot}
            aria-label="Quitar el tiro del paso"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-2 pb-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          disabled={!canUndo}
          onClick={onUndo}
          aria-label="Deshacer"
        >
          <Undo2 className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          disabled={!canRedo}
          onClick={onRedo}
          aria-label="Rehacer"
        >
          <Redo2 className="size-5" />
        </Button>
        <Button
          variant="outline"
          className="ml-auto h-11 px-2"
          onClick={onPreview}
          aria-pressed={previewing}
          aria-describedby={PREVIEW_HINT_ID}
        >
          {previewing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {previewing ? "Detener" : "Probar"}
        </Button>
        <Button
          className="h-11 px-2"
          onClick={onSave}
          disabled={saving || !canSave}
          aria-label="Guardar"
          aria-describedby={SAVE_HINT_ID}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {saveLabel}
        </Button>
      </div>

      {/* Copy distingue las dos acciones sin tocar el nombre accesible (C2). */}
      <span id={PREVIEW_HINT_ID} className="sr-only">
        Reproduce la jugada en memoria · no guarda
      </span>
      <span id={SAVE_HINT_ID} className="sr-only">
        Guarda en tu biblioteca
      </span>
    </div>
  )
}
