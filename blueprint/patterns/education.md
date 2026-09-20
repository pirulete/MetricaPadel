# Pattern: Education / LMS

## Overview
LMS, academia online o cursos. Agrega cursos con lecciones, enrollments y tracking de progreso. Activa el área privada de cursos con player de lecciones y milestones de completado.

## Features Activated
- Auth.js + guards `validateUser` / `validateAdmin`
- Audit (`auditAdminAction`, `auditCreate`, `auditUpdate`)
- Notification inbox + push (enrollment, course.published, lesson.completed)
- Marketing CMS (landing con course grid) — opcional

## Schema
Agregar al final de `lib/db/schema.ts`:

```ts
export const enrollmentStatusEnum = pgEnum('enrollment_status', ['active', 'completed', 'cancelled']);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default('0'),
  instructorId: uuid("instructor_id").references(() => users.id, { onDelete: "set null" }),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const enrollments = pgTable("enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
  status: enrollmentStatusEnum("status").notNull().default('active'),
}, (table) => [
  uniqueIndex("enrollments_user_course_idx").on(table.userId, table.courseId),
]);

export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  content: jsonb("content").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  durationMinutes: integer("duration_minutes").notNull().default(10),
}, (table) => [
  index("lessons_course_sort_idx").on(table.courseId, table.sortOrder),
]);

export const progress = pgTable("progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("progress_user_lesson_idx").on(table.userId, table.lessonId),
]);

export const coursesRelations = relations(courses, ({ one, many }) => ({
  instructor: one(users, { fields: [courses.instructorId], references: [users.id] }),
  enrollments: many(enrollments),
  lessons: many(lessons),
}));
export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, { fields: [enrollments.userId], references: [users.id] }),
  course: one(courses, { fields: [enrollments.courseId], references: [courses.id] }),
}));
export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  course: one(courses, { fields: [lessons.courseId], references: [courses.id] }),
  progress: many(progress),
}));
export const progressRelations = relations(progress, ({ one }) => ({
  user: one(users, { fields: [progress.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [progress.lessonId], references: [lessons.id] }),
}));

export type Course = typeof courses.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Progress = typeof progress.$inferSelect;
```

## Queries
`lib/db/queries/courses.ts`:

```ts
import { db } from "@/lib/db";
import { courses, enrollments, lessons, progress } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

/** Curso con lecciones ordenadas. */
export async function getCourseWithLessons(courseId: string) {
  return db.query.courses.findFirst({
    where: eq(courses.id, courseId),
    with: { lessons: { orderBy: (t, { asc }) => [asc(t.sortOrder)] } },
  });
}

/** Inscribe al usuario (no-op si ya está inscrito). */
export async function enroll(userId: string, courseId: string) {
  const existing = await db.query.enrollments.findFirst({
    where: and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)),
  });
  if (existing) return existing;
  const [row] = await db.insert(enrollments).values({ userId, courseId }).returning();
  return row;
}

/** Progreso del usuario en un curso: lecciones completadas / total. */
export async function getProgress(userId: string, courseId: string) {
  const course = await getCourseWithLessons(courseId);
  if (!course) return null;
  const done = await db.select({ lessonId: progress.lessonId })
    .from(progress)
    .where(and(
      eq(progress.userId, userId),
      eq(progress.completed, true),
    ));
  const doneSet = new Set(done.map((d) => d.lessonId));
  const completed = course.lessons.filter((l) => doneSet.has(l.id)).length;
  return { total: course.lessons.length, completed, percent: course.lessons.length ? Math.round((completed / course.lessons.length) * 100) : 0 };
}

/** Marca lección completada (upsert). */
export async function markLessonComplete(userId: string, lessonId: string) {
  const existing = await db.query.progress.findFirst({
    where: and(eq(progress.userId, userId), eq(progress.lessonId, lessonId)),
  });
  if (existing) {
    const [row] = await db.update(progress)
      .set({ completed: true, completedAt: new Date() })
      .where(eq(progress.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(progress)
    .values({ userId, lessonId, completed: true, completedAt: new Date() }).returning();
  return row;
}

/** Cursos del usuario con progreso. */
export async function getMyCourses(userId: string) {
  const rows = await db.query.enrollments.findMany({
    where: eq(enrollments.userId, userId),
    with: { course: true },
  });
  return Promise.all(rows.map(async (e) => ({
    ...e,
    progress: await getProgress(userId, e.courseId),
  })));
}
```

## API Endpoints
| Método | Ruta | Guard | Body | Response | Descripción |
|--------|------|-------|------|----------|-------------|
| GET | `/api/admin/courses` | `guardAdmin` | — | `Course[]` | Lista cursos |
| POST | `/api/admin/courses` | `guardAdmin` | `{name, description, price, instructorId}` | `Course` | Crea curso (audit `auditAdminAction`) |
| POST | `/api/user/enrollments` | `guardUser` | `{courseId}` | `Enrollment` | Inscribe (audit `auditCreate`) |
| PATCH | `/api/user/progress/[lessonId]` | `guardUser` | `{completed: true}` | `Progress` | Marca lección completada |

## UI Pages
| Ruta | Componentes | Estados | Descripción |
|------|-------------|---------|-------------|
| `app/(app)/courses/` | `CourseCard`, `ProgressBar`, `EmptyState` | loading, empty, error | Mis cursos con % progreso |
| `app/(app)/courses/[id]/` | `LessonList`, `Button`, `ProgressBar` | loading, error | Lecciones del curso |
| `app/(app)/courses/[id]/[lessonId]/` | `LessonContent`, `MarkCompleteButton` | loading, error | Contenido + marcar completada |

## Tests
- `tests/unit/courses.test.ts` — `enroll` (idempotente), `getProgress` (percent), `markLessonComplete` (upsert), `getMyCourses`
- `tests/api/courses.spec.ts` — guard 401/403 en enrollments, progress y admin courses
- `tests/api/courses-happy.spec.ts` — happy-path con SQL real: crear curso + lecciones → enroll → marcar completada → verificar progress
- `tests/e2e/course-flow.spec.ts` — flujo navegable: cursos → detalle → lección → completar → progreso actualizado

## Notification Triggers
En `lib/notifications/triggers.ts`:

```ts
/** enrollment.created — bienvenida al curso (P2, account). */
export async function triggerEnrollmentCreated(userId: string, courseName: string, courseId: string) {
  return createNotification({
    userId, type: 'success', priority: 'P2', title: '¡Inscrito!',
    body: `Te inscribiste en "${courseName}".`, category: 'account',
    ctaUrl: `/courses/${courseId}`, ctaLabel: 'Empezar curso',
  });
}

/** course.published — notifica a interesados (P2, marketing, dedup por curso). */
export async function triggerCoursePublished(userId: string, courseName: string, courseId: string) {
  return createNotification({
    userId, type: 'info', priority: 'P2', title: 'Nuevo curso disponible',
    body: `"${courseName}" ya está publicado.`, category: 'marketing',
    groupId: crypto.randomUUID(), ctaUrl: `/courses/${courseId}`, ctaLabel: 'Ver curso',
  });
}

/** lesson.completed — milestone 100% (P3, account, dedup por curso). */
export async function triggerLessonCompleted(userId: string, courseName: string, percent: number) {
  if (percent < 100) return null;
  return createNotification({
    userId, type: 'success', priority: 'P3', title: '¡Curso completado!',
    body: `Completaste "${courseName}". ¡Felicitaciones!`, category: 'account',
    groupId: crypto.randomUUID(), ctaUrl: '/courses', ctaLabel: 'Ver cursos',
  });
}
```