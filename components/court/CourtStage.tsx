"use client"

/**
 * Escena Konva del spike (transición de puzzle tipo PadelChess).
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * **ÚNICO archivo del repo que importa `konva`/`react-konva`** (regla D-T4).
 * Sólo entra al bundle vía `dynamic(..., { ssr: false })` desde `PuzzleDemo`,
 * por eso necesita `export default`.
 *
 * Regla de render: React sólo posee el paso activo y el tamaño; posiciones,
 * caminata, vuelo de la pelota y trazo de la flecha los mueve UN solo reloj
 * `Konva.Animation` (1000 ms, como PadelChess) sobre refs — nunca `setState`
 * por frame (AC-04).
 */

import { useEffect, useLayoutEffect, useRef } from "react"
import Konva from "konva"
import { Arc, Arrow, Circle, Group, Layer, Line, Rect, Stage } from "react-konva"
import {
  buildCourtLines,
  buildFloor,
  buildNet,
  buildPlayerFigures,
  buildShotView,
  buildWallPosts,
  COURT_COLORS,
  PLAYER_IDS,
  type CourtLineProps,
  type PostProps,
} from "./CourtLayers"
import { Bubble, LIMB_SELECTORS, Net, PlayerFigure } from "./CourtParts"
import { courtToPx } from "@/lib/padel/court/geometry"
import type { CourtViewport, Paso, PlayerId, PlayerPositions } from "@/lib/padel/court/types"

/** Duración de la transición (PadelChess: `tweenMs` por defecto 1000). */
const TWEEN_MS = 1000
/** Ciclos de paso durante la carrera de 1 s (cadencia). */
const STRIDE_CYCLES = 4

export type CourtStageProps = {
  /** Paso activo (data serializable de `lib/padel/court`). */
  step: Paso
  /** Tamaño CSS del contenedor + DPR normalizado. */
  viewport: CourtViewport
}

/** Interpola un punto sobre la polilínea px de la curva en t ∈ [0,1]. */
function pointOnPath(path: number[], t: number): { x: number; y: number } {
  const segments = path.length / 2 - 1
  if (segments < 1) return { x: path[0] ?? 0, y: path[1] ?? 0 }
  const f = Math.min(1, Math.max(0, t)) * segments
  const i = Math.min(segments - 1, Math.floor(f))
  const frac = f - i
  const x = path[i * 2] + (path[(i + 1) * 2] - path[i * 2]) * frac
  const y = path[i * 2 + 1] + (path[(i + 1) * 2 + 1] - path[i * 2 + 1]) * frac
  return { x, y }
}

/** Easing in-out (idéntico al `EaseInOut` de Konva, sin su firma de 4 args). */
function easeInOut(t: number): number {
  const s = Math.min(1, Math.max(0, t));
  return s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
}

/**
 * Figura simple de jugador de pádel (sombra, piernas con zapatillas, torso
 * con kit, brazos con pala y cabeza con pelo). Piernas/brazos pivotan en
 * cadera/hombro para poder animar la carrera rotándolos. Los pies quedan en
 * el origen del grupo.
 */

