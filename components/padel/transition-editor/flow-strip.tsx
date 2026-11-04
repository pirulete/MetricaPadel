"use client"

/**
 * Strip del flujo del editor (O1 de `design-exploration.md`): ①Paso ②Mueve
 * ③Tiro ④Prueba ⑤Guarda, con el paso activo en `aria-current="step"`.
 *
 * Presentacional y **no interactivo**: `<ol>/<li>`, nunca `role="tab"` ni
 * `<button>` — así no colisiona con los locators E2E del filmstrip
 * (`getByRole("tab", { name: /^Paso N/ })`).
 *
 * Colapsa a una sola línea ("Paso 2 de 5 · Tiro") cuando `collapsed` es true
 * (tras el primer guardado), para no ocupar espacio en uso diario.
 */

import { cn } from "@/lib/utils"
import { deriveFlowStep } from "@/lib/padel/court/flow"
import type { PlayerId } from "@/lib/padel/court/types"

const FLOW_STEPS = [
  { glyph: "①", label: "Paso", hint: "Crea el primer paso" },
  { glyph: "②", label: "Mueve", hint: "Toca un jugador y muévelo" },
  { glyph: "③", label: "Tiro", hint: "Coloca el golpe con el arco" },
  { glyph: "④", label: "Prueba", hint: "Reproduce la jugada en memoria" },
  { glyph: "⑤", label: "Guarda", hint: "Guarda en tu biblioteca" },
] as const

export type FlowStripProps = {
  stepsCount: number
  selected: PlayerId | null
  hasShot: boolean
  dirty: boolean
  previewing: boolean
  /** Tras el primer guardado el strip se reduce a una línea. */
  collapsed?: boolean
}

export function FlowStrip({
  stepsCount,
  selected,
  hasShot,
  dirty,
  previewing,
  collapsed = false,
}: FlowStripProps) {
  const current = deriveFlowStep({ stepsCount, selected, hasShot, dirty, previewing })
  const active = FLOW_STEPS[current - 1]

  if (collapsed) {
    return (
      <p className="px-1 text-xs font-medium text-muted-foreground md:sticky md:top-2 md:z-10 md:bg-background">
        Paso {current} de {FLOW_STEPS.length} · {active.label}
      </p>
    )
  }

  return (
    <nav aria-label="Flujo del editor" className="md:sticky md:top-2 md:z-10 md:bg-background">
      <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {FLOW_STEPS.map((item, index) => {
          const step = index + 1
          const isActive = step === current
          const isDone = step < current
          return (
            <li
              key={item.label}
              aria-current={isActive ? "step" : undefined}
              title={item.hint}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs",
                isActive && "border-primary bg-primary/10 font-semibold text-primary",
                isDone && !isActive && "border-transparent text-muted-foreground",
                !isActive && !isDone && "border-transparent text-muted-foreground/70"
              )}
            >
              <span aria-hidden>{item.glyph}</span>
              <span>{item.label}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
