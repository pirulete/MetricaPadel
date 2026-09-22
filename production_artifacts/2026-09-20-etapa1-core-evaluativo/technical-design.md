# Technical Design — Etapa 1: Core Evaluativo (Rúbricas + Evaluaciones)

> status: in-progress
> release: v0.1
> date: 2026-09-20
> change_id: etapa1-core-evaluativo
> module: admin+api+db+ui
> tags: [rubrics, evaluations, padel, db, migration, api, ui]

## 1. Resumen

Implementar el loop coach → rúbrica → evaluación → alumno con 4 pantallas (P09, P03, A03, P02) usando los roles de sistema existentes `USER`/`ADMIN`. Sin cursos, sin templates, sin `padel_role`. Se siguen los patrones del Marketing CMS: queries puras en `lib/db/queries/`, validaciones Zod en `lib/validations/`, guards server-side (`guardAdmin`/`guardUser`) + auditoría en mutaciones, API docs en `lib/api-docs/spec.ts`.

## 2. Decisiones de Arquitectura

| # | Decisión | Justificación |
|---|----------|---------------|
| D1 | **No se crea `lib/auth/padel-guards.ts`** | `validateAdmin`/`validateUser` + `guardAdmin`/`guardUser` existentes cubren 401/403. Ownership se resuelve en queries (filtro `ownerId`/`teacherId`/`studentId`), no en un guard nuevo. Menos código, mismo nivel de seguridad. |
| D2 | **Schema en `lib/db/schema.ts` (sin split)** | El archivo pasa de ~379 a ~540 líneas; la excepción de 500 líneas aplica a `lib/db/schema.ts` según AGENTS.md. Evita tocar `drizzle.config.ts` (apunta a `./lib/db/schema.ts`). |
| D3 | **Ownership anti-IDOR en queries** | Toda query de lectura/escritura recibe `ownerId`/`teacherId`/`studentId` y filtra con `and(eq(...), eq(...))`. Un 404 (no 403) si el recurso no pertenece al actor → no filtra existencia. |
| D4 | **`totalScore`/`maxScore` denormalizados** | Historial estable ante ediciones de rúbrica. Riesgo aceptado (spec): sin snapshot en Etapa 1. |
| D5 | **Crear usuario jugador = `ACTIVE` directo** | El alumno debe poder loguearse sin verificación de email (flujo admin). Se reutiliza `bcrypt.hash(password, 10)` de `lib/db/queries/auth.ts`. |
| D6 | **Archivar rúbrica = soft (`status=archived`)** | Nunca hard delete; las evaluaciones referencian la rúbrica. |
| D7 | **Sin variables de entorno nuevas** | No se agregan env vars; `.env.example` no cambia. |
| D8 | **Niveles fijos 4** | Escala `Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1` creada al crear rúbrica; no editables en Etapa 1. |

## 3. Impacto en DB (migración `0004_*` vía `db:generate`)

### Enums nuevos (2)
- `rubric_status`: `draft` | `active` | `archived`
- `evaluation_status`: `draft` | `published`

### Tablas nuevas (6) — en `lib/db/schema.ts`

