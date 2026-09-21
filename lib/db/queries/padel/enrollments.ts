import { db } from "@/lib/db";
import { and, asc, desc, eq, ilike, inArray, notExists, or, sql } from "drizzle-orm";
import {
  courses,
  courseEnrollments,
  evaluations,
  evaluationScores,
  rubrics,
  rubricCriteria,
  rubricLevels,
  users,
  courseLevelEnum,
  rubricCategoryEnum,
} from "@/lib/db/schema";
import { listCourseRubrics } from "./courses";

export type JoinCourseResult =
  | {
      ok: true;
      enrollment: typeof courseEnrollments.$inferSelect;
      courseId: string;
      courseName: string;
    }
  | { ok: false; reason: 'not_found' | 'archived' | 'own_course' | 'already_enrolled' };

export type AddStudentResult =
  | { ok: true; enrollment: typeof courseEnrollments.$inferSelect }
  | { ok: false; reason: 'course_not_found' | 'course_archived' | 'student_not_found' | 'student_not_active' | 'own_course' | 'already_enrolled' };

/**
 * Agrega alumno a un curso manualmente (G12, coach). Transaccional:
 * valida curso existe + activo + ownerId=addedById (404), alumno existe +
 * role USER + status ACTIVE (400), no es el coach (400), no ya inscrito (409).
 * UNIQUE(courseId, studentId) respalda en DB.
 */
export async function addStudentToCourse(courseId: string, studentId: string, addedById: string): Promise<AddStudentResult> {
  return await db.transaction(async (tx) => {
    const [course] = await tx.select().from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!course || course.ownerId !== addedById) return { ok: false as const, reason: 'course_not_found' as const };
    if (course.status !== 'active') return { ok: false as const, reason: 'course_archived' as const };
    if (course.ownerId === studentId) return { ok: false as const, reason: 'own_course' as const };

    const [student] = await tx.select().from(users)
      .where(eq(users.id, studentId))
      .limit(1);
    if (!student) return { ok: false as const, reason: 'student_not_found' as const };
    if (student.role !== 'USER' || student.status !== 'ACTIVE') return { ok: false as const, reason: 'student_not_active' as const };

    const [existing] = await tx.select({ id: courseEnrollments.id }).from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.courseId, courseId),
        eq(courseEnrollments.studentId, studentId),
      ))
      .limit(1);
    if (existing) return { ok: false as const, reason: 'already_enrolled' as const };

    const [enrollment] = await tx.insert(courseEnrollments).values({
      courseId,
      studentId,
    }).returning();

    return { ok: true as const, enrollment };
  });
}

/**
 * Candidatos a agregar a un curso (G12 search): usuarios role USER + status
 * ACTIVE no inscritos al curso, ILIKE por email/firstName/lastName, limit 20.
 * Excluye al coach (owner) — el coach es ADMIN, ya filtrado por role USER.
 */
export async function searchCourseCandidates(courseId: string, q: string) {
  const pattern = `%${q}%`;

  return await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(and(
      eq(users.role, 'USER'),
      eq(users.status, 'ACTIVE'),
      or(
        ilike(users.email, pattern),
        ilike(users.firstName, pattern),
        ilike(users.lastName, pattern),
      ),
      notExists(
        db.select({ id: courseEnrollments.id })
          .from(courseEnrollments)
          .where(and(
            eq(courseEnrollments.courseId, courseId),
            eq(courseEnrollments.studentId, users.id),
          )),
      ),
    ))
    .limit(20);
}

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

export type StudentCourseDetail = {
  course: {
    id: string;
    name: string;
    level: (typeof courseLevelEnum.enumValues)[number];
    schedule: string | null;
    days: string[];
  };
  rubrics: Array<{
    id: string;
    rubricId: string;
    title: string;
    category: (typeof rubricCategoryEnum.enumValues)[number];
    assignedAt: Date;
  }>;
  evaluations: Array<{
    id: string;
    rubricTitle: string | null;
    category: (typeof rubricCategoryEnum.enumValues)[number] | null;
    totalScore: number | null;
    maxScore: number | null;
    publishedAt: Date | null;
    readAt: Date | null;
    scores: Array<{
      criteriaId: string;
      criterionName: string | null;
      levelId: string;
      levelName: string | null;
      score: number;
      comment: string | null;
    }>;
  }>;
};

