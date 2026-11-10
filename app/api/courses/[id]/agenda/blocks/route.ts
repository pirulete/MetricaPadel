import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import {
  createBlock,
  getCourseOwned,
  listBlocksByRange,
  listWeeklySlots,
  toCourseBlockDto,
} from "@/lib/db/queries/padel";
import { addDays, canEditTiming, daysBetween, mondayOf, todayInTimeZone } from "@/lib/padel/class-agenda";
import { padelIdParamsSchema } from "@/lib/validations/padel";
import {
  MAX_RANGE_DAYS,
  blockCreateSchema,
  blockRangeQuerySchema,
} from "@/lib/validations/class-agenda";

export const runtime = "nodejs";

function today(): string {
  return todayInTimeZone(process.env.APP_TIMEZONE ?? "UTC", new Date());
}

function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) =>
    (value as { code?: string } | null | undefined)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown })?.cause) === "23505";
}

/**
 * GET /api/courses/[id]/agenda/blocks?from=&to= — bloques del rango (A6).
 * Default = semana actual; rango máximo 8 semanas. Permitido en curso archivado.
 */
export async function GET(
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

    const query = Object.fromEntries(request.nextUrl.searchParams);
    const validated = blockRangeQuerySchema.parse(query);

    const todayIso = today();
    const from = validated.from ?? mondayOf(todayIso);
    const to = validated.to ?? addDays(from, 6);
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          details: [{ message: `el rango máximo es de ${MAX_RANGE_DAYS} días (8 semanas)` }],
        },
        { status: 400 }
      );
    }

    const blocks = await listBlocksByRange(course.id, from, to);
    return NextResponse.json(
      { blocks: blocks.map((block) => toCourseBlockDto(block, todayIso)) },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      );
    }
    console.error("[courses/[id]/agenda/blocks] Error en GET:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/courses/[id]/agenda/blocks — crea bloque suelto o instancia de slot (A7).
 * 404 si `weeklySlotId` no pertenece al curso; 409 si slot+fecha ya existe (D7).
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

    const validated = blockCreateSchema.parse(await request.json());
    if (validated.weeklySlotId) {
      const slots = await listWeeklySlots(course.id);
      if (!slots.some((slot) => slot.id === validated.weeklySlotId)) {
        return NextResponse.json({ error: "Slot no encontrado" }, { status: 404 });
      }
    }

    const block = await createBlock(course.id, validated);
    const todayIso = today();

    await auditCreate("class_block", block.id, {
      courseId: block.courseId,
      blockDate: block.blockDate,
      startTime: block.startTime,
      durationMinutes: block.durationMinutes,
      label: block.label,
      maxCapacity: block.maxCapacity,
      weeklySlotId: block.weeklySlotId,
    }, { userId: session!.user.id, ...extractRequestContext(request) });

    return NextResponse.json(
      {
        block: {
          ...block,
          enrolledCount: 0,
          attendedCount: 0,
          capacityRemaining: block.maxCapacity,
          isPast: block.blockDate < todayIso,
          canEditTiming: canEditTiming(block, todayIso),
        },
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
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "Ya existe un bloque para ese slot y fecha", code: "AGENDA_BLOCK_DUPLICATE" },
        { status: 409 }
      );
    }
    console.error("[courses/[id]/agenda/blocks] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
