import { db } from "@/lib/db";
import { and, asc, desc, eq, gte, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import {
  classBlocks,
  blockEnrollments,
  courseEnrollments,
  courses,
  users,
  type BlockEnrollment,
  type ClassBlock,
} from "@/lib/db/schema";
import { resolveLimit, type PaginatedResult } from "./pagination";
import { validateAssignment } from "@/lib/padel/class-agenda";

/** Inscripción a bloque con datos del alumno (BlockEnrollmentDto). */
export type BlockEnrollmentDetail = {
  id: string;
  blockId: string;
  studentId: string;
  firstName: string | null;
  lastName: string | null;
  status: BlockEnrollment["status"];
  attended: boolean | null;
  notes: string | null;
};

/** Clase vista por el alumno (StudentClassDto). */
export type StudentClassRow = {
  blockId: string;
  courseId: string;
  courseName: string;
  blockDate: string;
  startTime: string;
  durationMinutes: number;
  label: string | null;
  blockStatus: ClassBlock["status"];
  enrollmentStatus: BlockEnrollment["status"];
  attended: boolean | null;
};

export type AttendanceAggregatesRow = {
  scheduled: number;
  completed: number;
  cancelled: number;
  attended: number;
  missed: number;
  total: number;
  attendanceRate: number | null;
};

export type AssignStudentsResult =
  | {
      ok: true;
      assigned: BlockEnrollment[];
      alreadyAssigned: string[];
      enrolledCount: number;
    }
  | { ok: false; reason: "block_not_found" | "block_cancelled" }
  | { ok: false; reason: "student_not_enrolled"; studentIds: string[] }
  | { ok: false; reason: "capacity"; remaining: number };

export type BlockMutationResult =
  | { ok: true; block: ClassBlock; enrollment?: BlockEnrollment }
  | { ok: false; reason: "block_not_found" | "block_cancelled" | "enrollment_not_found" };

export type SetBlockStatusResult =
  | { ok: true; block: ClassBlock; cancelledStudentIds: string[] }
  | { ok: false; reason: "block_not_found" };

/** Bloque + inscripciones con alumno. null si el bloque no es de ese curso. */
export async function listBlockDetail(courseId: string, blockId: string) {
  const [block] = await db.select().from(classBlocks)
    .where(and(eq(classBlocks.id, blockId), eq(classBlocks.courseId, courseId)))
    .limit(1);
  if (!block) return null;

  const enrollments = await db
    .select({
      id: blockEnrollments.id,
      blockId: blockEnrollments.blockId,
      studentId: blockEnrollments.studentId,
      firstName: users.firstName,
      lastName: users.lastName,
      status: blockEnrollments.status,
      attended: blockEnrollments.attended,
      notes: blockEnrollments.notes,
    })
    .from(blockEnrollments)
    .innerJoin(users, eq(users.id, blockEnrollments.studentId))
    .where(eq(blockEnrollments.blockId, blockId))
    .orderBy(asc(users.lastName), asc(users.firstName));

  return { block, enrollments };
}

/**
 * Asigna alumnos a un bloque en UNA transacción (all-or-nothing, D10):
 * valida bloque del curso, bloque no cancelado, todos los alumnos inscritos
 * al curso y cupo. Nada se escribe si alguna validación falla. Los ya
 * asignados se devuelven en `alreadyAssigned` (idempotente).
 */
export async function assignStudents(
  courseId: string,
  blockId: string,
  studentIds: string[],
): Promise<AssignStudentsResult> {
  const uniqueIds = [...new Set(studentIds)];

  return await db.transaction(async (tx) => {
    const [block] = await tx.select().from(classBlocks)
      .where(and(eq(classBlocks.id, blockId), eq(classBlocks.courseId, courseId)))
      .limit(1);
    if (!block) return { ok: false, reason: "block_not_found" } as const;
    if (block.status === "cancelled") return { ok: false, reason: "block_cancelled" } as const;

    const enrolled = await tx
      .select({ studentId: courseEnrollments.studentId })
      .from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.courseId, courseId),
        inArray(courseEnrollments.studentId, uniqueIds),
      ));
    const enrolledSet = new Set(enrolled.map((e) => e.studentId));
    const outsideCourse = uniqueIds.filter((id) => !enrolledSet.has(id));
    if (outsideCourse.length > 0) {
      return { ok: false, reason: "student_not_enrolled", studentIds: outsideCourse } as const;
    }

    const existing = await tx
      .select({ studentId: blockEnrollments.studentId })
      .from(blockEnrollments)
      .where(and(
        eq(blockEnrollments.blockId, blockId),
        inArray(blockEnrollments.studentId, uniqueIds),
      ));
    const existingSet = new Set(existing.map((e) => e.studentId));
    const toAssign = uniqueIds.filter((id) => !existingSet.has(id));

    const [countRow] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(blockEnrollments)
      .where(and(
        eq(blockEnrollments.blockId, blockId),
        ne(blockEnrollments.status, "cancelled"),
      ));
    const currentCount = countRow?.n ?? 0;

    const capacity = validateAssignment({
      maxCapacity: block.maxCapacity,
      currentCount,
      requested: toAssign.length,
    });
    if (!capacity.ok) {
      return { ok: false, reason: "capacity", remaining: capacity.remaining } as const;
    }

    const inserted = toAssign.length > 0
      ? await tx.insert(blockEnrollments)
        .values(toAssign.map((studentId) => ({ blockId, studentId })))
        .returning()
      : [];

    return {
      ok: true as const,
      assigned: inserted,
      alreadyAssigned: uniqueIds.filter((id) => existingSet.has(id)),
      enrolledCount: currentCount + inserted.length,
    };
  });
}

