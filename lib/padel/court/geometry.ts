/**
 * Geometría de la cancha: escala, offsets y conversión cancha ↔ píxeles.
 * Módulo PRODUCTIVO (editor de transiciones del coach): ya no es un spike.
 *
 * Archivo PURO: no lee `window`/`devicePixelRatio`; el viewport entra por
 * parámetro (lo mide `useCourtConfig`). Sin imports de `konva`/`react`.
 *
 * Aspect ratio de la cancha: COURT_WIDTH_M : COURT_DEPTH_M = 10:20 = 1:2
 * (vertical, norte→sur). `courtToPx` y `pxToCourt` son inversas (AC-06).
 */

import { COURT_DEPTH_M, COURT_WIDTH_M, type CourtPoint, type CourtViewport } from "./types";

/** Techo de DPR soportado (pantallas 3x/4x no necesitan más canvas). */
export const MAX_DPR = 4;

/** Píxeles por metro calculados para un viewport (0 si el viewport es degenerado). */
export type CourtScale = number;

/** Desplazamiento del origen de cancha dentro del viewport (CSS px). */
export type CourtOffsets = { offsetX: number; offsetY: number };

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Escala uniforme (px por metro) que encaja la cancha completa en el viewport
 * sin deformar el aspect 1:2 (letterboxing). Viewport 0×0 o inválido → 0
 * (sin NaN/Infinity, E5); el caller no debe renderizar el Stage en ese estado.
 */
export function computeScale(viewport: CourtViewport): CourtScale {
  const width = finiteOrZero(viewport.width);
  const height = finiteOrZero(viewport.height);
  if (width <= 0 || height <= 0) return 0;
  return Math.min(width / COURT_WIDTH_M, height / COURT_DEPTH_M);
}

/** Offsets que centran la cancha escalada dentro del viewport (letterbox). */
export function computeOffsets(viewport: CourtViewport): CourtOffsets {
  const scale = computeScale(viewport);
  const width = finiteOrZero(viewport.width);
  const height = finiteOrZero(viewport.height);
  return {
    offsetX: (width - COURT_WIDTH_M * scale) / 2,
    offsetY: (height - COURT_DEPTH_M * scale) / 2,
  };
}

/**
 * Convierte un punto en metros de cancha a píxeles del viewport
 * (`offset + punto * escala`). Sin `window`; valores no finitos → 0.
 */
export function courtToPx(point: CourtPoint, viewport: CourtViewport): CourtPoint {
  const scale = computeScale(viewport);
  const { offsetX, offsetY } = computeOffsets(viewport);
  return {
    x: offsetX + finiteOrZero(point.x) * scale,
    y: offsetY + finiteOrZero(point.y) * scale,
  };
}

/**
 * Inversa de `courtToPx`: píxeles del viewport → metros de cancha.
 * Viewport degenerado (escala 0) → `{0,0}` (sin NaN/Infinity); valores no
 * finitos de entrada se normalizan a 0. Es una inversa pura: NO recorta, el
 * caller aplica `clampCourtPoint` (drag/clamp de EC-10).
 */
export function pxToCourt(point: CourtPoint, viewport: CourtViewport): CourtPoint {
  const scale = computeScale(viewport);
  if (scale <= 0) return { x: 0, y: 0 };
  const { offsetX, offsetY } = computeOffsets(viewport);
  return {
    x: (finiteOrZero(point.x) - offsetX) / scale,
    y: (finiteOrZero(point.y) - offsetY) / scale,
  };
}

function clampAxis(value: number, max: number): number {
  const safe = finiteOrZero(value);
  return Math.min(max, Math.max(0, safe));
}

/** Acota un punto de cancha al rectángulo [0..10] × [0..20] (EC-10). */
export function clampCourtPoint(point: CourtPoint): CourtPoint {
  return {
    x: clampAxis(point.x, COURT_WIDTH_M),
    y: clampAxis(point.y, COURT_DEPTH_M),
  };
}

/**
 * Normaliza el `devicePixelRatio` del navegador a un rango usable [1, MAX_DPR].
 * Valores 0, negativos, NaN o Infinity → 1 (evita canvas de tamaño inválido).
 */
export function normalizeDpr(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(MAX_DPR, Math.max(1, dpr));
}

/**
 * Tamaño físico (device px) para un tamaño CSS dado. Multiplicar ambos ejes por
 * el mismo DPR normalizado no deforma el aspect ratio (AC-02).
 */
export function applyDpr(size: number, dpr: number): number {
  return finiteOrZero(size) * normalizeDpr(dpr);
}
