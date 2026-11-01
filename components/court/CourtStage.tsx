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
 * se animan con `node.to()` sobre refs de Konva, sin `setState` por frame
 * (AC-04). La "caminata" de las figuras corre en un `Konva.Animation` sobre
 * la capa de actores y sólo mientras hay tweens de movimiento activos.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Konva from "konva"
import { Arrow, Circle, Group, Layer, Line, Rect, Stage } from "react-konva"
import {
  buildCourtLines,
  buildFloor,
  buildMovementArrow,
  buildPlayerFigures,
  buildShotArrow,
  COURT_COLORS,
  PLAYER_IDS,
  type ArrowAnnotationProps,
  type CourtLineProps,
  type PlayerFigureProps,
} from "./CourtLayers"
import { courtToPx } from "@/lib/padel/court/geometry"
import { deriveMovementArrows } from "@/lib/padel/court/annotation"
import type { CourtViewport, Paso, PlayerId, PlayerPositions } from "@/lib/padel/court/types"

const TWEEN_SECONDS = 0.5
/** Velocidad del ciclo de caminata (radianios por milisegundo). */
const WALK_SPEED = 0.015

export type CourtStageProps = {
  /** Paso activo (data serializable de `lib/padel/court`). */
  step: Paso
  /** Tamaño CSS del contenedor + DPR normalizado. */
  viewport: CourtViewport
}

/** Flechas de la transición activa, en unidades de cancha (serializables). */
type ArrowData = {
  stepId: number
  movements: ReturnType<typeof deriveMovementArrows>
  shot: Paso["shot"]
}

/**
 * Figura simple de jugador de pádel (cabeza, torso, brazos con pala y
 * piernas). Los brazos/piernas pivotan en hombro/cadera para poder animar la
 * caminata rotándolos. Los pies quedan en el origen del grupo.
 */
function PlayerFigure({
  figure,
  groupRef,
}: {
  figure: PlayerFigureProps
  groupRef: (node: Konva.Group | null) => void
}) {
  const h = figure.height
  const limb = Math.max(1.5, h * 0.09)
  const thin = Math.max(1, h * 0.045)
  const detail = Math.max(1, h * 0.03)

  return (
    <Group x={figure.x} y={figure.y} listening={false} ref={groupRef}>
      {/* Cabeza */}
      <Circle
        x={0}
        y={-h * 0.9}
        r={h * 0.1}
        fill={figure.fill}
        stroke={figure.stroke}
        strokeWidth={detail}
      />
      {/* Torso */}
      <Line
        points={[0, -h * 0.78, 0, -h * 0.45]}
        stroke={figure.fill}
        strokeWidth={limb}
        lineCap="round"
      />
      {/* Brazo izquierdo (pivote en el hombro) */}
      <Group x={0} y={-h * 0.74} name="arm-l">
        <Line
          points={[0, 0, -h * 0.2, h * 0.16]}
          stroke={figure.fill}
          strokeWidth={limb}
          lineCap="round"
        />
      </Group>
      {/* Brazo derecho con pala (pivote en el hombro) */}
      <Group x={0} y={-h * 0.74} name="arm-r">
        <Line
          points={[0, 0, h * 0.2, h * 0.16]}
          stroke={figure.fill}
          strokeWidth={limb}
          lineCap="round"
        />
        <Line
          points={[h * 0.2, h * 0.16, h * 0.3, h * 0.04]}
          stroke={figure.stroke}
          strokeWidth={thin}
          lineCap="round"
        />
        <Circle
          x={h * 0.32}
          y={-h * 0.02}
          r={h * 0.07}
          stroke={figure.stroke}
          strokeWidth={thin}
          fill="transparent"
        />
      </Group>
      {/* Piernas (pivote en la cadera) */}
      <Group x={0} y={-h * 0.45} name="leg-l">
        <Line
          points={[0, 0, -h * 0.12, h * 0.45]}
          stroke={figure.fill}
          strokeWidth={limb}
          lineCap="round"
        />
      </Group>
      <Group x={0} y={-h * 0.45} name="leg-r">
        <Line
          points={[0, 0, h * 0.12, h * 0.45]}
          stroke={figure.fill}
          strokeWidth={limb}
          lineCap="round"
        />
      </Group>
    </Group>
  )
}

const LIMB_SELECTORS = [".arm-l", ".arm-r", ".leg-l", ".leg-r"] as const

