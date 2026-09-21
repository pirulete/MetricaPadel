import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { addStudentToCourse, getCourseById } from "@/lib/db/queries/padel";
import { courseStudentAddSchema, padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * POST /api/courses/[id]/students — agrega alumno al curso manualmente (G12).
 * 404 curso ajeno/inexistente (anti-IDOR); 400 alumno no activo/coach; 409 ya inscrito.
 * Audita CREATE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const body = await request.json();
    const validated = courseStudentAddSchema.parse(body);

    const detail = await getCourseById(session!.user.id as string, id);
    if (!detail) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const result = await addStudentToCourse(id, validated.studentId, session!.user.id as string);
    if (!result.ok) {
      switch (result.reason) {
        case "course_not_found":
          return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
        case "course_archived":
          return NextResponse.json({ error: "El curso está archivado" }, { status: 400 });
        case "student_not_found":
          return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });
        case "student_not_active":
          return NextResponse.json({ error: "El alumno no está activo" }, { status: 400 });
        case "own_course":
          return NextResponse.json({ error: "No puedes agregarte a tu propio curso" }, { status: 400 });
        case "already_enrolled":
          return NextResponse.json({ error: "El alumno ya está inscrito en este curso" }, { status: 409 });
      }
    }

    await auditCreate(
      "course_enrollment",
      result.enrollment.id,
      { courseId: id, studentId: validated.studentId },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ enrollment: result.enrollment }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]/students] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}