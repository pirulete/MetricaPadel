"use client"

/**
 * Stage Konva INTERACTIVO del editor de transiciones (un paso).
 *
 * Componente CONTROLADO: no guarda `useState`. Konva mueve los nodos sobre su
 * propio árbol mientras el puntero está presionado; al soltar (`dragend`) se
 * emite UNA llamada al padre, que actualiza el estado y re-renderiza con las
 * posiciones ya recortadas (sin deriva). Cero `setState` por frame (AC-04).
 *
 * Regla D-T4: este archivo importa `konva`/`react-konva`; sólo entra al bundle
 * vía `dynamic(..., { ssr: false })` desde `scenario-canvas.tsx` (T8).
 * `CourtStage` (motor de reproducción) NO se importa ni se modifica aquí: no
 * hay dos relojes rAF.
 *
 * Reutiliza builders de `CourtLayers` y piezas de `CourtParts`; no duplica el
 * dibujo de la cancha ni de las figuras.
 */

import { Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage } from "react-konva"
import type Konva from "konva"
import {
  buildCourtLines,
  buildFloor,
  buildNet,
  buildPlayerFigures,
  buildShotView,
  buildWallPosts,
  COURT_COLORS,
  type CourtLineProps,
  type PostProps,
} from "./CourtLayers"
import { Bubble, Net, PlayerFigure } from "./CourtParts"
import { clampCourtPoint, computeScale, courtToPx, pxToCourt } from "@/lib/padel/court/geometry"
import type {
  CourtPoint,
  CourtViewport,
  Paso,
  PlayerId,
  PlayerPositions,
} from "@/lib/padel/court/types"

/** Parche del tiro: mover destino y/o punto de control de la curva (F9). */
export type ShotPatch = { control?: CourtPoint; to?: CourtPoint }

export type EditorStageProps = {
  /** Paso activo (data serializable de `lib/padel/court`). */
  step: Paso
  /** F7: `steps[i-1]?.positions ?? steps[i].positions` — origen derivado del tiro. */
  originPositions: PlayerPositions
  /** F8: sólo jugadores; `"ball"` no existe (el origen es derivado). */
  selected: PlayerId | null
  /** Tamaño CSS del contenedor + DPR normalizado (lo mide `useCourtConfig`). */
  viewport: CourtViewport
  /** Tap en un jugador o en el fondo (`null`). */
  onSelect: (target: PlayerId | null) => void
  /** Jugador soltado; `point` ya viene recortado a la cancha. */
  onMovePlayer: (id: PlayerId, point: CourtPoint) => void
  /** Manija del tiro soltada (`to` o `control`). */
  onMoveShot: (patch: ShotPatch) => void
}

/** F6/AC-01: radio de hit-area ≥ 22 px → diámetro ≥ 44 px a cualquier ancho. */
function hitRadiusFor(scale: number): number {
  return Math.max(22, 0.55 * (Number.isFinite(scale) ? scale : 0))
}

/** Manija circular arrastrable (jugadores y tiro comparten el mismo patrón). */
function DragHandle({
  x,
  y,
  hitR,
  fill,
  stroke,
  dragBoundFunc,
  onDragEnd,
}: {
  x: number
  y: number
  hitR: number
  fill: string
  stroke: string
  dragBoundFunc: (pos: Konva.Vector2d) => CourtPoint
  onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void
}) {
  return (
    <Group x={x} y={y} draggable dragBoundFunc={dragBoundFunc} onDragEnd={onDragEnd}>
      <Circle radius={hitR} fill="transparent" />
      {/* Affordance visual: anillo marcado + punto central. `listening={false}`
          deja el hit-testing y el arrastre exactamente como estaban. */}
      <Circle radius={8} fill={fill} stroke={stroke} strokeWidth={3} listening={false} />
      <Circle radius={2.5} fill={stroke} listening={false} />
    </Group>
  )
}

