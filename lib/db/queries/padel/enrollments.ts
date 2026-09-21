import { db } from "@/lib/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  courses,
  courseEnrollments,
  users,
} from "@/lib/db/schema";

export type JoinCourseResult =
  | {
      ok: true;
      enrollment: typeof courseEnrollments.$inferSelect;
      courseId: string;
      courseName: string;
    }
  | { ok: false; reason: 'not_found' | 'archived' | 'own_course' | 'already_enrolled' };

/**
 * Inscribe alumno a un curso por inviteCode (case-insensitive) en transacción.
 * Validaciones: curso existe y activo (404), coach no se une a su propio curso
 * (400), ya inscrito (409). UNIQUE(courseId, studentId) respalda en DB.
 */
export async function joinCourse(studentId: string, inviteCode: string): Promise<JoinCourseResult> {
  return await db.transaction(async (tx) => {
    const [course] = await tx.select().from(courses)
      .where(sql`upper(${courses.inviteCode}) = upper(${inviteCode})`)
      .limit(1);
    if (!course) return { ok: false as const, reason: 'not_found' as const };
    if (course.status !== 'active') return { ok: false as const, reason: 'archived' as const };
    if (course.ownerId === studentId) return { ok: false as const, reason: 'own_course' as const };

    const [existing] = await tx.select({ id: courseEnrollments.id }).from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.courseId, course.id),
        eq(courseEnrollments.studentId, studentId),
      ))
      .limit(1);
    if (existing) return { ok: false as const, reason: 'already_enrolled' as const };

    const [enrollment] = await tx.insert(courseEnrollments).values({
      courseId: course.id,
      studentId,
    }).returning();

    return { ok: true as const, enrollment, courseId: course.id, courseName: course.name };
  });
}

/**
 * Cursos del alumno (A01 "Mis cursos"): solo activos, con nivel y horario.
 */
export async function listStudentCourses(studentId: string) {
  return await db
    .select({
      id: courses.id,
      name: courses.name,
      level: courses.level,
      schedule: courses.schedule,
      days: courses.days,
      inviteCode: courses.inviteCode,
      joinedAt: courseEnrollments.joinedAt,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(and(
      eq(courseEnrollments.studentId, studentId),
      eq(courses.status, 'active'),
    ))
    .orderBy(desc(courseEnrollments.joinedAt));
}

/**
 * Alumnos inscritos a un curso (P07 tab Alumnos).
 */
export async function listCourseStudents(courseId: string) {
  return await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      joinedAt: courseEnrollments.joinedAt,
    })
    .from(courseEnrollments)
    .innerJoin(users, eq(users.id, courseEnrollments.studentId))
    .where(eq(courseEnrollments.courseId, courseId))
    .orderBy(asc(courseEnrollments.joinedAt));
}

/**
 * Verifica si un alumno está inscrito a un curso (para P09 filtrado por curso).
 */
export async function getEnrollment(courseId: string, studentId: string) {
  const [row] = await db.select().from(courseEnrollments)
    .where(and(
      eq(courseEnrollments.courseId, courseId),
      eq(courseEnrollments.studentId, studentId),
    ))
    .limit(1);
  return row ?? null;
}

/**
 * Elimina la inscripción de un alumno a un curso (G11). Retorna la fila
 * eliminada o null si no existe (404, anti-IDOR). El UNIQUE(courseId,
 * studentId) liberado permite re-join posterior.
 */
export async function deleteEnrollment(courseId: string, studentId: string) {
  const [row] = await db.delete(courseEnrollments)
    .where(and(
      eq(courseEnrollments.courseId, courseId),
      eq(courseEnrollments.studentId, studentId),
    ))
    .returning();
  return row ?? null;
}