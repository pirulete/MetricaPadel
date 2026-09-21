import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { getTeacherDashboard } from "@/lib/db/queries/padel";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/teacher — métricas P01 del coach (guardAdmin).
 */
export async function GET() {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const dashboard = await getTeacherDashboard(session!.user.id as string);
    return NextResponse.json(dashboard, { status: 200 });
  } catch (error) {
    console.error("[dashboard/teacher] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}