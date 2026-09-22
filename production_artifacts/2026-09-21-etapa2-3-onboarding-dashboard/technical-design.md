# Technical Design — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> status: proposed
> release: v0.2
> date: 2026-09-21
> change_id: etapa2-3-onboarding-dashboard
> module: auth+api+db+ui
> tags: [courses, onboarding, dashboard, enrollment, padel, db, migration, api, ui]
> source: feature-spec.md + release-scope.md (misma carpeta)

## 1. Resumen

Segundo release del core evaluativo: onboarding real (SCR-02/SCR-03), cursos con código de invitación (P05/P06/P07/A02), homes con métricas (P01/A01), asignación de rúbricas a cursos (P08) e historial (P10). Reutiliza roles USER/ADMIN existentes (ADMIN=coach, USER=player), guards `validateUser`/`validateAdmin`/`guardUser`/`guardAdmin`, auditoría `lib/audit/helpers.ts` y el patrón queries puras + validaciones Zod + route handlers de Etapa 1.

## 2. Decisiones de arquitectura (ADR)

| # | Decisión | Justificación |
|---|----------|---------------|
| D1 | **`evaluations.courseId` nullable (FK courses, onDelete set null)** — desviación menor del release-scope ("sin cambios en tablas de Etapa 1") | P10 exige columna "curso" y filtro por curso; derivar vía `course_rubrics` es ambiguo (una rúbrica puede estar en N cursos). Cambio aditivo y retrocompatible: columnas existentes intactas, `courseId` opcional en create. Habilita P09 filtrado por curso post-MVP. |
| D2 | **P08 re-asignar misma rúbrica al curso → 409** (no idempotente) | Consistente con join 409; UNIQUE(courseId, rubricId) en DB. UI deshabilita rúbricas ya asignadas en paso 1 del modal. |
| D3 | **Días de clase vacíos → permitido** (jsonb default `[]`) | El mockup muestra selector multi-día; `schedule` (texto) es el dato principal. Evita 400 innecesario. |
| D4 | **inviteCode**: `PAD-` + 4 chars alfanuméricos, almacenado en mayúsculas; lookup case-insensitive (`upper()`); retry ≤5 en colisión, luego 500 controlado | UNIQUE en DB; normalización en `lib/padel/course-code.ts` (lógica pura testeable). |
| D5 | **`/dashboard` = una sola ruta** que ramifica por rol (P01 si ADMIN, A01 si USER) | Evita redirects y duplica layout; `validateUser` en `(app)/layout` ya cubre 401/LOCKED. Los endpoints API sí llevan guard de rol estricto. |
| D6 | **Registro SCR-02**: se agrega `role?: 'coach'|'player'` al schema del body pero el handler **lo ignora**; `createUser` siempre crea USER/TEMPORARY | Seguridad: nunca auto-ADMIN. El selector es UX pura. |
| D7 | **Archivar curso = soft** (`status='archived'`); enrollments/course_rubrics se conservan | Historial protegido; sin hard delete en este release. |
| D8 | **P10 historial**: solo `teacherId=me`; filtros `courseId`, `studentId`, `status`; join con `evaluations.courseId` para nombre de curso | Anti-IDOR por teacherId (404 si no es propio). |

## 3. Impacto en DB (migración `0005_*` vía `pnpm run db:generate`)

### Enums nuevos (2)
- `course_level` = `['iniciacion', 'intermedio', 'avanzado']`
- `course_status` = `['active', 'archived']`

### Tablas nuevas (3) — en `lib/db/schema.ts` (excepción 500 líneas permitida)

**`courses`**
| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid PK defaultRandom | |
| ownerId | uuid FK users **no cascade** | = ADMIN (coach) |
| name | varchar(200) notNull | |
| level | course_level notNull | |
| schedule | varchar(100) | texto horario, ej "18:00" |
| days | jsonb notNull default `[]` | ej `["Lun","Mié"]` |
| inviteCode | varchar(10) notNull UNIQUE | `PAD-XXXX` mayúsculas |
| status | course_status notNull default 'active' | |
| createdAt / updatedAt | timestamp defaultNow | |

Índices: `courses_owner_idx` (ownerId), `courses_invite_code_idx` UNIQUE.

**`course_enrollments`**
| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid PK | |
| courseId | uuid FK courses **cascade** | |
| studentId | uuid FK users **no cascade** | = USER (player) |
| joinedAt | timestamp defaultNow | |

UNIQUE `course_enrollments_course_student_idx` (courseId, studentId); índices `course_enrollments_course_idx`, `course_enrollments_student_idx`.

**`course_rubrics`**
| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid PK | |
| courseId | uuid FK courses **cascade** | |
| rubricId | uuid FK rubrics **no cascade** | historial protegido |
| assignedById | uuid FK users no cascade | coach que asigna |
| assignedAt | timestamp defaultNow | |