| Tabla | Columnas clave | FKs / Índices |
|-------|----------------|---------------|
| `rubrics` | id uuid PK, ownerId FK users (no cascade), title varchar(200), category enum `rubric_category` (tecnica/tactica/fisica/actitud), status `rubric_status` default `draft`, createdAt, updatedAt | índice `rubrics_owner_idx` (ownerId) |
| `rubric_levels` | id uuid PK, rubricId FK cascade, name varchar(100), score integer, sortOrder integer | índice `rubric_levels_rubric_idx` (rubricId) |
| `rubric_criteria` | id uuid PK, rubricId FK cascade, name varchar(200), sortOrder integer | índice `rubric_criteria_rubric_idx` (rubricId) |
| `rubric_descriptors` | id uuid PK, criteriaId FK cascade, levelId FK cascade, text text | UNIQUE `rubric_descriptors_criteria_level_idx` (criteriaId, levelId) |
| `evaluations` | id uuid PK, studentId FK users (no cascade), teacherId FK users (no cascade), rubricId FK rubrics (no cascade), status `evaluation_status` default `draft`, totalScore integer, maxScore integer, globalComment text, publishedAt timestamp, readAt timestamp, createdAt | índices: `evaluations_student_idx`, `evaluations_teacher_idx`, `evaluations_rubric_idx` |
| `evaluation_scores` | id uuid PK, evaluationId FK cascade, criteriaId FK rubric_criteria (no cascade), levelId FK rubric_levels (no cascade), score integer, comment text | UNIQUE `evaluation_scores_evaluation_criteria_idx` (evaluationId, criteriaId) |

Nota: `rubric_category` es un enum adicional (3º enum nuevo) para la categoría de rúbrica. FKs de `evaluation_scores` a criteria/levels **sin cascade** para proteger el historial (si se edita la rúbrica, los scores apuntan a filas que siguen existiendo).

### Migración
- `pnpm run db:generate` → `drizzle/0004_*.sql` (nunca SQL a mano).
- `pnpm run db:migrate` + verificación post-migración: `SELECT column_name FROM information_schema.columns WHERE table_name='rubrics' AND column_name='owner_id'` (y análogas para las 6 tablas).
- Verificar orden cronológico en `drizzle/meta/_journal.json`.

## 4. Impacto en Auth

| Aspecto | Cambio |
|---------|--------|
| Roles | Sin cambios de enum. `ADMIN` = coach, `USER` = alumno. |
| Guards | Reutilizar `guardAdmin`/`guardUser` (API) y `validateAdmin`/`validateUser` (páginas). Sin archivo nuevo. |
| Rutas privadas | `app/(app)/layout.tsx` ya llama `validateUser` (bloquea LOCKED). Páginas coach (P02/P03/P09) llaman `validateAdmin()` adicional. Páginas alumno (A03) solo `validateUser`. |
| Ownership | Queries filtran por `ownerId` (rubrics), `teacherId` (evaluations coach), `studentId` (evaluations alumno). |
| Auditoría | `auditCreate`/`auditUpdate`/`auditDelete` en: crear/editar/archivar rúbrica, crear/guardar/publicar evaluación, crear usuario admin. |
| Crear usuario | `POST /api/admin/users` crea `USER` con `status=ACTIVE` (sin verificación de email). Email duplicado → 409. |

## 5. Contratos API (contract-first, 15 endpoints)

### 5.1 Admin — usuarios jugadores
| Método + Path | Guard | Request | Response | Errores |
|---------------|-------|---------|----------|---------|
| `POST /api/admin/users` | guardAdmin | `{email, firstName, lastName, password}` (Zod) | 201 `{user: {id, email, firstName, lastName, role, status}}` | 400, 401, 403, 409 |
| `GET /api/admin/users` | guardAdmin | `?search=` opcional | 200 `{users: [{id, email, firstName, lastName, status}]}` (solo role USER) | 401, 403 |

### 5.2 Rúbricas (coach)
| Método + Path | Guard | Request | Response | Errores |
|---------------|-------|---------|----------|---------|
| `GET /api/rubrics` | guardAdmin | `?status=active\|archived` | 200 `{rubrics: [{id, title, category, status, criteriaCount, levelCount, createdAt}]}` | 401, 403 |
| `POST /api/rubrics` | guardAdmin | `{title, category, criteria: [{name, descriptors: [4 textos]}]}` (mín 1 criterio, 4 descriptores) | 201 `{rubric}` (con levels/criteria/descriptors) | 400, 401, 403 |
| `GET /api/rubrics/[id]` | guardAdmin (owner) | — | 200 `{rubric, levels, criteria, descriptors}` | 401, 403, 404 |
| `PUT /api/rubrics/[id]` | guardAdmin (owner) | `{title?, category?, criteria?}` (reemplazo completo de criteria/descriptors) | 200 `{rubric}` | 400, 401, 403, 404 |
| `DELETE /api/rubrics/[id]` | guardAdmin (owner) | — | 200 `{rubric: {status: 'archived'}}` (soft) | 401, 403, 404 |

