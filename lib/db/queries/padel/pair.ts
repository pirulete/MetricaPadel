import { db } from "@/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogs,
  evaluations,
  evaluationScores,
  rubricCriteria,
} from "@/lib/db/schema";
import { countMissingCriteria, isNotDeleted, saveEvaluationScoresTx } from "./evaluations";
import { getEnrollment } from "./enrollments";
import { auditCreate } from "@/lib/audit/helpers";
import type { AuditContext } from "@/lib/audit/helpers";

export type Evaluation = typeof evaluations.$inferSelect;

export type PairDraftsResult =
  | { ok: true; evaluationA: Evaluation; evaluationB: Evaluation }
  | { ok: false; reason: 'student_not_enrolled' };

export type PairSaveResult =
  | { ok: true; evaluationA: Evaluation; evaluationB: Evaluation }
  | { ok: false; reason: 'not_found' | 'not_owner' | 'not_draft' };

export type PairPublishResult =
  | { ok: true; evaluationA: Evaluation; evaluationB: Evaluation }
  | { ok: false; reason: 'not_found' | 'not_draft' | 'student_not_enrolled' | 'incomplete'; missingCriteria?: { evaluationA: number; evaluationB: number } };

/**
 * D7: conteo de criterios sincronizados (mismo levelId en ambos alumnos) vs
 * individuales, derivado de los scores reales al publicar. Local a pair.ts
 * (la versión pura de lib/padel/pair.ts puede reemplazarla sin cambio de
 * contrato).
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

/** G6: versión 1..N por (studentId, rubricId) entre publicadas, dentro de la tx. */
async function nextVersionFor(tx: any, studentId: string, rubricId: string): Promise<number> {
  const [row] = await tx.select({ maxVersion: sql<number>`COALESCE(MAX(${evaluations.version}), 0)` })
    .from(evaluations)
    .where(and(
      eq(evaluations.studentId, studentId),
      eq(evaluations.rubricId, rubricId),
      eq(evaluations.status, 'published'),
    ))
    .limit(1);
  return (row?.maxVersion ?? 0) + 1;
}

/** maxScore = criteria × 4 (fixed scale, patrón de publishEvaluation). */
async function maxScoreFor(tx: any, rubricId: string): Promise<number> {
  const [row] = await tx.select({ count: sql<number>`count(*)` }).from(rubricCriteria)
    .where(eq(rubricCriteria.rubricId, rubricId));
  return (row?.count ?? 0) * 4;
}

/**
 * Crea 2 borradores de evaluación en pareja (status=draft, version=null) en
 * una sola transacción. Valida que ambos alumnos estén inscritos al curso
 * (CA-07, 404 anti-IDOR). Rollback si falla el 2º insert. Audita CREATE por
 * cada borrador (patrón existente).
 */
export async function createPairDrafts(params: {
  studentAId: string;
  studentBId: string;
  teacherId: string;
  rubricId: string;
  courseId: string;
}): Promise<PairDraftsResult> {
  const enrollmentA = await getEnrollment(params.courseId, params.studentAId);
  if (!enrollmentA) return { ok: false as const, reason: 'student_not_enrolled' as const };
  const enrollmentB = await getEnrollment(params.courseId, params.studentBId);
  if (!enrollmentB) return { ok: false as const, reason: 'student_not_enrolled' as const };

  const { evaluationA, evaluationB } = await db.transaction(async (tx) => {
    const [evaluationA] = await tx.insert(evaluations).values({
      studentId: params.studentAId,
      teacherId: params.teacherId,
      rubricId: params.rubricId,
      courseId: params.courseId,
      status: 'draft',
    }).returning();
    const [evaluationB] = await tx.insert(evaluations).values({
      studentId: params.studentBId,
      teacherId: params.teacherId,
      rubricId: params.rubricId,
      courseId: params.courseId,
      status: 'draft',
    }).returning();
    return { evaluationA, evaluationB };
  });

  await auditCreate(
    "evaluation",
    evaluationA.id,
    { studentId: params.studentAId, rubricId: params.rubricId, courseId: params.courseId, status: 'draft' },
    { userId: params.teacherId }
  );
  await auditCreate(
    "evaluation",
    evaluationB.id,
    { studentId: params.studentBId, rubricId: params.rubricId, courseId: params.courseId, status: 'draft' },
    { userId: params.teacherId }
  );

  return { ok: true as const, evaluationA, evaluationB };
}

/**
 * Guarda scores de ambos borradores de pareja en una sola transacción
 * (RF-06): reutiliza saveEvaluationScoresTx por alumno; si falla el save de B,
 * rollback del save de A. Valida existencia (404), ownership (403) y draft.
 */
export async function savePairEvaluationScores(
  teacherId: string,
  input: {
    evaluationAId: string;
    evaluationBId: string;
    scoresA: Array<{ criteriaId: string; levelId: string; comment?: string }>;
    scoresB: Array<{ criteriaId: string; levelId: string; comment?: string }>;
    globalCommentA?: string;
    globalCommentB?: string;
  }
): Promise<PairSaveResult> {
  return await db.transaction(async (tx) => {
    const [evaluationA] = await tx.select().from(evaluations)
      .where(and(eq(evaluations.id, input.evaluationAId), isNotDeleted))
      .limit(1);
    if (!evaluationA) return { ok: false as const, reason: 'not_found' as const };
    if (evaluationA.teacherId !== teacherId) return { ok: false as const, reason: 'not_owner' as const };
    if (evaluationA.status !== 'draft') return { ok: false as const, reason: 'not_draft' as const };

    const [evaluationB] = await tx.select().from(evaluations)
      .where(and(eq(evaluations.id, input.evaluationBId), isNotDeleted))
      .limit(1);
    if (!evaluationB) return { ok: false as const, reason: 'not_found' as const };
    if (evaluationB.teacherId !== teacherId) return { ok: false as const, reason: 'not_owner' as const };
    if (evaluationB.status !== 'draft') return { ok: false as const, reason: 'not_draft' as const };

    const updatedA = await saveEvaluationScoresTx(tx, teacherId, input.evaluationAId, {
      scores: input.scoresA,
      globalComment: input.globalCommentA,
    });
    if (!updatedA) return { ok: false as const, reason: 'not_found' as const };

    const updatedB = await saveEvaluationScoresTx(tx, teacherId, input.evaluationBId, {
      scores: input.scoresB,
      globalComment: input.globalCommentB,
    });
    if (!updatedB) return { ok: false as const, reason: 'not_found' as const };

    return { ok: true as const, evaluationA: updatedA, evaluationB: updatedB };
  });
}