UNIQUE `course_rubrics_course_rubric_idx` (courseId, rubricId); índice `course_rubrics_course_idx`.

### Cambio aditivo en tabla existente
- `evaluations.courseId` uuid nullable FK courses `onDelete: set null` (D1). Sin cambios en rubrics/evaluation_scores.

### Relations
- `coursesRelations` (owner, enrollments, rubrics), `courseEnrollmentsRelations` (course, student), `courseRubricsRelations` (course, rubric, assignedBy); extender `usersRelations` (courses, enrollments) y `rubricsRelations` (courseRubrics).

### Post-migración
- `pnpm run db:migrate` + verificación de columnas (`SELECT column_name FROM information_schema.columns WHERE table_name='courses' AND column_name='invite_code'`, etc.) y orden cronológico en `drizzle/meta/_journal.json`.

## 4. Contratos API (contract-first)

Convenciones: errores `{ error: string, details?: ... }`; ownership roto → **404** (no 403); guard falla → 401/403; mutaciones sensibles auditan (`course`, `course_enrollment`, `course_rubric`).

### 4.1 Auth (ampliación)
**`POST /api/auth/register`** (existente, ampliar)
- Body: `{ email, password, firstName, lastName?, role?: 'coach'|'player' }` — `role` **ignorado** (D6).
- Respuestas: 201 `{ success, message, email }`; 400 email duplicado/datos inválidos; 429 rate limit.
- Sin cambios en signin/verify-email.

### 4.2 Cursos (coach, guardAdmin + ownership ownerId)
| Método + Path | Body/Query | 200/201 | Errores |
|---------------|-----------|---------|---------|
| `GET /api/courses` | — | `{ courses: CourseListItem[] }` (id, name, level, schedule, days, inviteCode, status, studentCount) | 401, 403 |
| `POST /api/courses` | `{ name, level, schedule?, days? }` | 201 `{ course: CourseDto }` (inviteCode generado) | 400, 401, 403, 500 (colisión tras 5 retries) |
| `GET /api/courses/{id}` | — | `{ course: CourseDetail }` (course + students[] + rubrics[]) | 400, 401, 403, 404 |
| `PUT /api/courses/{id}` | `{ name?, level?, schedule?, days? }` | `{ course: CourseDto }` | 400, 401, 403, 404 |
| `DELETE /api/courses/{id}` | — | `{ course: { id, status: 'archived' } }` (soft) | 400, 401, 403, 404 |
| `POST /api/courses/{id}/rubrics` | `{ rubricId }` | 201 `{ assignment: CourseRubricDto }` | 400 (rúbrica no active/ajena), 401, 403, 404, 409 (ya asignada, D2) |
| `GET /api/courses/{id}/rubrics` | — | `{ rubrics: CourseRubricDto[] }` | 400, 401, 403, 404 |

### 4.3 Join (alumno, guardUser)
**`POST /api/courses/join`**
- Body: `{ inviteCode }` (case-insensitive).
- 201 `{ enrollment: { courseId, courseName, joinedAt } }`; 400 coach uniéndose a su propio curso; 404 código inválido o curso archivado; 409 ya inscrito; 401/403 guard.
- Audita CREATE `course_enrollment`.

### 4.4 Dashboard (derivado, sin tablas nuevas)
**`GET /api/dashboard/teacher`** (guardAdmin)
- 200 `{ metrics: { students, evaluations, average, classesToday }, courses: CourseListItem[] }`
- `students` = COUNT enrollments de sus cursos; `evaluations` = COUNT evaluations teacherId=me; `average` = AVG(totalScore/maxScore) de publicadas (COALESCE → null si no hay, UI muestra "—"); `classesToday` = cursos con día de hoy en `days`.

**`GET /api/dashboard/student`** (guardUser)
- 200 `{ level: CourseLevel \| null, courses: StudentCourseListItem[], notifications: NotificationDto[] }` (últimas 5 del inbox existente, reutiliza query de notifications).

### 4.5 Historial (coach, guardAdmin + teacherId)
**`GET /api/history`**
- Query: `?courseId=&studentId=&status=draft|published`
- 200 `{ evaluations: HistoryItem[] }` — id, studentName, rubricTitle, courseName (via `evaluations.courseId`, D1), date, totalScore, maxScore, level (derivado de ratio), status.
- 400 query inválida; 401; 403.

### 4.6 Retrocompatibilidad
- Ningún endpoint existente cambia su contrato. `POST /api/auth/register` solo agrega campo opcional ignorado. `POST /api/evaluations` acepta `courseId?` opcional (D1) sin romper clientes actuales.

