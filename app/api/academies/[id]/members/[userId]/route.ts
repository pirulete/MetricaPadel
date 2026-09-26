import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAcademyAdmin } from "@/lib/auth/academy-guard";
import { auditMemberRemoved, extractRequestContext } from "@/lib/audit/helpers";
import { removeMember } from "@/lib/db/queries/padel/academies";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * DELETE /api/academies/[id]/members/[userId]
 * Remueve miembro (soft, status=removed). guardAcademyAdmin: OWNER/ADMIN.
 * 400 si se intenta remover al último OWNER activo. 404 si no existe.
 * Audita DELETE.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await auth();
    const { id, userId } = padelIdParamsSchema.extend({ userId: z.string().uuid("userId debe ser un uuid válido") }).parse(await params);
    const guardError = await guardAcademyAdmin(session, id);
    if (guardError) return guardError;

    const result = await removeMember(id, userId);
    if (!result.ok) {
      if (result.reason === "last_owner") {
        return NextResponse.json({ error: "No se puede remover al último OWNER de la academia" }, { status: 400 });
      }
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
    }

    await auditMemberRemoved(
      id,
      result.membership.id,
      { userId, role: result.membership.role, status: result.membership.status },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ membership: { id: result.membership.id, status: result.membership.status } }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[academies/[id]/members/[userId]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}