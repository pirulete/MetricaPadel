import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { joinCourse } from "@/lib/db/queries/padel";
import { courseJoinSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/courses/join — inscribe al alumno (USER) por inviteCode (A02).
 * 201 ok; 400 coach en su propio curso; 404 código inválido/archivado; 409 ya inscrito.
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const validated = courseJoinSchema.parse(body);

    const result = await joinCourse(session!.user.id as string, validated.inviteCode);

    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
        case 'archived':
          return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
        case 'own_course':
          return NextResponse.json({ error: "No puedes unirte a tu propio curso" }, { status: 400 });
        case 'already_enrolled':
          return NextResponse.json({ error: "Ya estás inscrito a este curso" }, { status: 409 });
      }
    }

    await auditCreate(
      "course_enrollment",
      result.enrollment.id,
      { courseId: result.courseId, courseName: result.courseName },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      {
        enrollment: {
          courseId: result.courseId,
          courseName: result.courseName,
          joinedAt: result.enrollment.joinedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/join] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}