## 5. Impacto en Auth

- **Sin cambios en `auth.ts` ni guards**: se reutilizan `validateUser`/`validateAdmin`/`guardUser`/`guardAdmin` (`lib/auth/admin-guard.ts`).
- **Registro nunca-ADMIN** (D6): el handler ignora `role` del body; `createUser` sigue creando USER/TEMPORARY. Documentar en `auth-impact.md` y `security-checklist.md`.
- **Estados**: rutas privadas admiten ACTIVE (y TEMPORARY solo para el flujo de verificación existente); LOCKED nunca permitido (guard existente).
- **Auditoría**: `auditCreate`/`auditUpdate`/`auditDelete` en crear/editar/archivar curso, join, asignar rúbrica.
- **Anti-IDOR**: toda query de cursos recibe `ownerId`; join valida que el coach no se una a su propio curso (400); historial filtra por `teacherId`.

## 6. Impacto en UI (10 pantallas)

### Público (`app/(public)`)
- `register/page.tsx` — SCR-02: formulario real + segmented coach/player (UX; backend siempre USER). Reutiliza UI kit (Card/Input/Button/Label).
- `login/page.tsx` — SCR-03: formulario real, errores 401/LOCKED, link a registro.

### Privada (`app/(app)`)
- `dashboard/page.tsx` — reemplaza placeholder: ramifica por rol (D5). ADMIN → P01 (métricas + CTA "Evaluar ahora" → `/evaluar` + "Mis cursos" + bottom nav); USER → A01 (saludo + nivel + CTA unirse + notificaciones + "Mis cursos" + bottom nav).
- `cursos/page.tsx` — P05: lista cards (nombre, nº alumnos, horario, badge código), CTA crear (abre modal P06), empty state.
- `cursos/[id]/page.tsx` — P07: tabs Alumnos / Rúbricas asignadas, código invite con copiar, botones "Asignar rúbrica" (P08) y "Evaluar" (→ `/evaluar?courseId=`).
- `historial/page.tsx` — P10: lista con filtros (curso/alumno/estado), empty state.

### Componentes (`components/padel/`)
- `course-card.tsx`, `course-detail.tsx` (tabs), `create-course-modal.tsx` (P06), `join-course-modal.tsx` (A02), `assign-rubric-modal.tsx` (P08, 2 pasos), `history-list.tsx` (P10), `dashboard-metrics.tsx` (P01), `teacher-dashboard.tsx` + `student-dashboard.tsx` (P01/A01), `bottom-nav.tsx` (compartido).
- Sin componentes nuevos del UI kit: Button/Card/Badge/Tabs/Input/Textarea/Label/Select/Separator existentes (validado en mockup Etapa 3).

## 7. Lógica pura y queries

- `lib/padel/course-code.ts` — `generateInviteCode()` (PAD-XXXX, retry), `normalizeInviteCode()` (upper), `isValidInviteCode()`.
- `lib/padel/dashboard.ts` — `computeAverage(totalScore, maxScore)` (null si sin publicadas), `deriveLevel(ratio)` (mapeo a nivel de curso), `isClassToday(days)`.
- `lib/db/queries/padel/courses.ts` — `createCourse`, `listCourses(ownerId)`, `getCourseById(ownerId, id)` (con students+rubrics), `updateCourse`, `archiveCourse`, `getCourseByInviteCode`, `joinCourse(studentId, inviteCode)` (transacción + validaciones), `listStudentCourses(studentId)`, `listCourseStudents(courseId)`, `assignRubricToCourse`, `listCourseRubrics(courseId)`.
- `lib/db/queries/padel/dashboard.ts` — `getTeacherDashboard(teacherId)`, `getStudentDashboard(studentId)`.
- `lib/db/queries/padel/history.ts` — `listHistory(teacherId, filters)`.
- Exportar desde `lib/db/queries/padel/index.ts`.

## 8. Validaciones Zod (`lib/validations/padel.ts`)

- `courseCreateSchema` (`name` 1-200, `level` enum, `schedule` ≤100 opcional, `days` array de strings ≤7 opcional).
- `courseUpdateSchema` = partial.
- `courseJoinSchema` (`inviteCode` regex `^PAD-[A-Z0-9]{4}$` tras normalizar).
- `courseRubricAssignSchema` (`rubricId` uuid).
- `historyQuerySchema` (`courseId`/`studentId` uuid opcionales, `status` enum opcional).
- `courseIdParamsSchema` (reutiliza `padelIdParamsSchema`).

## 9. Tests requeridos (mapeo)

