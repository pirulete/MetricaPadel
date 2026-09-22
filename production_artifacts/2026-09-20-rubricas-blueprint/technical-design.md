# Technical Design — Rúbricas de Pádel (MVP)

> status: proposed
> release: v0.1
> date: 2026-09-20
> change_id: rubricas-blueprint
> module: api
> tags: [db, migration, auth, ui, api, mvp]

## 1. Estado actual verificado (solo lectura)

- `padel-evaluation` es un clon limpio de `skeleton_base` (2 commits de init). **No existe ningún plan técnico previo en el repo** (`production_artifacts/` vacío).
- El `technical-design.md` de `skeleton_base/production_artifacts/2026-09-16-project-blueprint/` corresponde al sistema de scaffolding (blueprint), **no** a Padel Evaluation.
- El plan anterior (matches, match_players, trainings, training_players, padel_profiles) existe solo como artifact de chat — **nunca se implementó**. No hay tablas padel en `lib/db/schema.ts` (solo stock: users, sessions, audit_logs, marketing_*, terms, notifications, push_*).
- `users.role` es `user_role` enum `['USER','ADMIN']` (sistema). El registro actual **no** acepta selector de rol.

## 2. Schema Drizzle propuesto (14 tablas nuevas + 3 enums)

### 2.1 Enums

```ts
export const padelRoleEnum = pgEnum('padel_role', ['coach', 'player']);
export const rubricStatusEnum = pgEnum('rubric_status', ['draft', 'active', 'archived']);
export const evaluationStatusEnum = pgEnum('evaluation_status', ['draft', 'published']);
```

**Decisión de rol**: coach/player es rol de dominio → vive en `padel_profiles`, NO se toca `user_role` (USER/ADMIN sigue siendo rol de sistema para `validateAdmin`). Requiere guard nuevo `requireCoach()` / `requirePlayer()` (ver §5).

### 2.2 Tablas

| Tabla | Columnas | Constraints / Índices |
|-------|----------|----------------------|
| `padel_profiles` | id uuid PK, userId uuid FK→users (cascade), role padelRoleEnum, clubName varchar(255), phone varchar(20), createdAt | UNIQUE(userId) |
| `rubrics` | id uuid PK, ownerId uuid FK→users (cascade), title varchar(255), category varchar(100), description text, status rubricStatusEnum default 'draft', createdAt, updatedAt | INDEX(ownerId) |
| `rubric_levels` | id uuid PK, rubricId uuid FK→rubrics (cascade), name varchar(100), score integer, sortOrder integer | INDEX(rubricId) |
| `rubric_criteria` | id uuid PK, rubricId uuid FK→rubrics (cascade), name varchar(255), description text, sortOrder integer | INDEX(rubricId) |
| `rubric_descriptors` | id uuid PK, criteriaId uuid FK→rubric_criteria (cascade), levelId uuid FK→rubric_levels (cascade), text text | UNIQUE(criteriaId, levelId) |
| `rubric_templates` | id uuid PK, name varchar(255), description text, category varchar(100), isDefault boolean default false | — (seed) |
| `template_levels` | id uuid PK, templateId uuid FK→rubric_templates (cascade), name varchar(100), score integer, sortOrder integer | INDEX(templateId) |
| `template_criteria` | id uuid PK, templateId uuid FK→rubric_templates (cascade), name varchar(255), description text, sortOrder integer | INDEX(templateId) |
| `template_descriptors` | id uuid PK, criteriaId uuid FK→template_criteria (cascade), levelId uuid FK→template_levels (cascade), text text | UNIQUE(criteriaId, levelId) |
| `courses` | id uuid PK, teacherId uuid FK→users (cascade), name varchar(255), period varchar(100), description text, inviteCode varchar(20) UNIQUE, createdAt | UNIQUE(inviteCode) + INDEX(teacherId) |
| `course_students` | id uuid PK, courseId uuid FK→courses (cascade), studentId uuid FK→users (cascade), enrolledAt | UNIQUE(courseId, studentId) |
| `course_rubrics` | id uuid PK, courseId uuid FK→courses (cascade), rubricId uuid FK→rubrics (cascade), assignedAt | UNIQUE(courseId, rubricId) |
| `evaluations` | id uuid PK, studentId uuid FK→users, teacherId uuid FK→users, courseId uuid FK→courses, rubricId uuid FK→rubrics, status evaluationStatusEnum default 'draft', totalScore integer, maxScore integer, globalComment text, createdAt, publishedAt | INDEX(studentId), INDEX(teacherId), INDEX(courseId) |
| `evaluation_scores` | id uuid PK, evaluationId uuid FK→evaluations (cascade), criteriaId uuid FK→rubric_criteria, levelId uuid FK→rubric_levels, score integer, comment text | UNIQUE(evaluationId, criteriaId) |

