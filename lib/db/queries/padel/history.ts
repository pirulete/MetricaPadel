import { db } from "@/lib/db";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  courses,
  evaluations,
  rubrics,
  users,
} from "@/lib/db/schema";
import type { EvaluationStatus } from "./evaluations";

export type HistoryFilters = {
  courseId?: string;
  studentId?: string;
  status?: EvaluationStatus;
};

export type HistoryItem = {
  id: string;
  studentName: string;
  rubricTitle: string;
  courseName: string | null;
  date: Date | null;
  totalScore: number | null;
  maxScore: number | null;
  status: EvaluationStatus;
};

/**
 * Historial del coach (P10, D8): solo teacherId=me. Filtros opcionales
 * courseId/studentId/status. Join con courses vía evaluations.courseId (D1)
 * para el nombre de curso. Anti-IDOR: teacherId siempre de la sesión.
 */
export async function listHistory(teacherId: string, filters: HistoryFilters = {}): Promise<HistoryItem[]> {
  const conditions = [eq(evaluations.teacherId, teacherId)];
  if (filters.courseId) conditions.push(eq(evaluations.courseId, filters.courseId));
  if (filters.studentId) conditions.push(eq(evaluations.studentId, filters.studentId));
  if (filters.status) conditions.push(eq(evaluations.status, filters.status));

  return await db
    .select({
      id: evaluations.id,
      studentName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      rubricTitle: rubrics.title,
      courseName: courses.name,
      date: evaluations.publishedAt,
      totalScore: evaluations.totalScore,
      maxScore: evaluations.maxScore,
      status: evaluations.status,
    })
    .from(evaluations)
    .innerJoin(users, eq(users.id, evaluations.studentId))
    .innerJoin(rubrics, eq(rubrics.id, evaluations.rubricId))
    .leftJoin(courses, eq(courses.id, evaluations.courseId))
    .where(and(...conditions))
    .orderBy(desc(evaluations.publishedAt));
}