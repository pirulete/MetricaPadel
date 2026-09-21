/**
 * R5 — Cobertura dimensional de evaluaciones.
 * Server-only: importa db/pg. No usar en client components.
 */
import { db } from "@/lib/db";
import { evaluations, rubrics } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";

/**
 * Check if the student already has a published evaluation for the given category.
 * Excludes the current evaluation (by ID) since it was just published.
 */
export async function checkDimensionalCoverage(
  studentId: string,
  currentRubricCategory: string,
  excludeEvaluationId?: string
): Promise<{ alreadyEvaluated: boolean; coveredCategories: string[] }> {
  const conditions = [
    eq(evaluations.studentId, studentId),
    eq(evaluations.status, "published"),
  ];
  if (excludeEvaluationId) {
    conditions.push(ne(evaluations.id, excludeEvaluationId));
  }

  const rows = await db
    .selectDistinct({ category: rubrics.category })
    .from(evaluations)
    .innerJoin(rubrics, eq(rubrics.id, evaluations.rubricId))
    .where(and(...conditions));

  const coveredCategories: string[] = rows.map((r) => r.category);
  return {
    alreadyEvaluated: coveredCategories.includes(currentRubricCategory),
    coveredCategories,
  };
}
