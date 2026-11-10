import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import { assignStudents, getCourseOwned, listBlockDetail } from "@/lib/db/queries/padel";
import { notifyClassEvent } from "@/lib/notifications/agenda";
import { blockEnrollmentCreateSchema } from "@/lib/validations/class-agenda";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

const blockIdSchema = z.string().uuid("blockId debe ser un uuid válido");

/**
 * POST /api/courses/[id]/agenda/blocks/[blockId]/enrollments — asigna alumnos (A10).
 * All-or-nothing (D10): si un alumno no está inscrito al curso o no hay cupo,
 * no se escribe nada. Notifica `assigned` post-commit solo a los nuevos
 * (studentIds ya validados por `assignStudents`).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const raw = await params;
    const { id } = padelIdParamsSchema.parse(raw);
    const blockId = blockIdSchema.parse(raw.blockId);

    const course = await getCourseOwned(session!.user.id as string, id);
    if (!course) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }
    if (course.status === "archived") {
      return NextResponse.json(
        { error: "El curso está archivado", code: "AGENDA_COURSE_ARCHIVED" },
        { status: 409 }
      );
    }

    const { studentIds } = blockEnrollmentCreateSchema.parse(await request.json());

    const result = await assignStudents(course.id, blockId, studentIds);
    if (!result.ok) {
      if (result.reason === "student_not_enrolled") {
        return NextResponse.json(
          {
            error: "Hay alumnos que no están inscritos al curso",
            code: "AGENDA_STUDENT_NOT_ENROLLED",
            studentIds: result.studentIds,
          },
          { status: 400 }
        );
      }
      if (result.reason === "capacity") {
        return NextResponse.json(
          {
            error: "El bloque no tiene cupo disponible",
            code: "AGENDA_CAPACITY",
            remaining: result.remaining,
          },
          { status: 409 }
        );
      }
      if (result.reason === "block_cancelled") {
        return NextResponse.json(
          { error: "El bloque está cancelado", code: "AGENDA_BLOCK_CANCELLED" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }

    const assigned = result.assigned.map((row) => row.studentId);
    let notified = 0;

    if (assigned.length > 0) {
      const detail = await listBlockDetail(course.id, blockId);
      if (detail) {
        const { block } = detail;
        const settled = await Promise.allSettled(
          assigned.map((studentId) =>
            notifyClassEvent({
              event: "assigned",
              studentId,
              blockId,
              courseName: course.name,
              blockDate: block.blockDate,
              startTime: block.startTime,
              label: block.label,
            })
          )
        );
        notified = settled.filter((item) => item.status === "fulfilled").length;
      }
    }

    await auditCreate(
      "block_enrollment",
      blockId,
      {
        courseId: course.id,
        blockId,
        studentIds: assigned,
        alreadyAssigned: result.alreadyAssigned,
        enrolledCount: result.enrolledCount,
        notified,
      },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      {
        assigned,
        alreadyAssigned: result.alreadyAssigned,
        enrolledCount: result.enrolledCount,
        notified,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error(
      "[courses/[id]/agenda/blocks/[blockId]/enrollments] Error en POST:",
      error
    );
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