/**
 * Marca asistencia (tri-estado) + notas. Si attended es true/false la
 * inscripción pasa a completed; null = sin marcar (status intacto).
 */
export async function updateAttendance(
  courseId: string,
  blockId: string,
  studentId: string,
  data: { attended?: boolean | null; notes?: string | null },
): Promise<BlockMutationResult> {
  return await db.transaction(async (tx) => {
    const [block] = await tx.select().from(classBlocks)
      .where(and(eq(classBlocks.id, blockId), eq(classBlocks.courseId, courseId)))
      .limit(1);
    if (!block) return { ok: false, reason: "block_not_found" } as const;
    if (block.status === "cancelled") return { ok: false, reason: "block_cancelled" } as const;

    const [existing] = await tx.select({ id: blockEnrollments.id }).from(blockEnrollments)
      .where(and(eq(blockEnrollments.blockId, blockId), eq(blockEnrollments.studentId, studentId)))
      .limit(1);
    if (!existing) return { ok: false, reason: "enrollment_not_found" } as const;

    const [enrollment] = await tx.update(blockEnrollments)
      .set({
        ...(data.attended !== undefined ? { attended: data.attended } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.attended !== undefined && data.attended !== null ? { status: "completed" as const } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(blockEnrollments.blockId, blockId), eq(blockEnrollments.studentId, studentId)))
      .returning();

    return { ok: true as const, block, enrollment };
  });
}

/** Quita alumno del bloque (hard delete). null si el bloque o la fila no existen. */
export async function removeEnrollment(courseId: string, blockId: string, studentId: string) {
  return await db.transaction(async (tx) => {
    const [block] = await tx.select({ id: classBlocks.id }).from(classBlocks)
      .where(and(eq(classBlocks.id, blockId), eq(classBlocks.courseId, courseId)))
      .limit(1);
    if (!block) return { ok: false, reason: "block_not_found" } as const;

    const [removed] = await tx.delete(blockEnrollments)
      .where(and(eq(blockEnrollments.blockId, blockId), eq(blockEnrollments.studentId, studentId)))
      .returning();
    if (!removed) return { ok: false, reason: "enrollment_not_found" } as const;
    return { ok: true as const, removed: true };
  });
}

/**
 * Cambia status del bloque. Cancelar arrastra las inscripciones a cancelled y
 * devuelve los studentIds afectados para notificar post-commit (EC-05).
 */
export async function setBlockStatus(
  courseId: string,
  blockId: string,
  status: ClassBlock["status"],
): Promise<SetBlockStatusResult> {
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: classBlocks.id }).from(classBlocks)
      .where(and(eq(classBlocks.id, blockId), eq(classBlocks.courseId, courseId)))
      .limit(1);
    if (!existing) return { ok: false, reason: "block_not_found" } as const;

    const [block] = await tx.update(classBlocks)
      .set({ status, updatedAt: new Date() })
      .where(eq(classBlocks.id, blockId))
      .returning();

    if (status !== "cancelled") {
      return { ok: true as const, block, cancelledStudentIds: [] };
    }

    const affected = await tx.update(blockEnrollments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(blockEnrollments.blockId, blockId), ne(blockEnrollments.status, "cancelled")))
      .returning({ studentId: blockEnrollments.studentId });

    return { ok: true as const, block, cancelledStudentIds: affected.map((r) => r.studentId) };
  });
}

const studentClassColumns = {
  blockId: classBlocks.id,
  courseId: classBlocks.courseId,
  courseName: courses.name,
  blockDate: classBlocks.blockDate,
  startTime: classBlocks.startTime,
  durationMinutes: classBlocks.durationMinutes,
  label: classBlocks.label,
  blockStatus: classBlocks.status,
  enrollmentStatus: blockEnrollments.status,
  attended: blockEnrollments.attended,
};

