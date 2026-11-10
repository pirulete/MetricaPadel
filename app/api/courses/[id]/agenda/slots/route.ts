import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import {
  createWeeklySlot,
  getCourseOwned,
  listWeeklySlots,
} from "@/lib/db/queries/padel";
import { padelIdParamsSchema } from "@/lib/validations/padel";
import { weeklySlotInputSchema } from "@/lib/validations/class-agenda";

export const runtime = "nodejs";

type WeeklySlot = Awaited<ReturnType<typeof listWeeklySlots>>[number];

/** WeeklySlotDto (technical-design §3.1): sin timestamps. */
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
 * GET /api/courses/[id]/agenda/slots — plantilla semanal del curso (A1).
 * Ownership `courses.ownerId` → 404. Permitido en curso archivado (lectura).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const guardError = guardAdmin(session);
    if (guardError) return guardError;

    const { id } = padelIdParamsSchema.parse(await params);
    const course = await getCourseOwned(session!.user.id as string, id);
    if (!course) {
      return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
    }

    const slots = await listWeeklySlots(course.id);
    return NextResponse.json({ items: slots.map(toSlotDto) }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[courses/[id]/agenda/slots] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/courses/[id]/agenda/slots — crea slot de la plantilla (A2).
 * 409 `AGENDA_SLOT_DUPLICATE` por UNIQUE (courseId, dayOfWeek, startTime).
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

    const validated = weeklySlotInputSchema.parse(await request.json());
    const slot = await createWeeklySlot(course.id, validated);

    await auditCreate("weekly_slot", slot.id, toSlotDto(slot), {
      userId: session!.user.id,
      ...extractRequestContext(request),
    });

    return NextResponse.json({ slot: toSlotDto(slot) }, { status: 201 });
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
    console.error("[courses/[id]/agenda/slots] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