/**
 * Detalle de curso para el alumno (G8): verifica inscripción (anti-IDOR),
 * info del curso, rúbricas asignadas y evaluaciones publicadas propias del
 * curso con scores enriquecidos (criterionName/levelName). Retorna null si
 * el alumno no está inscrito o el curso no existe (404, no 403).
 */
export async function getStudentCourseDetail(
  studentId: string,
  courseId: string
): Promise<StudentCourseDetail | null> {
  const enrollment = await getEnrollment(courseId, studentId);
  if (!enrollment) return null;

  const [course] = await db.select().from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) return null;

  const [rubricsList, evaluationsList] = await Promise.all([
    listCourseRubrics(courseId),
    db.select().from(evaluations)
      .where(and(
        eq(evaluations.studentId, studentId),
        eq(evaluations.courseId, courseId),
        eq(evaluations.status, 'published'),
      ))
      .orderBy(desc(evaluations.publishedAt)),
  ]);

  const rubricIds = [...new Set(evaluationsList.map((e) => e.rubricId))];
  const evaluationIds = evaluationsList.map((e) => e.id);

  const [rubricRows, scores, criteria, levels] = await Promise.all([
    rubricIds.length > 0
      ? db.select({ id: rubrics.id, title: rubrics.title, category: rubrics.category })
          .from(rubrics)
          .where(inArray(rubrics.id, rubricIds))
      : Promise.resolve([]),
    evaluationIds.length > 0
      ? db.select().from(evaluationScores)
          .where(inArray(evaluationScores.evaluationId, evaluationIds))
      : Promise.resolve([]),
    rubricIds.length > 0
      ? db.select({ id: rubricCriteria.id, rubricId: rubricCriteria.rubricId, name: rubricCriteria.name })
          .from(rubricCriteria)
          .where(inArray(rubricCriteria.rubricId, rubricIds))
      : Promise.resolve([]),
    rubricIds.length > 0
      ? db.select({ id: rubricLevels.id, rubricId: rubricLevels.rubricId, name: rubricLevels.name })
          .from(rubricLevels)
          .where(inArray(rubricLevels.rubricId, rubricIds))
      : Promise.resolve([]),
  ]);

  const rubricById = new Map(rubricRows.map((r) => [r.id, r]));
  const criterionById = new Map(criteria.map((c) => [c.id, c.name]));
  const levelById = new Map(levels.map((l) => [l.id, l.name]));
  const scoresByEvaluation = new Map<string, typeof scores>();
  for (const s of scores) {
    const list = scoresByEvaluation.get(s.evaluationId) ?? [];
    list.push(s);
    scoresByEvaluation.set(s.evaluationId, list);
  }

  const evaluationsEnriched = evaluationsList.map((e) => {
    const rubric = rubricById.get(e.rubricId);
    return {
      id: e.id,
      rubricTitle: rubric?.title ?? null,
      category: rubric?.category ?? null,
      totalScore: e.totalScore,
      maxScore: e.maxScore,
      publishedAt: e.publishedAt,
      readAt: e.readAt,
      scores: (scoresByEvaluation.get(e.id) ?? []).map((s) => ({
        criteriaId: s.criteriaId,
        criterionName: criterionById.get(s.criteriaId) ?? null,
        levelId: s.levelId,
        levelName: levelById.get(s.levelId) ?? null,
        score: s.score,
        comment: s.comment,
      })),
    };
  });

  return {
    course: {
      id: course.id,
      name: course.name,
      level: course.level,
      schedule: course.schedule,
      days: course.days as string[],
    },
    rubrics: rubricsList,
    evaluations: evaluationsEnriched,
  };
}