### 5.3 Evaluaciones (coach)
| Método + Path | Guard | Request | Response | Errores |
|---------------|-------|---------|----------|---------|
| `GET /api/evaluations` | guardAdmin (teacher) | `?status=draft\|published` | 200 `{evaluations: [{id, studentId, studentName, rubricTitle, status, totalScore, maxScore, updatedAt}]}` | 401, 403 |
| `POST /api/evaluations` | guardAdmin | `{studentId, rubricId}` | 201 `{evaluation}` (borrador) | 400, 401, 403, 404 |
| `GET /api/evaluations/[id]` | guardAdmin (teacher) | — | 200 `{evaluation, student, rubric, scores: [{criteriaId, levelId, score, comment}]}` | 401, 403, 404 |
| `PUT /api/evaluations/[id]` | guardAdmin (teacher) | `{scores: [{criteriaId, levelId, comment?}], globalComment?}` (solo borrador) | 200 `{evaluation}` (recalcula totalScore) | 400, 401, 403, 404 |
| `POST /api/evaluations/[id]/publish` | guardAdmin (teacher) | — | 200 `{evaluation}` (valida todos los criterios con nivel; set publishedAt) | 400, 401, 403, 404 |

### 5.4 Alumno (ownership estricto)
| Método + Path | Guard | Request | Response | Errores |
|---------------|-------|---------|----------|---------|
| `GET /api/student/evaluations` | guardUser (owner) | — | 200 `{evaluations: [{id, rubricTitle, category, totalScore, maxScore, publishedAt, readAt}]}` (solo published) | 401, 403 |
| `GET /api/student/evaluations/[id]` | guardUser (owner) | — | 200 `{evaluation, rubric, scores: [{criterionName, levelName, score, descriptor}]}` | 401, 403, 404 |
| `POST /api/student/evaluations/[id]/read` | guardUser (owner) | — | 200 `{evaluation: {readAt}}` (idempotente) | 401, 403, 404 |

### 5.5 Schemas Zod (`lib/validations/padel.ts`)
- `adminCreateUserSchema`: email (email), firstName/lastName (string 1-255), password (min 8).
- `rubricCreateSchema`: title (1-200), category (enum), criteria (array min 1, cada uno: name 1-200 + descriptors array exact 4, text 1-1000).
- `rubricUpdateSchema`: partial de create.
- `evaluationCreateSchema`: studentId/rubricId (uuid).
- `evaluationSaveSchema`: scores (array min 1, cada uno: criteriaId uuid, levelId uuid, comment opcional), globalComment opcional.
- `listQuerySchema`: status opcional enum.

## 6. Impacto en UI (4 pantallas)

| Pantalla | Ruta | Guard página | Componentes |
|----------|------|--------------|-------------|
| P02 Biblioteca Rúbricas | `app/(app)/rubricas/page.tsx` | validateAdmin | `components/padel/rubric-card.tsx`, `components/padel/empty-state.tsx` (reutiliza Tabs/Badge/Card/Button) |
| P03 Editor Rúbrica | `app/(app)/rubricas/nueva/page.tsx` + `app/(app)/rubricas/[id]/page.tsx` | validateAdmin | `components/padel/rubric-editor.tsx` (matriz descriptores, añadir criterio) |
| P09 Evaluar Alumno | `app/(app)/evaluar/page.tsx` (nuevo) + `app/(app)/evaluar/[id]/page.tsx` (resume borrador) | validateAdmin | `components/padel/scoring-canvas.tsx` (score en vivo), `components/padel/student-picker.tsx` |
| A03 Detalle Evaluación | `app/(app)/evaluaciones/page.tsx` (lista + empty state) + `app/(app)/evaluaciones/[id]/page.tsx` | validateUser | `components/padel/evaluation-card.tsx`, `components/padel/rubric-viewer.tsx` |

