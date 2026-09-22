# Technical Design — Etapa 4: Evolución del Alumno y Gestión de Alumnos por Curso (G6 + G7 + G12)

> status: in-progress
> release: v0.4
> date: 2026-09-21
> change_id: etapa4-evolution-management
> module: api+db+ui
> tags: [padel, evaluations, versions, evolution, courses, enrollment, migration, api, ui]

Fuente: `feature-spec.md` (mismo directorio) + `release-scope.md`.

---

## 1. Resumen de Decisiones

| Decisión | Detalle |
|---|---|
| Versión de evaluación | Columna `evaluations.version` (integer, nullable). Solo publicadas incrementan; drafts quedan `null`. Cómputo dentro de la transacción de publish: `COALESCE(MAX(version),0)+1` por (studentId, rubricId). |
| Migración | `0007_*` vía `pnpm run db:generate` (NOTA: `0006_handy_proemial_gods.sql` ya existe — cambio de enum de categoría; el spec decía 0006_* pero el número real será 0007_*). Incluye backfill de versiones legacy con UPDATE ordenado por publishedAt. |
| Serie coach | `GET /api/evaluations/series?studentId=&rubricId=` — guardAdmin + ACTIVE + anti-IDOR 404. |
| Serie alumno | `GET /api/student/evaluations/series?rubricId=` — guardUser + ACTIVE + role USER + anti-IDOR 404. |
| Evolución alumno | `GET /api/student/evolution` — guardUser + ACTIVE + role USER, read-only sin auditoría. Lógica pura en `lib/padel/evolution.ts` (sin imports server-side). |
| Gestión alumnos curso | `POST /api/courses/[id]/students`, `DELETE /api/courses/[id]/students/[studentId]`, `GET /api/courses/[id]/students/search?q=` — guardAdmin + ACTIVE + auditoría en mutaciones. |
| Auth | **Sin cambios.** Guards existentes (`guardAdmin`/`guardUser`) cubren los 3 gaps. No se toca `auth.ts`, `lib/auth/`, ni `app/api/auth/`. |
| Env vars | **Ninguna nueva.** No se modifica `.env.example`. |
| Retrocompatibilidad | `POST /api/evaluations/[id]/publish` mantiene contrato (añade `version` al DTO, campo aditivo). `GET /api/student/evaluations` no cambia. |

---

## 2. Impacto por Capa

### 2.1 DB (migración `0007_*`)

- `lib/db/schema.ts` — tabla `evaluations`:
  - `version: integer("version")` (nullable, sin default — drafts null).
  - Índice `evaluations_student_rubric_status_idx` sobre `(studentId, rubricId, status)` para cómputo de versión y series.
- Migración generada con `db:generate` + custom SQL de backfill (regla AGENTS.md: generar primero, agregar SQL custom, re-generar snapshot):
  - `UPDATE evaluations SET version = sub.rn FROM (SELECT id, row_number() OVER (PARTITION BY student_id, rubric_id ORDER BY published_at ASC) AS rn FROM evaluations WHERE status = 'published' AND published_at IS NOT NULL) sub WHERE evaluations.id = sub.rn.id` — asigna 1..N por (studentId, rubricId) ordenado por publishedAt. Drafts quedan `null`.
- Verificación post-migración (regla AGENTS.md): `SELECT column_name FROM information_schema.columns WHERE table_name='evaluations' AND column_name='version'` + verificar orden cronológico en `drizzle/meta/_journal.json`.

### 2.2 Queries (`lib/db/queries/padel/evaluations.ts`)

