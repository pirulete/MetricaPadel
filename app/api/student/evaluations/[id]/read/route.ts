import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { markEvaluationRead } from "@/lib/db/queries/padel";
import { triggerEvaluationRead } from "@/lib/notifications/triggers";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/student/evaluations/[id]/read
 * Marca evaluación publicada como leída (idempotente). Ownership: 404 si no
 * pertenece al alumno o no está publicada. En la primera lectura dispara
 * trigger evaluation.read (G13) para notificar al coach.
 */
export async function POST(
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

    const result = await markEvaluationRead(session!.user.id as string, id);
    if (!result) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
    }

    // Primera lectura → notificar al coach (dedup por groupId = evaluationId)
    if (result.firstRead && result.evaluation.teacherId) {
      await triggerEvaluationRead(result.evaluation.teacherId, id);
    }

    return NextResponse.json(
      { evaluation: { id: result.evaluation.id, readAt: result.evaluation.readAt } },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[student/evaluations/[id]/read] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}