import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import {
  getEnrollment,
  getStudentAggregates,
  listStudentUpcoming,
} from "@/lib/db/queries/padel";
import { todayInTimeZone } from "@/lib/padel/class-agenda";
import { studentAgendaQuerySchema } from "@/lib/validations/class-agenda";

export const runtime = "nodejs";

/**
 * GET /api/student/agenda — próximas clases + agregados del alumno (U1).
 * `limit` default 5 (A5, sin `resolveLimit`). `?courseId` de un curso donde no
 * está inscrito ⇒ 404 (anti-IDOR). "Hoy" sale de `APP_TIMEZONE` (D18).
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
    const query = studentAgendaQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    if (query.courseId && !(await getEnrollment(query.courseId, studentId))) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const todayIso = todayInTimeZone(process.env.APP_TIMEZONE ?? "UTC", new Date());
    const [upcoming, aggregates] = await Promise.all([
      listStudentUpcoming(studentId, todayIso, {
        courseId: query.courseId,
        limit: query.limit,
      }),
      getStudentAggregates(studentId, query.courseId),
    ]);

    return NextResponse.json({ upcoming, aggregates, todayIso }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[student/agenda] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
