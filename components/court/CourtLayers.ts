/**
 * Prop-builder de las capas z-ordered de la escena
 * (cancha → actores → anotaciones). SPIKE NO PRODUCTIVO — borrable tras el
 * go/no-go.
 *
 * SIN librería de canvas (regla D-T4: el único archivo que la importa es
 * `CourtStage.tsx`). Aquí sólo se derivan props planas a partir de
 * `lib/padel/court/*`: cero lógica de negocio, cero estado.
 *
 * Líneas según reglamento FIP: perímetro = paredes (no se pinta), líneas de
 * servicio a 6,95 m de la red (Y=3.05 norte / Y=16.95 sur) y línea central de
 * saque de la red a la servicio + 0,20 m de prolongación (X=5).
 */

import { computeArrowGeometry, computeDashProgress } from "@/lib/padel/court/annotation"
import { computeScale, courtToPx } from "@/lib/padel/court/geometry"
import {
  COURT_DEPTH_M,
  COURT_WIDTH_M,
  NET_Y_M,
  SERVICE_LINE_OFFSET_M,
  SERVICE_LINE_OVERSHOOT_M,
  type CourtViewport,
  type MovementArrow,
  type Paso,
  type PlayerId,
  type PlayerPositions,
} from "@/lib/padel/court/types"

/** Orden estable de los 4 marcadores. */
export const PLAYER_IDS = ["A", "B", "C", "D"] as const satisfies readonly PlayerId[]

/**
 * Paleta del spike. Konva dibuja en canvas y no resuelve CSS variables, así
 * que los colores viven aquí (FIP: líneas blancas o negras sobre el piso).
 */
export const COURT_COLORS = {
  /** Piso de cancha: azul rey. */
  floor: "#4169E1",
  /** Líneas de juego (FIP: blanco, contraste con el piso). */
  line: "#F8FAFC",
  /** Red (más gruesa que las líneas). */
  net: "#0F172A",
  /** Equipo Norte (A, B). */
  teamNorth: "#F8FAFC",
  /** Equipo Sur (C, D). */
  teamSouth: "#F59E0B",
  /** Contorno de las figuras y detalle. */
  figure: "#0F172A",
  /** Flecha de movimiento de jugadores. */
  movementArrow: "#000000",
  /** Flecha del tiro de la pelota (la pelota no se dibuja). */
  shotArrow: "#4ADE80",
} as const

/** Piso de la cancha (rectángulo relleno, sin línea de perímetro pintada). */
export type CourtFloorProps = { x: number; y: number; width: number; height: number }

/** Línea de cancha ya en píxeles del viewport. */
export type CourtLineProps = {
  key: string
  points: number[]
  stroke: string
  strokeWidth: number
  closed: boolean
}

/** Figura de jugador (persona simple) ya en píxeles del viewport. */
export type PlayerFigureProps = {
  id: PlayerId
  /** Equivalente a "clase" en Konva (`node.name()`). */
  name: string
  x: number
  y: number
  /** Altura total de la figura en px (proporcional a la escala de la cancha). */
  height: number
  fill: string
  stroke: string
}

/** Flecha con trazo progresivo (movimiento o tiro). */
export type ArrowAnnotationProps = {
  key: string
  points: number[]
  /** Longitud del tramo en px (alimenta `dash` y `dashOffset`). */
  length: number
  dash: [number, number]
  dashOffset: number
}

/** Altura real de una persona en metros (para escalar la figura). */
const FIGURE_HEIGHT_M = 1.5;
/** Acotación de la figura para contenedores pequeños/grandes (px). */
const FIGURE_MIN_PX = 16;
const FIGURE_MAX_PX = 110;

/** Distancia reglamentaria red → línea de servicio (FIP). */
const SERVICE_Y_NORTH = NET_Y_M - SERVICE_LINE_OFFSET_M; // 3.05
const SERVICE_Y_SOUTH = NET_Y_M + SERVICE_LINE_OFFSET_M; // 16.95
/** Extremos de la línea central de saque (red → servicio + prolongación). */
const CENTER_Y_NORTH = SERVICE_Y_NORTH - SERVICE_LINE_OVERSHOOT_M; // 2.85
const CENTER_Y_SOUTH = SERVICE_Y_SOUTH + SERVICE_LINE_OVERSHOOT_M; // 17.15
const CENTER_X = COURT_WIDTH_M / 2; // 5

function toPx(x: number, y: number, viewport: CourtViewport): [number, number] {
  const point = courtToPx({ x, y }, viewport)
  return [point.x, point.y]
}