/** Join base alumno ⇒ bloque ⇒ curso, scoped por inscripción al curso (anti-IDOR). */
function studentAgendaQuery(studentId: string) {
  return db
    .select(studentClassColumns)
    .from(blockEnrollments)
    .innerJoin(classBlocks, eq(classBlocks.id, blockEnrollments.blockId))
    .innerJoin(courses, eq(courses.id, classBlocks.courseId))
    .innerJoin(
      courseEnrollments,
      and(
        eq(courseEnrollments.courseId, classBlocks.courseId),
        eq(courseEnrollments.studentId, studentId),
      ),
    );
}

/**
 * Próximas clases del alumno: bloques scheduled con block_date >= todayIso en
 * cursos donde sigue inscrito. Orden ascendente. `limit` default 5 (A5).
 */
export async function listStudentUpcoming(
  studentId: string,
  todayIso: string,
  params?: { courseId?: string; limit?: number },
): Promise<StudentClassRow[]> {
  const conditions = [
    eq(blockEnrollments.studentId, studentId),
    eq(classBlocks.status, "scheduled"),
    gte(classBlocks.blockDate, todayIso),
    ne(blockEnrollments.status, "cancelled"),
  ];
  if (params?.courseId) conditions.push(eq(classBlocks.courseId, params.courseId));

  return await studentAgendaQuery(studentId)
    .where(and(...conditions))
    .orderBy(asc(classBlocks.blockDate), asc(classBlocks.startTime))
    .limit(params?.limit ?? 5);
}

/**
 * Historial del alumno: clases pasadas (block_date < todayIso) o no scheduled.
 * Cursor propio (B2) = `YYYY-MM-DDTHH:mm` sobre (blockDate, startTime) desc;
 * limit+1 detecta hasMore.
 */
export async function listStudentHistory(
  studentId: string,
  todayIso: string,
  params?: { courseId?: string; limit?: number; cursor?: string },
): Promise<PaginatedResult<StudentClassRow>> {
  const limit = resolveLimit(params?.limit);
  const conditions: SQL[] = [eq(blockEnrollments.studentId, studentId)];
  if (params?.courseId) conditions.push(eq(classBlocks.courseId, params.courseId));
  if (params?.cursor) {
    const [cursorDate, cursorTime] = params.cursor.split("T");
    conditions.push(
      or(
        lt(classBlocks.blockDate, cursorDate),
        and(eq(classBlocks.blockDate, cursorDate), lt(classBlocks.startTime, cursorTime)),
      ) as SQL,
    );
  }

  const pastFilter = or(
    lt(classBlocks.blockDate, todayIso),
    ne(classBlocks.status, "scheduled"),
  );

  const rows = await studentAgendaQuery(studentId)
    .where(and(...conditions, pastFilter))
    .orderBy(desc(classBlocks.blockDate), desc(classBlocks.startTime))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? `${last.blockDate}T${last.startTime}` : null,
  };
}

/**
 * Agregados de asistencia del alumno (U1). Cuenta por status del bloque y
 * asistencias tri-estado; attendanceRate = attended/(attended+missed) a 3
 * decimales, null si no hay marcadas.
 */
export async function getStudentAggregates(
  studentId: string,
  courseId?: string,
): Promise<AttendanceAggregatesRow> {
  const conditions = [eq(blockEnrollments.studentId, studentId)];
  if (courseId) conditions.push(eq(classBlocks.courseId, courseId));

  const [row] = await db
    .select({
      scheduled: sql<number>`(count(*) filter (where ${classBlocks.status} = 'scheduled'))::int`,
      completed: sql<number>`(count(*) filter (where ${classBlocks.status} = 'completed'))::int`,
      cancelled: sql<number>`(count(*) filter (where ${classBlocks.status} = 'cancelled'))::int`,
      attended: sql<number>`(count(*) filter (where ${blockEnrollments.attended} = true))::int`,
      missed: sql<number>`(count(*) filter (where ${blockEnrollments.attended} = false))::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(blockEnrollments)
    .innerJoin(classBlocks, eq(classBlocks.id, blockEnrollments.blockId))
    .innerJoin(courseEnrollments, and(
      eq(courseEnrollments.courseId, classBlocks.courseId),
      eq(courseEnrollments.studentId, studentId),
    ))
    .where(and(...conditions));

  const counts = row ?? { scheduled: 0, completed: 0, cancelled: 0, attended: 0, missed: 0, total: 0 };
  const marked = counts.attended + counts.missed;
  return {
    ...counts,
    attendanceRate: marked === 0 ? null : Math.round((counts.attended / marked) * 1000) / 1000,
  };
}
