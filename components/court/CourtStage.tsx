"use client"

/**
 * Escena Konva del spike (transición de puzzle tipo PadelChess).
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * **ÚNICO archivo del repo que importa `konva`/`react-konva`** (regla D-T4).
 * Sólo entra al bundle vía `dynamic(..., { ssr: false })` desde `PuzzleDemo`,
 * por eso necesita `export default`.
 *
 * Regla de render: React sólo posee el paso activo y el tamaño; las posiciones
 * se animan con `node.to()` sobre refs de Konva, sin `setState` por frame (AC-04).
 */

import { useEffect, useLayoutEffect, useRef } from "react"
import Konva from "konva"
import { Arrow, Circle, Layer, Line, Stage } from "react-konva"
import { buildArrow, buildCourtLines, buildPlayerMarkers, PLAYER_IDS } from "./CourtLayers"
import { courtToPx } from "@/lib/padel/court/geometry"
import type { CourtViewport, Paso, PlayerId, PlayerPositions } from "@/lib/padel/court/types"

const TWEEN_SECONDS = 0.5
const ARROW_STROKE = "#dc2626"

export type CourtStageProps = {
  /** Paso activo (data serializable de `lib/padel/court`). */
  step: Paso
  /** Tamaño CSS del contenedor + DPR normalizado. */
  viewport: CourtViewport
}

export default function CourtStage({ step, viewport }: CourtStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const circleRefs = useRef<Partial<Record<PlayerId, Konva.Circle | null>>>({})
  const arrowRef = useRef<Konva.Arrow | null>(null)
  const tweensRef = useRef<Konva.Tween[]>([])

  // Memoria de la transición anterior (sólo se lee en efectos, nunca en render).
  const previousPositions = useRef<PlayerPositions>(step.positions)
  const previousStepId = useRef(step.id)

  const { width, height, dpr } = viewport
  const isReady = width > 0 && height > 0

  // E2: al desmontar no queda ningún tween vivo. `Tween#destroy` pausa y libera.
  useEffect(() => {
    return () => {
      for (const tween of tweensRef.current) tween.destroy()
      tweensRef.current = []
    }
  }, [])

  // Nitidez retina (AC-02): cada capa redibuja a la densidad física real.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    for (const layer of stage.getLayers()) {
      layer.getCanvas().setPixelRatio(dpr)
      layer.batchDraw()
    }
  }, [dpr, width, height])

  /**
   * Transición determinista (E1/E7). React ya dejó los nodos en el destino al
   * re-renderizar; aquí se reposicionan en el origen anterior y se anima hasta
   * el destino. Destruir los tweens previos antes de crear los nuevos hace que
   * N toggles en ráfaga converjan siempre al paso activo, sin cola de animación.
   * En resize no se anima: el paso activo se preserva tal cual.
   */
  useLayoutEffect(() => {
    if (width <= 0 || height <= 0) return

    const stepChanged = previousStepId.current !== step.id
    previousStepId.current = step.id
    const from = previousPositions.current
    previousPositions.current = step.positions

    for (const tween of tweensRef.current) tween.destroy()
    tweensRef.current = []

    if (!stepChanged) return

    const targetViewport: CourtViewport = { width, height, dpr }

    for (const id of PLAYER_IDS) {
      const node = circleRefs.current[id]
      if (!node) continue
      const origin = courtToPx(from[id], targetViewport)
      const target = courtToPx(step.positions[id], targetViewport)
      node.position(origin)
      tweensRef.current.push(
        node.to({
          x: target.x,
          y: target.y,
          duration: TWEEN_SECONDS,
          easing: Konva.Easings.EaseInOut,
        })
      )
    }

    const arrow = arrowRef.current
    const annotation = buildArrow(step, targetViewport)
    if (arrow && annotation) {
      arrow.setAttr("dashOffset", annotation.length)
      tweensRef.current.push(
        arrow.to({
          dashOffset: 0,
          duration: TWEEN_SECONDS,
          easing: Konva.Easings.EaseInOut,
        })
      )
    }
  }, [step, width, height, dpr])

  // E5: un Stage 0×0 deja el canvas en estado inválido; mejor no renderizarlo.
  if (!isReady) return null

  const courtLines = buildCourtLines(viewport)
  const markers = buildPlayerMarkers(step.positions, viewport)
  const annotation = buildArrow(step, viewport)

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      listening={false}
      className="block"
      style={{ pointerEvents: "none" }} // no secuestra el scroll táctil (AC-06)
    >
      {/* Capa 1 — cancha (estática, sólo depende del viewport) */}
      <Layer listening={false}>
        {courtLines.map((line) => (
          <Line
            key={line.key}
            points={line.points}
            stroke={line.stroke}
            strokeWidth={line.strokeWidth}
            closed={line.closed}
            lineJoin="round"
          />
        ))}
      </Layer>

      {/* Capa 2 — actores (4) */}
      <Layer listening={false}>
        {markers.map((marker) => (
          <Circle
            key={marker.id}
            name={marker.name}
            x={marker.x}
            y={marker.y}
            radius={marker.radius}
            fill={marker.fill}
            stroke={marker.stroke}
            strokeWidth={2}
            ref={(node) => {
              circleRefs.current[marker.id] = node
            }}
          />
        ))}
      </Layer>

      {/* Capa 3 — anotaciones (trazo progresivo con dashOffset animado) */}
      <Layer listening={false}>
        {annotation && (
          <Arrow
            ref={arrowRef}
            points={annotation.points}
            stroke={ARROW_STROKE}
            fill={ARROW_STROKE}
            strokeWidth={2}
            dash={annotation.dash}
            dashOffset={annotation.dashOffset}
            pointerLength={10}
            pointerWidth={10}
          />
        )}
      </Layer>
    </Stage>
  )
}
