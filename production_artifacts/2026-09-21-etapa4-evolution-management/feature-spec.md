# Feature Spec — Etapa 4: Evolución del Alumno y Gestión de Alumnos por Curso (G6 + G7 + G12)

> status: proposed
> release: v0.4
> date: 2026-09-21
> change_id: etapa4-evolution-management
> module: api+db+ui
> tags: [padel, evaluations, versions, evolution, courses, enrollment, migration, api, ui]

Fuente: `production_artifacts/2026-09-21-user-flows-v2.md` §7 (G6, G7, G12 — los 3 gaps HIGH restantes del loop evaluativo).

---

## G6 — Re-evaluación / Versiones de evaluación

### Problema

Hoy el coach publica una evaluación UNA vez por fila (`status: draft → published`, `publishEvaluation` devuelve `not_draft` si ya está publicada). No existe concepto de "versión": si el alumno mejora, el coach no tiene forma de crear una nueva evaluación del mismo alumno con la misma rúbrica y mostrar progresión. A nivel DB no hay UNIQUE(studentId, rubricId), pero no hay versión numérica, ni agrupación de serie, ni UI que lo facilite.

### Objetivo

Permitir múltiples evaluaciones publicadas para el mismo (studentId, rubricId), cada una con un `version` incremental que represente la progresión temporal del alumno.

### Alcance

- **DB**: columna `evaluations.version` (integer, nullable) + índice `(studentId, rubricId, status)` para cómputo de versión y listado de serie. Migración Drizzle vía `db:generate` (0006_*). Backfill de versiones para evaluaciones publicadas legacy (1, 2, 3… por (studentId, rubricId) ordenado por publishedAt).
- **Queries** (`lib/db/queries/padel/evaluations.ts`):
  - `publishEvaluation`: al publicar, asignar `version = COALESCE(MAX(version),0)+1` entre evaluaciones publicadas del mismo (studentId, rubricId) — dentro de la misma transacción.
  - `listEvaluationSeries(teacherId, studentId, rubricId)`: serie de evaluaciones (draft + published) del coach para ese alumno+rúbrica, ordenada por versión/publishedAt, con scores enriquecidos.
  - `listStudentEvaluationSeries(studentId, rubricId)`: serie publicada visible al alumno.
- **API**:
  - `POST /api/evaluations/[id]/publish` (modificado): incluye `version` en la respuesta.
  - `GET /api/evaluations/series?studentId=&rubricId=` (nuevo, guardAdmin + ACTIVE + anti-IDOR 404): serie del coach.
  - `GET /api/student/evaluations/series?rubricId=` (nuevo, guardUser + ACTIVE + role USER + anti-IDOR 404): serie publicada del alumno.
- **UI**:
  - `components/padel/scoring-canvas.tsx` (modificado): al cargar un alumno+rúbrica ya evaluados, mostrar badge "Versión N" y aviso de re-evaluación (reutiliza patrón soft-block R5, nunca bloquea).
  - `components/padel/evaluation-card.tsx` (modificado): mostrar versión en la lista del coach.
- **Validaciones**: `lib/validations/padel.ts` — `seriesQuerySchema` (studentId uuid, rubricId uuid).

### Acceptance Criteria

1. Un coach puede publicar una 2ª evaluación del mismo alumno con la misma rúbrica; la nueva evaluación recibe `version = 2` y la anterior conserva `version = 1` (verificado con SQL real).
2. `GET /api/evaluations/series?studentId=&rubricId=` devuelve la serie ordenada con `version`, `status`, `totalScore`, `maxScore`, `publishedAt` y scores enriquecidos; alumno/rúbrica ajenos → 404 (anti-IDOR).
3. `GET /api/student/evaluations/series?rubricId=` devuelve solo evaluaciones publicadas del alumno autenticado con su `version`; borradores nunca visibles; rúbrica ajena → 404.
4. El backfill de migración asigna versiones 1..N a evaluaciones publicadas legacy por (studentId, rubricId) ordenadas por publishedAt; drafts quedan con `version = null`.
5. Unit tests: `tests/unit/db/evaluations.test.ts` (+cómputo de versión en publish, +series coach/student). API tests: `tests/api/padel/evaluation-version-happy.spec.ts` (SQL real: publish v1 → v2, series ordenada, 404 IDOR) + guards 401/403. E2E: `tests/e2e/evaluation-version.spec.ts` (flujo coach: evaluar → publicar → re-evaluar → ver versión 2).

### Edge Cases

- Múltiples drafts del mismo alumno+rúbrica: solo las publicadas incrementan versión; drafts quedan `version = null`.
- Publicar una evaluación ya publicada (`not_draft`): se mantiene el 409/400 actual, no se re-asigna versión.
- Rúbrica archivada: no se puede crear evaluación nueva (comportamiento actual), pero la serie histórica sigue visible.
- Evaluaciones legacy sin versión tras backfill: se tratan como v1 en orden cronológico.
- Alumno con 0 evaluaciones: serie vacía (200 con `[]`).

