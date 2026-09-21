import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { rubrics, rubricCriteria, rubricLevels, rubricDescriptors } from "@/lib/db/schema";
import { getStudentEvaluationById } from "@/lib/db/queries/padel";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/student/evaluations/[id]
 * Detalle de evaluación publicada propia (studentId = sesión). Enrich scores
 * con criterionName/levelName/descriptor para render read-only (A03).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Student endpoints are only for USER role (not ADMIN/coach)
    if (session!.user.role !== "USER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = padelIdParamsSchema.parse(await params);

    const result = await getStudentEvaluationById(session!.user.id as string, id);
    if (!result) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
    }

    const rubricId = result.evaluation.rubricId;
    const [rubric, criteria, levels] = await Promise.all([
      db.query.rubrics.findFirst({
        where: eq(rubrics.id, rubricId),
        columns: { id: true, title: true, category: true },
      }),
      db.query.rubricCriteria.findMany({
        where: eq(rubricCriteria.rubricId, rubricId),
        orderBy: (t, { asc }) => [asc(t.sortOrder)],
      }),
      db.query.rubricLevels.findMany({
        where: eq(rubricLevels.rubricId, rubricId),
        orderBy: (t, { asc }) => [asc(t.sortOrder)],
      }),
    ]);

    const descriptors =
      criteria.length > 0
        ? await db.query.rubricDescriptors.findMany({
            where: inArray(
              rubricDescriptors.criteriaId,
              criteria.map((c) => c.id)
            ),
          })
        : [];

    const criterionById = new Map(criteria.map((c) => [c.id, c]));
    const levelById = new Map(levels.map((l) => [l.id, l]));
    const descriptorKey = (criteriaId: string, levelId: string) => `${criteriaId}:${levelId}`;
    const descriptorByKey = new Map(
      descriptors.map((d) => [descriptorKey(d.criteriaId, d.levelId), d.text])
    );

    const scores = result.scores.map((s) => ({
      criteriaId: s.criteriaId,
      criterionName: criterionById.get(s.criteriaId)?.name ?? null,
      levelId: s.levelId,
      levelName: levelById.get(s.levelId)?.name ?? null,
      score: s.score,
      descriptor: descriptorByKey.get(descriptorKey(s.criteriaId, s.levelId)) ?? null,
      comment: s.comment,
    }));

    return NextResponse.json(
      { evaluation: result.evaluation, rubric, scores },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[student/evaluations/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}