**Notas**:
- `totalScore`/`maxScore` denormalizados en `evaluations` (historial estable aunque se edite la rúbrica después).
- `inviteCode` formato `PAD-XXXX` validado en capa de aplicación (Zod regex `^PAD-[A-Z0-9]{4}$`).
- Migración: `pnpm run db:generate` + `db:migrate` (reglas ARCHITECTURE.md). Seed de templates: script `scripts/seed-rubric-templates.ts` (3-5 templates base).
- **Riesgo aceptado**: editar una rúbrica publicada altera evaluaciones históricas (no hay snapshot). Mitigación post-MVP: jsonb `rubricSnapshot` al publicar.

## 3. Mapeo pantalla → tabla

| Pantalla | Entidad DB principal | Relaciones | Endpoint(s) |
|----------|---------------------|------------|-------------|
| SCR-01 Splash | — (routing) | — | — |
| SCR-02 Registro + rol | users + padel_profiles | padel_profiles.userId → users | `POST /api/auth/register` (mod) |
| SCR-03 Login | users | — | `POST /api/auth/signin` (existente) |
| P01 Home Profesor | courses, evaluations | teacherId | `GET /api/courses`, `GET /api/evaluations` |
| P02 Biblioteca Rúbricas | rubrics | ownerId | `GET /api/rubrics` |
| P03 Editor Rúbrica | rubrics + rubric_levels + rubric_criteria + rubric_descriptors | → rubrics | `GET/PUT /api/rubrics/[id]`, `POST /api/rubrics` |
| P04 Templates | rubric_templates + template_* | — (seed) | `GET /api/rubric-templates`, `POST /api/rubrics/from-template` |
| P05 Mis Cursos | courses | teacherId | `GET /api/courses` |
| P06 Crear Curso | courses (genera inviteCode) | — | `POST /api/courses` |
| P07 Detalle Curso | course_students, course_rubrics | → courses, users, rubrics | `GET /api/courses/[id]`, `GET /api/courses/[id]/students` |
| P08 Asignar Rúbrica | course_rubrics | → courses, rubrics | `POST/DELETE /api/courses/[id]/rubrics` |
| P09 Evaluar Alumno | evaluations + evaluation_scores | → course_students, rubrics, rubric_criteria | `POST /api/evaluations`, `PUT /api/evaluations/[id]`, `POST /api/evaluations/[id]/publish` |
| P10 Historial | evaluations | → users (student), courses | `GET /api/evaluations` |
| A01 Home Alumno | course_students, evaluations | studentId | `GET /api/student/courses`, `GET /api/student/evaluations` |
| A02 Unirse Curso | course_students (por inviteCode) | → courses | `POST /api/courses/join` |
| A03 Detalle Evaluación | evaluation_scores | → evaluations, rubric_criteria, rubric_descriptors | `GET /api/student/evaluations/[id]` |

## 4. Gap con plan anterior

| Plan anterior (chat) | Spec actual (rúbricas) | Veredicto |
|----------------------|------------------------|-----------|
| `matches`, `match_players` | — | **REEMPLAZADO** — el core del producto es evaluación por rúbrica, no tracking de partidos. No crear. |
| `trainings`, `training_players` | — | **REEMPLAZADO** — misma razón. Si se necesita asistencia a clases, será feature futura sobre `courses`. |
| `padel_profiles` genérico | `padel_profiles` con role coach/player | **SE MANTIENE** — redefinido: rol de dominio + clubName + phone. |
| — | `rubrics` + levels/criteria/descriptors | **NUEVO** (core) |
| — | `rubric_templates` + template_* | **NUEVO** (seed) |
| — | `courses`, `course_students`, `course_rubrics` | **NUEVO** |
| — | `evaluations`, `evaluation_scores` | **NUEVO** |

