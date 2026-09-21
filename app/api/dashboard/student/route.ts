import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { getStudentDashboard } from "@/lib/db/queries/padel";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/student — A01 del alumno (guardUser): nivel, cursos, notificaciones.
 */
export async function GET() {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Student endpoints are only for USER role (not ADMIN/coach)
    if (session!.user.role !== "USER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const dashboard = await getStudentDashboard(session!.user.id as string);
    return NextResponse.json(dashboard, { status: 200 });
  } catch (error) {
    console.error("[dashboard/student] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}