| Tipo | Archivo | Cubre |
|------|---------|-------|
| Unit | `tests/unit/db/courses.test.ts` | schema + queries (CRUD, enrollments, course_rubrics, ownership, join edge cases, métricas) |
| Unit | `tests/unit/padel/course-code.test.ts` | generación/validación inviteCode (formato, colisión, case-insensitive) |
| Unit | `tests/unit/padel/dashboard.test.ts` | métricas P01/A01 (counts, average null, deriveLevel, isClassToday) |
| Unit | `tests/unit/validations/padel.test.ts` (ampliar) | course create/update/join/assign/history schemas |
| API guard | `tests/api/padel/courses-guard.spec.ts` | 401/403 por endpoint (sin sesión / USER en coach / ADMIN en alumno) |
| API happy | `tests/api/padel/courses-happy.spec.ts` | SQL real: list/create/detail/update/archive + rubrics assign |
| API happy | `tests/api/padel/join-happy.spec.ts` | join 201 + edge cases 404/409/400 |
| API happy | `tests/api/padel/dashboard-happy.spec.ts` | teacher + student con SQL real |
| API happy | `tests/api/padel/history-happy.spec.ts` | historial + filtros + IDOR 404 |
| E2E | `tests/e2e/onboarding.spec.ts` | registro→login (SCR-02/SCR-03) |
| E2E | `tests/e2e/course-flow.spec.ts` | crear curso→join→asignar rúbrica (P06/A02/P08) |
| E2E | `tests/e2e/dashboard.spec.ts` | P01/A01/P10 navegable |

Gate `--coverage`: sin regresión >3% en módulos afectados (padel, auth).

## 10. API Docs (`lib/api-docs/spec.ts`)

- Nuevo `lib/api-docs/paths/courses.ts` (tags `Padel Courses` + `Padel Student`) y `lib/api-docs/schemas/courses.ts` (CourseDto, CourseListItem, CourseDetail, CourseRubricDto, EnrollmentDto, TeacherDashboardDto, StudentDashboardDto, HistoryItemDto, CourseInput, JoinInput, RubricAssignInput).
- Actualizar `spec.ts`: imports, tags, paths; ampliar descripción de `POST /api/auth/register` (campo `role` ignorado) y `POST /api/evaluations` (`courseId` opcional).
- Gate `--api-docs`: ~13 endpoints nuevos documentados.

## 11. Variables de entorno

- **Sin variables nuevas**. Verificar `.env.example` sin cambios (no se requieren VAPID/Resend adicionales; el inbox de notificaciones ya existe).

## 12. Documentación

- `ARCHITECTURE.md`: actualizar sección "Padel Evaluativo" (tablas courses/enrollments/course_rubrics, `evaluations.courseId`, endpoints, migración 0005).
- `FEATURES.md`: entrada con metadata del change_id al cierre.
- `AGENTS.md`: sin cambios (no cambian roles/workflows/gates).

## 13. Agentes y orden de ejecución

| Orden | Agente | Responsabilidad |
|-------|--------|-----------------|
| 0 (opcional) | @ui-designer | Mockup Etapa 2 (`components/preview/etapa2-onboarding-cursos.tsx`) si se requiere antes de implementar; no bloqueante |
| 1 | @db-engineer | schema.ts (+3 tablas, +2 enums, evaluations.courseId), `db:generate` → `0005_*`, `db:migrate` + verificación, queries courses/dashboard/history, unit tests, db-plan.md + migration-notes.md |
| 2 | @auth-security | Validar guards, registro nunca-ADMIN (D6), auditoría, auth-impact.md + security-checklist.md |
| 3 | @app-engineer | Route handlers (courses, join, dashboard, history), register ampliado, 10 pantallas, componentes padel, api-docs, unit/API/E2E tests, app-notes.md |
| 4 | @ponytail-reviewer | Revisión de simplicidad (ponytail-review-report.md) |
| 5 | @qa-release | E2E final, test-matrix.md, acceptance-criteria.md, release-report.md, evidence-manifest.json |

Cross-agent review: se activa (>5 archivos) — @app-engineer valida viabilidad, genera design-review.md si hay observaciones.

## 14. Rollout y riesgos

1. DB (migración + queries) → 2. Auth (guards/registro) → 3. API + UI + tests → 4. Ponytail → 5. QA.
- Riesgo alto: registro con selector de rol sugiere auto-ADMIN → mitigado por D6 + auth-impact.
- Riesgo medio: promedio sin publicadas → `average: null` + UI "—".
- Riesgo medio: P08 asigna rúbrica pero no crea evaluaciones → `course_rubrics` persiste; P09 filtra por curso post-MVP.
- Riesgo bajo: colisión inviteCode → retry ≤5 + UNIQUE.
- Métricas loop: `node scripts/loop-metrics.js --record etapa2-3-onboarding-dashboard --iterations <n> --gates-failed <n> --module dashboard`.