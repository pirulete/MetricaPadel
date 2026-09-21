/**
 * Funciones puras de evolución del alumno (G7).
 * NOTA: Este archivo es "puro" — NO importa db/pg ni módulos server-side.
 *       La query de DB (listStudentEvolution) vive en lib/db/queries/padel/evaluations.ts.
 */

export type Trend = "up" | "down" | "stable";

/**
 * Tendencia entre el último score y el anterior. Con <2 puntos no hay
 * comparación → 'stable'. Igualdad exacta → 'stable'.
 */
export function computeTrend(scores: number[]): Trend {
  if (scores.length < 2) return "stable";
  const last = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  if (last > prev) return "up";
  if (last < prev) return "down";
  return "stable";
}

export type EvolutionScoreItem = {
  category: string;
  totalScore: number | null;
  maxScore: number | null;
  publishedAt: Date | string | null;
};

/**
 * Agrupa evaluaciones por categoría preservando el orden de entrada
 * (listStudentEvolution ya viene ordenada por publishedAt ASC). Las
 * evaluaciones sin categoría se omiten. Genérica sobre el item para
 * aceptar el shape completo de StudentEvolutionItem.
 */
export function groupByCategory<T extends { category: string }>(
  evaluations: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const e of evaluations) {
    if (!e.category) continue;
    (groups[e.category] ??= []).push(e);
  }
  return groups;
}