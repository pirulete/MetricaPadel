import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  deleteBlock,
  getCourseOwned,
  listBlockDetail,
  setBlockStatus,
  updateBlock,
} from "@/lib/db/queries/padel";
import { notifyClassEvent } from "@/lib/notifications/agenda";
import { canEditTiming, resolveCapacityRemaining, todayInTimeZone } from "@/lib/padel/class-agenda";
import { padelIdParamsSchema } from "@/lib/validations/padel";
import { blockUpdateSchema } from "@/lib/validations/class-agenda";

export const runtime = "nodejs";

const blockIdSchema = z.string().uuid("blockId debe ser un uuid válido");
const TIMING_FIELDS = ["blockDate", "startTime", "durationMinutes"] as const;

type BlockRow = NonNullable<Awaited<ReturnType<typeof listBlockDetail>>>["block"];
type EnrollmentRow = NonNullable<Awaited<ReturnType<typeof listBlockDetail>>>["enrollments"][number];

function today(): string {
  return todayInTimeZone(process.env.APP_TIMEZONE ?? "UTC", new Date());
}

function toBlockDto(block: BlockRow, enrollments: EnrollmentRow[], todayIso: string) {
  const active = enrollments.filter((row) => row.status !== "cancelled");
  const enrolledCount = active.length;
  const attendedCount = active.filter((row) => row.attended === true).length;
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
    attendedCount,
    capacityRemaining: resolveCapacityRemaining(block.maxCapacity, enrolledCount),
    isPast: block.blockDate < todayIso,
    canEditTiming: canEditTiming(block, todayIso),
  };
}

/**
 * GET /api/courses/[id]/agenda/blocks/[blockId] — detalle del bloque + inscripciones.
 * Hidrata el sheet de asignación al reabrir un bloque (el hook cachea por bloque).
 * Lectura: sin auditoría y permitido en curso archivado (mismo criterio que A6).
 */
export async function GET(
  _request: NextRequest,
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

    const detail = await listBlockDetail(course.id, blockId);
    if (!detail) {
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }

    return NextResponse.json(
      {
        block: toBlockDto(detail.block, detail.enrollments, today()),
        enrollments: detail.enrollments,
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
    console.error("[courses/[id]/agenda/blocks/[blockId]] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * PUT /api/courses/[id]/agenda/blocks/[blockId] — edita horario/datos y/o estado (A8).
 * Cancelar (`status:'cancelled'`) transiciona las inscripciones en la tx y notifica
 * post-commit (best-effort, `Promise.allSettled`).
 */
export async function PUT(
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

    const validated = blockUpdateSchema.parse(await request.json());
    const { status, ...fields } = validated;
    const hasFields = Object.keys(fields).length > 0;
    const timingChange = TIMING_FIELDS.some((field) => fields[field] !== undefined);

    const detail = await listBlockDetail(course.id, blockId);
    if (!detail) {
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }

    const todayIso = today();
    if (hasFields && detail.block.status === "cancelled") {
      return NextResponse.json(
        { error: "El bloque está cancelado", code: "AGENDA_BLOCK_CANCELLED" },
        { status: 409 }
      );
    }
    if (timingChange && !canEditTiming(detail.block, todayIso)) {
      return NextResponse.json(
        { error: "No se puede editar el horario de un bloque pasado", code: "AGENDA_BLOCK_PAST" },
        { status: 409 }
      );
    }

    let block = detail.block;
    if (hasFields) {
      const updated = await updateBlock(course.id, blockId, fields);
      if (!updated) {
        return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
      }
      block = updated;
    }

    let notified = 0;
    if (status && status !== block.status) {
      const result = await setBlockStatus(course.id, blockId, status);
      if (!result.ok) {
        return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
      }
      block = result.block;

      if (status === "cancelled" && result.cancelledStudentIds.length > 0) {
        const settled = await Promise.allSettled(
          result.cancelledStudentIds.map((studentId) =>
            notifyClassEvent({
              event: "cancelled",
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

    await auditUpdate(
      "class_block",
      blockId,
      { status: detail.block.status, blockDate: detail.block.blockDate, startTime: detail.block.startTime },
      { status: block.status, blockDate: block.blockDate, startTime: block.startTime, notified },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      { block: toBlockDto(block, detail.enrollments, todayIso), notified },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[courses/[id]/agenda/blocks/[blockId]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/courses/[id]/agenda/blocks/[blockId] — borra bloque vacío (A9).
 * Con inscripciones ⇒ 409 `AGENDA_BLOCK_HAS_ENROLLMENTS` (usar cancelación).
 */
export async function DELETE(
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

    const result = await deleteBlock(course.id, blockId);
    if (!result.ok) {
      if (result.reason === "has_enrollments") {
        return NextResponse.json(
          {
            error: "El bloque tiene alumnos asignados; cancélalo en lugar de borrarlo",
            code: "AGENDA_BLOCK_HAS_ENROLLMENTS",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }

    await auditDelete(
      "class_block",
      blockId,
      {
        courseId: result.block.courseId,
        blockDate: result.block.blockDate,
        startTime: result.block.startTime,
        status: result.block.status,
      },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[courses/[id]/agenda/blocks/[blockId]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
