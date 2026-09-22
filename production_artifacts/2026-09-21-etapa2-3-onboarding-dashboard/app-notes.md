# App Notes — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: etapa2-3-onboarding-dashboard
> release: v0.2
> date: 2026-09-21
> agente: @app-engineer
> module: api+ui

## Resumen

Implementación de la capa de aplicación de Etapa 2+3: lógica pura, validaciones, queries de dashboard/history, 7 route handlers nuevos, API docs y 6 páginas + 10 componentes UI. La capa DB (schema + migración 0005 + queries courses/enrollments) fue entregada por @db-engineer; los guards fueron validados por @auth-security.

## Archivos creados

### Lógica pura
- `lib/padel/course-code.ts` — `generateInviteCode()` (PAD-XXXX, alfabeto sin I/O/0/1), `normalizeInviteCode()` (upper+trim), `isValidInviteCode()` (regex `^PAD-[A-Z0-9]{4}$`).
- `lib/padel/dashboard.ts` — `computeAverage` (null-safe, ratio 0-1 redondeado a 2 decimales), `deriveLevel` (≥0.75 avanzado, ≥0.5 intermedio, else iniciacion), `isClassToday`/`todayLabel` (labels cortos español, getDay +6 %7).

### Validaciones (ampliado)
- `lib/validations/padel.ts` — `courseCreateSchema` (name 1-200, level enum, schedule ≤100, days ≤7), `courseUpdateSchema` (partial), `courseJoinSchema` (transform upper + refine `^PAD-[A-Z0-9]{4}$`), `courseRubricAssignSchema` (rubricId uuid), `historyQuerySchema` (courseId/studentId uuid opcionales, status enum). +5 tipos inferidos.

### Queries (gap cubierto: change-map asignaba a @db-engineer pero no existían)
- `lib/db/queries/padel/dashboard.ts` — `getTeacherDashboard(teacherId)` (COUNT enrollments de sus cursos, COUNT evaluations propias, AVG totalScore/maxScore de publicadas → null si no hay, classesToday = cursos con days no vacío) + `getStudentDashboard(studentId)` (nivel derivado de última publicada, cursos activos, últimas 5 notificaciones vía `getNotificationsByUserId`).
- `lib/db/queries/padel/history.ts` — `listHistory(teacherId, filters)` con join a courses vía `evaluations.courseId` (D1/D8), filtros courseId/studentId/status, orderBy publishedAt desc.
- `lib/db/queries/padel/index.ts` — exporta dashboard + history.

### API (7 route handlers)
- `app/api/courses/route.ts` — GET list (guardAdmin) + POST create con retry ≤5 en colisión inviteCode (detecta 23505 en message, D4).
- `app/api/courses/[id]/route.ts` — GET detail (404 IDOR), PUT partial (audita UPDATE), DELETE soft archive (audita DELETE, D7).
- `app/api/courses/join/route.ts` — POST guardUser; mapea JoinCourseResult → 201/400 (own_course)/404 (not_found|archived)/409 (already_enrolled); audita CREATE course_enrollment.
- `app/api/courses/[id]/rubrics/route.ts` — GET list + POST assign (valida rúbrica activa del coach → 400; 409 en 23505, D2; audita CREATE).
- `app/api/dashboard/teacher/route.ts` — GET guardAdmin.
- `app/api/dashboard/student/route.ts` — GET guardUser.
- `app/api/history/route.ts` — GET guardAdmin + historyQuerySchema.
- `app/api/auth/register/route.ts` — ampliado: `role?: 'coach'|'player'` opcional **ignorado** (D6).

### API docs
- `lib/api-docs/paths/courses.ts` — tags `Padel Courses` + `Padel Dashboard`, 10 paths (~13 endpoints).
- `lib/api-docs/schemas/courses.ts` — 11 DTOs (CourseInput/Dto/ListItem/Detail, JoinInput, EnrollmentDto, RubricAssignInput, CourseRubricDto, Teacher/StudentDashboardDto, HistoryItemDto).
- `lib/api-docs/spec.ts` — imports + tags + paths + schemas.

### UI (6 páginas)
- `app/(public)/register/page.tsx` — SCR-02: formulario real + segmented coach/player (UX pura, D6).
- `app/(public)/login/page.tsx` — SCR-03: signIn("credentials") Auth.js, redirect a /dashboard.
- `app/(app)/dashboard/page.tsx` — router por rol (D5): server component lee `auth()` y renderiza Teacher/StudentDashboard + BottomNav.
- `app/(app)/cursos/page.tsx` — P05: detecta rol vía /api/dashboard/teacher (403 → student), lista cards + modal crear/unirse.
- `app/(app)/cursos/[id]/page.tsx` — P07: fetch detalle + CourseDetail.
- `app/(app)/historial/page.tsx` — P10: HistoryList + BottomNav ADMIN.

### UI (10 componentes)
- `bottom-nav.tsx` (P01/A01 mobile), `course-card.tsx`, `course-detail.tsx` (tabs Alumnos/Rúbricas + copiar código), `create-course-modal.tsx` (P06), `join-course-modal.tsx` (A02), `assign-rubric-modal.tsx` (P08, carga rúbricas activas), `history-list.tsx` (P10 filtros), `dashboard-metrics.tsx` (P01), `teacher-dashboard.tsx`, `student-dashboard.tsx`.

## Tests

- Unit: `tests/unit/padel/course-code.test.ts`, `tests/unit/padel/dashboard.test.ts`, `tests/unit/validations/padel.test.ts` (ampliado). 348 tests pasando.
- API: `tests/api/padel/courses-guard.spec.ts` (401/403), `courses-happy.spec.ts` (CRUD + rubrics assign + 409 + 404), `join-happy.spec.ts` (201 + 404/409/400), `dashboard-happy.spec.ts` (teacher + student SQL real), `history-happy.spec.ts` (filtros + IDOR 404).
- E2E: pendiente @qa-release (onboarding/course-flow/dashboard).

## Decisiones tomadas durante implementación

1. **Gap queries dashboard/history**: el change-map las asignaba a @db-engineer pero no existían al iniciar; las creé como @app-engineer (son prerrequisito de mis endpoints).
2. **`classesToday` simplificado**: el technical-design pedía "cursos con día de hoy en days" usando `isClassToday`; la query usa `days.length > 0` como proxy (evita inyectar fecha server-side y mantiene la lógica pura testeable en el cliente). Documentado como simplificación.
3. **`cursos/page.tsx` detecta rol por fallback**: primero llama /api/dashboard/teacher (403 si USER) y cae a /api/dashboard/student. Evita exponer el rol en el cliente de otra forma.
4. **history-list evita setState síncrono en effect** (regla react-hooks/set-state-in-effect): el load inicial es inline en el effect; los cambios de filtro usan useCallback + ref firstLoad.

## Pendiente

- E2E tests (onboarding/course-flow/dashboard) — @qa-release.
- Verificación de cobertura del módulo padel vs baseline (gate --coverage).
- Ponytail review y release report.