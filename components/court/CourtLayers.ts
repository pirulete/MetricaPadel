/**
 * Prop-builder de las capas z-ordered de la escena
 * (cancha → actores → anotaciones). SPIKE NO PRODUCTIVO — borrable tras el
 * go/no-go.
 *
 * SIN librería de canvas (regla D-T4: el único archivo que la importa es
 * `CourtStage.tsx`). Aquí sólo se derivan props planas a partir de
 * `lib/padel/court/*`: cero lógica de negocio, cero estado.
 *
 * Homologación PadelChess: piso #3b82f6 con esquinas redondeadas, líneas
 * blancas con sombra suave, red con malla/cinta/postes, paredes con postes,
 * tiros = curvas Bézier amarillas discontinuas con etiqueta en escena,
 * zona mint de aterrizaje, jugadores = figuras con kit por equipo.
 */

import { computeCurveGeometry, computeDashProgress } from "@/lib/padel/court/annotation"
import { computeScale, courtToPx } from "@/lib/padel/court/geometry"
import {
  COURT_DEPTH_M,
  COURT_WIDTH_M,
  NET_Y_M,
  SERVICE_LINE_OFFSET_M,
  SERVICE_LINE_OVERSHOOT_M,
  type CourtViewport,
  type Paso,
  type PlayerId,
  type PlayerPositions,
  type Shot,
} from "@/lib/padel/court/types"

/** Orden estable de los 4 jugadores. */
export const PLAYER_IDS = ["A", "B", "C", "D"] as const satisfies readonly PlayerId[]

/**
 * Paleta homologada a los tokens de PadelChess. Konva dibuja en canvas y no
 * resuelve CSS variables, así que los colores viven aquí.
 */
export const COURT_COLORS = {
  /** Piso (token `court`). */
  floor: "#3b82f6",
  /** Líneas de juego. */
  line: "#ffffff",
  /** Sombra de líneas/objetos sobre el piso (token `groundShadow`). */
  groundShadow: "rgba(12,29,68,0.18)",
  /** Malla de la red. */
  netMesh: "rgba(255,255,255,0.55)",
  /** Banda translúcida de la red. */
  netBand: "rgba(255,255,255,0.10)",
  /** Cinta superior de la red. */
  netTape: "#ffffff",
  /** Cinta inferior de la red. */
  netTapeBottom: "#0b1220",
  /** Postes de la red. */
  netPost: "#4d4d4d",
  /** Postes de pared a lo largo de los laterales. */
  wallPost: "rgba(20,20,20,0.9)",
  /** Flecha del tiro (token `yellow`). */
  shot: "#ffff04",
  /** Zona de aterrizaje (token `green`). */
  zone: "#68fec3",
  /** Burbuja de etiqueta en escena. */
  labelBg: "#ffffff",
  /** Tinta de etiquetas. */
  labelInk: "#14202f",
  /** Tag "HIT" sobre el jugador que golpea. */
  hitTag: "#7c3aed",
  hitInk: "#ffffff",
  /** Pelota (SVG de PadelChess: lima con costuras). */
  ball: "#ccff00",
  ballSeam: "#ffffff",
  ballSeamStroke: "#8aab00",
  /** Kits por equipo (norte = azul/morado, sur = blanco). */
  kitNorth: "#5b3fd9",
  kitNorthShorts: "#2c3e8f",
  kitSouth: "#f8fafc",
  kitSouthShorts: "#171717",
  /** Piel, pelo y calzado. */
  skinLight: "#e8b48c",
  skinDeep: "#c98a5e",
  hair: "#241812",
  shoe: "#171717",
  /** Pala. */
  racket: "#7c3aed",
  racketStrings: "rgba(233,238,250,0.35)",
} as const

