import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { evaluations, rubrics, users } from "@/lib/db/schema";
import { getEvaluationById, saveEvaluationScores } from "@/lib/db/queries/padel";
import { resolveAcademyForEvaluation } from "@/lib/db/queries/padel/academies";
import { evaluationSaveSchema, padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/evaluations/[id]
 * Detalle de evaluación + scores + student + rubric. Ownership: 404 si no
 * pertenece al teacher (anti-IDOR).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const result = await getEvaluationById(session!.user.id as string, id);
    if (!result) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
    }

    const [student, rubric] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, result.evaluation.studentId),
        columns: { id: true, firstName: true, lastName: true, email: true },
      }),
      db.query.rubrics.findFirst({
        where: eq(rubrics.id, result.evaluation.rubricId),
        columns: { id: true, title: true, category: true, status: true, academyId: true },
      }),
    ]);

    // Academia para branding del PDF (null si la rúbrica no es institucional
    // y el teacher no tiene membresía activa). Mismo patrón que el endpoint alumno.
    const academy = rubric
      ? await resolveAcademyForEvaluation(rubric, result.evaluation.teacherId)
      : null;

    return NextResponse.json(
      { evaluation: result.evaluation, student, rubric, scores: result.scores, academy },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations/[id]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/evaluations/[id]
 * Guarda scores + globalComment en borrador (solo status=draft). Recalcula
 * totalScore. Audita UPDATE.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const body = await request.json();
    const validated = evaluationSaveSchema.parse(body);

    const evaluation = await saveEvaluationScores(session!.user.id as string, id, validated);
    if (!evaluation) {
      return NextResponse.json({ error: "Evaluación no encontrada o ya publicada" }, { status: 404 });
    }

    await auditUpdate(
      "evaluation",
      id,
      { status: "draft" },
      { totalScore: evaluation.totalScore, scoresCount: validated.scores.length },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ evaluation }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations/[id]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/evaluations/[id]
 * G16: soft-delete (archivado) de evaluación. Solo el teacher que la creó
 * puede archivarla (anti-IDOR → 404). Los datos se conservan (historial +
 * versiones); las queries de coach/alumno la ocultan vía deletedAt.
 * Audita DELETE.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const result = await getEvaluationById(session!.user.id as string, id);
    if (!result) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
    }

    await db.update(evaluations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(evaluations.id, id));

    await auditDelete(
      "evaluation",
      id,
      {
        status: result.evaluation.status,
        totalScore: result.evaluation.totalScore,
        version: result.evaluation.version,
        studentId: result.evaluation.studentId,
        rubricId: result.evaluation.rubricId,
      },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations/[id]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}