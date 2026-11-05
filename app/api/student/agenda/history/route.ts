import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { getEnrollment, listStudentHistory } from "@/lib/db/queries/padel";
import { todayInTimeZone } from "@/lib/padel/class-agenda";
import { agendaHistoryQuerySchema } from "@/lib/validations/class-agenda";

export const runtime = "nodejs";

/**
 * GET /api/student/agenda/history — historial paginado del alumno (U2).
 * Cursor propio `YYYY-MM-DDTHH:mm` sobre `(block_date, start_time)` desc (B2);
 * `nextCursor` en el mismo formato. `?courseId` no inscrito ⇒ 404 (anti-IDOR).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guardError = guardUser(session);
    if (guardError) return guardError;
    if (session!.user.status !== "ACTIVE") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (session!.user.role !== "USER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const studentId = session!.user.id as string;
    const query = agendaHistoryQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    if (query.courseId && !(await getEnrollment(query.courseId, studentId))) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const todayIso = todayInTimeZone(process.env.APP_TIMEZONE ?? "UTC", new Date());
    const { items, nextCursor } = await listStudentHistory(studentId, todayIso, {
      courseId: query.courseId,
      limit: query.limit,
      cursor: query.cursor,
    });

    return NextResponse.json({ items, nextCursor }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[student/agenda/history] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