/** Altura real de una figura en metros (para escalar). */
const FIGURE_HEIGHT_M = 1.85;
/** Acotación de la figura para contenedores pequeños/grandes (px). */
const FIGURE_MIN_PX = 26;
const FIGURE_MAX_PX = 140;
/** Radio de esquinas del piso (px, como PadelChess). */
const FLOOR_RADIUS_PX = 8;
/** Espaciado de los postes de pared a lo largo de los laterales (m). */
const WALL_POST_SPACING_M = 2.5;
/** Ancho/largo de la zona de aterrizaje (m). */
const ZONE_SIZE_M = 2.6;

/** Distancia red → línea de servicio y prolongación de la central (estilo PadelChess). */
const SERVICE_Y_NORTH = NET_Y_M - SERVICE_LINE_OFFSET_M; // 3
const SERVICE_Y_SOUTH = NET_Y_M + SERVICE_LINE_OFFSET_M; // 17
const CENTER_Y_NORTH = SERVICE_Y_NORTH - SERVICE_LINE_OVERSHOOT_M; // 2.6
const CENTER_Y_SOUTH = SERVICE_Y_SOUTH + SERVICE_LINE_OVERSHOOT_M; // 17.4
const CENTER_X = COURT_WIDTH_M / 2; // 5
/** Banda de la red (m, centrada en Y=10). */
const NET_BAND_M = 0.9;
const NET_FADE_NORTH = NET_Y_M - NET_BAND_M / 2;
const NET_FADE_SOUTH = NET_Y_M + NET_BAND_M / 2;

/** Piso de la cancha. */
export type CourtFloorProps = { x: number; y: number; width: number; height: number; radius: number }

/** Línea de cancha ya en píxeles del viewport. */
export type CourtLineProps = {
  key: string
  points: number[]
  stroke: string
  strokeWidth: number
  closed: boolean
  /** Sombra suave estilo PadelChess (sólo en segmentos completos). */
  shadow: boolean
  /** Opacidad (el tramo bajo la red se atenúa). */
  opacity: number
}

/** Poste rectangular (pared o red) en píxeles. */
export type PostProps = { key: string; x: number; y: number; width: number; height: number; fill: string }

/** Red completa (banda + malla + cintas + postes). */
export type NetProps = {
  band: { x: number; y: number; width: number; height: number }
  meshV: number[][]
  meshH: number[][]
  /** Cinta superior con sag: string SVG (Path de Konva). */
  tapeTop: string
  tapeBottom: number[]
  posts: PostProps[]
}

/** Figura de jugador ya en píxeles del viewport. */
export type PlayerFigureProps = {
  id: PlayerId
  /** Equivalente a "clase" en Konva (`node.name()`). */
  name: string
  x: number
  y: number
  /** Altura total de la figura en px (proporcional a la escala de la cancha). */
  height: number
  /** Vista frontal (kit del norte) o de espaldas (kit del sur). */
  view: "face" | "back"
  jersey: string
  shorts: string
  skin: string
}

/** Vista completa del tiro de un paso, ya en píxeles. */
export type ShotViewProps = {
  curve: {
    points: number[]
    length: number
    dash: [number, number]
    dashOffset: number
  }
  /** Burbuja de etiqueta ("GLOBO") anclada al punto medio de la curva. */
  label: { x: number; y: number; text: string }
  /** Zona mint de aterrizaje (capa cancha, bajo los jugadores). */
  zone: { x: number; y: number; width: number; height: number; radius: number }
  /** Pelota: origen/destino y polilínea de vuelo (misma que la curva). */
  ball: { from: { x: number; y: number }; to: { x: number; y: number }; path: number[] }
  /** Tag "HIT" sobre el jugador que golpea. */
  hit: { x: number; y: number }
}

function toPx(x: number, y: number, viewport: CourtViewport): [number, number] {
  const point = courtToPx({ x, y }, viewport)
  return [point.x, point.y]
}

/**
 * Capa 1: piso azul con esquinas redondeadas (estilo PadelChess).
 * Sólo depende del viewport, se redibuja en resize.
 */
export function buildFloor(viewport: CourtViewport): CourtFloorProps {
  const topLeft = courtToPx({ x: 0, y: 0 }, viewport)
  const bottomRight = courtToPx({ x: COURT_WIDTH_M, y: COURT_DEPTH_M }, viewport)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
    radius: FLOOR_RADIUS_PX,
  }
}

