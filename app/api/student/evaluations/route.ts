import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { listStudentEvaluations } from "@/lib/db/queries/padel";
import { studentEvaluationListQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/student/evaluations
 * Lista evaluaciones publicadas del alumno (studentId = sesión). Solo published.
 * Paginación por cursor (G15): ?limit=&cursor=. Retorna { items, nextCursor }.
 */
export async function GET(request: NextRequest) {
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

    const query = studentEvaluationListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const result = await listStudentEvaluations(
      session!.user.id as string,
      { limit: query.limit, cursor: query.cursor }
    );
    return NextResponse.json({ items: result.items, nextCursor: result.nextCursor }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[student/evaluations] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}