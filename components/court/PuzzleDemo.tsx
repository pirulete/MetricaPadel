"use client"

/**
 * Wrapper navegable del spike: controles del puzzle + punto único de entrada a
 * Konva vía `dynamic(..., { ssr: false })` (patrón D-T3/D-T4).
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 */

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useCourtConfig } from "./useCourtConfig"
import { DEMO_SCENARIO } from "@/lib/padel/court/demo-scenario"
import { clampStepIndex } from "@/lib/padel/court/steps"
import type { CourtViewport } from "@/lib/padel/court/types"

const CourtStage = dynamic(() => import("./CourtStage"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-muted" />,
})

const STEPS = DEMO_SCENARIO.steps

export function PuzzleDemo() {
  const { containerRef, isReady, width, height, dpr } = useCourtConfig()
  const [pasoActivo, setPasoActivo] = useState(DEMO_SCENARIO.initialStepIndex)

  const viewport = useMemo<CourtViewport>(() => ({ width, height, dpr }), [width, height, dpr])

  const activeStep = STEPS[clampStepIndex(pasoActivo, STEPS.length)]
  const isFirst = pasoActivo <= 0
  const isLast = pasoActivo >= STEPS.length - 1

  // Clamp + update funcional: 20 toggles en ráfaga convergen al mismo paso (E1/E4).
  const move = (delta: number) =>
    setPasoActivo((current) => clampStepIndex(current + delta, STEPS.length))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{DEMO_SCENARIO.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cancha 20×10 m · {STEPS.length} pasos · animación sobre refs de Konva (sin re-render por frame)
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div
          ref={containerRef}
          className="aspect-[2/1] w-full overflow-hidden rounded-lg border bg-muted/30"
        >
          {isReady && <CourtStage step={activeStep} viewport={viewport} />}
        </div>

        {/* AC-12: texto alternativo del paso activo, fuera del canvas. */}
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {activeStep.label}
        </p>
      </CardContent>

      <CardFooter className="justify-between gap-2">
        <Button variant="outline" onClick={() => move(-1)} disabled={isFirst}>
          Paso anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          {activeStep.id} / {STEPS.length}
        </span>
        <Button onClick={() => move(1)} disabled={isLast}>
          Siguiente paso
        </Button>
      </CardFooter>
    </Card>
  )
}
