/**
 * Anotaciones: geometría de las flechas de tiro (curvas Bézier) y progreso
 * del trazo. SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO: recibe viewport/valores por parámetro, no lee `window` y no
 * importa `konva`/`react`. El renderer sólo aplica `points`, `strokeDasharray`
 * y `strokeDashoffset` a un nodo Konva.
 *
 * Homologación PadelChess: los tiros son curvas Bézier cuadráticas
 * (startPoint / controlPoint / endPoint) muestreadas en polilíneas.
 */

import { courtToPx } from "./geometry";
import type { CourtPoint, CourtViewport, Shot } from "./types";

/** Número de segmentos de la polilínea que aproxima la curva. */
const CURVE_SEGMENTS = 32;

/** Geometría de la curva ya convertida a píxeles del viewport. */
export type CurveGeometry = {
  /** Polilínea plana `[x1,y1,x2,y2,...]` lista para `Line.points`. */
  points: number[];
  /** Longitud total en píxeles (alimenta `strokeDasharray`, AC-07). */
  length: number;
  /** Punto medio de la curva en píxeles (ancla la etiqueta en escena). */
  midpoint: { x: number; y: number };
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

/** Punto de la cuadrática `B(t)` con t acotado a [0,1] (de Piel para Bezier). */
export function quadraticPoint(from: CourtPoint, control: CourtPoint, to: CourtPoint, t: number): CourtPoint {
  const s = clamp01(t);
  const u = 1 - s;
  return {
    x: u * u * from.x + 2 * u * s * control.x + s * s * to.x,
    y: u * u * from.y + 2 * u * s * control.y + s * s * to.y,
  };
}

/**
 * Geometría de la curva del tiro en píxeles: muestrea la cuadrática en
 * `CURVE_SEGMENTS` segmentos, calcula la longitud poligonal y el punto medio
 * (donde PadelChess coloca la etiqueta del tiro). Determinista: mismos
 * puntos + mismo viewport → mismo resultado (AC-07).
 */
export function computeCurveGeometry(shot: Shot, viewport: CourtViewport): CurveGeometry {
  const points: number[] = [];
  let length = 0;
  let previous: { x: number; y: number } | null = null;

  for (let i = 0; i <= CURVE_SEGMENTS; i++) {
    const courtPoint = quadraticPoint(shot.from, shot.control, shot.to, i / CURVE_SEGMENTS);
    const pixel = courtToPx(courtPoint, viewport);
    points.push(pixel.x, pixel.y);
    if (previous) length += Math.hypot(pixel.x - previous.x, pixel.y - previous.y);
    previous = pixel;
  }

  const midpointCourt = quadraticPoint(shot.from, shot.control, shot.to, 0.5);
  return { points, length, midpoint: courtToPx(midpointCourt, viewport) };
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