export default function EditorStage({
  step,
  originPositions,
  selected,
  viewport,
  onSelect,
  onMovePlayer,
  onMoveShot,
}: EditorStageProps) {
  const { width, height } = viewport
  // E5: un Stage 0×0 deja el canvas inválido; el wrapper no debería montarlo.
  if (width <= 0 || height <= 0) return null

  const floor = buildFloor(viewport)
  const courtLines = buildCourtLines(viewport)
  const wallPosts = buildWallPosts(viewport)
  const net = buildNet(viewport)
  const figures = buildPlayerFigures(step.positions, viewport)
  const hitR = hitRadiusFor(computeScale(viewport))
  const view = buildShotView(step, viewport, 0, originPositions)
  const shot = step.shot

  /** Recorta una posición absoluta del Stage al rectángulo de la cancha (px). */
  const clampPx = (pos: Konva.Vector2d): CourtPoint =>
    courtToPx(clampCourtPoint(pxToCourt(pos, viewport)), viewport)

  /** Fija el nodo en la posición recortada antes de notificar al padre. */
  const settleNode = (event: Konva.KonvaEventObject<DragEvent>): CourtPoint => {
    const court = clampCourtPoint(pxToCourt(event.target.position(), viewport))
    event.target.position(courtToPx(court, viewport))
    return court
  }

  const stopBubble = (event: Konva.KonvaEventObject<Event>) => {
    event.cancelBubble = true
  }

  return (
    <Stage
      width={width}
      height={height}
      className="block"
      // Tap en el letterbox (fuera de la cancha) deselecciona.
      onMouseDown={(event) => {
        if (event.target === event.target.getStage()) onSelect(null)
      }}
      onTouchStart={(event) => {
        if (event.target === event.target.getStage()) onSelect(null)
      }}
    >
      {/* Capa 1 — cancha: piso, líneas, postes, red y vista del tiro actual */}
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
        {view && (
          <>
            <Rect
              x={view.zone.x}
              y={view.zone.y}
              width={view.zone.width}
              height={view.zone.height}
              fill="rgba(104,254,195,0.5)"
              cornerRadius={view.zone.radius}
              stroke={COURT_COLORS.zone}
              strokeWidth={2}
            />
            <Arrow
              points={view.curve.points}
              stroke={COURT_COLORS.shot}
              fill={COURT_COLORS.shot}
              strokeWidth={3}
              dash={[12, 8]}
              lineCap="round"
              pointerLength={12}
              pointerWidth={12}
            />
            <Bubble
              x={view.label.x}
              y={view.label.y}
              text={view.label.text}
              fill={COURT_COLORS.labelBg}
              ink={COURT_COLORS.labelInk}
              fontSize={14}
              nodeRef={() => {}}
            />
            {/* Hit derivado: sólo lectura (el origen no se persiste). */}
            <Bubble
              x={view.hit.x}
              y={view.hit.y - 46}
              text="HIT"
              fill={COURT_COLORS.hitTag}
              ink={COURT_COLORS.hitInk}
              fontSize={12}
              nodeRef={() => {}}
            />
          </>
        )}
      </Layer>

      {/* Capa 2 — jugadores arrastrables (el seleccionado se resalta) */}
      <Layer>
        {figures.map((figure) => {
          const isSelected = selected === figure.id
          const ring = figure.height * 0.32
          return (
            <Group
              key={figure.id}
              name={figure.name}
              x={figure.x}
              y={figure.y}
              draggable
              dragBoundFunc={clampPx}
              onMouseDown={() => onSelect(figure.id)}
              onTouchStart={() => onSelect(figure.id)}
              onDragStart={stopBubble}
              onDragEnd={(event) => {
                stopBubble(event)
                onMovePlayer(figure.id, settleNode(event))
              }}
            >
              {isSelected && (
                <Ellipse
                  x={0}
                  y={0}
                  radiusX={ring}
                  radiusY={ring * 0.4}
                  stroke={COURT_COLORS.hitTag}
                  strokeWidth={3}
                  dash={[6, 4]}
                  listening={false}
                />
              )}
              {/* Hit-area: hermana de la figura (CourtParts no se toca, F5). */}
              <Rect
                x={-hitR}
                y={-hitR * 1.6}
                width={hitR * 2}
                height={hitR * 2}
                fill="transparent"
              />
              <PlayerFigure figure={{ ...figure, x: 0, y: 0 }} groupRef={() => {}} />
              {/* Punto central del jugador seleccionado (sólo visual). */}
              {isSelected && (
                <Circle radius={3} fill={COURT_COLORS.hitTag} listening={false} />
              )}
            </Group>
          )
        })}
      </Layer>

      {/* Capa 3 — manijas del tiro: destino y control de la curva */}
      {shot && (
        <Layer>
          <DragHandle
            x={courtToPx(shot.to, viewport).x}
            y={courtToPx(shot.to, viewport).y}
            hitR={hitR}
            fill={COURT_COLORS.zone}
            stroke={COURT_COLORS.line}
            dragBoundFunc={clampPx}
            onDragEnd={(event) => onMoveShot({ to: settleNode(event) })}
          />
          <DragHandle
            x={courtToPx(shot.control, viewport).x}
            y={courtToPx(shot.control, viewport).y}
            hitR={hitR}
            fill={COURT_COLORS.hitTag}
            stroke={COURT_COLORS.line}
            dragBoundFunc={clampPx}
            onDragEnd={(event) => onMoveShot({ control: settleNode(event) })}
          />
        </Layer>
      )}
    </Stage>
  )
}