**Conclusión**: el plan anterior queda descartado en su mayoría; solo sobrevive `padel_profiles` (redefinido). El modelo de datos se construye desde cero sobre el stock de skeleton_base.

## 5. Impacto en auth y guards

- **Registro (SCR-02)**: `POST /api/auth/register` acepta `role: 'coach'|'player'` → crea user (role USER) + `padel_profiles`. Validación Zod + transacción.
- **Guards nuevos** en `lib/auth/padel-guards.ts`:
  - `requireCoach()` — 403 si no hay `padel_profiles.role = 'coach'` (protege /api/rubrics, /api/courses, /api/evaluations).
  - `requirePlayer()` — 403 si no es `player` (protege /api/student/*, /api/courses/join).
  - Ambos exigen `validateUser` primero (nunca LOCKED; TEMPORARY no puede operar).
- **Ownership**: toda query de rubrics/courses/evaluations filtra por `ownerId`/`teacherId`/`studentId` de sesión (IDOR prevention).
- **Auditoría**: mutaciones sensibles → `audit_logs` (crear/editar rúbrica, crear curso, publicar evaluación, unirse a curso).
- **Retrocompatibilidad**: `user_role` enum intacto; endpoints auth existentes no cambian de contrato (register solo agrega campo opcional `role`).

## 6. Contratos API (contract first) — 26 endpoints (3 modificados, 23 nuevos)

| Método + Path | Guard | Body/Query | Respuesta |
|---------------|-------|-----------|-----------|
| `POST /api/auth/register` (mod) | público + rate limit | `{email, password, firstName, lastName, role}` | 201 user + profile |
| `GET /api/user/profile` (mod) | validateUser | — | user + padel_profile |
| `GET /api/rubrics` | requireCoach | `?status=` | `RubricSummary[]` |
| `POST /api/rubrics` | requireCoach | `{title, category, description, levels[], criteria[], descriptors[]}` | Rubric |
| `GET /api/rubrics/[id]` | requireCoach (owner) | — | Rubric + levels + criteria + descriptors |
| `PUT /api/rubrics/[id]` | requireCoach (owner) | idem POST | Rubric |
| `DELETE /api/rubrics/[id]` | requireCoach (owner) | — | 204 (soft: status=archived) |
| `GET /api/rubric-templates` | requireCoach | — | TemplateSummary[] |
| `GET /api/rubric-templates/[id]` | requireCoach | — | Template + levels + criteria + descriptors |
| `POST /api/rubrics/from-template` | requireCoach | `{templateId, title}` | Rubric (copia) |
| `GET /api/courses` | requireCoach | — | CourseSummary[] |
| `POST /api/courses` | requireCoach | `{name, period, description}` | Course (con inviteCode) |
| `GET /api/courses/[id]` | requireCoach (owner) | — | Course + students[] + rubrics[] |
| `PUT /api/courses/[id]` | requireCoach (owner) | `{name, period, description}` | Course |
| `DELETE /api/courses/[id]` | requireCoach (owner) | — | 204 |
| `GET /api/courses/[id]/students` | requireCoach (owner) | — | StudentSummary[] |
| `DELETE /api/courses/[id]/students/[studentId]` | requireCoach (owner) | — | 204 |
| `POST /api/courses/[id]/rubrics` | requireCoach (owner) | `{rubricId}` | course_rubric |
| `DELETE /api/courses/[id]/rubrics/[rubricId]` | requireCoach (owner) | — | 204 |
| `POST /api/courses/join` | requirePlayer | `{inviteCode}` | Course |
| `GET /api/evaluations` | requireCoach | `?courseId=&studentId=&status=` | EvaluationSummary[] |
| `POST /api/evaluations` | requireCoach | `{courseId, studentId, rubricId}` | Evaluation (draft) |
| `GET /api/evaluations/[id]` | requireCoach (teacher) | — | Evaluation + scores + rubric |
| `PUT /api/evaluations/[id]` | requireCoach (teacher) | `{scores[], globalComment}` | Evaluation |
| `POST /api/evaluations/[id]/publish` | requireCoach (teacher) | — | Evaluation (published) |
| `GET /api/student/courses` | requirePlayer | — | CourseSummary[] |
| `GET /api/student/evaluations` | requirePlayer | — | EvaluationSummary[] |
| `GET /api/student/evaluations/[id]` | requirePlayer (owner) | — | Evaluation + scores + rubric |

Todos los endpoints nuevos se documentan en `lib/api-docs/spec.ts` (paths + schemas).

## 7. Tests requeridos

| Tipo | Archivos | Cubre |
|------|----------|-------|
| Unit | `tests/unit/db/rubrics.test.ts`, `courses.test.ts`, `evaluations.test.ts`, `padel-profiles.test.ts` | queries + schema |
| Unit | `tests/unit/auth/padel-guards.test.ts` | requireCoach/requirePlayer (403, LOCKED, sin profile) |
| Unit | `tests/unit/validations/padel.test.ts` | Zod schemas (inviteCode PAD-XXXX, role, scores) |
| API guard | `tests/api/padel/guard.spec.ts` | 401/403 por endpoint protegido |
| API happy | `tests/api/padel/rubrics-happy.spec.ts`, `courses-happy.spec.ts`, `evaluations-happy.spec.ts`, `join-happy.spec.ts` | SQL real contra NeonDB (1 happy-path por endpoint) |
| E2E | `tests/e2e/register-role.spec.ts`, `rubric-editor.spec.ts`, `course-flow.spec.ts`, `evaluation-flow.spec.ts` | flujo feliz navegable (registro con rol, crear rúbrica, crear/unirse curso, evaluar) |

## 8. Estimación revisada

| Ítem | Cantidad |
|------|----------|
| Tablas nuevas | 14 (+3 enums) |
| Endpoints | 26 (3 modificados, 23 nuevos) |
| Componentes UI | ~16 pantallas + ~12 compartidos (rubric-editor, scoring-canvas, rubric-viewer, course-card, evaluation-card, empty/loading/error states) |
| Archivos de test | ~12 unit + ~5 API spec + 4 E2E |
| Migraciones | 1 (`0004_*`) + 1 seed script |

**Días (1 dev, con harness completo: tests + cobertura + docs)**:

| Fase | Alcance | Días |
|------|---------|------|
| 1. DB + auth | schema, migración, seed templates, register con rol, guards | 3-4 |
| 2. Rúbricas + Templates | CRUD + editor + from-template | 4-5 |
| 3. Cursos | CRUD + join + asignar rúbrica + estudiantes | 3-4 |
| 4. Evaluaciones | draft + scoring canvas + publish + historial | 5-6 |
| 5. Alumno + QA | vistas alumno, E2E, harness `--all`, release | 3-4 |
| **Total** | | **18-23 días (~4-5 semanas)** |

Con 2 devs en paralelo (DB+auth ∥ UI): ~2.5-3 semanas. El canvas de scoring en tiempo real (P09) es el item de mayor riesgo → prototipar primero.

## 9. Agentes requeridos y orden

| Orden | Agente | Entregables |
|-------|--------|-------------|
| 1 | @pm | feature-spec.md (16 pantallas, AC, edge cases) |
| 2 | @db-engineer | schema.ts + migración + seed + queries + unit tests |
| 3 | @auth-security | register con rol, padel-guards, auditoría, auth-impact.md |
| 4 | @app-engineer | APIs + páginas profesor/alumno + tests + api-docs |
| 5 | @ponytail-reviewer | revisión de simplicidad |
| 6 | @qa-release | E2E + test-matrix + release-report |

## 10. Archivos a tocar (change-map resumen)

| Archivo | Cambio | Líneas est. |
|---------|--------|-------------|
| `lib/db/schema.ts` | +14 tablas, +3 enums, +relations | +350 (split sugerido: `lib/db/schema/padel.ts`) |
| `lib/db/queries/padel/*.ts` | queries por módulo (rubrics, courses, evaluations) | ~400 |
| `lib/auth/padel-guards.ts` | requireCoach/requirePlayer | ~60 |
| `app/api/auth/register/route.ts` | +role, transacción profile | +30 |
| `app/api/padel/**` (23 routes) | endpoints nuevos | ~900 |
| `app/(app)/**` (13 páginas) | UI profesor + alumno | ~1800 |
| `components/padel/**` | ~12 componentes compartidos | ~800 |
| `lib/api-docs/spec.ts` | +26 paths | +400 |
| `scripts/seed-rubric-templates.ts` | seed | ~120 |
| `tests/**` | unit + API + E2E | ~1200 |
| `.env.example` | **sin cambios** (no hay vars nuevas) | 0 |