| Función | Tipo | Descripción |
|---|---|---|
| `publishEvaluation` | MOD | Dentro de la transacción existente, antes del UPDATE: `SELECT COALESCE(MAX(version),0)+1 FROM evaluations WHERE studentId=? AND rubricId=? AND status='published'` y setear `version` en el UPDATE. |
| `listEvaluationSeries(teacherId, studentId, rubricId)` | NEW | Serie coach (draft + published) con scores enriquecidos (criterionName/levelName), ordenada por version ASC NULLS LAST, luego publishedAt. Scoped teacherId (anti-IDOR). |
| `listStudentEvaluationSeries(studentId, rubricId)` | NEW | Serie publicada del alumno con scores enriquecidos, ordenada por version ASC. Scoped studentId + status published (anti-IDOR). |
| `listStudentEvolution(studentId)` | NEW | Evaluaciones publicadas del alumno con rubricTitle, category, version, totalScore, maxScore, publishedAt, readAt + scores enriquecidos, ordenadas por publishedAt ASC (alimenta G7). |

### 2.3 Lógica pura (`lib/padel/evolution.ts` — NUEVO, sin imports server-side)

- `computeTrend(series)`: para cada evaluación excepto la primera de la serie: `totalDelta` (totalScore - prev.totalScore), `perCriterion` (delta por criterionId dentro de la misma rúbrica), `direction: 'up' | 'down' | 'equal'`. Primera evaluación → `trend: null`.
- `groupByCategory(evaluations)`: agrupa por `rubrics.category` (para UI de `/evolucion`).
- Tipos exportados: `TrendDirection`, `TrendResult`, `EvolutionSeries`.

### 2.4 Queries (`lib/db/queries/padel/enrollments.ts`)

| Función | Tipo | Descripción |
|---|---|---|
| `addStudentToCourse(courseId, studentId, addedById)` | NEW | Transaccional: valida curso existe + activo + ownerId=addedById (404), alumno existe + role USER + status ACTIVE (400), no es el coach (400), no ya inscrito (409). Insert en `course_enrollments` (UNIQUE respalda). |
| `searchCourseCandidates(courseId, q)` | NEW | Usuarios role USER + status ACTIVE no inscritos al curso, ILIKE por email/firstName/lastName, `limit 20`, excluye al coach. |
| `removeStudentFromCourse(courseId, studentId)` | NEW | Delete scoped (404 si no inscrito). Reutiliza lógica de `deleteEnrollment` con guard de ownership del curso en el handler. |

### 2.5 API — Contratos (contract first)

#### G6 — Modificado
`POST /api/evaluations/[id]/publish` (MOD)
- Response 200: `{ evaluation: EvaluationDto }` — `EvaluationDto` gana `version: integer|null`. Sin cambios de status codes.

#### G6 — Nuevos
`GET /api/evaluations/series?studentId=&rubricId=` (guardAdmin + ACTIVE)
- 200: `{ series: EvaluationSeriesItemDto[] }` — `[{ id, version, status, totalScore, maxScore, publishedAt, scores: [{criteriaId, criterionName, levelId, levelName, score}] }]`
- 400 query inválida (Zod `seriesQuerySchema`), 401, 403, 404 alumno/rúbrica ajena (anti-IDOR).

`GET /api/student/evaluations/series?rubricId=` (guardUser + ACTIVE + role USER)
- 200: `{ series: StudentEvaluationSeriesItemDto[] }` — solo published, con `version`.
- 400, 401, 403 (LOCKED o rol ADMIN), 404 rúbrica ajena.

#### G7 — Nuevo
`GET /api/student/evolution` (guardUser + ACTIVE + role USER, read-only)
- 200: `{ series: StudentEvolutionDto[] }` — `[{ rubricId, rubricTitle, category, evaluations: [{ id, version, totalScore, maxScore, publishedAt, readAt, trend: { totalDelta, perCriterion: [{criterionId, criterionName, delta, direction}] } | null }] }]`
- 401, 403 (LOCKED o rol ADMIN). Sin 404 (siempre scoped al alumno autenticado).

#### G12 — Nuevos (guardAdmin + ACTIVE + auditoría)
`POST /api/courses/[id]/students`
- Body: `{ email: string } | { studentId: uuid }` (refine "al menos uno", `courseAddStudentSchema`).
- 201: `{ enrollment: { courseId, studentId, joinedAt } }` + `auditCreate("course_enrollment", ...)`.
- 400 alumno no ACTIVE/USER o es el coach; 404 curso ajeno/inexistente o alumno inexistente; 409 ya inscrito.

