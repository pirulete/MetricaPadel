import { db } from "@/lib/db";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { PaginatedResult, PaginationParams } from "./pagination";
import { resolveLimit } from "./pagination";
import {
  evaluations,
  evaluationScores,
  rubrics,
  rubricCriteria,
  rubricLevels,
  users,
  evaluationStatusEnum,
  rubricCategoryEnum,
} from "@/lib/db/schema";

export type EvaluationStatus = (typeof evaluationStatusEnum.enumValues)[number];

/**
 * G16: condición reusable para excluir evaluaciones archivadas (soft-delete).
 * Todas las queries de coach/alumno la aplican; las de admin/super-admin NO
 * (el super admin necesita ver todo).
 */
export const isNotDeleted = isNull(evaluations.deletedAt);

export type EvaluationWithScores = {
  evaluation: typeof evaluations.$inferSelect;
  scores: Array<typeof evaluationScores.$inferSelect>;
};

export type SaveEvaluationInput = {
  scores: Array<{ criteriaId: string; levelId: string; comment?: string }>;
  globalComment?: string;
};

export type PublishResult =
  | { ok: true; evaluation: typeof evaluations.$inferSelect }
  | { ok: false; reason: 'not_found' | 'not_draft' | 'incomplete'; missingCriteria?: number };

export type EnrichedScore = {
  criteriaId: string;
  criterionName: string | null;
  levelId: string;
  levelName: string | null;
  score: number;
  comment: string | null;
};

export type EvaluationSeriesItem = {
  id: string;
  version: number | null;
  status: EvaluationStatus;
  totalScore: number | null;
  maxScore: number | null;
  publishedAt: Date | null;
  scores: EnrichedScore[];
};

export type StudentEvolutionItem = {
  id: string;
  rubricId: string;
  rubricTitle: string;
  category: (typeof rubricCategoryEnum.enumValues)[number];
  version: number | null;
  totalScore: number | null;
  maxScore: number | null;
  publishedAt: Date | null;
  readAt: Date | null;
  scores: EnrichedScore[];
};

/**
 * Enriquecimiento compartido de scores (criterionName/levelName) para las
 * series de evaluación (G6/G7). Retorna Map<evaluationId, EnrichedScore[]>.
 */
async function enrichEvaluationScores(evaluationIds: string[]): Promise<Map<string, EnrichedScore[]>> {
  if (evaluationIds.length === 0) return new Map();
  const [scores, criteria, levels] = await Promise.all([
    db.select().from(evaluationScores).where(inArray(evaluationScores.evaluationId, evaluationIds)),
    db.select({ id: rubricCriteria.id, name: rubricCriteria.name }).from(rubricCriteria),
    db.select({ id: rubricLevels.id, name: rubricLevels.name }).from(rubricLevels),
  ]);
  const criterionById = new Map(criteria.map((c) => [c.id, c.name]));
  const levelById = new Map(levels.map((l) => [l.id, l.name]));
  const byEvaluation = new Map<string, EnrichedScore[]>();
  for (const s of scores) {
    const list = byEvaluation.get(s.evaluationId) ?? [];
    list.push({
      criteriaId: s.criteriaId,
      criterionName: criterionById.get(s.criteriaId) ?? null,
      levelId: s.levelId,
      levelName: levelById.get(s.levelId) ?? null,
      score: s.score,
      comment: s.comment,
    });
    byEvaluation.set(s.evaluationId, list);
  }
  return byEvaluation;
}

/**
 * Crea borrador de evaluación (status=draft). El API valida que la rúbrica
 * exista y pertenezca al teacher antes de llamar.
 */
export async function createEvaluation(data: {
  studentId: string;
  teacherId: string;
  rubricId: string;
}) {
  const [row] = await db.insert(evaluations).values({
    studentId: data.studentId,
    teacherId: data.teacherId,
    rubricId: data.rubricId,
    status: 'draft',
  }).returning();
  return row;
}

/**
 * Detalle de evaluación scoped al teacher (anti-IDOR coach).
 * Retorna null si no existe o no pertenece al teacher.
 */
export async function getEvaluationById(teacherId: string, id: string): Promise<EvaluationWithScores | null> {
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, id), eq(evaluations.teacherId, teacherId), isNotDeleted),
  });
  if (!evaluation) return null;

  const scores = await db.query.evaluationScores.findMany({
    where: eq(evaluationScores.evaluationId, id),
  });

  return { evaluation, scores };
}

