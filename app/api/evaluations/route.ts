import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import {
  createEvaluation,
  getRubricById,
  getPlayerById,
  listEvaluations,
} from "@/lib/db/queries/padel";
import { evaluationCreateSchema, evaluationListQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/evaluations
 * Lista evaluaciones del coach (teacherId = sesión). Query: ?status=draft|published.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const query = evaluationListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const evaluations = await listEvaluations(session!.user.id as string, query.status);
    return NextResponse.json({ evaluations }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/evaluations
 * Crea borrador (status=draft). Valida que la rúbrica exista y pertenezca al
 * coach (404) y que el alumno exista y sea role USER (404). Audita CREATE.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = evaluationCreateSchema.parse(body);

    const rubric = await getRubricById(session!.user.id as string, validated.rubricId);
    if (!rubric) {
      return NextResponse.json({ error: "Rúbrica no encontrada" }, { status: 404 });
    }

    const student = await getPlayerById(validated.studentId);
    if (!student) {
      return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });
    }

    const evaluation = await createEvaluation({
      studentId: validated.studentId,
      teacherId: session!.user.id as string,
      rubricId: validated.rubricId,
    });

    await auditCreate(
      "evaluation",
      evaluation.id,
      { studentId: validated.studentId, rubricId: validated.rubricId, status: evaluation.status },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ evaluation }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}