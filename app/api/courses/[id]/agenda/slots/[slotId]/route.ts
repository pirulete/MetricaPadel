import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditDelete, auditUpdate, extractRequestContext } from "@/lib/audit/helpers";
import {
  deleteWeeklySlot,
  getCourseOwned,
  listWeeklySlots,
  updateWeeklySlot,
} from "@/lib/db/queries/padel";
import { padelIdParamsSchema } from "@/lib/validations/padel";
import { weeklySlotUpdateSchema } from "@/lib/validations/class-agenda";

export const runtime = "nodejs";

type WeeklySlot = Awaited<ReturnType<typeof listWeeklySlots>>[number];

const slotIdSchema = z.string().uuid("slotId debe ser un uuid válido");

function toSlotDto(slot: WeeklySlot) {
  return {
    id: slot.id,
    courseId: slot.courseId,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    durationMinutes: slot.durationMinutes,
    label: slot.label,
    isActive: slot.isActive,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) =>
    (value as { code?: string } | null | undefined)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown })?.cause) === "23505";
}

/**
 * PUT /api/courses/[id]/agenda/slots/[slotId] — update parcial (A3).
 * 404 si el slot no pertenece al curso; 409 `AGENDA_SLOT_DUPLICATE`.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const raw = await params;
    const { id } = padelIdParamsSchema.parse(raw);
    const slotId = slotIdSchema.parse(raw.slotId);

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

    const validated = weeklySlotUpdateSchema.parse(await request.json());
    const existing = (await listWeeklySlots(course.id)).find((slot) => slot.id === slotId);
    if (!existing) {
      return NextResponse.json({ error: "Slot no encontrado" }, { status: 404 });
    }

    const slot = await updateWeeklySlot(course.id, slotId, validated);
    if (!slot) {
      return NextResponse.json({ error: "Slot no encontrado" }, { status: 404 });
    }

    await auditUpdate("weekly_slot", slotId, toSlotDto(existing), toSlotDto(slot), {
      userId: session!.user.id,
      ...extractRequestContext(request),
    });

    return NextResponse.json({ slot: toSlotDto(slot) }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "Ya existe un slot con ese día y hora", code: "AGENDA_SLOT_DUPLICATE" },
        { status: 409 }
      );
    }
    console.error("[courses/[id]/agenda/slots/[slotId]] Error en PUT:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/courses/[id]/agenda/slots/[slotId] — borra slot (A4).
 * Los bloques generados sobreviven con `weeklySlotId = null` (EC-10).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const raw = await params;
    const { id } = padelIdParamsSchema.parse(raw);
    const slotId = slotIdSchema.parse(raw.slotId);

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

    const existing = (await listWeeklySlots(course.id)).find((slot) => slot.id === slotId);
    const result = await deleteWeeklySlot(course.id, slotId);
    if (!result.deleted) {
      return NextResponse.json({ error: "Slot no encontrado" }, { status: 404 });
    }

    await auditDelete(
      "weekly_slot",
      slotId,
      { ...(existing ? toSlotDto(existing) : { id: slotId }), detachedBlocks: result.detachedBlocks },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      { deleted: true, detachedBlocks: result.detachedBlocks },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[courses/[id]/agenda/slots/[slotId]] Error en DELETE:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
