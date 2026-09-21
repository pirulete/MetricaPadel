import { db } from "@/lib/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  evaluations,
  evaluationScores,
  rubrics,
  rubricCriteria,
  rubricLevels,
  users,
  evaluationStatusEnum,
} from "@/lib/db/schema";

export type EvaluationStatus = (typeof evaluationStatusEnum.enumValues)[number];

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
    where: and(eq(evaluations.id, id), eq(evaluations.teacherId, teacherId)),
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
 * status opcional: 'draft' | 'published'.
 */
export async function listEvaluations(teacherId: string, status?: EvaluationStatus) {
  const conditions = [eq(evaluations.teacherId, teacherId)];
  if (status) conditions.push(eq(evaluations.status, status));

  return await db
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
    .orderBy(desc(evaluations.updatedAt));
}

/**
 * Lista evaluaciones publicadas del alumno (A03). Solo published.
 */
export async function listStudentEvaluations(studentId: string) {
  return await db
    .select({
      id: evaluations.id,
      rubricTitle: rubrics.title,
      category: rubrics.category,
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
    ))
    .orderBy(desc(evaluations.publishedAt));
}

/**
 * Guarda scores de un borrador (solo status=draft): reemplaza el set completo
 * de scores y recalcula totalScore desde los niveles seleccionados.
 * Retorna la evaluación actualizada o null si no existe / no es del teacher /
 * ya está publicada.
 */
export async function saveEvaluationScores(teacherId: string, id: string, input: SaveEvaluationInput) {
  return await db.transaction(async (tx) => {
    const [evaluation] = await tx.select().from(evaluations)
      .where(and(eq(evaluations.id, id), eq(evaluations.teacherId, teacherId)))
      .limit(1);
    if (!evaluation || evaluation.status !== 'draft') return null;

    const levelIds = input.scores.map((s) => s.levelId);
    const levels = levelIds.length > 0
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
  });
}

/**
 * Publica evaluación: valida que todos los criteria de la rúbrica tengan score
 * y setea publishedAt. Retorna unión discriminada con reason en caso de error.
 */
export async function publishEvaluation(teacherId: string, id: string): Promise<PublishResult> {
  return await db.transaction(async (tx) => {
    const [evaluation] = await tx.select().from(evaluations)
      .where(and(eq(evaluations.id, id), eq(evaluations.teacherId, teacherId)))
      .limit(1);
    if (!evaluation) return { ok: false, reason: 'not_found' as const };
    if (evaluation.status !== 'draft') return { ok: false, reason: 'not_draft' as const };

    const criteria = await tx.select({ id: rubricCriteria.id }).from(rubricCriteria)
      .where(eq(rubricCriteria.rubricId, evaluation.rubricId));
    const scores = await tx.select({ criteriaId: evaluationScores.criteriaId }).from(evaluationScores)
      .where(eq(evaluationScores.evaluationId, id));

    const scoredCriteria = new Set(scores.map((s) => s.criteriaId));
    const missing = criteria.filter((c) => !scoredCriteria.has(c.id));
    if (missing.length > 0) {
      return { ok: false, reason: 'incomplete' as const, missingCriteria: missing.length };
    }

    const [published] = await tx.update(evaluations)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(evaluations.id, id))
      .returning();

    return { ok: true, evaluation: published };
  });
}

/**
 * Marca evaluación publicada como leída (idempotente: re-set readAt no falla).
 * Scoped al alumno (anti-IDOR). Retorna null si no existe / no es del alumno /
 * no está publicada.
 */
export async function markEvaluationRead(studentId: string, id: string) {
  const [row] = await db.update(evaluations)
    .set({ readAt: new Date() })
    .where(and(
      eq(evaluations.id, id),
      eq(evaluations.studentId, studentId),
      eq(evaluations.status, 'published'),
    ))
    .returning();
  return row ?? null;
}