- Sin componentes UI nuevos: Button/Card/Badge/Tabs/Input/Textarea/Label/Select/Separator del kit existente.
- Estados cubiertos por pantalla: default, empty, loading (skeleton), error (Sonner/toast en mutaciones).
- Score en vivo P09: estado local en `scoring-canvas.tsx`; `totalScore = Σ score seleccionado`, `maxScore = criterios × 4`; persistencia vía `PUT /api/evaluations/[id]`.

## 7. Archivos a Crear/Modificar

### Crear
- `lib/db/queries/padel/rubrics.ts` — CRUD rúbrica + levels/criteria/descriptors (transacción), list con counts, archive.
- `lib/db/queries/padel/evaluations.ts` — CRUD evaluación + scores, list coach/alumno, publish, markRead, ownership filters.
- `lib/db/queries/padel/admin-users.ts` — `createActiveUser` (bcrypt + ACTIVE + USER), `listPlayers`.
- `lib/validations/padel.ts` — schemas Zod (sección 5.5).
- `lib/padel/score.ts` — funciones puras: `computeMaxScore(criteriaCount)`, `computeTotalScore(scores)`, `validatePublish(scores, criteriaCount)`.
- `app/api/admin/users/route.ts` — GET + POST.
- `app/api/rubrics/route.ts` — GET + POST.
- `app/api/rubrics/[id]/route.ts` — GET + PUT + DELETE.
- `app/api/evaluations/route.ts` — GET + POST.
- `app/api/evaluations/[id]/route.ts` — GET + PUT.
- `app/api/evaluations/[id]/publish/route.ts` — POST.
- `app/api/student/evaluations/route.ts` — GET.
- `app/api/student/evaluations/[id]/route.ts` — GET.
- `app/api/student/evaluations/[id]/read/route.ts` — POST.
- `lib/api-docs/paths/padel.ts` — 15 paths OpenAPI.
- `lib/api-docs/schemas/padel.ts` — schemas OpenAPI (Rubric, RubricInput, Evaluation, EvaluationScore, StudentEvaluation, AdminUser, etc.).
- Páginas: `app/(app)/rubricas/page.tsx`, `app/(app)/rubricas/nueva/page.tsx`, `app/(app)/rubricas/[id]/page.tsx`, `app/(app)/evaluar/page.tsx`, `app/(app)/evaluar/[id]/page.tsx`, `app/(app)/evaluaciones/page.tsx`, `app/(app)/evaluaciones/[id]/page.tsx`.
- Componentes: `components/padel/scoring-canvas.tsx`, `components/padel/rubric-editor.tsx`, `components/padel/rubric-viewer.tsx`, `components/padel/rubric-card.tsx`, `components/padel/evaluation-card.tsx`, `components/padel/student-picker.tsx`, `components/padel/empty-state.tsx`.
- Tests: ver sección 8.

### Modificar
- `lib/db/schema.ts` — +3 enums, +6 tablas, +relations.
- `lib/api-docs/spec.ts` — importar `padelPaths`/`padelTags`/`padelSchemas`, +2 tags (`Padel Admin`, `Padel Student`).
- `ARCHITECTURE.md` — sección Padel Evaluativo (estructura carpetas, tablas, endpoints).
- `FEATURES.md` — entrada del cambio (responsable: implementadores).
- `AGENTS.md` — sin cambios (no cambian roles/workflows).

## 8. Tests Requeridos

