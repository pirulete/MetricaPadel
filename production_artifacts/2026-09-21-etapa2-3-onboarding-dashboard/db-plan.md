# DB Plan — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: etapa2-3-onboarding-dashboard
> release: v0.2
> date: 2026-09-21
> module: db
> tags: [courses, onboarding, enrollment, padel, db, migration]
> status: in-progress

## Resumen

Se agregan 2 enums y 3 tablas al schema existente (`lib/db/schema.ts`, sin split — excepción 500 líneas permitida) y un cambio aditivo en `evaluations` (`courseId` nullable, decisión D1 del technical-design). Tablas Etapa 1 (`rubrics`, `rubric_levels`, `rubric_criteria`, `rubric_descriptors`, `evaluation_scores`) intactas. Retrocompatibilidad total.

## Enums nuevos (2)

| Enum | Valores | Uso |
|------|---------|-----|
| `course_level` | `iniciacion` \| `intermedio` \| `avanzado` | Nivel del curso (P05/P06) |
| `course_status` | `active` \| `archived` | Soft archive de curso (D7: nunca hard delete) |

## Tablas nuevas (3)

| Tabla | Columnas clave | FKs / Índices | Notas |
|-------|----------------|---------------|-------|
| `courses` | id uuid PK, ownerId FK users (no action), name varchar(200), level enum, schedule varchar(100), days jsonb default `[]`, inviteCode varchar(10), status enum default `active`, createdAt, updatedAt | UNIQUE `courses_invite_code_idx` (inviteCode), `courses_owner_idx` (ownerId) | ownerId = coach (ADMIN); inviteCode `PAD-XXXX` mayúsculas (D4) |
| `course_enrollments` | id uuid PK, courseId FK courses (cascade), studentId FK users (no action), joinedAt | UNIQUE `course_enrollments_course_student_idx` (courseId, studentId), `course_enrollments_course_idx`, `course_enrollments_student_idx` | UNIQUE evita doble inscripción (409) |
| `course_rubrics` | id uuid PK, courseId FK courses (cascade), rubricId FK rubrics (no action), assignedById FK users (no action), assignedAt | UNIQUE `course_rubrics_course_rubric_idx` (courseId, rubricId), `course_rubrics_course_idx` | UNIQUE → re-asignar misma rúbrica = 409 (D2); rubricId sin cascade protege historial |

## Cambio aditivo en tabla existente

- `evaluations.courseId` uuid nullable FK `courses` **onDelete: set null** (D1). Habilita P10 (columna "curso" + filtro) y P09 (filtrado por curso post-MVP). Sin cambios en `rubrics`/`evaluation_scores`.

## Decisiones de diseño

- **`courses.ownerId` sin cascade**: no se borra el coach con sus cursos.
- **`course_enrollments.courseId` cascade**: borrar curso limpia inscripciones; archivar (soft) las conserva (D7).
- **`course_rubrics.rubricId` sin cascade**: historial protegido (una rúbrica puede estar en N cursos).
- **`evaluations.courseId` set null**: archivar/borrar curso no destruye evaluaciones históricas.
- **`days` jsonb default `[]`** (D3): días de clase vacíos permitidos; `schedule` (texto) es el dato principal.
- **inviteCode UNIQUE en DB** + normalización `upper()` en queries (lookup case-insensitive, D4).

## Queries nuevas (`lib/db/queries/padel/`)

| Archivo | Funciones | Ownership |
|---------|-----------|-----------|
| `courses.ts` | `createCourse`, `listCourses` (studentCount), `getCourseById` (students+rubrics), `updateCourse`, `archiveCourse` (soft), `getCourseByInviteCode` (case-insensitive), `assignRubricToCourse`, `listCourseRubrics` | Filtro `ownerId` (anti-IDOR) |
| `enrollments.ts` | `joinCourse` (transacción + validaciones 404/400/409), `listStudentCourses`, `listCourseStudents`, `getEnrollment` | `studentId` / `courseId` |

## Migración

- `drizzle/0005_goofy_charles_xavier.sql` generada vía `pnpm run db:generate` (nunca SQL a mano).
- Orden cronológico verificado en `drizzle/meta/_journal.json` (idx 5, tag `0005_goofy_charles_xavier`).
- **Ejecutada contra DB local** (`postgresql://padel:padel_dev_2026@localhost:5432/padel_evaluation`) — ver `migration-notes.md`.

## Tests

- `tests/unit/db/courses.test.ts` — CRUD cursos, enrollments, course_rubrics, ownership, join edge cases, métricas (mapeado en technical-design §9; pendiente de implementar junto con API).

## Archivos modificados

- `lib/db/schema.ts` (+2 enums, +3 tablas, +relations, +types, `evaluations.courseId`)
- `lib/db/queries/padel/courses.ts` (nuevo)
- `lib/db/queries/padel/enrollments.ts` (nuevo)
- `lib/db/queries/padel/index.ts` (+exports)
- `drizzle/0005_goofy_charles_xavier.sql` (nuevo)
- `drizzle/meta/0005_snapshot.json` (nuevo)