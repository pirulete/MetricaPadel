import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { guardAdmin } from "@/lib/auth/admin-guard";
import { auditCreate, extractRequestContext } from "@/lib/audit/helpers";
import {
  getCourseOwned,
  listBlocksByRange,
  materializeWeek,
  toCourseBlockDto,
} from "@/lib/db/queries/padel";
import { mondayOf, todayInTimeZone } from "@/lib/padel/class-agenda";
import { padelIdParamsSchema } from "@/lib/validations/padel";
import { materializeWeekSchema } from "@/lib/validations/class-agenda";

export const runtime = "nodejs";

function today(): string {
  return todayInTimeZone(process.env.APP_TIMEZONE ?? "UTC", new Date());
}

/**
 * POST /api/courses/[id]/agenda/weeks — materializa la semana desde los slots
 * activos (A5). Idempotente (D7). Sin slots activos ⇒ 409 `AGENDA_NO_SLOTS`.
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

    const body = await request.json().catch(() => ({}));
    const validated = materializeWeekSchema.parse(body ?? {});
    const todayIso = today();
    const weekStart = validated.weekStart ?? mondayOf(todayIso);

    const result = await materializeWeek(course.id, weekStart);
    if (!result.ok) {
      return NextResponse.json(
        { error: "El curso no tiene slots activos", code: "AGENDA_NO_SLOTS" },
        { status: 409 }
      );
    }

    const blocks = await listBlocksByRange(course.id, result.weekStart, result.weekEnd);

    await auditCreate(
      "class_block_week",
      result.weekStart,
      {
        courseId: course.id,
        weekStart: result.weekStart,
        weekEnd: result.weekEnd,
        created: result.created,
        skipped: result.skipped,
        activeSlots: result.activeSlots,
      },
      { userId: session!.user.id, ...extractRequestContext(request) }
    );

    return NextResponse.json(
      {
        weekStart: result.weekStart,
        weekEnd: result.weekEnd,
        created: result.created,
        skipped: result.skipped,
        blocks: blocks.map((block) => toCourseBlockDto(block, todayIso)),
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
    console.error("[courses/[id]/agenda/weeks] Error en POST:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
