"use client"

/**
 * Filmstrip de pasos del editor (chips numéricos, sin mini-canvas — F-nota).
 *
 * Estados cubiertos: vacío (sin pasos → `EmptyState`), paso activo, documento
 * con cambios sin guardar (`dirty`) y colapsado. Acciones: añadir, duplicar,
 * borrar y reordenar el paso activo. Targets ≥44 px.
 *
 * Presentacional: el estado vive en `editor-screen` (T10).
 */

import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react"
import { EmptyState } from "@/components/padel/empty-state"
import { Button } from "@/components/ui/button"
import type { Paso } from "@/lib/padel/court/types"
import { cn } from "@/lib/utils"

export type StepFilmstripProps = {
  steps: Paso[]
  /** Índice 0-based del paso activo. */
  activeIndex: number
  dirty?: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelect: (index: number) => void
  onAdd: () => void
  onDuplicate: () => void
  onRemove: () => void
  /** Reordena el paso `from` a `to`. */
  onMove: (from: number, to: number) => void
}

export function StepFilmstrip({
  steps,
  activeIndex,
  dirty = false,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onMove,
}: StepFilmstripProps) {
  const total = steps.length
  const lastIndex = Math.max(0, total - 1)

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <p className="truncate text-[11px] font-medium text-muted-foreground">
          Pasos · {total}
          {dirty && <span className="text-foreground"> · sin guardar</span>}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={onAdd}
            aria-label="Añadir paso"
          >
            <Plus className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir pasos" : "Colapsar pasos"}
          >
            {collapsed ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
          </Button>
        </div>
      </div>

      {!collapsed &&
        (total === 0 ? (
          <div className="px-2 pb-2">
            <EmptyState
              title="Aún no hay pasos"
              description="Añade el primero para colocar jugadores y dirigir el tiro."
              action={
                <Button size="sm" onClick={onAdd}>
                  <Plus className="size-4" /> Añadir paso
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Pasos de la transición"
              className="flex items-center gap-1.5 overflow-x-auto px-2 pb-2"
            >
              {steps.map((step, index) => {
                const active = index === activeIndex
                return (
                  <button
                    key={step.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={`Paso ${index + 1}${active ? " (activo)" : ""}`}
                    onClick={() => onSelect(index)}
                    className={cn(
                      "relative flex size-11 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {index + 1}
                    {active && dirty && (
                      <span
                        className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                        aria-hidden
                      />
                    )}
                  </button>
                )
              })}
              <Button
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                onClick={onAdd}
                aria-label="Añadir paso al final"
              >
                <Plus className="size-4" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5 border-t px-2 py-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-11 flex-1"
                disabled={activeIndex <= 0}
                onClick={() => onMove(activeIndex, activeIndex - 1)}
              >
                ← Mover
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 flex-1"
                disabled={activeIndex >= lastIndex}
                onClick={() => onMove(activeIndex, activeIndex + 1)}
              >
                Mover →
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                onClick={onDuplicate}
                aria-label="Duplicar paso activo"
              >
                <Copy className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                disabled={total <= 1}
                onClick={onRemove}
                aria-label="Borrar paso activo"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </>
        ))}
    </div>
  )
}