`DELETE /api/courses/[id]/students/[studentId]`
- 200: `{ ok: true }` + `auditDelete("course_enrollment", ...)`.
- 400 id inválido; 404 no inscrito o curso ajeno. Evaluaciones conservan `courseId` (FK set null no aplica aquí — courseId queda, historial intacto).

`GET /api/courses/[id]/students/search?q=`
- 200: `{ candidates: CourseStudentCandidateDto[] }` — `[{ id, firstName, lastName, email }]`, máx 20, read-only sin auditoría.
- 400 q inválida (`courseStudentSearchSchema`); 404 curso ajeno.

### 2.6 Validaciones (`lib/validations/padel.ts`)

- `seriesQuerySchema`: `{ studentId: uuid, rubricId: uuid }` (G6 coach).
- `studentSeriesQuerySchema`: `{ rubricId: uuid }` (G6 alumno).
- `courseAddStudentSchema`: `{ email?: email, studentId?: uuid }` + refine al menos uno.
- `courseStudentSearchSchema`: `{ q: string min 1 max 100 }`.

### 2.7 API Docs (`lib/api-docs/`)

- `paths/padel.ts`: +`/api/evaluations/series`, +`/api/student/evaluations/series`, +`/api/student/evolution`; MOD descripción de `/api/evaluations/{id}/publish` (menciona `version`).
- `schemas/padel.ts`: +`version` en `EvaluationDto`; +`EvaluationSeriesItemDto`, +`StudentEvaluationSeriesItemDto`, +`StudentEvolutionDto`, +`EvolutionSeriesDto`, +`TrendDto`.
- `paths/courses.ts`: +`/api/courses/{id}/students` (POST), +`/api/courses/{id}/students/{studentId}` (DELETE), +`/api/courses/{id}/students/search` (GET).
- `schemas/courses.ts`: +`CourseAddStudentInput`, +`CourseStudentCandidateDto`, +`CourseEnrollmentDto`.
- `spec.ts` no cambia (paths/schemas se componen automáticamente desde los submódulos).

### 2.8 UI

| Archivo | Tipo | Cambio |
|---|---|---|
| `app/(app)/evolucion/page.tsx` | NEW | Página server: `validateUser` + router por rol (solo USER; ADMIN → redirect/403). Fetch `GET /api/student/evolution`. |
| `components/padel/evolution-view.tsx` | NEW | Client: por categoría → cards de rúbrica → línea temporal con score, % y Badge de tendencia (↑/↓/→). Estados: empty, primera evaluación, series ≥2. Sin librería de charts. |
| `components/padel/scoring-canvas.tsx` | MOD | Badge "Versión N" + aviso de re-evaluación al cargar alumno+rúbrica ya evaluados (patrón soft-block R5, nunca bloquea). |
| `components/padel/evaluation-card.tsx` | MOD | Mostrar `version` en la lista del coach. |
| `components/padel/course-detail.tsx` | MOD | Tab Alumnos: botón "Agregar alumno" → modal con search debounced (patrón `user-list.tsx`) + botón remover con confirmación (sonner). Solo ADMIN. |
| `components/padel/bottom-nav.tsx` | MOD | USER_ITEMS: +`/evolucion` (icono TrendUp de lucide). |
| `app/(app)/evaluaciones/page.tsx` | MOD | Link a `/evolucion` desde la lista del alumno. |

### 2.9 Tests (mapeo completo)

