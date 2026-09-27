import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardSuperAdmin } from "@/lib/auth/admin-guard";
import { listAdmins } from "@/lib/db/queries/padel";
import { adminUserQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/admin/admins
 * Lista usuarios con role ADMIN/SUPER_ADMIN (visibilidad global de plataforma).
 * Exclusivo de SUPER_ADMIN. Query: ?search= (ILIKE por nombre/email).
 * Sin auditoría (lectura).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardSuperAdmin(session);
    if (guardError) return guardError;

    const query = adminUserQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const admins = await listAdmins(query.search);
    return NextResponse.json({ admins }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[admin/admins] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}