/**
 * Detalle de evaluación scoped al alumno (anti-IDOR student).
 * Solo publicadas: los borradores nunca son visibles para el alumno.
 */
export async function getStudentEvaluationById(studentId: string, id: string): Promise<EvaluationWithScores | null> {
  const evaluation = await db.query.evaluations.findFirst({
    where: and(
      eq(evaluations.id, id),
      eq(evaluations.studentId, studentId),
      eq(evaluations.status, 'published'),
      isNotDeleted,
    ),
  });
  if (!evaluation) return null;

  const scores = await db.query.evaluationScores.findMany({
    where: eq(evaluationScores.evaluationId, id),
  });

  return { evaluation, scores };
}

/**
 * Lista evaluaciones del coach (teacher) con studentName + rubricTitle.
 * status opcional: 'draft' | 'published'. Paginada por cursor (G15) sobre
 * updatedAt desc (orden actual de la lista).
 */
export async function listEvaluations(
  teacherId: string,
  status?: EvaluationStatus,
  params?: PaginationParams,
): Promise<PaginatedResult<{
  id: string;
  studentId: string;
  studentName: string;
  rubricTitle: string;
  status: EvaluationStatus;
  totalScore: number | null;
  maxScore: number | null;
  updatedAt: Date;
}>> {
  const limit = resolveLimit(params?.limit);
  const conditions = [eq(evaluations.teacherId, teacherId), isNotDeleted];
  if (status) conditions.push(eq(evaluations.status, status));
  if (params?.cursor) conditions.push(lt(evaluations.updatedAt, new Date(params.cursor)));

  const rows = await db
    .select({
      id: evaluations.id,
      studentId: evaluations.studentId,
      studentName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      rubricTitle: rubrics.title,
      status: evaluations.status,
      totalScore: evaluations.totalScore,
      maxScore: evaluations.maxScore,
      updatedAt: evaluations.updatedAt,
    })
    .from(evaluations)
    .innerJoin(users, eq(users.id, evaluations.studentId))
    .innerJoin(rubrics, eq(rubrics.id, evaluations.rubricId))
    .where(and(...conditions))
    .orderBy(desc(evaluations.updatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1].updatedAt.toISOString()
    : null;
  return { items, nextCursor };
}

/**
 * Lista evaluaciones publicadas del alumno (A03). Solo published.
 * Paginada por cursor (G15) sobre publishedAt desc.
 */
export async function listStudentEvaluations(
  studentId: string,
  params?: PaginationParams,
): Promise<PaginatedResult<{
  id: string;
  rubricTitle: string;
  category: (typeof rubricCategoryEnum.enumValues)[number];
  version: number | null;
  totalScore: number | null;
  maxScore: number | null;
  publishedAt: Date | null;
  readAt: Date | null;
}>> {
  const limit = resolveLimit(params?.limit);
  const conditions = [
    eq(evaluations.studentId, studentId),
    eq(evaluations.status, 'published'),
    isNotDeleted,
  ];
  if (params?.cursor) conditions.push(lt(evaluations.publishedAt, new Date(params.cursor)));

  const rows = await db
    .select({
      id: evaluations.id,
      rubricTitle: rubrics.title,
      category: rubrics.category,
      version: evaluations.version,
      totalScore: evaluations.totalScore,
      maxScore: evaluations.maxScore,
      publishedAt: evaluations.publishedAt,
      readAt: evaluations.readAt,
    })
    .from(evaluations)
    .innerJoin(rubrics, eq(rubrics.id, evaluations.rubricId))
    .where(and(...conditions))
    .orderBy(desc(evaluations.publishedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last?.publishedAt ? last.publishedAt.toISOString() : null;
  return { items, nextCursor };
}

/**
 * Helper tx-scoped: guarda scores de un borrador (solo status=draft): reemplaza
 * el set completo de scores y recalcula totalScore desde los niveles
 * seleccionados. Extraído de saveEvaluationScores para reutilización en
 * evaluaciones de pareja (pair.ts). Retorna la evaluación actualizada o null
 * si no existe / no es del teacher / ya está publicada.
 */
export async function saveEvaluationScoresTx(
  tx: any,
  teacherId: string,
  id: string,
  input: SaveEvaluationInput
): Promise<typeof evaluations.$inferSelect | null> {
  const [evaluation] = await tx.select().from(evaluations)
    .where(and(eq(evaluations.id, id), eq(evaluations.teacherId, teacherId), isNotDeleted))
    .limit(1);
  if (!evaluation || evaluation.status !== 'draft') return null;

  const levelIds = input.scores.map((s) => s.levelId);
  const levels: Array<{ id: string; score: number }> = levelIds.length > 0
    ? await tx.select({ id: rubricLevels.id, score: rubricLevels.score })
        .from(rubricLevels)
        .where(inArray(rubricLevels.id, levelIds))
    : [];
  const scoreByLevel = new Map(levels.map((l) => [l.id, l.score]));

  await tx.delete(evaluationScores).where(eq(evaluationScores.evaluationId, id));

  for (const s of input.scores) {
    await tx.insert(evaluationScores).values({
      evaluationId: id,
      criteriaId: s.criteriaId,
      levelId: s.levelId,
      score: scoreByLevel.get(s.levelId) ?? 0,
      comment: s.comment ?? null,
    });
  }

  const totalScore = input.scores.reduce((sum, s) => sum + (scoreByLevel.get(s.levelId) ?? 0), 0);

  const [updated] = await tx.update(evaluations)
    .set({
      totalScore,
      globalComment: input.globalComment !== undefined ? input.globalComment : evaluation.globalComment,
      updatedAt: new Date(),
    })
    .where(eq(evaluations.id, id))
    .returning();

  return updated;
}

/**
 * Guarda scores de un borrador (solo status=draft). Wrapper transaccional de
 * saveEvaluationScoresTx. Retorna la evaluación actualizada o null si no
 * existe / no es del teacher / ya está publicada.
 */
export async function saveEvaluationScores(teacherId: string, id: string, input: SaveEvaluationInput) {
  return await db.transaction(async (tx) => saveEvaluationScoresTx(tx, teacherId, id, input));
}

/**
 * Helper tx-scoped: cuenta criterios de la rúbrica sin score en la evaluación.
 * Extraído de publishEvaluation para reutilización en evaluaciones de pareja
 * (pair.ts).
 */
export async function countMissingCriteria(
  tx: any,
  rubricId: string,
  evaluationId: string
): Promise<number> {
  const criteria: Array<{ id: string }> = await tx.select({ id: rubricCriteria.id }).from(rubricCriteria)
    .where(eq(rubricCriteria.rubricId, rubricId));
  const scores: Array<{ criteriaId: string }> = await tx.select({ criteriaId: evaluationScores.criteriaId }).from(evaluationScores)
    .where(eq(evaluationScores.evaluationId, evaluationId));

  const scoredCriteria = new Set(scores.map((s) => s.criteriaId));
  return criteria.filter((c) => !scoredCriteria.has(c.id)).length;
}

/**
 * Publica evaluación: valida que todos los criteria de la rúbrica tengan score
 * y setea publishedAt. Retorna unión discriminada con reason en caso de error.
 */
export async function publishEvaluation(teacherId: string, id: string): Promise<PublishResult> {
  return await db.transaction(async (tx) => {
    const [evaluation] = await tx.select().from(evaluations)
      .where(and(eq(evaluations.id, id), eq(evaluations.teacherId, teacherId), isNotDeleted))
      .limit(1);
    if (!evaluation) return { ok: false, reason: 'not_found' as const };
    if (evaluation.status !== 'draft') return { ok: false, reason: 'not_draft' as const };

    const missing = await countMissingCriteria(tx, evaluation.rubricId, id);
    if (missing > 0) {
      return { ok: false, reason: 'incomplete' as const, missingCriteria: missing };
    }

    // G6: versión 1..N por (studentId, rubricId) entre publicadas. Cómputo
    // dentro de la transacción para evitar carreras (publish es single-user).
    const [versionRow] = await tx.select({ maxVersion: sql<number>`COALESCE(MAX(${evaluations.version}), 0)` })
      .from(evaluations)
      .where(and(
        eq(evaluations.studentId, evaluation.studentId),
        eq(evaluations.rubricId, evaluation.rubricId),
        eq(evaluations.status, 'published'),
      ))
      .limit(1);
    const nextVersion = (versionRow?.maxVersion ?? 0) + 1;

    // maxScore = criteria × 4 (fixed scale)
    const criteria = await tx.select({ id: rubricCriteria.id }).from(rubricCriteria)
      .where(eq(rubricCriteria.rubricId, evaluation.rubricId));
    const maxScore = criteria.length * 4;

    const [published] = await tx.update(evaluations)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date(), version: nextVersion, maxScore })
      .where(eq(evaluations.id, id))
      .returning();

    return { ok: true, evaluation: published };
  });
}

/**
 * Serie de evaluaciones del coach (G6): draft + published de un alumno con una
 * rúbrica, con scores enriquecidos (criterionName/levelName). Ordenada por
 * version ASC NULLS LAST (drafts al final), luego publishedAt. Scoped al
 * teacher (anti-IDOR): retorna [] si el alumno/rúbrica no pertenece al coach.
 */
export async function listEvaluationSeries(teacherId: string, studentId: string, rubricId: string): Promise<EvaluationSeriesItem[]> {
  const rows = await db.select().from(evaluations)
    .where(and(
      eq(evaluations.teacherId, teacherId),
      eq(evaluations.studentId, studentId),
      eq(evaluations.rubricId, rubricId),
      isNotDeleted,
    ))
    .orderBy(sql`${evaluations.version} ASC NULLS LAST`, asc(evaluations.publishedAt));

  const scores = await enrichEvaluationScores(rows.map((r) => r.id));
  return rows.map((e) => ({
    id: e.id,
    version: e.version,
    status: e.status,
    totalScore: e.totalScore,
    maxScore: e.maxScore,
    publishedAt: e.publishedAt,
    scores: scores.get(e.id) ?? [],
  }));
}

/**
 * Serie publicada del alumno (G6 alumno): solo published, ordenada por version
 * ASC. Scoped al studentId (anti-IDOR): retorna [] si la rúbrica no le
 * pertenece o no hay publicadas.
 */
export async function listStudentEvaluationSeries(studentId: string, rubricId: string): Promise<EvaluationSeriesItem[]> {
  const rows = await db.select().from(evaluations)
    .where(and(
      eq(evaluations.studentId, studentId),
      eq(evaluations.rubricId, rubricId),
      eq(evaluations.status, 'published'),
      isNotDeleted,
    ))
    .orderBy(asc(evaluations.version));

  const scores = await enrichEvaluationScores(rows.map((r) => r.id));
  return rows.map((e) => ({
    id: e.id,
    version: e.version,
    status: e.status,
    totalScore: e.totalScore,
    maxScore: e.maxScore,
    publishedAt: e.publishedAt,
    scores: scores.get(e.id) ?? [],
  }));
}

/**
 * Evolución del alumno (G7): evaluaciones publicadas con rubricTitle, category,
 * version, scores enriquecidos, ordenadas por publishedAt ASC. Scoped al
 * studentId (anti-IDOR). Alimenta lib/padel/evolution.ts (computeTrend).
 */
export async function listStudentEvolution(studentId: string): Promise<StudentEvolutionItem[]> {
  const rows = await db
    .select({
      id: evaluations.id,
      rubricId: evaluations.rubricId,
      rubricTitle: rubrics.title,
      category: rubrics.category,
      version: evaluations.version,
      totalScore: evaluations.totalScore,
      maxScore: evaluations.maxScore,
      publishedAt: evaluations.publishedAt,
      readAt: evaluations.readAt,
    })
    .from(evaluations)
    .innerJoin(rubrics, eq(rubrics.id, evaluations.rubricId))
    .where(and(
      eq(evaluations.studentId, studentId),
      eq(evaluations.status, 'published'),
      isNotDeleted,
    ))
    .orderBy(asc(evaluations.publishedAt));

  const scores = await enrichEvaluationScores(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, scores: scores.get(r.id) ?? [] }));
}

