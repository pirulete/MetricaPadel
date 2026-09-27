import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { evaluations, evaluationScores, rubrics, rubricCriteria, users } from "@/lib/db/schema";
import { resolveAcademyForEvaluation } from "@/lib/db/queries/padel/academies";
import { generateEvaluationPdf, type PdfScoreRow } from "@/lib/padel/pdf";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/evaluations/[id]/pdf
 * Genera PDF con branding de academia (RF-04). guardUser + ACTIVE; teacher o
 * student de la evaluación (404 si ajeno). 400 si la evaluación es draft.
 * Sin auditoría (lectura). Content-Disposition attachment.
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

    const { id } = padelIdParamsSchema.parse(await params);

    const evaluation = await db.query.evaluations.findFirst({
      where: eq(evaluations.id, id),
    });
    if (!evaluation) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
    }
    // Solo teacher o student de la evaluación (anti-IDOR).
    if (evaluation.teacherId !== session!.user.id && evaluation.studentId !== session!.user.id) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
    }
    if (evaluation.status !== "published") {
      return NextResponse.json({ error: "La evaluación debe estar publicada para exportar PDF" }, { status: 400 });
    }

    const [rubric, scoreRows, student, teacher] = await Promise.all([
      db.query.rubrics.findFirst({
        where: eq(rubrics.id, evaluation.rubricId),
        columns: { id: true, title: true, category: true, academyId: true },
      }),
      loadScoreRows(evaluation.id, evaluation.rubricId),
      db.query.users.findFirst({
        where: eq(users.id, evaluation.studentId),
        columns: { id: true, firstName: true, lastName: true, email: true },
      }),
      db.query.users.findFirst({
        where: eq(users.id, evaluation.teacherId),
        columns: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);

    if (!rubric) {
      return NextResponse.json({ error: "Rúbrica no encontrada" }, { status: 404 });
    }

    const academy = await resolveAcademyForEvaluation(rubric, evaluation.teacherId);

    const pdfBuffer = await generateEvaluationPdf(
      {
        id: evaluation.id,
        status: evaluation.status,
        totalScore: evaluation.totalScore,
        maxScore: evaluation.maxScore,
        globalComment: evaluation.globalComment,
        publishedAt: evaluation.publishedAt,
      },
      { id: rubric.id, title: rubric.title, category: rubric.category },
      scoreRows,
      academy
        ? { id: academy.id, name: academy.name, logoUrl: academy.logoUrl, primaryColor: academy.primaryColor }
        : undefined,
      student
        ? { id: student.id, firstName: student.firstName, lastName: student.lastName, email: student.email }
        : undefined,
      teacher
        ? { id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email }
        : undefined
    );

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="evaluacion-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations/[id]/pdf] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * Carga scores enriquecidos con criterionName para el PDF. Cada fila lleva la
 * categoría de la rúbrica (una de las 6 dimensiones del radar) y maxScore=4
 * (escala fija Excelente 4 … En desarrollo 1).
 */
async function loadScoreRows(evaluationId: string, rubricId: string): Promise<PdfScoreRow[]> {
  const [scores, criteria, rubric] = await Promise.all([
    db.select().from(evaluationScores).where(eq(evaluationScores.evaluationId, evaluationId)),
    db.select({ id: rubricCriteria.id, name: rubricCriteria.name }).from(rubricCriteria),
    db.query.rubrics.findFirst({
      where: eq(rubrics.id, rubricId),
      columns: { category: true },
    }),
  ]);
  const nameById = new Map(criteria.map((c) => [c.id, c.name]));
  const category = rubric?.category ?? "reglas";
  return scores.map((s) => ({
    criteriaName: nameById.get(s.criteriaId) ?? "Criterio",
    category,
    score: s.score,
    maxScore: 4,
    comment: s.comment ?? undefined,
  }));
}