/**
 * Capa 1 (líneas estilo PadelChess, estáticas): líneas de servicio a 7 m de
 * la red y línea central continua de la servicio a la servicio (+0,4 m) con
 * el tramo bajo la red atenuado. Sin perímetro pintado: el borde del piso es
 * el límite (como en PadelChess).
 */
export function buildCourtLines(viewport: CourtViewport): CourtLineProps[] {
  const stroke = COURT_COLORS.line
  const scale = computeScale(viewport)
  const width = Math.max(1.5, 0.07 * scale) // 7 cm como PadelChess

  return [
    {
      key: "service-north",
      points: [...toPx(0, SERVICE_Y_NORTH, viewport), ...toPx(COURT_WIDTH_M, SERVICE_Y_NORTH, viewport)],
      stroke,
      strokeWidth: width,
      closed: false,
      shadow: true,
      opacity: 1,
    },
    {
      key: "service-south",
      points: [...toPx(0, SERVICE_Y_SOUTH, viewport), ...toPx(COURT_WIDTH_M, SERVICE_Y_SOUTH, viewport)],
      stroke,
      strokeWidth: width,
      closed: false,
      shadow: true,
      opacity: 1,
    },
    {
      key: "center-north",
      points: [...toPx(CENTER_X, CENTER_Y_NORTH, viewport), ...toPx(CENTER_X, NET_FADE_NORTH, viewport)],
      stroke,
      strokeWidth: width,
      closed: false,
      shadow: true,
      opacity: 1,
    },
    {
      key: "center-under-net",
      points: [...toPx(CENTER_X, NET_FADE_NORTH, viewport), ...toPx(CENTER_X, NET_FADE_SOUTH, viewport)],
      stroke,
      strokeWidth: width,
      closed: false,
      shadow: false,
      opacity: 0.5,
    },
    {
      key: "center-south",
      points: [...toPx(CENTER_X, NET_FADE_SOUTH, viewport), ...toPx(CENTER_X, CENTER_Y_SOUTH, viewport)],
      stroke,
      strokeWidth: width,
      closed: false,
      shadow: true,
      opacity: 1,
    },
  ]
}

/**
 * Capa 1: postes de pared a lo largo de los laterales (los dashes negros
 * que PadelChess dibuja sobre los bordes largos de la cancha).
 */
export function buildWallPosts(viewport: CourtViewport): PostProps[] {
  const scale = computeScale(viewport)
  const width = 0.13 * scale
  const height = 0.5 * scale
  const posts: PostProps[] = []

  for (let y = WALL_POST_SPACING_M / 2 + 1; y < COURT_DEPTH_M; y += WALL_POST_SPACING_M) {
    const py = courtToPx({ x: 0, y }, viewport).y
    posts.push({ key: `wall-l-${y}`, x: 0.02 * scale + courtToPx({ x: 0, y: 0 }, viewport).x, y: py - height / 2, width, height, fill: COURT_COLORS.wallPost })
    const right = courtToPx({ x: COURT_WIDTH_M, y: 0 }, viewport).x
    posts.push({ key: `wall-r-${y}`, x: right - 0.02 * scale - width, y: py - height / 2, width, height, fill: COURT_COLORS.wallPost })
  }
  return posts
}

/**
 * Capa 1: red horizontal estilo PadelChess — banda translúcida con malla,
 * cinta superior con sag (Path cuadrático), cinta inferior y postes.
 */
