/**
 * R5 — Cobertura dimensional de evaluaciones.
 * Server-only: importa db/pg. No usar en client components.
 */
import { db } from "@/lib/db";
import { evaluations, rubrics } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function checkDimensionalCoverage(
  studentId: string,
  currentRubricCategory: string
): Promise<{ alreadyEvaluated: boolean; coveredCategories: string[] }> {
  const rows = await db
    .selectDistinct({ category: rubrics.category })
    .from(evaluations)
    .innerJoin(rubrics, eq(rubrics.id, evaluations.rubricId))
    .where(and(
      eq(evaluations.studentId, studentId),
      eq(evaluations.status, "published"),
    ));

  const coveredCategories: string[] = rows.map((r) => r.category);
  return {
    alreadyEvaluated: coveredCategories.includes(currentRubricCategory),
    coveredCategories,
  };
}
