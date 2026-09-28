import { db } from "@/lib/db";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  courses,
  evaluations,
  rubrics,
  users,
} from "@/lib/db/schema";
import { isNotDeleted, type EvaluationStatus } from "./evaluations";
import type { PaginatedResult, PaginationParams } from "./pagination";
import { resolveLimit } from "./pagination";
import type { RubricCategory } from "@/lib/db/schema";

export type HistoryFilters = {
  courseId?: string;
  studentId?: string;
  status?: EvaluationStatus;
};

export type HistoryItem = {
  id: string;
  studentName: string;
  rubricTitle: string;
  category: RubricCategory;
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
 * Paginada por cursor (G15) sobre publishedAt desc (los borradores con
 * publishedAt null quedan en la primera página, orden DESC los pone primero).
 */
export async function listHistory(
  teacherId: string,
  filters: HistoryFilters = {},
  params?: PaginationParams,
): Promise<PaginatedResult<HistoryItem>> {
  const limit = resolveLimit(params?.limit);
  const conditions = [eq(evaluations.teacherId, teacherId), isNotDeleted];
  if (filters.courseId) conditions.push(eq(evaluations.courseId, filters.courseId));
  if (filters.studentId) conditions.push(eq(evaluations.studentId, filters.studentId));
  if (filters.status) conditions.push(eq(evaluations.status, filters.status));
  if (params?.cursor) conditions.push(lt(evaluations.publishedAt, new Date(params.cursor)));

  const rows = await db
    .select({
      id: evaluations.id,
      studentName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      rubricTitle: rubrics.title,
      category: rubrics.category,
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
    .orderBy(desc(evaluations.publishedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last?.date ? last.date.toISOString() : null;
  return { items, nextCursor };
}