| Tipo | Archivo | Cubre |
|---|---|---|
| Unit | `tests/unit/db/evaluations.test.ts` (MOD) | publish asigna version 1→2; drafts version null; listEvaluationSeries orden; listStudentEvaluationSeries solo published; listStudentEvolution. |
| Unit | `tests/unit/padel/evolution.test.ts` (NEW) | computeTrend up/down/equal; primera evaluación null; criterios distintos entre rúbricas; groupByCategory. |
| Unit | `tests/unit/db/enrollments.test.ts` (MOD) | addStudentToCourse ok/ya inscrito/self/curso archivado/alumno no ACTIVE; searchCourseCandidates; removeStudentFromCourse. |
| API happy | `tests/api/padel/evaluation-version-happy.spec.ts` (NEW) | SQL real: publish v1 → v2, series ordenada, 404 IDOR. |
| API guard | `tests/api/padel/evaluation-version.spec.ts` (NEW) | 401/403 en series coach y alumno. |
| API happy | `tests/api/padel/student-evolution-happy.spec.ts` (NEW) | SQL real: 2 evaluaciones → delta correcto; 1 evaluación → trend null; 403 rol ADMIN; 401 sin sesión. |
| API happy | `tests/api/padel/course-students-happy.spec.ts` (NEW) | SQL real: add 201 + verificación + 409 + 400 + 404; remove 200 + verificación + evaluaciones intactas; search 200. |
| API guard | `tests/api/padel/course-students.spec.ts` (NEW) | 401/403 en los 3 endpoints G12. |
| E2E | `tests/e2e/evaluation-version.spec.ts` (NEW) | Coach: evaluar → publicar → re-evaluar → ver versión 2. |
| E2E | `tests/e2e/student-evolution.spec.ts` (NEW) | Auth + render `/evolucion` + guards. |
| E2E | `tests/e2e/course-students.spec.ts` (NEW) | Auth + flujo agregar/remover alumno. |

---

## 3. Orden de Ejecución de Agentes

1. **@db-engineer** — schema.ts (version + índice) → `db:generate` → custom SQL backfill → `db:migrate` + verificación columnas → queries (evaluations.ts, enrollments.ts) → unit tests db.
2. **@app-engineer** — validaciones Zod → route handlers (series coach/alumno, evolution, course students) → API docs → lógica pura evolution.ts → UI (evolucion page, evolution-view, scoring-canvas, evaluation-card, course-detail, bottom-nav) → unit tests padel + API happy/guard tests + E2E.
3. **@ponytail-reviewer** — revisión de simplicidad antes de QA.
4. **@qa-release** — smoke, regresión auth, test-matrix, acceptance-criteria, release-report, evidence-manifest.

G12 es independiente de G6/G7: puede ejecutarse en paralelo (mismo @app-engineer, distinto batch de commits).

## 4. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Migración 0007_* con backfill incorrecto | UPDATE con `row_number() OVER (PARTITION BY student_id, rubric_id ORDER BY published_at)`; verificación SQL post-migración + `_journal.json` cronológico. |
| Cómputo de versión en carrera (2 publishes simultáneos) | Cómputo dentro de la transacción de publish; el índice (studentId, rubricId, status) acota el MAX. Sin UNIQUE parcial (aceptado: riesgo bajo, publish es single-user por coach). |
| Regresión cobertura módulo padel | Unit tests por query nueva; gate `--coverage` contra baseline. |
| Anti-IDOR roto | 404 explícito por endpoint en tests happy + guards. |
| UI tendencia sin charts | Badge/divs nativos, sin dependencias nuevas. |

## 5. Retrocompatibilidad

- `POST /api/evaluations/[id]/publish`: campo `version` aditivo — clientes existentes no se rompen.
- `GET /api/student/evaluations`: sin cambios de contrato.
- `GET /api/courses/[id]`: sin cambios (G12 agrega endpoints nuevos, no modifica el detalle).
- Evaluaciones legacy sin version tras backfill: tratadas como v1 en orden cronológico.

## 6. Documentación

- `ARCHITECTURE.md`: nueva sección "Padel Evaluativo — Evolución y Gestión de Alumnos (v0.4)" con tablas/endpoints/UI nuevos.
- `FEATURES.md`: entrada `etapa4-evolution-management` al cerrar (status: released).
- `.env.example`: sin cambios (0 env vars nuevas).
- `AGENTS.md`: sin cambios (no cambian roles ni workflows).