import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardSuperAdmin } from "@/lib/auth/admin-guard";
import { auditAdminDemoted } from "@/lib/audit/super-admin";
import { extractRequestContext } from "@/lib/audit/helpers";
import { demoteUser } from "@/lib/db/queries/padel";
import { getUserById } from "@/lib/db/queries/auth";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/admin/users/[id]/demote
 * Demota ADMIN → USER. Exclusivo de SUPER_ADMIN. Reglas:
 * - target inexistente            → 404
 * - target.id === session.id      → 400 (no puedes demotar tu propio usuario)
 * - target.role === 'SUPER_ADMIN' → 400 (SUPER_ADMIN no es demotable vía API, D2)
 * - target.role === 'USER'        → 400 (el usuario no es ADMIN)
 * Transaccional (demoteUser valida rol + invariante último SUPER_ADMIN dentro
 * de la transacción, D5). Audita ADMIN_DEMOTED.
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

    const target = await getUserById(id);
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (target.id === session!.user.id) {
      return NextResponse.json({ error: "No puedes demotar tu propio usuario" }, { status: 400 });
    }
    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json({ error: "SUPER_ADMIN no puede ser demotado" }, { status: 400 });
    }
    if (target.role === "USER") {
      return NextResponse.json({ error: "El usuario no es ADMIN" }, { status: 400 });
    }

    const result = await demoteUser(id);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }
      if (result.reason === "not_admin") {
        return NextResponse.json({ error: "El usuario no es ADMIN" }, { status: 400 });
      }
      return NextResponse.json({ error: "No puedes demotar al último SUPER_ADMIN activo" }, { status: 400 });
    }

    await auditAdminDemoted(session!.user.id, id, extractRequestContext(request));

    return NextResponse.json({ user: result.user }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/users/[id]/demote] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}