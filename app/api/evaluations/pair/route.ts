import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  createPairDrafts,
  getPlayerById,
  getRubricById,
  savePairEvaluationScores,
} from "@/lib/db/queries/padel";
import {
  pairEvaluationCreateSchema,
  pairEvaluationSaveSchema,
} from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/evaluations/pair
 * Crea 2 borradores de evaluación en pareja (status=draft, version=null) en
 * una sola transacción. Anti-IDOR: rúbrica del coach (404), alumnos role USER
 * (404), ambos inscritos al curso (404, CA-07). Audita CREATE por borrador
 * (dentro de createPairDrafts).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = pairEvaluationCreateSchema.parse(body);

    const rubric = await getRubricById(session!.user.id as string, validated.rubricId);
    if (!rubric) {
      return NextResponse.json({ error: "Rúbrica no encontrada" }, { status: 404 });
    }

    const [studentA, studentB] = await Promise.all([
      getPlayerById(validated.studentAId),
      getPlayerById(validated.studentBId),
    ]);
    if (!studentA || !studentB) {
      return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });
    }

    const result = await createPairDrafts({
      studentAId: validated.studentAId,
      studentBId: validated.studentBId,
      teacherId: session!.user.id as string,
      rubricId: validated.rubricId,
      courseId: validated.courseId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Alumno no inscrito al curso" }, { status: 404 });
    }

    return NextResponse.json(
      { evaluationA: result.evaluationA, evaluationB: result.evaluationB },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations/pair] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/evaluations/pair
 * Guarda scores de ambos borradores en una sola transacción (RF-06): si falla
 * el save de B, rollback del save de A. Anti-IDOR: borradores del teacher
 * (404), solo status=draft (400). Audita UPDATE por borrador.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = pairEvaluationSaveSchema.parse(body);

    const result = await savePairEvaluationScores(session!.user.id as string, validated);
    if (!result.ok) {
      if (result.reason === "not_found" || result.reason === "not_owner") {
        return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ error: "Solo se puede guardar un borrador" }, { status: 400 });
    }

    await auditUpdate(
      "evaluation",
      validated.evaluationAId,
      { status: "draft" },
      { totalScore: result.evaluationA.totalScore, scoresCount: validated.scoresA.length, pair: true },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );
    await auditUpdate(
      "evaluation",
      validated.evaluationBId,
      { status: "draft" },
      { totalScore: result.evaluationB.totalScore, scoresCount: validated.scoresB.length, pair: true },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      { evaluationA: result.evaluationA, evaluationB: result.evaluationB },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations/pair] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}