### Out-of-Scope

- Soft-delete de evaluaciones (G16).
- Comparación visual entre versiones (vive en G7).
- Re-publish de una evaluación ya publicada (editar versión publicada).

---

## G7 — Vista de evolución / comparativa del alumno

### Problema

El alumno ve sus evaluaciones como lista plana (`GET /api/student/evaluations`). No hay vista de progreso temporal: no puede ver si sus scores suben/bajan por categoría ni comparar evaluaciones de la misma rúbrica/categoría.

### Objetivo

Vista de evolución del alumno: series por rúbrica/categoría con tendencia (delta vs evaluación anterior) por criterio y total.

### Alcance

- **Lógica pura** `lib/padel/evolution.ts` (nuevo, sin imports server-side):
  - `computeTrend(series)`: para cada evaluación (excepto la primera), delta de `totalScore` y delta por criterio (mismo rubricId); dirección `up | down | equal`; porcentaje `totalScore/maxScore` para comparar entre rúbricas distintas de la misma categoría.
  - `groupByCategory(evaluations)`: agrupa publicadas por `rubrics.category`.
- **Queries** (`lib/db/queries/padel/evaluations.ts`): `listStudentEvolution(studentId)` — evaluaciones publicadas del alumno con rubricTitle, category, version, totalScore, maxScore, publishedAt y scores enriquecidos (criterionName/levelName), ordenadas por publishedAt.
- **API**: `GET /api/student/evolution` (nuevo, guardUser + ACTIVE + role USER, read-only sin auditoría): `{ series: [{ rubricId, rubricTitle, category, evaluations: [{ id, version, totalScore, maxScore, publishedAt, readAt, trend: { totalDelta, perCriterion: [{criterionId, criterionName, delta, direction}] } }] }] }`.
- **UI**: página `app/(app)/evolucion` (nueva, layout `validateUser`, router por rol: solo USER; ADMIN ve 403/redirect) + `components/padel/evolution-view.tsx` (client): por categoría → cards de rúbrica → línea temporal de evaluaciones con score, % y flechas de tendencia (↑/↓/→ con Badge, sin librería de charts). Entrada en `bottom-nav` (USER_ITEMS) y link desde `evaluaciones`.
- **API docs**: `lib/api-docs/paths/padel.ts` + `schemas/padel.ts` (+`StudentEvolutionDto`, +`EvolutionSeriesDto`, +`TrendDto`).

### Acceptance Criteria

1. `GET /api/student/evolution` devuelve series agrupadas por rúbrica con `trend.totalDelta` y `trend.perCriterion` (delta y dirección) comparando cada evaluación con la anterior; primera evaluación de cada serie → `trend: null`.
2. La comparación entre rúbricas de la misma categoría usa porcentaje (`totalScore/maxScore`); el delta por criterio solo se calcula dentro de la misma rúbrica (criterios pueden diferir entre rúbricas).
3. La página `/evolucion` muestra: empty state si no hay evaluaciones publicadas; estado "primera evaluación" sin tendencia; flechas de tendencia correctas para series con ≥2 evaluaciones; solo datos del alumno autenticado (anti-IDOR).
4. Unit tests: `tests/unit/padel/evolution.test.ts` (computeTrend: up/down/equal, primera evaluación null, criterios distintos entre rúbricas; groupByCategory). API tests: `tests/api/padel/student-evolution-happy.spec.ts` (SQL real: 2 evaluaciones misma rúbrica → delta correcto; 1 evaluación → trend null; 403 rol ADMIN; 401 sin sesión). E2E: `tests/e2e/student-evolution.spec.ts` (auth + render + guards).

### Edge Cases

- Alumno con 1 sola evaluación publicada: serie con 1 item, `trend: null`, UI muestra "Primera evaluación".
- Alumno sin evaluaciones: 200 con `series: []`, UI empty state.
- Rúbricas de la misma categoría con distinto número de criterios: comparación solo por % total, nunca por criterio cruzado.
- Evaluaciones draft: nunca aparecen.
- Alumno con evaluaciones de rúbricas archivadas: siguen visibles en la serie (historial protegido).

### Out-of-Scope

- Gráficos con librería externa (charts) — se usa UI nativa (Badge/divs).
- Comparativa coach (historial con tendencia) — solo alumno en esta etapa.
- Exportación CSV (G2).

---

## G12 — Gestión de alumnos por curso desde el coach

### Problema

Los alumnos solo entran a un curso por invite code (`POST /api/courses/join`). El coach no puede agregar manualmente a un alumno existente (creado vía `/api/admin/users`) ni removerlo. `listCourseStudents` existe (P07 tab Alumnos) pero es read-only.

### Objetivo

