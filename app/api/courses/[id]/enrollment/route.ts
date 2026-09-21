import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { guardUser } from "@/lib/auth/admin-guard";
import { auditDelete, extractRequestContext } from "@/lib/audit/helpers";
import { deleteEnrollment } from "@/lib/db/queries/padel";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

/**
 * DELETE /api/courses/[id]/enrollment
 * El alumno (USER, ACTIVE) se desinscribe de un curso (G11). 404 si no está
 * inscrito (anti-IDOR). Audita DELETE. El UNIQUE liberado permite re-join.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = padelIdParamsSchema.parse(await params);

    const enrollment = await deleteEnrollment(id, session!.user.id as string);
    if (!enrollment) {
      return NextResponse.json(
        { error: "No estás inscrito a este curso" },
        { status: 404 }
      );
    }

    await auditDelete(
      "course_enrollment",
      enrollment.id,
      { courseId: enrollment.courseId, studentId: enrollment.studentId },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.errors }, { status: 400 });
    }
    console.error("[courses/[id]/enrollment] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}