| Tipo | Archivo | Cubre |
|------|---------|-------|
| Unit | `tests/unit/db/rubrics.test.ts` | queries: create con levels/criteria/descriptors, list por status+owner, get por owner, archive, ownership (404 ajeno) |
| Unit | `tests/unit/db/evaluations.test.ts` | queries: create borrador, save scores, publish, markRead idempotente, list coach/alumno, ownership |
| Unit | `tests/unit/db/admin-users.test.ts` | createActiveUser (hash, ACTIVE, USER), listPlayers, email duplicado |
| Unit | `tests/unit/validations/padel.test.ts` | Zod: rubric create/update, evaluation save, admin user create, list query |
| Unit | `tests/unit/padel/score.test.ts` | computeMaxScore, computeTotalScore, validatePublish (falta criterio → false) |
| API guard | `tests/api/padel/guard.spec.ts` | 401 sin sesión, 403 USER en endpoints coach, 403 ADMIN en endpoints alumno, 404 IDOR |
| API happy | `tests/api/padel/admin-users-happy.spec.ts` | POST/GET admin users con SQL real |
| API happy | `tests/api/padel/rubrics-happy.spec.ts` | GET/POST/PUT/DELETE rúbricas con SQL real |
| API happy | `tests/api/padel/evaluations-happy.spec.ts` | GET/POST/PUT/publish evaluaciones con SQL real |
| API happy | `tests/api/padel/student-happy.spec.ts` | GET list/detail/read alumno con SQL real |
| E2E | `tests/e2e/rubric-editor.spec.ts` | P02+P03: crear rúbrica, ver en biblioteca, archivar |
| E2E | `tests/e2e/evaluation-flow.spec.ts` | P09: crear usuario, evaluar, score en vivo, publicar |
| E2E | `tests/e2e/student-view.spec.ts` | A03: alumno ve evaluación publicada, marca leída, empty state |

## 9. Agentes y Orden de Ejecución

| Orden | Agente | Responsabilidad | Deliverable |
|-------|--------|-----------------|-------------|
| 1 | @db-engineer | schema + enums + tablas + migración `0004_*` + queries padel + unit tests DB | `db-plan.md`, `migration-notes.md` |
| 2 | @auth-security | validar guards/ownership/auditoría en diseño, revisar `POST /api/admin/users` (creación ACTIVE), auth-impact | `auth-impact.md`, `security-checklist.md` |
| 3 | @app-engineer | validaciones Zod, `lib/padel/score.ts`, 15 endpoints, api-docs, 4 pantallas + componentes, unit/API/E2E tests | `app-notes.md` |
| 4 | @ponytail-reviewer | revisión de simplicidad (scoring-canvas, rubric-editor) | `ponytail-review-report.md` |
| 5 | @qa-release | E2E final, test-matrix, acceptance-criteria, release-report, FEATURES.md | `release-report.md`, `test-matrix.md`, `acceptance-criteria.md` |

## 10. Retrocompatibilidad

- No se modifican endpoints existentes; solo se agregan rutas nuevas bajo `/api/admin/users`, `/api/rubrics`, `/api/evaluations`, `/api/student/*`.
- `lib/db/schema.ts` solo agrega tablas/enums; no altera `users`, `sessions`, `audit_logs`.
- `lib/api-docs/spec.ts` agrega tags/paths; no rompe los existentes.
- Sin cambios en auth.ts ni en el flujo de login existente.

## 11. Riesgos y Mitigaciones

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Editar rúbrica publicada altera historial | Media | totalScore/maxScore denormalizados; snapshot post-MVP (aceptado en spec) |
| Creación de usuarios admin (capacidad nueva) | Media | Endpoint mínimo + Zod + auditoría + 409 email duplicado; sin auto-registro |
| Canvas P09 (score en vivo) complejidad UI | Media | Estado local + persistencia en borrador; prototipar con mockup existente |
| Transacción rúbrica (levels+criteria+descriptors) | Media | `db.transaction` en create/update; unit tests de integridad |