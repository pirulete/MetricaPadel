import { db } from "@/lib/db";
import { and, asc, between, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import {
  classBlocks,
  blockEnrollments,
  weeklySlots,
  type ClassBlock,
  type WeeklySlot,
} from "@/lib/db/schema";
import {
  buildMaterializationPlan,
  buildWeekInfo,
  canEditTiming,
  resolveCapacityRemaining,
} from "@/lib/padel/class-agenda";

export type WeeklySlotInput = {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  label?: string | null;
  isActive?: boolean;
};

export type UpdateWeeklySlotInput = Partial<WeeklySlotInput>;

/**
 * Bloque con contadores derivados. `enrolledCount`/`attendedCount` cuentan
 * inscripciones activas (status <> 'cancelled') y asistencias marcadas true.
 * `capacityRemaining` = null si maxCapacity es null (sin tope, D5).
 */
export type CourseBlockRow = {
  id: string;
  courseId: string;
  weeklySlotId: string | null;
  blockDate: string;
  startTime: string;
  durationMinutes: number;
  status: ClassBlock["status"];
  maxCapacity: number | null;
  label: string | null;
  enrolledCount: number;
  attendedCount: number;
  capacityRemaining: number | null;
};

/** CourseBlockDto del coach: bloque + flags derivados de `todayIso` (C2). */
export function toCourseBlockDto(block: CourseBlockRow, todayIso: string) {
  return {
    ...block,
    isPast: block.blockDate < todayIso,
    canEditTiming: canEditTiming(block, todayIso),
  };
}

export type MaterializeWeekResult =
  | {
      ok: true;
      weekStart: string;
      weekEnd: string;
      created: number;
      skipped: number;
      activeSlots: number;
    }
  | { ok: false; reason: "no_slots" };

/** Slots del curso (activos e inactivos), ordenados por día y hora. */
export async function listWeeklySlots(courseId: string): Promise<WeeklySlot[]> {
  return await db.select().from(weeklySlots)
    .where(eq(weeklySlots.courseId, courseId))
    .orderBy(asc(weeklySlots.dayOfWeek), asc(weeklySlots.startTime));
}

/**
 * Inserta slot de plantilla. UNIQUE (courseId, dayOfWeek, startTime) respalda
 * el 409 AGENDA_SLOT_DUPLICATE: el caller traduce el error de constraint.
 */
export async function createWeeklySlot(courseId: string, data: WeeklySlotInput) {
  const [row] = await db.insert(weeklySlots).values({
    courseId,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    durationMinutes: data.durationMinutes,
    label: data.label ?? null,
    isActive: data.isActive ?? true,
  }).returning();
  return row;
}

/** Update parcial scoped por courseId. null si el slot no existe en ese curso. */
export async function updateWeeklySlot(
  courseId: string,
  slotId: string,
  data: UpdateWeeklySlotInput,
) {
  const [row] = await db.update(weeklySlots)
    .set({
      ...(data.dayOfWeek !== undefined ? { dayOfWeek: data.dayOfWeek } : {}),
      ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
      ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(weeklySlots.id, slotId), eq(weeklySlots.courseId, courseId)))
    .returning();
  return row ?? null;
}

/**
 * Borra slot scoped por courseId. Los bloques generados sobreviven con
 * weeklySlotId = null (FK set null, EC-10); devuelve cuántos se desprendieron.
 */
export async function deleteWeeklySlot(courseId: string, slotId: string) {
  return await db.transaction(async (tx) => {
    const [slot] = await tx.select({ id: weeklySlots.id }).from(weeklySlots)
      .where(and(eq(weeklySlots.id, slotId), eq(weeklySlots.courseId, courseId)))
      .limit(1);
    if (!slot) return { deleted: false, detachedBlocks: 0 };

    const [countRow] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(classBlocks)
      .where(eq(classBlocks.weeklySlotId, slotId));
    const detachedBlocks = countRow?.n ?? 0;

    await tx.delete(weeklySlots).where(eq(weeklySlots.id, slotId));
    return { deleted: true, detachedBlocks };
  });
}

/**
 * Materializa la semana (lunes weekStart + 6 días) desde los slots activos.
 * Idempotente (D7): `onConflictDoNothing` sobre UNIQUE parcial
 * (weeklySlotId, blockDate). Sin slots activos ⇒ { ok:false } sin escribir
 * (caller responde 409 AGENDA_NO_SLOTS). Todo ocurre en una transacción.
 */
export async function materializeWeek(
  courseId: string,
  weekStart: string,
): Promise<MaterializeWeekResult> {
  const { dates, weekEnd } = buildWeekInfo(weekStart);

  return await db.transaction(async (tx) => {
    const slots = await tx.select().from(weeklySlots)
      .where(and(eq(weeklySlots.courseId, courseId), eq(weeklySlots.isActive, true)))
      .orderBy(asc(weeklySlots.dayOfWeek), asc(weeklySlots.startTime));
    if (slots.length === 0) return { ok: false, reason: "no_slots" } as const;

    const existing = await tx
      .select({ weeklySlotId: classBlocks.weeklySlotId, blockDate: classBlocks.blockDate })
      .from(classBlocks)
      .where(and(
        eq(classBlocks.courseId, courseId),
        between(classBlocks.blockDate, weekStart, weekEnd),
        isNotNull(classBlocks.weeklySlotId),
      ));
    const existingKeys = new Set(existing.map((b) => `${b.weeklySlotId}:${b.blockDate}`));

    const candidates = buildMaterializationPlan(slots, weekStart, [...existingKeys]).candidates.map(
      (candidate) => ({
        courseId,
        weeklySlotId: candidate.weeklySlotId,
        blockDate: candidate.blockDate,
        startTime: candidate.startTime,
        durationMinutes: candidate.durationMinutes,
        status: "scheduled" as const,
        label: candidate.label,
      }),
    );

    const inserted = candidates.length > 0
      ? await tx.insert(classBlocks).values(candidates).onConflictDoNothing().returning({ id: classBlocks.id })
      : [];

    const total = slots.length * dates.length;
    return {
      ok: true as const,
      weekStart,
      weekEnd,
      created: inserted.length,
      skipped: total - inserted.length,
      activeSlots: slots.length,
    };
  });
}

export type CreateBlockInput = {
  blockDate: string;
  startTime: string;
  durationMinutes: number;
  label?: string | null;
  maxCapacity?: number | null;
  weeklySlotId?: string | null;
};

export type UpdateBlockInput = Partial<Omit<CreateBlockInput, "weeklySlotId">>;

/**
 * Inserta bloque suelto o instancia datada de un slot (A7). El UNIQUE parcial
 * (weeklySlotId, blockDate) se traduce a 409 `AGENDA_SLOT_DUPLICATE` en el handler.
 */
export async function createBlock(courseId: string, data: CreateBlockInput) {
  const [row] = await db.insert(classBlocks).values({
    courseId,
    weeklySlotId: data.weeklySlotId ?? null,
    blockDate: data.blockDate,
    startTime: data.startTime,
    durationMinutes: data.durationMinutes,
    label: data.label ?? null,
    maxCapacity: data.maxCapacity ?? null,
  }).returning();
  return row;
}

/** Update de campos de un bloque scoped por courseId. null si no existe en ese curso. */
export async function updateBlock(
  courseId: string,
  blockId: string,
  data: UpdateBlockInput,
) {
  const [row] = await db.update(classBlocks)
    .set({
      ...(data.blockDate !== undefined ? { blockDate: data.blockDate } : {}),
      ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
      ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.maxCapacity !== undefined ? { maxCapacity: data.maxCapacity } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(classBlocks.id, blockId), eq(classBlocks.courseId, courseId)))
    .returning();
  return row ?? null;
}

export type DeleteBlockResult =
  | { ok: true; block: ClassBlock }
  | { ok: false; reason: "block_not_found" | "has_enrollments" };

/**
 * Borra bloque vacío (A9). Con cualquier inscripción (incluidas canceladas) no
 * borra: el coach debe cancelar para preservar el historial.
 */
export async function deleteBlock(
  courseId: string,
  blockId: string,
): Promise<DeleteBlockResult> {
  return await db.transaction(async (tx) => {
    const [block] = await tx.select().from(classBlocks)
      .where(and(eq(classBlocks.id, blockId), eq(classBlocks.courseId, courseId)))
      .limit(1);
    if (!block) return { ok: false, reason: "block_not_found" } as const;

    const [countRow] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(blockEnrollments)
      .where(eq(blockEnrollments.blockId, blockId));
    if ((countRow?.n ?? 0) > 0) return { ok: false, reason: "has_enrollments" } as const;

    await tx.delete(classBlocks).where(eq(classBlocks.id, blockId));
    return { ok: true as const, block };
  });
}

/**
 * Bloques de un rango de fechas (rango cerrado, ≤8 semanas se valida en el
 * handler) con contadores para la agenda semanal del coach. Sin enrollments:
 * el detalle por bloque lo resuelve listBlockDetail.
 */
export async function listBlocksByRange(
  courseId: string,
  from: string,
  to: string,
): Promise<CourseBlockRow[]> {
  const rows = await db
    .select({
      id: classBlocks.id,
      courseId: classBlocks.courseId,
      weeklySlotId: classBlocks.weeklySlotId,
      blockDate: classBlocks.blockDate,
      startTime: classBlocks.startTime,
      durationMinutes: classBlocks.durationMinutes,
      status: classBlocks.status,
      maxCapacity: classBlocks.maxCapacity,
      label: classBlocks.label,
      enrolledCount: sql<number>`(count(${blockEnrollments.id}) filter (where ${blockEnrollments.status} <> 'cancelled'))::int`,
      attendedCount: sql<number>`(count(${blockEnrollments.id}) filter (where ${blockEnrollments.attended} = true))::int`,
    })
    .from(classBlocks)
    .leftJoin(blockEnrollments, eq(blockEnrollments.blockId, classBlocks.id))
    .where(and(
      eq(classBlocks.courseId, courseId),
      gte(classBlocks.blockDate, from),
      lte(classBlocks.blockDate, to),
    ))
    .groupBy(classBlocks.id)
    .orderBy(asc(classBlocks.blockDate), asc(classBlocks.startTime));

  return rows.map((row) => ({
    ...row,
    capacityRemaining: resolveCapacityRemaining(row.maxCapacity, row.enrolledCount),
  }));
}