/** Etiqueta en escena (burbuja estilo PadelChess: "GLOBO", "HIT"). */
export default function CourtStage({ step, viewport }: CourtStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const actorsLayerRef = useRef<Konva.Layer | null>(null)
  const figureRefs = useRef<Partial<Record<PlayerId, Konva.Group | null>>>({})
  const ballRef = useRef<Konva.Group | null>(null)
  const curveRef = useRef<Konva.Arrow | null>(null)
  const labelRef = useRef<Konva.Group | null>(null)
  const hitRef = useRef<Konva.Group | null>(null)
  const zoneRef = useRef<Konva.Rect | null>(null)
  const visualPosRef = useRef<Partial<Record<PlayerId, { x: number; y: number }>>>({})
  const animHandleRef = useRef<number | null>(null)

  // Memoria de la transición anterior (sólo se lee en efectos, nunca en render).
  const previousPositions = useRef<PlayerPositions>(step.positions)
  const previousStepId = useRef(step.id)

  const { width, height, dpr } = viewport
  const isReady = width > 0 && height > 0
  const view = buildShotView(step, viewport, 0)
  const signature = `${step.id}|${width}x${height}`

  /** Detiene la animación activa y devuelve figuras a la pose de reposo. */
  const stopAnimation = () => {
    if (animHandleRef.current !== null) {
      cancelAnimationFrame(animHandleRef.current)
      animHandleRef.current = null
    }
    for (const id of PLAYER_IDS) {
      const group = figureRefs.current[id]
      if (!group) continue
      for (const selector of LIMB_SELECTORS) {
        const node = group.find(selector)[0]
        if (node) node.rotation(0)
      }
    }
  }

  // E2: al desmontar no queda ninguna animación ni timers colgados.
  useEffect(() => stopAnimation, [])

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
   * Transición determinista (E1/E7) con UN reloj: posiciones de figuras,
   * cadencia de carrera, vuelo de la pelota por la curva, trazo de la flecha
   * y fade de etiquetas/zona — todo derivado de `t ∈ [0,1]` con easing
   * in-out y duración TWEEN_MS. Convergencia: el estado final sólo depende
   * del paso destino. En resize (sin cambio de paso): snap instantáneo.
   */
  useLayoutEffect(() => {
    if (width <= 0 || height <= 0) return

    const stepChanged = previousStepId.current !== step.id
    previousStepId.current = step.id
    const from = previousPositions.current
    previousPositions.current = step.positions

    stopAnimation()

    const targetViewport: CourtViewport = { width, height, dpr }
    const viewNow = buildShotView(step, targetViewport, 0)

    const snap = () => {
      for (const id of PLAYER_IDS) {
        const node = figureRefs.current[id]
        if (!node) continue
        const target = courtToPx(step.positions[id], targetViewport)
        node.position(target)
        visualPosRef.current[id] = target
      }
      if (viewNow) {
        ballRef.current?.position(viewNow.ball.to)
        curveRef.current?.setAttr("dashOffset", 0)
        labelRef.current?.opacity(1)
        hitRef.current?.opacity(1)
        zoneRef.current?.opacity(1)
      }
    }

    if (!stepChanged) {
      snap() // Resize o montaje: sin animación (E3/E5).
      return
    }

    // Orígenes: posición visual actual si había animación en curso; si no, el
    // paso anterior del escenario.
    const origins: Partial<Record<PlayerId, { x: number; y: number }>> = {}
    const targets: Partial<Record<PlayerId, { x: number; y: number }>> = {}
    const walking = new Set<PlayerId>()
    for (const id of PLAYER_IDS) {
      const visual = visualPosRef.current[id]
      const origin = visual ?? courtToPx(from[id], targetViewport)
      const target = courtToPx(step.positions[id], targetViewport)
      origins[id] = origin
      targets[id] = target
      figureRefs.current[id]?.position(origin)
      if (Math.hypot(target.x - origin.x, target.y - origin.y) > 1) walking.add(id)
    }

    // Estado inicial de la anotación del tiro.
    if (viewNow) {
      ballRef.current?.position(viewNow.ball.from)
      curveRef.current?.setAttr("dashOffset", viewNow.curve.length)
      labelRef.current?.opacity(0)
      hitRef.current?.opacity(0)
      zoneRef.current?.opacity(0)
    }

    const start = performance.now()
    const tick = () => {
      const elapsed = performance.now() - start
      const raw = Math.min(1, elapsed / TWEEN_MS)
      const t = easeInOut(raw)

      for (const id of walking) {
        const node = figureRefs.current[id]
        const origin = origins[id]
        const target = targets[id]
        if (!node || !origin || !target) continue
        node.position({
          x: origin.x + (target.x - origin.x) * t,
          y: origin.y + (target.y - origin.y) * t,
        })
        visualPosRef.current[id] = node.position()
        // Cadencia de carrera: piernas y brazos en contrafase.
        const swing = Math.sin(raw * Math.PI * STRIDE_CYCLES) * 0.55
        const legL = node.find(".leg-l")[0]
        const legR = node.find(".leg-r")[0]
        const armL = node.find(".arm-l")[0]
        const armR = node.find(".arm-r")[0]
        if (legL) legL.rotation(swing)
        if (legR) legR.rotation(-swing)
        if (armL) armL.rotation(-swing * 0.7)
        if (armR) armR.rotation(swing * 0.7)
      }

      if (viewNow) {
        const ballPos = pointOnPath(viewNow.curve.points, t)
        ballRef.current?.position(ballPos)
        curveRef.current?.setAttr("dashOffset", viewNow.curve.length * (1 - t))
        const fade = Math.max(0, (t - 0.6) / 0.4)
        labelRef.current?.opacity(fade)
        hitRef.current?.opacity(fade)
        zoneRef.current?.opacity(Math.min(1, t * 3))
      }

      if (raw < 1) {
        animHandleRef.current = requestAnimationFrame(tick)
        return
      }

      // Estado final exacto (E1/E7): posiciones destino, pose de reposo.
      animHandleRef.current = null
      for (const id of PLAYER_IDS) {
        const node = figureRefs.current[id]
        if (!node) continue
        node.position(targets[id] ?? node.position())
        for (const selector of LIMB_SELECTORS) {
          const limb = node.find(selector)[0]
          if (limb) limb.rotation(0)
        }
      }
      if (viewNow) {
        ballRef.current?.position(viewNow.ball.to)
        curveRef.current?.setAttr("dashOffset", 0)
        labelRef.current?.opacity(1)
        hitRef.current?.opacity(1)
        zoneRef.current?.opacity(1)
      }
    }
    animHandleRef.current = requestAnimationFrame(tick)

    return () => {
      if (animHandleRef.current !== null) {
        cancelAnimationFrame(animHandleRef.current)
        animHandleRef.current = null
      }
    }
  }, [step, width, height, dpr, signature])

  // E5: un Stage 0×0 deja el canvas en estado inválido; mejor no renderizarlo.
  if (!isReady) return null

  const floor = buildFloor(viewport)
  const courtLines = buildCourtLines(viewport)
  const wallPosts = buildWallPosts(viewport)
  const net = buildNet(viewport)
  const figures = buildPlayerFigures(step.positions, viewport)
  const shotView = view
  const ballRadius = Math.max(5, ((figures[0]?.height ?? 30) / 1.85) * 0.26)

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      listening={false}
      className="block"
      style={{ pointerEvents: "none" }} // no secuestra el scroll táctil (AC-06)
    >
      {/* Capa 1 — piso, líneas, postes de pared, red y zona de aterrizaje */}
      <Layer listening={false}>
        <Rect
          x={floor.x}
          y={floor.y}
          width={floor.width}
          height={floor.height}
          fill={COURT_COLORS.floor}
          cornerRadius={floor.radius}
        />
        {courtLines.map((line: CourtLineProps) => (
          <Line
            key={line.key}
            points={line.points}
            stroke={line.stroke}
            strokeWidth={line.strokeWidth}
            closed={line.closed}
            lineJoin="round"
            opacity={line.opacity}
            shadowEnabled={line.shadow}
            shadowColor={COURT_COLORS.groundShadow}
            shadowBlur={8}
          />
        ))}
        {wallPosts.map((post: PostProps) => (
          <Rect
            key={post.key}
            x={post.x}
            y={post.y}
            width={post.width}
            height={post.height}
            fill={post.fill}
            cornerRadius={2}
          />
        ))}
        <Net net={net} />
        {shotView && (
          <Rect
            ref={zoneRef}
            x={shotView.zone.x}
            y={shotView.zone.y}
            width={shotView.zone.width}
            height={shotView.zone.height}
            fill="rgba(104,254,195,0.5)"
            cornerRadius={shotView.zone.radius}
            stroke={COURT_COLORS.zone}
            strokeWidth={2}
          />
        )}
      </Layer>

      {/* Capa 2 — actores: 4 figuras con kit por equipo */}
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

      {/* Capa 3 — anotaciones: curva del tiro, pelota y etiquetas en escena */}
      <Layer listening={false}>
        {shotView && (
          <Arrow
            ref={curveRef}
            points={shotView.curve.points}
            stroke={COURT_COLORS.shot}
            fill={COURT_COLORS.shot}
            strokeWidth={3}
            dash={shotView.curve.dash}
            dashOffset={shotView.curve.dashOffset}
            pointerLength={12}
            pointerWidth={10}
            lineJoin="round"
            lineCap="round"
          />
        )}
        {shotView && (
          <Group ref={ballRef} x={shotView.ball.from.x} y={shotView.ball.from.y} listening={false}>
            <Circle
              radius={ballRadius}
              fill={COURT_COLORS.ball}
              stroke={COURT_COLORS.ballSeamStroke}
              strokeWidth={1.2}
              shadowColor="rgba(12,29,68,0.3)"
              shadowBlur={5}
              shadowOffsetY={2}
            />
            <Arc
              innerRadius={ballRadius * 0.55}
              outerRadius={ballRadius * 0.97}
              angle={70}
              rotation={-40}
              fill={COURT_COLORS.ballSeam}
            />
            <Arc
              innerRadius={ballRadius * 0.55}
              outerRadius={ballRadius * 0.97}
              angle={70}
              rotation={140}
              fill={COURT_COLORS.ballSeam}
            />
          </Group>
        )}
        {shotView && (
          <Bubble
            nodeRef={(node) => {
              labelRef.current = node
            }}
            x={shotView.label.x}
            y={shotView.label.y}
            text={shotView.label.text}
            fill={COURT_COLORS.labelBg}
            ink={COURT_COLORS.labelInk}
            fontSize={14}
          />
        )}
        {shotView && (
          <Bubble
            nodeRef={(node) => {
              hitRef.current = node
            }}
            x={shotView.hit.x}
            y={shotView.hit.y - (figures[0]?.height ?? 40) * 1.6}
            text="HIT"
            fill={COURT_COLORS.hitTag}
            ink={COURT_COLORS.hitInk}
            fontSize={12}
          />
        )}
      </Layer>
    </Stage>
  )
}

/** Red horizontal: banda translúcida, malla, cinta con sag y postes. */