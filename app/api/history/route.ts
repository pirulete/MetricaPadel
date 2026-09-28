import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { listHistory } from "@/lib/db/queries/padel";
import { historyQuerySchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * GET /api/history — historial del coach (P10, D8). Filtros opcionales
 * ?courseId=&studentId=&status=draft|published + paginación ?limit=&cursor=
 * (G15). Anti-IDOR: teacherId = sesión. Retorna { items, nextCursor }.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const query = historyQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const result = await listHistory(
      session!.user.id as string,
      { courseId: query.courseId, studentId: query.studentId, status: query.status },
      { limit: query.limit, cursor: query.cursor }
    );
    return NextResponse.json({ items: result.items, nextCursor: result.nextCursor }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[history] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}