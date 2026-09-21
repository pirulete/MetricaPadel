import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, extractRequestContext } from "@/lib/audit/helpers";
import { getCourseById, removeStudentFromCourse } from "@/lib/db/queries/padel";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * DELETE /api/courses/[id]/students/[studentId] — remueve alumno del curso (G12).
 * 404 curso ajeno/inexistente (anti-IDOR) o inscripción inexistente. Audita DELETE.
 * Las evaluaciones conservan courseId (historial intacto).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id, studentId } = padelIdParamsSchema.extend({
      studentId: z.string().uuid("studentId debe ser un uuid válido"),
    }).parse(await params);

    const detail = await getCourseById(session!.user.id as string, id);
    if (!detail) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const removed = await removeStudentFromCourse(id, studentId);
    if (!removed) {
      return NextResponse.json({ error: "El alumno no está inscrito en este curso" }, { status: 404 });
    }

    await auditDelete(
      "course_enrollment",
      removed.id,
      { courseId: id, studentId },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]/students/[studentId]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}