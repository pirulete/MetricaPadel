import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import { promoteUser } from "@/lib/db/queries/padel";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/admin/users/[id]/promote
 * Promueve un usuario USER a ADMIN (G3). 404 si inexistente o ya ADMIN
 * (anti-IDOR: recurso no aplicable = 404). Audita UPDATE.
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

    const user = await promoteUser(id);
    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado o ya es ADMIN" },
        { status: 404 }
      );
    }

    await auditUpdate(
      "user",
      id,
      { role: "USER" },
      { role: "ADMIN" },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/users/[id]/promote] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}