/**
 * Publica la pareja en una sola transacción (R2/R3/D5): valida existencia/
 * ownership/draft de ambos borradores, re-valida inscripción (defensa en
 * profundidad), cuenta criterios faltantes por alumno, calcula versión por
 * alumno (COALESCE(MAX,0)+1 por (studentId, rubricId)), hace 2 updates a
 * published e inserta PAIR_EVALUATION_PUBLISHED en audit_logs dentro de la
 * misma transacción. Sin notificaciones (D8) ni coverage check (D9).
 */
export async function publishPairEvaluation(
  teacherId: string,
  input: {
    evaluationAId: string;
    evaluationBId: string;
    durationSeconds?: number;
  },
  auditContext?: AuditContext
): Promise<PairPublishResult> {
  return await db.transaction(async (tx) => {
    const [evaluationA] = await tx.select().from(evaluations)
      .where(and(eq(evaluations.id, input.evaluationAId), eq(evaluations.teacherId, teacherId), isNotDeleted))
      .limit(1);
    const [evaluationB] = await tx.select().from(evaluations)
      .where(and(eq(evaluations.id, input.evaluationBId), eq(evaluations.teacherId, teacherId), isNotDeleted))
      .limit(1);
    if (!evaluationA || !evaluationB) return { ok: false as const, reason: 'not_found' as const };
    if (evaluationA.status !== 'draft' || evaluationB.status !== 'draft') {
      return { ok: false as const, reason: 'not_draft' as const };
    }
    if (!evaluationA.courseId || !evaluationB.courseId) {
      return { ok: false as const, reason: 'student_not_enrolled' as const };
    }

    // Defensa en profundidad: re-validar inscripción (CA-07) ante remoción
    // entre draft y publish.
    const [enrollmentA, enrollmentB] = await Promise.all([
      getEnrollment(evaluationA.courseId, evaluationA.studentId),
      getEnrollment(evaluationB.courseId, evaluationB.studentId),
    ]);
    if (!enrollmentA || !enrollmentB) {
      return { ok: false as const, reason: 'student_not_enrolled' as const };
    }

    const missingA = await countMissingCriteria(tx, evaluationA.rubricId, evaluationA.id);
    const missingB = await countMissingCriteria(tx, evaluationB.rubricId, evaluationB.id);
    if (missingA > 0 || missingB > 0) {
      return {
        ok: false as const,
        reason: 'incomplete' as const,
        missingCriteria: { evaluationA: missingA, evaluationB: missingB },
      };
    }

    const [versionA, versionB] = await Promise.all([
      nextVersionFor(tx, evaluationA.studentId, evaluationA.rubricId),
      nextVersionFor(tx, evaluationB.studentId, evaluationB.rubricId),
    ]);
    const [maxScoreA, maxScoreB] = await Promise.all([
      maxScoreFor(tx, evaluationA.rubricId),
      maxScoreFor(tx, evaluationB.rubricId),
    ]);

    // D7: conteo shared/individual derivado de los scores reales.
    const pairScores = await tx.select().from(evaluationScores)
      .where(inArray(evaluationScores.evaluationId, [evaluationA.id, evaluationB.id]));
    const { shared, individual } = computePairAuditCounts(
      pairScores.filter((s) => s.evaluationId === evaluationA.id),
      pairScores.filter((s) => s.evaluationId === evaluationB.id),
    );

    const now = new Date();
    const [publishedA] = await tx.update(evaluations)
      .set({ status: 'published', publishedAt: now, updatedAt: now, version: versionA, maxScore: maxScoreA })
      .where(eq(evaluations.id, evaluationA.id))
      .returning();
    const [publishedB] = await tx.update(evaluations)
      .set({ status: 'published', publishedAt: now, updatedAt: now, version: versionB, maxScore: maxScoreB })
      .where(eq(evaluations.id, evaluationB.id))
      .returning();

    // D5: auditoría dentro de la transacción (desviación deliberada del
    // patrón 1v1, exigida por CA-06/R2).
    await tx.insert(auditLogs).values({
      userId: teacherId,
      actionType: 'PAIR_EVALUATION_PUBLISHED',
      entityName: 'evaluation',
      entityId: evaluationA.id,
      newValues: {
        coach_id: teacherId,
        course_id: evaluationA.courseId,
        student_a_id: evaluationA.studentId,
        student_b_id: evaluationB.studentId,
        shared_criteria_count: shared,
        individual_criteria_count: individual,
        duration_seconds: input.durationSeconds ?? 0,
      },
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      metadata: { ...(auditContext?.metadata ?? {}) },
    });

    return { ok: true as const, evaluationA: publishedA, evaluationB: publishedB };
  });
}