import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { listStudentEvaluations } from "@/lib/db/queries/padel";

export const runtime = "nodejs";

/**
 * GET /api/student/evaluations
 * Lista evaluaciones publicadas del alumno (studentId = sesión). Solo published.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const evaluations = await listStudentEvaluations(session!.user.id as string);
    return NextResponse.json({ evaluations }, { status: 200 });
  } catch (error) {
    console.error("[student/evaluations] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}