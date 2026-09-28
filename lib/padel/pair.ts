/**
 * Lógica pura de Evaluación en Pareja 2v2 (SPEC-01, v0.8).
 * NOTA: Este archivo es "puro" — NO importa db/pg ni módulos server-side.
 *       Las queries transaccionales viven en lib/db/queries/padel/pair.ts.
 */

/** Categorías que se evalúan como unidad de pareja por defecto (D3). */
export const SHARED_CATEGORIES = ['tactica', 'actitud_equipo', 'reglas'] as const;
/** Categorías que se evalúan individualmente por defecto. */
export const INDIVIDUAL_CATEGORIES = ['tecnica_basica', 'tecnica_especifica', 'fisica'] as const;

export type PairScore = { criteriaId: string; levelId: string; comment?: string };

export type PairAuditPayload = {
  coach_id: string;
  course_id: string;
  student_a_id: string;
  student_b_id: string;
  shared_criteria_count: number;
  individual_criteria_count: number;
  duration_seconds: number;
};

/** true si la categoría se evalúa compartida por defecto. */
export function isSharedCategory(category: string): boolean {
  return (SHARED_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Sincroniza el nivel de un criterio compartido en ambos alumnos (upsert).
 * Retorna los nuevos sets; no muta los originales.
 */
export function applySharedSelection(
  scoresA: PairScore[],
  scoresB: PairScore[],
  criteriaId: string,
  levelId: string
): { scoresA: PairScore[]; scoresB: PairScore[] } {
  const upsert = (scores: PairScore[]): PairScore[] => {
    const existing = scores.find((s) => s.criteriaId === criteriaId);
    if (existing) {
      return scores.map((s) => (s.criteriaId === criteriaId ? { ...s, levelId } : s));
    }
    return [...scores, { criteriaId, levelId }];
  };
  return { scoresA: upsert(scoresA), scoresB: upsert(scoresB) };
}

/**
 * Al activar el toggle "Evaluar en Pareja" de un criterio, sincroniza ambos
 * alumnos: A es la fuente (copia A → B); si A aún no tiene el criterio pero B
 * sí, lo toma de B (quedan sincronizados).
 */
export function syncPairScores(
  scoresA: PairScore[],
  scoresB: PairScore[],
  sharedCriteriaIds: string[]
): { scoresA: PairScore[]; scoresB: PairScore[] } {
  const levelByCriteriaA = new Map(scoresA.map((s) => [s.criteriaId, s.levelId]));
  const levelByCriteriaB = new Map(scoresB.map((s) => [s.criteriaId, s.levelId]));
  const shared = new Set(sharedCriteriaIds);

  // A es la fuente: B toma el nivel de A en criterios compartidos.
  const nextB = scoresB.map((s) => {
    if (!shared.has(s.criteriaId)) return s;
    const levelA = levelByCriteriaA.get(s.criteriaId);
    return levelA ? { ...s, levelId: levelA } : s;
  });
  // Si A no tiene el criterio compartido pero B sí, A lo toma de B.
  const nextA = [...scoresA];
  for (const criteriaId of shared) {
    if (!levelByCriteriaA.has(criteriaId) && levelByCriteriaB.has(criteriaId)) {
      nextA.push({ criteriaId, levelId: levelByCriteriaB.get(criteriaId)! });
    }
  }
  return { scoresA: nextA, scoresB: nextB };
}

/**
 * Totales en vivo de ambos alumnos. maxScore = criterios distintos evaluados
 * (unión A∪B) × nivel máximo de la escala (4). Para una evaluación completa
 * equivale a criteriaCount × 4 (patrón computeMaxScore de score.ts).
 */
export function computePairTotals(
  scoresA: Array<{ criteriaId: string; levelId: string }>,
  scoresB: Array<{ criteriaId: string; levelId: string }>,
  levelScoreById: Map<string, number>
): { totalA: number; totalB: number; maxScore: number } {
  const totalA = scoresA.reduce((sum, s) => sum + (levelScoreById.get(s.levelId) ?? 0), 0);
  const totalB = scoresB.reduce((sum, s) => sum + (levelScoreById.get(s.levelId) ?? 0), 0);
  const distinctCriteria = new Set([...scoresA, ...scoresB].map((s) => s.criteriaId)).size;
  const maxLevelScore = Math.max(0, ...levelScoreById.values());
  return { totalA, totalB, maxScore: distinctCriteria * maxLevelScore };
}

/**
 * Valida que ambos alumnos tengan score en todos los criterios antes de
 * publicar. criteriaCount 0 → invalid (rúbrica sin criterios no es publicable).
 */
export function validatePairPublish(
  scoresA: Array<{ criteriaId: string }>,
  scoresB: Array<{ criteriaId: string }>,
  criteriaCount: number
): { valid: boolean; missingA: number; missingB: number } {
  if (criteriaCount <= 0) return { valid: false, missingA: criteriaCount, missingB: criteriaCount };
  const scoredA = new Set(scoresA.map((s) => s.criteriaId)).size;
  const scoredB = new Set(scoresB.map((s) => s.criteriaId)).size;
  const missingA = Math.max(0, criteriaCount - scoredA);
  const missingB = Math.max(0, criteriaCount - scoredB);
  return { valid: missingA === 0 && missingB === 0, missingA, missingB };
}

/**
 * D7: conteo de criterios sincronizados (mismo levelId en ambos alumnos) vs
 * individuales, derivado de los scores reales al publicar.
 */
export function computePairAuditCounts(
  scoresA: Array<{ criteriaId: string; levelId: string }>,
  scoresB: Array<{ criteriaId: string; levelId: string }>
): { shared: number; individual: number } {
  const levelByCriteriaA = new Map(scoresA.map((s) => [s.criteriaId, s.levelId]));
  const levelByCriteriaB = new Map(scoresB.map((s) => [s.criteriaId, s.levelId]));
  const allCriteria = new Set([...levelByCriteriaA.keys(), ...levelByCriteriaB.keys()]);
  let shared = 0;
  let individual = 0;
  for (const criteriaId of allCriteria) {
    const levelA = levelByCriteriaA.get(criteriaId);
    const levelB = levelByCriteriaB.get(criteriaId);
    if (levelA !== undefined && levelB !== undefined && levelA === levelB) shared++;
    else individual++;
  }
  return { shared, individual };
}

/** Payload de auditoría PAIR_EVALUATION_PUBLISHED (espejo de lib/audit/helpers.ts). */
export function buildPairAuditPayload(params: {
  coachId: string;
  courseId: string;
  studentAId: string;
  studentBId: string;
  scoresA: Array<{ criteriaId: string; levelId: string }>;
  scoresB: Array<{ criteriaId: string; levelId: string }>;
  durationSeconds?: number;
}): PairAuditPayload {
  const { shared, individual } = computePairAuditCounts(params.scoresA, params.scoresB);
  return {
    coach_id: params.coachId,
    course_id: params.courseId,
    student_a_id: params.studentAId,
    student_b_id: params.studentBId,
    shared_criteria_count: shared,
    individual_criteria_count: individual,
    duration_seconds: params.durationSeconds ?? 0,
  };
}