export default function CourtStage({ step, viewport }: CourtStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const actorsLayerRef = useRef<Konva.Layer | null>(null)
  const figureRefs = useRef<Partial<Record<PlayerId, Konva.Group | null>>>({})
  const arrowRefs = useRef<Map<string, Konva.Arrow | null>>(new Map())
  const tweensRef = useRef<Konva.Tween[]>([])

  // Caminata: animación sobre la capa de actores, activa sólo durante tweens.
  const walkAnimRef = useRef<Konva.Animation | null>(null)
  const walkTimeoutRef = useRef<number | null>(null)
  const movingIdsRef = useRef<Set<PlayerId>>(new Set())
  const phaseRef = useRef(0)

  // Flechas de la transición activa (unidad de cancha; el px se deriva en render).
  const [arrowData, setArrowData] = useState<ArrowData>({
    stepId: step.id,
    movements: [],
    shot: step.shot,
  })
  const animatedSigRef = useRef("")

  // Memoria de la transición anterior (sólo se lee en efectos, nunca en render).
  const previousPositions = useRef<PlayerPositions>(step.positions)
  const previousStepId = useRef(step.id)

  const { width, height, dpr } = viewport
  const isReady = width > 0 && height > 0

  /** Detiene la caminata y devuelve las figuras a la pose de reposo. */
  const stopWalk = () => {
    walkAnimRef.current?.stop()
    for (const id of PLAYER_IDS) {
      const group = figureRefs.current[id]
      if (!group) continue
      for (const selector of LIMB_SELECTORS) {
        const node = group.find(selector)[0]
        if (node) node.rotation(0)
      }
    }
  }

  // E2: al desmontar no queda ningún tween vivo ni timers colgados.
  useEffect(() => {
    return () => {
      for (const tween of tweensRef.current) tween.destroy()
      tweensRef.current = []
      if (walkTimeoutRef.current) window.clearTimeout(walkTimeoutRef.current)
      walkAnimRef.current?.stop()
      walkAnimRef.current = null
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
   * Transición determinista (E1/E7). React ya dejó las figuras en el destino
   * al re-renderizar; aquí se reposicionan en el origen anterior y se anima
   * hasta el destino. Destruir los tweens previos antes de crear los nuevos
   * hace que N toggles en ráfaga converjan siempre al paso activo. En resize
   * no se anima: hay snap determinista al paso activo (E3).
   */
  useLayoutEffect(() => {
    if (width <= 0 || height <= 0) return

    const stepChanged = previousStepId.current !== step.id
    previousStepId.current = step.id
    const from = previousPositions.current
    previousPositions.current = step.positions

    for (const tween of tweensRef.current) tween.destroy()
    tweensRef.current = []
    if (walkTimeoutRef.current) {
      window.clearTimeout(walkTimeoutRef.current)
      walkTimeoutRef.current = null
    }

    const targetViewport: CourtViewport = { width, height, dpr }

    if (!stepChanged) {
      // Resize (o montaje): snap sin animación al paso activo (E3/E5).
      stopWalk()
      movingIdsRef.current = new Set()
      for (const id of PLAYER_IDS) {
        figureRefs.current[id]?.position(courtToPx(step.positions[id], targetViewport))
      }
      return
    }

    const moving = new Set<PlayerId>()
    for (const id of PLAYER_IDS) {
      const node = figureRefs.current[id]
      if (!node) continue
      const origin = courtToPx(from[id], targetViewport)
      const target = courtToPx(step.positions[id], targetViewport)
      node.position(origin)
      if (origin.x !== target.x || origin.y !== target.y) moving.add(id)
      tweensRef.current.push(
        node.to({
          x: target.x,
          y: target.y,
          duration: TWEEN_SECONDS,
          easing: Konva.Easings.EaseInOut,
        })
      )
    }
    movingIdsRef.current = moving

    setArrowData({
      stepId: step.id,
      movements: deriveMovementArrows(from, step.positions, PLAYER_IDS),
      shot: step.shot,
    })

    if (moving.size > 0) {
      phaseRef.current = 0
      // La caminata se crea perezosamente: la capa ya existe tras el render.
      if (!walkAnimRef.current && actorsLayerRef.current) {
        walkAnimRef.current = new Konva.Animation((frame) => {
          phaseRef.current += (frame.timeDiff ?? 16) * WALK_SPEED
          const swing = Math.sin(phaseRef.current)
          for (const id of movingIdsRef.current) {
            const group = figureRefs.current[id]
            if (!group) continue
            const legL = group.find(".leg-l")[0]
            const legR = group.find(".leg-r")[0]
            const armL = group.find(".arm-l")[0]
            const armR = group.find(".arm-r")[0]
            if (legL) legL.rotation(swing * 0.5)
            if (legR) legR.rotation(-swing * 0.5)
            if (armL) armL.rotation(-swing * 0.35)
            if (armR) armR.rotation(swing * 0.35)
          }
        }, actorsLayerRef.current)
      }
      walkAnimRef.current?.start()
      walkTimeoutRef.current = window.setTimeout(
        () => {
          stopWalk()
          movingIdsRef.current = new Set()
          walkTimeoutRef.current = null
        },
        (TWEEN_SECONDS + 0.1) * 1000
      )
    } else {
      stopWalk()
    }
  }, [step, width, height, dpr])

  // Flechas: trazo progresivo por tween una vez los nodos del paso nuevo ya
  // están montados (este efecto corre después del render que las dibuja).
  useLayoutEffect(() => {
    if (width <= 0 || height <= 0) return
    if (arrowData.stepId !== step.id) return // datos frescos aún no montados

    const signature = `${step.id}|${width}x${height}`
    if (animatedSigRef.current === signature) return
    animatedSigRef.current = signature

    const built = buildArrows()
    for (const arrow of built) {
      const node = arrowRefs.current.get(arrow.key)
      if (!node || arrow.length <= 0) continue
      node.setAttr("dashOffset", arrow.length)
      tweensRef.current.push(
        node.to({
          dashOffset: 0,
          duration: TWEEN_SECONDS,
          easing: Konva.Easings.EaseInOut,
        })
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrowData, step.id, width, height, dpr])

  // E5: un Stage 0×0 deja el canvas en estado inválido; mejor no renderizarlo.
  if (!isReady) return null

  const floor = buildFloor(viewport)
  const courtLines = buildCourtLines(viewport)
  const figures = buildPlayerFigures(step.positions, viewport)

  /** Flechas en píxeles: trazo al 0% si aún no se animaron, si no completas. */
  function buildArrows(): ArrowAnnotationProps[] {
    const signature = `${step.id}|${width}x${height}`
    const progress = animatedSigRef.current === signature ? 1 : 0
    const movements = arrowData.movements.map((arrow) =>
      buildMovementArrow(arrow, viewport, progress)
    )
    const shot = buildShotArrow(step, viewport, progress)
    return shot ? [...movements, shot] : movements
  }

  const arrows = buildArrows()

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      listening={false}
      className="block"
      style={{ pointerEvents: "none" }} // no secuestra el scroll táctil (AC-06)
    >
      {/* Capa 1 — piso azul rey + líneas FIP (estáticas, sólo dependen del viewport) */}
      <Layer listening={false}>
        <Rect
          x={floor.x}
          y={floor.y}
          width={floor.width}
          height={floor.height}
          fill={COURT_COLORS.floor}
        />
        {courtLines.map((line: CourtLineProps) => (
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

      {/* Capa 2 — actores: 4 figuras de persona (las anima el tween + caminata) */}
      <Layer listening={false} ref={actorsLayerRef}>
        {figures.map((figure) => (
          <PlayerFigure
            key={figure.id}
            figure={figure}
            groupRef={(node) => {
              figureRefs.current[figure.id] = node
            }}
          />
        ))}
      </Layer>

      {/* Capa 3 — anotaciones: movimientos (negro) + tiro (verde) */}
      <Layer listening={false}>
        {arrows.map((arrow) => (
          <Arrow
            key={arrow.key}
            ref={(node) => {
              arrowRefs.current.set(arrow.key, node)
            }}
            points={arrow.points}
            stroke={arrow.key === "shot" ? COURT_COLORS.shotArrow : COURT_COLORS.movementArrow}
            fill={arrow.key === "shot" ? COURT_COLORS.shotArrow : COURT_COLORS.movementArrow}
            strokeWidth={arrow.key === "shot" ? 3 : 2}
            dash={arrow.dash}
            dashOffset={arrow.dashOffset}
            pointerLength={arrow.key === "shot" ? 12 : 9}
            pointerWidth={arrow.key === "shot" ? 12 : 9}
          />
        ))}
      </Layer>
    </Stage>
  )
}