/**
 * Capa 1: piso azul rey. Sólo depende del viewport, se redibuja en resize.
 */
export function buildFloor(viewport: CourtViewport): CourtFloorProps {
  const topLeft = courtToPx({ x: 0, y: 0 }, viewport)
  const bottomRight = courtToPx({ x: COURT_WIDTH_M, y: COURT_DEPTH_M }, viewport)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
}

/**
 * Capa 1 (líneas FIP, estáticas): red horizontal en Y=10, líneas de servicio
 * paralelas a 6,95 m y líneas centrales de saque perpendiculares (red →
 * servicio + 20 cm). Sin perímetro pintado: las paredes son el límite.
 */
export function buildCourtLines(viewport: CourtViewport): CourtLineProps[] {
  const stroke = COURT_COLORS.line
  return [
    {
      key: "net",
      points: [...toPx(0, NET_Y_M, viewport), ...toPx(COURT_WIDTH_M, NET_Y_M, viewport)],
      stroke: COURT_COLORS.net,
      strokeWidth: 4,
      closed: false,
    },
    {
      key: "service-north",
      points: [...toPx(0, SERVICE_Y_NORTH, viewport), ...toPx(COURT_WIDTH_M, SERVICE_Y_NORTH, viewport)],
      stroke,
      strokeWidth: 2,
      closed: false,
    },
    {
      key: "service-south",
      points: [...toPx(0, SERVICE_Y_SOUTH, viewport), ...toPx(COURT_WIDTH_M, SERVICE_Y_SOUTH, viewport)],
      stroke,
      strokeWidth: 2,
      closed: false,
    },
    {
      key: "center-north",
      points: [...toPx(CENTER_X, NET_Y_M, viewport), ...toPx(CENTER_X, CENTER_Y_NORTH, viewport)],
      stroke,
      strokeWidth: 2,
      closed: false,
    },
    {
      key: "center-south",
      points: [...toPx(CENTER_X, NET_Y_M, viewport), ...toPx(CENTER_X, CENTER_Y_SOUTH, viewport)],
      stroke,
      strokeWidth: 2,
      closed: false,
    },
  ]
}

/**
 * Capa 2 (actores): las 4 figuras de persona con `name` = `jugador-a`..
 * `jugador-d`. La altura escala con la cancha (acotada para seguir visible
 * en contenedores pequeños). Norte = blanco, Sur = ámbar.
 */
export function buildPlayerFigures(
  positions: PlayerPositions,
  viewport: CourtViewport
): PlayerFigureProps[] {
  const scale = computeScale(viewport)
  const height = Math.min(FIGURE_MAX_PX, Math.max(FIGURE_MIN_PX, scale * FIGURE_HEIGHT_M))

  return PLAYER_IDS.map((id) => {
    const point = courtToPx(positions[id], viewport)
    const north = id === "A" || id === "B"
    return {
      id,
      name: `jugador-${id.toLowerCase()}`,
      x: point.x,
      y: point.y,
      height,
      fill: north ? COURT_COLORS.teamNorth : COURT_COLORS.teamSouth,
      stroke: COURT_COLORS.figure,
    }
  })
}

/** Geometría de UNA flecha en píxeles con trazo según `progress` (0 = oculto). */
function buildArrowProps(
  key: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  viewport: CourtViewport,
  progress: number
): ArrowAnnotationProps {
  const geometry = computeArrowGeometry(from, to, viewport)
  const dash = computeDashProgress(progress, geometry.length, "forward")
  return {
    key,
    points: [geometry.x1, geometry.y1, geometry.x2, geometry.y2],
    length: geometry.length,
    dash: dash.dashArray,
    dashOffset: dash.dashOffset,
  }
}

/**
 * Capa 3: flecha de MOVIMIENTO de un jugador (negra) entre el paso anterior y
 * el actual. Las derivadas de la transición activa las ensambla CourtStage.
 */
export function buildMovementArrow(
  arrow: MovementArrow,
  viewport: CourtViewport,
  progress = 0
): ArrowAnnotationProps {
  return buildArrowProps(`mov-${arrow.player.toLowerCase()}`, arrow.from, arrow.to, viewport, progress)
}

/**
 * Capa 3: flecha del TIRO de la pelota (verde). `null` si el paso no tiene
 * tiro. La pelota en sí nunca se dibuja.
 */
export function buildShotArrow(
  step: Paso,
  viewport: CourtViewport,
  progress = 0
): ArrowAnnotationProps | null {
  if (!step.shot) return null
  return buildArrowProps("shot", step.shot.from, step.shot.to, viewport, progress)
}
