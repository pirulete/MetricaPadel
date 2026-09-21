import { db } from "@/lib/db";
import { and, count, eq, sql } from "drizzle-orm";
import {
  courses,
  courseEnrollments,
  evaluations,
} from "@/lib/db/schema";
import { listCourses } from "./courses";
import { listStudentCourses } from "./enrollments";
import { getNotificationsByUserId } from "@/lib/db/queries/notifications";
import { deriveLevel, isClassToday } from "@/lib/padel/dashboard";

export type TeacherDashboard = {
  metrics: {
    students: number;
    evaluations: number;
    average: number | null;
    classesToday: number;
  };
  courses: Awaited<ReturnType<typeof listCourses>>;
};

export type StudentDashboard = {
  level: 'iniciacion' | 'intermedio' | 'avanzado' | null;
  courses: Awaited<ReturnType<typeof listStudentCourses>>;
  notifications: Array<typeof import("@/lib/db/schema").notifications.$inferSelect>;
};

/**
 * Métricas del coach (P01): alumnos únicos en sus cursos, evaluaciones propias,
 * promedio de publicadas (null si no hay) y cursos con clase hoy.
 */
export async function getTeacherDashboard(teacherId: string): Promise<TeacherDashboard> {
  const [studentsRow, evaluationsRow, avgRow, coursesList] = await Promise.all([
    db
      .select({ count: count() })
      .from(courseEnrollments)
      .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
      .where(eq(courses.ownerId, teacherId)),
    db
      .select({ count: count() })
      .from(evaluations)
      .where(eq(evaluations.teacherId, teacherId)),
    db
      .select({
        average: sql<number | null>`avg(${evaluations.totalScore}::numeric / nullif(${evaluations.maxScore}, 0))`,
      })
      .from(evaluations)
      .where(and(
        eq(evaluations.teacherId, teacherId),
        eq(evaluations.status, 'published'),
      )),
    listCourses(teacherId),
  ]);

  const average = avgRow[0]?.average ?? null;

  return {
    metrics: {
      students: studentsRow[0]?.count ?? 0,
      evaluations: evaluationsRow[0]?.count ?? 0,
      average,
      classesToday: coursesList.filter((c) => isClassToday(c.days)).length,
    },
    courses: coursesList,
  };
}

/**
 * Dashboard del alumno (A01): nivel derivado de su última evaluación publicada,
 * cursos activos y últimas 5 notificaciones del inbox.
 */
export async function getStudentDashboard(studentId: string): Promise<StudentDashboard> {
  const [lastEval, coursesList, notifResult] = await Promise.all([
    db
      .select({ totalScore: evaluations.totalScore, maxScore: evaluations.maxScore })
      .from(evaluations)
      .where(and(
        eq(evaluations.studentId, studentId),
        eq(evaluations.status, 'published'),
      ))
      .orderBy(sql`${evaluations.publishedAt} desc nulls last`)
      .limit(1),
    listStudentCourses(studentId),
    getNotificationsByUserId(studentId, { limit: 5 }),
  ]);

  const last = lastEval[0];
  let level: StudentDashboard['level'] = null;
  if (last?.totalScore != null && last.maxScore && last.maxScore > 0) {
    level = deriveLevel(last.totalScore / last.maxScore);
  }

  return { level, courses: coursesList, notifications: notifResult.items };
}