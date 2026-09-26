import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAcademyCoach } from "@/lib/auth/academy-guard";
import { listAcademyMembers } from "@/lib/db/queries/padel/academies";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/academies/[id]/members
 * Lista miembros con info de usuario (guardAcademyCoach: OWNER/ADMIN/COACH).
 * 404 anti-IDOR si no es miembro activo.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = padelIdParamsSchema.parse(await params);
    const guardError = await guardAcademyCoach(session, id);
    if (guardError) return guardError;

    const members = await listAcademyMembers(id);
    return NextResponse.json({ members }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/members] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}