El coach (ADMIN, owner del curso) puede agregar alumnos existentes (por email/búsqueda) y removerlos, con auditoría y anti-IDOR.

### Alcance

- **Queries** (`lib/db/queries/padel/enrollments.ts`):
  - `addStudentToCourse(courseId, studentId, addedById)`: insert transaccional con validaciones (curso activo y del coach, alumno ACTIVE + role USER, no ya inscrito, no es el coach). Reutiliza UNIQUE(courseId, studentId).
  - `searchCourseCandidates(courseId, q)`: busca usuarios role USER + status ACTIVE no inscritos al curso, por email o nombre (ILIKE, limit 20).
  - `removeStudentFromCourse(courseId, studentId)`: delete scoped (404 si no inscrito). Reutiliza `deleteEnrollment` con guard de ownership del curso.
- **API** (3 nuevos, guardAdmin + ACTIVE + audit):
  - `POST /api/courses/[id]/students` — body `{ email }` (o `{ studentId }`): 201 + auditoría `auditCreate`; 400 si no ACTIVE/USER/self; 404 curso ajeno/inexistente o alumno inexistente; 409 ya inscrito.
  - `DELETE /api/courses/[id]/students/[studentId]` — 200 + auditoría `auditDelete`; 404 si no inscrito o curso ajeno.
  - `GET /api/courses/[id]/students/search?q=` — 200 con candidatos (read-only, sin auditoría); 404 curso ajeno.
- **Validaciones**: `lib/validations/padel.ts` — `courseAddStudentSchema` (email email() O studentId uuid, refine "al menos uno"), `courseStudentSearchSchema` (q min 1 max 100).
- **UI**: `components/padel/course-detail.tsx` (modificado, tab Alumnos): botón "Agregar alumno" → modal con search (debounced, reutiliza patrón de `user-list.tsx`) + botón remover por alumno con confirmación (sonner). Solo ADMIN (el tab ya es coach-only).
- **API docs**: `lib/api-docs/paths/courses.ts` + `schemas/courses.ts` (+`CourseAddStudentInput`, +`CourseStudentCandidateDto`).

### Acceptance Criteria

1. `POST /api/courses/[id]/students` con email de un alumno ACTIVE/USER no inscrito → 201 y fila en `course_enrollments` (verificado con SQL real) + auditoría; email de coach (ADMIN) → 400; alumno LOCKED/TEMPORARY → 400; ya inscrito → 409; curso ajeno → 404.
2. `DELETE /api/courses/[id]/students/[studentId]` → 200, fila eliminada (SQL real) + auditoría; no inscrito → 404; curso ajeno → 404; las evaluaciones históricas del alumno en ese curso se conservan (FK sin cascade).
3. `GET /api/courses/[id]/students/search?q=` devuelve solo usuarios ACTIVE/USER no inscritos al curso (máx 20), excluye al coach; curso ajeno → 404.
4. La UI del tab Alumnos permite agregar por búsqueda y remover con confirmación; toasts de éxito/error con sonner.
5. Unit tests: `tests/unit/db/enrollments.test.ts` (+addStudentToCourse ok/ya inscrito/self/curso archivado, +searchCourseCandidates, +removeStudentFromCourse). API tests: `tests/api/padel/course-students-happy.spec.ts` (SQL real: add 201 + verificación + 409 + 400 + 404; remove 200 + verificación + evaluaciones intactas; search 200) + guards 401/403. E2E: `tests/e2e/course-students.spec.ts` (auth + flujo agregar/remover).

### Edge Cases

- Agregar alumno ya inscrito → 409 (UNIQUE respalda).
- Agregar al propio coach (owner) → 400.
- Curso archivado → no se puede agregar (400/404); remover sí se permite (limpieza).
- Alumno LOCKED o TEMPORARY → 400 (solo ACTIVE/USER).
- Remover alumno con evaluaciones en el curso: evaluaciones conservan `courseId` (historial intacto, igual que G11).
- Búsqueda sin resultados → 200 con `[]`.

### Out-of-Scope

- Crear alumno desde el modal (ya existe `POST /api/admin/users` + UI G10).
- Importación masiva CSV (G2).
- Notificación al alumno al ser agregado/removido (G13 es otro gap, queda fuera).

---

## Dependencias

- G6 es prerequisito de G7 (la serie con `version` alimenta la vista de evolución).
- G12 es independiente de G6/G7.
- Orden de implementación: G6 → G7 → G12 (o G12 en paralelo).

## Riesgos

- Migración 0006_* con backfill de versiones: verificar columnas tras `db:migrate` (regla AGENTS.md) y orden cronológico en `_journal.json`.
- G7 sin librería de charts: la UI de tendencia debe ser nativa (Badge/divs) para no agregar dependencias.
- Anti-IDOR en los 3 gaps: recurso ajeno → 404, nunca 403.