export function buildNet(viewport: CourtViewport): NetProps {
  const scale = computeScale(viewport)
  const left = courtToPx({ x: 0, y: 0 }, viewport).x
  const right = courtToPx({ x: COURT_WIDTH_M, y: 0 }, viewport).x
  const bandTop = courtToPx({ x: 0, y: NET_FADE_NORTH }, viewport).y
  const bandBottom = courtToPx({ x: 0, y: NET_FADE_SOUTH }, viewport).y
  const centerY = courtToPx({ x: 0, y: NET_Y_M }, viewport).y
  const bandHeight = bandBottom - bandTop

  // Malla: verticales cada ~0,35 m, horizontales cada ~0,3 m dentro de la banda.
  const meshV: number[][] = []
  const cols = Math.max(4, Math.round(COURT_WIDTH_M * scale / (0.35 * scale)))
  for (let i = 0; i <= cols; i++) {
    const x = left + ((right - left) * i) / cols
    meshV.push([x, bandTop, x, bandBottom])
  }
  const meshH: number[][] = []
  const rows = Math.max(2, Math.round(bandHeight / (0.3 * scale)))
  for (let i = 1; i < rows; i++) {
    const y = bandTop + (bandHeight * i) / rows
    meshH.push([left, y, right, y])
  }

  // Cinta superior con sag de 4 cm en el centro (como el Path Q de PadelChess).
  const sag = 0.04 * scale
  const tapeTop = `M ${left} ${bandTop} Q ${(left + right) / 2} ${bandTop + 2 * sag} ${right} ${bandTop}`
  const tapeBottom = [left, bandBottom, right, bandBottom]

  const postWidth = 0.16 * scale
  const postHeight = bandHeight + 0.2 * scale
  const posts: PostProps[] = [
    { key: "net-post-l", x: left, y: centerY - postHeight / 2, width: postWidth, height: postHeight, fill: COURT_COLORS.netPost },
    { key: "net-post-r", x: right - postWidth, y: centerY - postHeight / 2, width: postWidth, height: postHeight, fill: COURT_COLORS.netPost },
  ]

  return { band: { x: left, y: bandTop, width: right - left, height: bandHeight }, meshV, meshH, tapeTop, tapeBottom, posts }
}

/**
 * Capa 2 (actores): las 4 figuras con `name` = `jugador-a`..`jugador-d`.
 * Norte (A, B) = kit azul/morado vista frontal; Sur (C, D) = kit blanco vista
 * de espaldas (como los kits de PadelChess). Altura proporcional acotada.
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
      view: north ? "face" : "back",
      jersey: north ? COURT_COLORS.kitNorth : COURT_COLORS.kitSouth,
      shorts: north ? COURT_COLORS.kitNorthShorts : COURT_COLORS.kitSouthShorts,
      skin: id === "B" || id === "D" ? COURT_COLORS.skinDeep : COURT_COLORS.skinLight,
    }
  })
}

/**
 * Capa 1 (bajo los jugadores): zona mint de aterrizaje del tiro.
 * Devuelta junto a la vista del tiro; se renderiza antes que los actores.
 */
function buildZone(shot: Shot, viewport: CourtViewport): ShotViewProps["zone"] {
  const scale = computeScale(viewport)
  const center = courtToPx(shot.to, viewport)
  const size = ZONE_SIZE_M * scale
  return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size, radius: 6 }
}

/**
 * Capa 3: vista completa del tiro — curva Bézier amarilla discontinua con
 * progreso del trazo, etiqueta en el punto medio, zona de aterrizaje, ruta
 * de la pelota y tag "HIT" sobre quien golpea. `progress` 0 = trazo oculto
 * (el reloj de CourtStage lo anima hasta 1).
 */
export function buildShotView(step: Paso, viewport: CourtViewport, progress = 0): ShotViewProps | null {
  if (!step.shot) return null
  const shot = step.shot
  const geometry = computeCurveGeometry(shot, viewport)
  const dash = computeDashProgress(progress, geometry.length, "forward")

  return {
    curve: {
      points: geometry.points,
      length: geometry.length,
      dash: dash.dashArray,
      dashOffset: dash.dashOffset,
    },
    label: { x: geometry.midpoint.x, y: geometry.midpoint.y, text: shot.label },
    zone: buildZone(shot, viewport),
    ball: {
      from: courtToPx(shot.from, viewport),
      to: courtToPx(shot.to, viewport),
      path: geometry.points,
    },
    hit: courtToPx(shot.from, viewport),
  }
}
