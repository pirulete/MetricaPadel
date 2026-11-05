import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  getCourseOwned,
  listBlockDetail,
  removeEnrollment,
  updateAttendance,
} from "@/lib/db/queries/padel";
import { notifyClassEvent } from "@/lib/notifications/agenda";
import { canEditTiming, todayInTimeZone } from "@/lib/padel/class-agenda";
import { blockEnrollmentUpdateSchema } from "@/lib/validations/class-agenda";
import { padelIdParamsSchema } from "@/lib/validations/padel";

export const runtime = "nodejs";

const uuidSchema = (field: string) => z.string().uuid(`${field} debe ser un uuid válido`);

type BlockDetail = NonNullable<Awaited<ReturnType<typeof listBlockDetail>>>;

function toBlockDto(
  block: BlockDetail["block"],
  enrollments: BlockDetail["enrollments"],
  todayIso: string
) {
  const active = enrollments.filter((row) => row.status !== "cancelled");
  const enrolledCount = active.length;
  return {
    id: block.id,
    courseId: block.courseId,
    weeklySlotId: block.weeklySlotId,
    blockDate: block.blockDate,
    startTime: block.startTime,
    durationMinutes: block.durationMinutes,
    status: block.status,
    maxCapacity: block.maxCapacity,
    label: block.label,
    enrolledCount,
    attendedCount: active.filter((row) => row.attended === true).length,
    capacityRemaining:
      block.maxCapacity === null ? null : Math.max(0, block.maxCapacity - enrolledCount),
    isPast: block.blockDate < todayIso,
    canEditTiming: canEditTiming(block, todayIso),
  };
}

/**
 * PUT /api/courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId] — asistencia (A11).
 * Tri-estado `attended` (null/true/false) + `notes`; true/false pasa la
 * inscripción a `completed` (query). Sin notificación.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string; studentId: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const raw = await params;
    const { id } = padelIdParamsSchema.parse(raw);
    const blockId = uuidSchema("blockId").parse(raw.blockId);
    const studentId = uuidSchema("studentId").parse(raw.studentId);

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

    const detail = await listBlockDetail(course.id, blockId);
    if (!detail) {
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }
    if (detail.block.status === "cancelled") {
      return NextResponse.json(
        { error: "El bloque está cancelado", code: "AGENDA_BLOCK_CANCELLED" },
        { status: 409 }
      );
    }
    const before = detail.enrollments.find((row) => row.studentId === studentId);
    if (!before) {
      return NextResponse.json({ error: "Inscripción no encontrada" }, { status: 404 });
    }

    const payload = blockEnrollmentUpdateSchema.parse(await request.json());

    const result = await updateAttendance(course.id, blockId, studentId, {
      attended: payload.attended,
      notes: payload.notes,
    });
    if (!result.ok) {
      if (result.reason === "block_cancelled") {
        return NextResponse.json(
          { error: "El bloque está cancelado", code: "AGENDA_BLOCK_CANCELLED" },
          { status: 409 }
        );
      }
      if (result.reason === "block_not_found") {
        return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
      }
      return NextResponse.json({ error: "Inscripción no encontrada" }, { status: 404 });
    }

    const enrollment = result.enrollment!;
    const todayIso = todayInTimeZone(process.env.APP_TIMEZONE ?? "UTC", new Date());
    const fresh = await listBlockDetail(course.id, blockId);

    await auditUpdate(
      "block_enrollment",
      before.id,
      { attended: before.attended, notes: before.notes, status: before.status },
      {
        attended: enrollment.attended,
        notes: enrollment.notes,
        status: enrollment.status,
        blockId,
        studentId,
      },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      {
        enrollment,
        block: fresh ? toBlockDto(fresh.block, fresh.enrollments, todayIso) : null,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error(
      "[courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId]] Error en PUT:",
      error
    );
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId] — quita al alumno (A12).
 * Notifica `removed` post-commit (solo a un alumno que estaba asignado).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string; studentId: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const raw = await params;
    const { id } = padelIdParamsSchema.parse(raw);
    const blockId = uuidSchema("blockId").parse(raw.blockId);
    const studentId = uuidSchema("studentId").parse(raw.studentId);

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

    const result = await removeEnrollment(course.id, blockId, studentId);
    if (!result.ok) {
      return result.reason === "block_not_found"
        ? NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 })
        : NextResponse.json({ error: "Inscripción no encontrada" }, { status: 404 });
    }

    const detail = await listBlockDetail(course.id, blockId);
    if (detail) {
      const { block } = detail;
      try {
        await notifyClassEvent({
          event: "removed",
          studentId,
          blockId,
          courseName: course.name,
          blockDate: block.blockDate,
          startTime: block.startTime,
          label: block.label,
        });
      } catch (notifyError) {
        console.error("[agenda] notify failed", notifyError);
      }
    }

    await auditDelete(
      "block_enrollment",
      `${blockId}:${studentId}`,
      { courseId: course.id, blockId, studentId },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ removed: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error(
      "[courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId]] Error en DELETE:",
      error
    );
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
