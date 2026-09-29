import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { extractRequestContext } from "@/lib/audit/helpers";
import { publishPairEvaluation } from "@/lib/db/queries/padel";
import { pairEvaluationPublishSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/evaluations/pair/publish
 * Publica la pareja en una sola transacción (R2/R3/D5): valida completitud de
 * ambos borradores, cómputo de versión por alumno, 2 updates a published e
 * insert de PAIR_EVALUATION_PUBLISHED en audit_logs dentro de la misma tx.
 * Sin notificaciones (D8) ni coverage check (D9).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const body = await request.json();
    const validated = pairEvaluationPublishSchema.parse(body);

    const result = await publishPairEvaluation(
      session!.user.id as string,
      validated,
      { userId: session!.user.id, ...extractRequestContext(request) }
    );
    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
        case "not_draft":
          return NextResponse.json({ error: "Solo se puede publicar un borrador" }, { status: 400 });
        case "student_not_enrolled":
          return NextResponse.json({ error: "Alumno no inscrito al curso" }, { status: 404 });
        case "incomplete":
          return NextResponse.json(
            { error: "Faltan criterios por evaluar", missingCriteria: result.missingCriteria },
            { status: 400 }
          );
      }
    }

    return NextResponse.json(
      { evaluationA: result.evaluationA, evaluationB: result.evaluationB },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations/pair/publish] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}