/**
 * Anotaciones: geometría de la flecha de trayectoria y progreso del trazo.
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO: recibe viewport/valores por parámetro, no lee `window` y no
 * importa `konva`/`react`. El renderer sólo aplica `points`, `strokeDasharray`
 * y `strokeDashoffset` a un nodo `Arrow`/`Line`.
 */

import { courtToPx } from "./geometry";
import type {
  CourtPoint,
  CourtViewport,
  MovementArrow,
  PlayerId,
  PlayerPositions,
} from "./types";

/** Flecha ya convertida a píxeles del viewport. */
export type ArrowGeometry = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Longitud en píxeles (alimenta `strokeDasharray`, AC-07). */
  length: number;
};

/** Sentido de dibujo del trazo: avance o rebobinado. */
export type DashDirection = "forward" | "backward";

/** Estado de trazo progresivo para un nodo Konva. */
export type DashProgress = {
  /** `[largo, largo]`: guion del tamaño del tramo completo. */
  dashArray: [number, number];
  dashOffset: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Geometría de la flecha `from → to` en píxeles del viewport. Determinista:
 * mismas coordenadas de cancha + mismo viewport → mismo resultado, así que el
 * escenario serializable (AC-07) basta para redibujar la anotación.
 */
export function computeArrowGeometry(
  from: CourtPoint,
  to: CourtPoint,
  viewport: CourtViewport
): ArrowGeometry {
  const start = courtToPx(from, viewport);
  const end = courtToPx(to, viewport);
  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    length: Math.hypot(end.x - start.x, end.y - start.y),
  };
}

/**
 * Progreso del trazo (0 = oculto/inicio, 1 = trazo completo).
 * - `forward`: el offset baja de `length` a 0 → el guion se "dibuja".
 * - `backward`: simétrico, sube de 0 a `length` → el guion se "borra".
 * Monotónico en ambos sentidos y sin NaN con `progress` inválido o `length` 0.
 */
export function computeDashProgress(
  progress: number,
  totalLength: number,
  direction: DashDirection = "forward"
): DashProgress {
  const p = clamp01(progress);
  const length = Number.isFinite(totalLength) && totalLength > 0 ? totalLength : 0;
  const dashOffset = direction === "backward" ? p * length : (1 - p) * length;
  return { dashArray: [length, length], dashOffset };
}

/** Desplazamiento mínimo (m) para considerar que un jugador se movió. */
const MOVE_EPSILON_M = 0.01;

/**
 * Deriva las flechas de MOVIMIENTO de jugadores (negras) entre el estado
 * anterior y el actual del escenario. Sólo incluye a los que se desplazaron
 * más de `MOVE_EPSILON_M` y conserva el orden estable de `PLAYER_IDS`
 * (A, B, C, D). Determinista: mismas posiciones → mismas flechas (AC-07).
 */
export function deriveMovementArrows(
  from: PlayerPositions,
  to: PlayerPositions,
  playerOrder: readonly PlayerId[]
): MovementArrow[] {
  const arrows: MovementArrow[] = [];
  for (const player of playerOrder) {
    const start = from[player];
    const end = to[player];
    if (!start || !end) continue;
    const moved =
      Math.abs(end.x - start.x) > MOVE_EPSILON_M || Math.abs(end.y - start.y) > MOVE_EPSILON_M;
    if (moved) arrows.push({ player, from: start, to: end });
  }
  return arrows;
}
