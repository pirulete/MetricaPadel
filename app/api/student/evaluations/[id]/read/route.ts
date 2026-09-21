import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { markEvaluationRead } from "@/lib/db/queries/padel";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/student/evaluations/[id]/read
 * Marca evaluación publicada como leída (idempotente). Ownership: 404 si no
 * pertenece al alumno o no está publicada.
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

    const { id } = padelIdParamsSchema.parse(await params);

    const evaluation = await markEvaluationRead(session!.user.id as string, id);
    if (!evaluation) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
    }

    return NextResponse.json(
      { evaluation: { id: evaluation.id, readAt: evaluation.readAt } },
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