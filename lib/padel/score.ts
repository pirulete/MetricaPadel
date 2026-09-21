/**
 * Funciones puras de score del Core Evaluativo (Etapa 1).
 * Escala fija: Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1.
 */

export type ScoreRow = { criteriaId: string; score: number };

/** Score máximo posible = criterios × nivel máximo (4). */
export function computeMaxScore(criteriaCount: number): number {
  return criteriaCount * 4;
}

/** Suma de scores seleccionados (score en vivo del canvas P09). */
export function computeTotalScore(scores: Array<{ score: number }>): number {
  return scores.reduce((sum, s) => sum + s.score, 0);
}

/**
 * Valida que todos los criterios tengan score antes de publicar.
 * criteriaCount 0 → false (rúbrica sin criterios no es publicable).
 */
export function validatePublish(scores: Array<{ criteriaId: string }>, criteriaCount: number): boolean {
  if (criteriaCount <= 0) return false;
  const scored = new Set(scores.map((s) => s.criteriaId));
  return scored.size >= criteriaCount;
}