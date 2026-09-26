/**
 * Polígono radar de 6 dimensiones (SPEC-EPIC-01, RF-04).
 * Función PURA — sin imports server-side ni de renderer. El renderer (SVG web,
 * recharts, react-pdf) solo dibuja; el cómputo vive acá y es unit-testable.
 *
 * Convención: computeRadarPoints devuelve puntos en espacio unitario [-1,1]
 * (radio 1 = maxScore). computeRadarPolygon los mapea a coordenadas SVG
 * (cx, cy, radius) y devuelve el string `points` para <polygon>.
 */

export const RADAR_DIMENSIONS = [
  "reglas",
  "tecnica_basica",
  "tecnica_especifica",
  "tactica",
  "fisica",
  "actitud_equipo",
] as const;

export type RadarDimension = (typeof RADAR_DIMENSIONS)[number];

export type RadarPoint = { x: number; y: number };

/**
 * Calcula los 6 vértices del polígono radar en espacio unitario.
 * - Orden: RADAR_DIMENSIONS, empezando en el tope (ángulo -90°) y en sentido horario.
 * - Cada dimensión se normaliza a score/maxScore, clamp [0,1].
 * - Dimensiones ausentes → 0 (centro). maxScore ≤ 0 → todos en el centro.
 */
export function computeRadarPoints(scores: Record<string, number>, maxScore: number): RadarPoint[] {
  const n = RADAR_DIMENSIONS.length;
  if (maxScore <= 0) {
    return RADAR_DIMENSIONS.map(() => ({ x: 0, y: 0 }));
  }
  return RADAR_DIMENSIONS.map((dim, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const raw = scores[dim] ?? 0;
    const ratio = Math.min(1, Math.max(0, raw / maxScore));
    return { x: Math.cos(angle) * ratio, y: Math.sin(angle) * ratio };
  });
}

/**
 * String `points` para <polygon> SVG: mapea los puntos unitarios a
 * coordenadas absolutas centradas en (cx, cy) con el radio dado.
 */
export function computeRadarPolygon(
  scores: Record<string, number>,
  maxScore: number,
  cx: number,
  cy: number,
  radius: number
): string {
  return computeRadarPoints(scores, maxScore)
    .map((p) => `${(cx + p.x * radius).toFixed(2)},${(cy + p.y * radius).toFixed(2)}`)
    .join(" ");
}

/** Polígono de rejilla (grid ring) para un radio relativo r ∈ (0,1]. */
export function computeGridRing(r: number, cx: number, cy: number, radius: number): string {
  return computeRadarPolygon(Object.fromEntries(RADAR_DIMENSIONS.map((d) => [d, r])), 1, cx, cy, radius);
}