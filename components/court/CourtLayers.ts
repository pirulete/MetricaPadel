/**
 * Prop-builder de las 3 capas z-ordered de la escena (cancha → actores → anotaciones).
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * SIN librería de canvas (regla D-T4: el único archivo que la importa es
 * `CourtStage.tsx`). Aquí sólo se derivan props planas a partir de
 * `lib/padel/court/*`: cero lógica de negocio, cero estado.
 */

import { computeArrowGeometry, computeDashProgress } from "@/lib/padel/court/annotation"
import { courtToPx } from "@/lib/padel/court/geometry"
import {
  COURT_DEPTH_M,
  COURT_WIDTH_M,
  type CourtViewport,
  type Paso,
  type PlayerId,
  type PlayerPositions,
} from "@/lib/padel/court/types"

/** Orden estable de los 4 marcadores. */
export const PLAYER_IDS = ["A", "B", "C", "D"] as const satisfies readonly PlayerId[]

/** Línea de cancha ya en píxeles del viewport. */
export type CourtLineProps = {
  key: string
  points: number[]
  stroke: string
  strokeWidth: number
  closed: boolean
}

/** Marcador de jugador ya en píxeles del viewport. */
export type PlayerMarkerProps = {
  id: PlayerId
  /** Equivalente a "clase" en Konva (`node.name()`). */
  name: string
  x: number
  y: number
  radius: number
  fill: string
  stroke: string
}

/** Flecha de trayectoria con trazo progresivo. */
export type ArrowAnnotationProps = {
  points: number[]
  /** Longitud del tramo en px (alimenta `dash` y `dashOffset`). */
  length: number
  dash: [number, number]
  dashOffset: number
}

// Valores del spike: Konva dibuja en canvas y no resuelve CSS variables.
const COURT_LINE = "#94a3b8"
const COURT_NET = "#475569"
const TEAM_A_FILL = "#2563eb"
const TEAM_B_FILL = "#d97706"
const MARKER_STROKE = "#f8fafc"

/** Distancia reglamentaria de la línea de servicio a la red (3,05 m). */
const SERVICE_LINE_OFFSET_M = 3.05

function toPx(x: number, y: number, viewport: CourtViewport): [number, number] {
  const point = courtToPx({ x, y }, viewport)
  return [point.x, point.y]
}

/**
 * Capa 1 (estática): perímetro 20×10, red y líneas de servicio. Sólo depende
 * del viewport, así que basta redibujarla en resize.
 */
export function buildCourtLines(viewport: CourtViewport): CourtLineProps[] {
  const netX = COURT_WIDTH_M / 2
  const middleY = COURT_DEPTH_M / 2
  const serviceLeft = netX - SERVICE_LINE_OFFSET_M
  const serviceRight = netX + SERVICE_LINE_OFFSET_M

  return [
    {
      key: "perimeter",
      points: [
        ...toPx(0, 0, viewport),
        ...toPx(COURT_WIDTH_M, 0, viewport),
        ...toPx(COURT_WIDTH_M, COURT_DEPTH_M, viewport),
        ...toPx(0, COURT_DEPTH_M, viewport),
      ],
      stroke: COURT_LINE,
      strokeWidth: 2,
      closed: true,
    },
    {
      key: "net",
      points: [...toPx(netX, 0, viewport), ...toPx(netX, COURT_DEPTH_M, viewport)],
      stroke: COURT_NET,
      strokeWidth: 3,
      closed: false,
    },
    {
      key: "service-left",
      points: [...toPx(serviceLeft, 0, viewport), ...toPx(serviceLeft, COURT_DEPTH_M, viewport)],
      stroke: COURT_LINE,
      strokeWidth: 1,
      closed: false,
    },
    {
      key: "service-right",
      points: [...toPx(serviceRight, 0, viewport), ...toPx(serviceRight, COURT_DEPTH_M, viewport)],
      stroke: COURT_LINE,
      strokeWidth: 1,
      closed: false,
    },
    {
      key: "service-center-left",
      points: [...toPx(0, middleY, viewport), ...toPx(serviceLeft, middleY, viewport)],
      stroke: COURT_LINE,
      strokeWidth: 1,
      closed: false,
    },
    {
      key: "service-center-right",
      points: [...toPx(serviceRight, middleY, viewport), ...toPx(COURT_WIDTH_M, middleY, viewport)],
      stroke: COURT_LINE,
      strokeWidth: 1,
      closed: false,
    },
  ]
}

/**
 * Capa 2 (actores): los 4 jugadores, con `name` = `jugador-a`..`jugador-d`
 * para inspección desde DevTools/E2E. Radio proporcional a la escala.
 */
export function buildPlayerMarkers(
  positions: PlayerPositions,
  viewport: CourtViewport
): PlayerMarkerProps[] {
  const markerRadius = markerRadiusFromScale(viewport)

  return PLAYER_IDS.map((id) => {
    const point = courtToPx(positions[id], viewport)
    return {
      id,
      name: `jugador-${id.toLowerCase()}`,
      x: point.x,
      y: point.y,
      radius: markerRadius,
      fill: id === "A" || id === "B" ? TEAM_A_FILL : TEAM_B_FILL,
      stroke: MARKER_STROKE,
    }
  })
}

/** Radio del marcador (px) acotado para que siga visible en contenedores pequeños. */
function markerRadiusFromScale(viewport: CourtViewport): number {
  const scale = Math.min(viewport.width / COURT_WIDTH_M, viewport.height / COURT_DEPTH_M)
  return Math.min(18, Math.max(6, scale * 0.4))
}

/**
 * Capa 3 (anotaciones): flecha del tiro con `dash`/`dashOffset` iniciales que
 * el tween de `CourtStage` anima hasta 0 (trazo progresivo, AC-07).
 * `null` si el paso no traza trayectoria.
 */
export function buildArrow(step: Paso, viewport: CourtViewport): ArrowAnnotationProps | null {
  if (!step.trajectory) return null
  const geometry = computeArrowGeometry(step.trajectory.from, step.trajectory.to, viewport)
  const progress = computeDashProgress(0, geometry.length, "forward")
  return {
    points: [geometry.x1, geometry.y1, geometry.x2, geometry.y2],
    length: geometry.length,
    dash: progress.dashArray,
    dashOffset: progress.dashOffset,
  }
}
