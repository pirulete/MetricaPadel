"use client"

/**
 * Preview "Probar" del editor de transiciones.
 *
 * Adaptador de props: monta el `CourtStage` EXISTENTE (motor de animación con
 * su único reloj rAF) con el `CourtScenario` derivado de la fila de DB vía
 * `toCourtScenario`. Aquí no hay animación nueva ni `setTimeout`: el índice del
 * paso es controlado por el padre (`editor-screen`, T10), que avanza con
 * `clampStepIndex`. Medición del contenedor vía `useCourtConfig` (E5).
 *
 * Regla D-T4: `CourtStage` se importa con `dynamic({ ssr: false })` — Konva
 * nunca se evalúa en el servidor.
 */

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { clampStepIndex } from "@/lib/padel/court/steps"
import { toCourtScenario, type TransitionRow } from "@/lib/padel/court/transition"
import { useCourtConfig } from "./useCourtConfig"

const CourtStage = dynamic(() => import("./CourtStage"), { ssr: false })

export type ScenarioPreviewProps = {
  /** Fila mínima de `coach_transitions` (`id`, `title`, `scenario`). */
  row: TransitionRow
  /** Paso a mostrar (0-based). Por defecto `scenario.initialStepIndex`. */
  index?: number
  className?: string
}

export default function ScenarioPreview({ row, index, className }: ScenarioPreviewProps) {
  const { containerRef, isReady, width, height, dpr } = useCourtConfig()
  const scenario = useMemo(() => toCourtScenario(row), [row])

  const total = scenario.steps.length
  const stepIndex = clampStepIndex(index ?? scenario.initialStepIndex, total)
  const step = scenario.steps[stepIndex]
  // F7: misma expresión que el editor — el origen del tiro es el paso anterior.
  const originPositions = scenario.steps[stepIndex - 1]?.positions ?? step?.positions

  return (
    <div ref={containerRef} className={className ?? "aspect-[1/2] w-full"}>
      {isReady && step && originPositions && (
        <CourtStage
          step={step}
          originPositions={originPositions}
          viewport={{ width, height, dpr }}
        />
      )}
    </div>
  )
}
