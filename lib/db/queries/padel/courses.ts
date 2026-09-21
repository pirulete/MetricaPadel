import { db } from "@/lib/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  courses,
  courseEnrollments,
  courseRubrics,
  rubrics,
  users,
  courseLevelEnum,
  courseStatusEnum,
} from "@/lib/db/schema";

export type CourseLevel = (typeof courseLevelEnum.enumValues)[number];
export type CourseStatus = (typeof courseStatusEnum.enumValues)[number];

export type CreateCourseInput = {
  ownerId: string;
  name: string;
  level: CourseLevel;
  schedule?: string | null;
  days?: string[];
  inviteCode: string;
};

export type UpdateCourseInput = {
  name?: string;
  level?: CourseLevel;
  schedule?: string | null;
  days?: string[];
};

export type CourseListItem = {
  id: string;
  name: string;
  level: CourseLevel;
  schedule: string | null;
  days: string[];
  inviteCode: string;
  status: CourseStatus;
  studentCount: number;
};

export type CourseDetail = {
  course: typeof courses.$inferSelect;
  students: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    joinedAt: Date;
  }>;
  rubrics: Array<{
    id: string;
    rubricId: string;
    title: string;
    assignedAt: Date;
  }>;
};

/**
 * Crea curso (status=active). El inviteCode ya viene generado/normalizado por
 * lib/padel/course-code.ts (PAD-XXXX mayúsculas). Ownership: ownerId = coach.
 */
export async function createCourse(data: CreateCourseInput) {
  const [row] = await db.insert(courses).values({
    ownerId: data.ownerId,
    name: data.name,
    level: data.level,
    schedule: data.schedule ?? null,
    days: data.days ?? [],
    inviteCode: data.inviteCode,
    status: 'active',
  }).returning();
  return row;
}

/**
 * Lista cursos del coach con studentCount (P05). Scoped al owner (anti-IDOR).
 */
export async function listCourses(ownerId: string): Promise<CourseListItem[]> {
  return await db
    .select({
      id: courses.id,
      name: courses.name,
      level: courses.level,
      schedule: courses.schedule,
      days: sql<string[]>`${courses.days}`,
      inviteCode: courses.inviteCode,
      status: courses.status,
      studentCount: sql<number>`count(distinct ${courseEnrollments.id})::int`,
    })
    .from(courses)
    .leftJoin(courseEnrollments, eq(courseEnrollments.courseId, courses.id))
    .where(eq(courses.ownerId, ownerId))
    .groupBy(courses.id)
    .orderBy(desc(courses.createdAt));
}

/**
 * Detalle de curso (P07): course + students[] + rubrics[]. Scoped al owner;
 * retorna null si no existe o no pertenece al coach (404, no 403).
 */
export async function getCourseById(ownerId: string, id: string): Promise<CourseDetail | null> {
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, id), eq(courses.ownerId, ownerId)),
  });
  if (!course) return null;

  const [students, rubricsList] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        joinedAt: courseEnrollments.joinedAt,
      })
      .from(courseEnrollments)
      .innerJoin(users, eq(users.id, courseEnrollments.studentId))
      .where(eq(courseEnrollments.courseId, id))
      .orderBy(asc(courseEnrollments.joinedAt)),
    db
      .select({
        id: courseRubrics.id,
        rubricId: courseRubrics.rubricId,
        title: rubrics.title,
        assignedAt: courseRubrics.assignedAt,
      })
      .from(courseRubrics)
      .innerJoin(rubrics, eq(rubrics.id, courseRubrics.rubricId))
      .where(eq(courseRubrics.courseId, id))
      .orderBy(desc(courseRubrics.assignedAt)),
  ]);

  return { course, students, rubrics: rubricsList };
}

/**
 * Actualiza campos parciales del curso. Retorna null si no existe o no
 * pertenece al owner.
 */
export async function updateCourse(ownerId: string, id: string, data: UpdateCourseInput) {
  const [row] = await db.update(courses)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.level !== undefined ? { level: data.level } : {}),
      ...(data.schedule !== undefined ? { schedule: data.schedule } : {}),
      ...(data.days !== undefined ? { days: data.days } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(courses.id, id), eq(courses.ownerId, ownerId)))
    .returning();
  return row ?? null;
}

/**
 * Archiva curso (soft, status=archived, D7). Nunca hard delete: enrollments y
 * course_rubrics se conservan. Retorna null si no existe o no es del owner.
 */
export async function archiveCourse(ownerId: string, id: string) {
  const [row] = await db.update(courses)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(courses.id, id), eq(courses.ownerId, ownerId)))
    .returning();
  return row ?? null;
}

/**
 * Busca curso por inviteCode (case-insensitive via upper()). Retorna null si
 * no existe. El caller (join) valida status=active.
 */
export async function getCourseByInviteCode(inviteCode: string) {
  const [row] = await db.select().from(courses)
    .where(sql`upper(${courses.inviteCode}) = upper(${inviteCode})`)
    .limit(1);
  return row ?? null;
}

/**
 * Asigna rúbrica a curso (P08). UNIQUE(courseId, rubricId) en DB → re-asignar
 * lanza error de constraint; el caller lo traduce a 409 (D2).
 */
export async function assignRubricToCourse(courseId: string, rubricId: string, assignedById: string) {
  const [row] = await db.insert(courseRubrics).values({
    courseId,
    rubricId,
    assignedById,
  }).returning();
  return row;
}

/**
 * Lista rúbricas asignadas a un curso (P07/P08 paso 2).
 */
export async function listCourseRubrics(courseId: string) {
  return await db
    .select({
      id: courseRubrics.id,
      rubricId: courseRubrics.rubricId,
      title: rubrics.title,
      category: rubrics.category,
      assignedAt: courseRubrics.assignedAt,
    })
    .from(courseRubrics)
    .innerJoin(rubrics, eq(rubrics.id, courseRubrics.rubricId))
    .where(eq(courseRubrics.courseId, courseId))
    .orderBy(desc(courseRubrics.assignedAt));
}

/**
 * Remueve alumno de un curso (G12, coach). Delete scoped: retorna la fila
 * eliminada o null si no existe la inscripción (404, anti-IDOR). El guard de
 * ownership del curso (ownerId) vive en el route handler. Las evaluaciones
 * conservan courseId (historial intacto, FK set null no aplica aquí).
 */
export async function removeStudentFromCourse(courseId: string, studentId: string) {
  const [row] = await db.delete(courseEnrollments)
    .where(and(
      eq(courseEnrollments.courseId, courseId),
      eq(courseEnrollments.studentId, studentId),
    ))
    .returning();
  return row ?? null;
}