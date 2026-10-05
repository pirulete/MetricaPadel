import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardSuperAdmin } from "@/lib/auth/admin-guard";
import { auditAcademyRestored } from "@/lib/audit/academy";
import { extractRequestContext } from "@/lib/audit/helpers";
import { getAcademyById, restoreAcademy } from "@/lib/db/queries/padel/academies";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/academies/[id]/restore
 * Restaura academia archivada → active (solo SUPER_ADMIN, v0.9).
 * 400 si ya está activa. 404 si no existe. Audita ACADEMY_RESTORED.
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
    const previous = await getAcademyById(id);
    if (!previous) {
      return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
    }

    const result = await restoreAcademy(id);
    if (!result.ok) {
      if (result.reason === "already_active") {
        return NextResponse.json({ error: "La academia ya está activa" }, { status: 400 });
      }
      return NextResponse.json({ error: "Academia no encontrada" }, { status: 404 });
    }

    await auditAcademyRestored(
      id,
      { status: previous.status, name: previous.name },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ academy: result.academy }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/restore] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}