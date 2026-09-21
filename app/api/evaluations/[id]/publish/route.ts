import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { publishEvaluation } from "@/lib/db/queries/padel";
import { triggerEvaluationPublished } from "@/lib/notifications/triggers";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/evaluations/[id]/publish
 * Publica evaluación validando que todos los criteria de la rúbrica tengan
 * score. 400 si no es borrador o faltan criterios. Audita UPDATE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);

    const result = await publishEvaluation(session!.user.id as string, id);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
      }
      if (result.reason === "not_draft") {
        return NextResponse.json({ error: "Solo se puede publicar un borrador" }, { status: 400 });
      }
      return NextResponse.json(
        { error: `Faltan ${result.missingCriteria} criterios por evaluar` },
        { status: 400 }
      );
    }

    await auditUpdate(
      "evaluation",
      id,
      { status: "draft" },
      { status: "published", publishedAt: result.evaluation.publishedAt },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    // G9: notificación al alumno — fire-and-forget (el publish nunca falla por el engine).
    if (result.evaluation.studentId) {
      triggerEvaluationPublished(result.evaluation.studentId, id).catch((err) => {
        console.error("[evaluations/[id]/publish] Error en trigger de notificación:", err);
      });
    }

    return NextResponse.json({ evaluation: result.evaluation }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[evaluations/[id]/publish] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}