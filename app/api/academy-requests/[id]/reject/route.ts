import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardSuperAdmin } from "@/lib/auth/admin-guard";
import { auditAccessRequestRejected } from "@/lib/audit/academy";
import { extractRequestContext } from "@/lib/audit/helpers";
import { getAccessRequestById, rejectRequest } from "@/lib/db/queries/padel/academy-requests";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/academy-requests/[id]/reject
 * Rechaza solicitud pendiente (solo SUPER_ADMIN, v0.9). 400 ya revisada.
 * 404 inexistente. Audita REQUEST_REJECTED.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardSuperAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const existing = await getAccessRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "La solicitud ya fue revisada" }, { status: 400 });
    }

    const actorId = session!.user.id as string;
    const result = await rejectRequest(id, actorId);
    if (!result.ok) {
      if (result.reason === "already_reviewed") {
        return NextResponse.json({ error: "La solicitud ya fue revisada" }, { status: 400 });
      }
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    await auditAccessRequestRejected(
      result.request.id,
      {
        userId: result.request.userId,
        type: result.request.type,
        academyId: result.request.academyId,
        requestedRole: result.request.requestedRole,
        reviewedBy: actorId,
      },
      { userId: actorId, ...extractRequestContext(request) }
    );

    return NextResponse.json({ request: result.request }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academy-requests/[id]/reject] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}