/**
 * Marca evaluación publicada como leída (idempotente: re-set readAt no falla).
 * Scoped al alumno (anti-IDOR). Retorna null si no existe / no es del alumno /
 * no está publicada. `firstRead` indica si readAt era null antes (primera lectura,
 * útil para triggers de notificación).
 */
export async function markEvaluationRead(studentId: string, id: string) {
  // Intento atómico: solo actualiza si aún no fue leída → detecta primera lectura
  const [updated] = await db.update(evaluations)
    .set({ readAt: new Date() })
    .where(and(
      eq(evaluations.id, id),
      eq(evaluations.studentId, studentId),
      eq(evaluations.status, 'published'),
      isNull(evaluations.readAt),
      isNotDeleted,
    ))
    .returning();
  if (updated) return { evaluation: updated, firstRead: true };

  // Ya leída (idempotente) o no existe: distingue para no romper el 404
  const [existing] = await db.select({
    id: evaluations.id,
    readAt: evaluations.readAt,
    teacherId: evaluations.teacherId,
  })
    .from(evaluations)
    .where(and(
      eq(evaluations.id, id),
      eq(evaluations.studentId, studentId),
      eq(evaluations.status, 'published'),
      isNotDeleted,
    ));
  if (!existing) return null;
  return { evaluation: existing, firstRead: false };
}