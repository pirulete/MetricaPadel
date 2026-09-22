# Feature Spec — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> status: proposed
> release: v0.2
> date: 2026-09-21
> change_id: etapa2-3-onboarding-dashboard
> module: auth+api+db+ui
> tags: [courses, onboarding, dashboard, enrollment, padel, db, migration, api, ui]

## Problema

Etapa 1 (v0.1, released) entregó el core evaluativo (rúbricas + evaluaciones) sin contexto: no hay forma de que un alumno se registre/loguee con UX real, ni cursos donde agrupar alumnos, ni hubs de navegación (home profesor/alumno), ni historial. El blueprint (`2026-09-20-rubricas-blueprint/mockup-phases.md`) clasifica auth + cursos como **PREREQUISITO** y dashboards/management como **MANAGEMENT**: sin ellos el producto no tiene onboarding ni organización. Los mockups `components/preview/etapa3-dashboard-management.tsx` (P01/A01/P06/P08/P10) ya existen; Etapa 2 (SCR-02/SCR-03/P05/P07/A02) no tiene mockup propio aún.

## Objetivo

Entregar el ciclo completo de vida del alumno y del coach: registro/login reales (SCR-02/SCR-03), cursos con código de invitación (P05/P07/A02), creación y asignación de rúbricas a cursos (P06/P08), homes con métricas (P01/A01) e historial de evaluaciones (P10). Reutiliza roles USER/ADMIN existentes (ADMIN = coach, USER = player) y las 6 tablas de Etapa 1.

## Alcance (10 pantallas: 5 Etapa 2 + 5 Etapa 3)

### Etapa 2 — Onboarding y Cursos

| Pantalla | Descripción | Rol |
|----------|-------------|-----|
| **SCR-02 Registro** | Formulario registro con selector de rol coach/player (segmented). El rol seleccionado mapea a ADMIN/USER del sistema | Público |
| **SCR-03 Login** | Login con email+password, link a registro, manejo de errores (credenciales inválidas, LOCKED) | Público |
| **P05 Cursos** | Lista de cursos del coach (cards con nombre, nº alumnos, horario, badge código invite), CTA crear curso, empty state | ADMIN |
| **P07 Detalle Curso** | Tabs Alumnos / Rúbricas asignadas, código invite con copiar, botones asignar rúbrica y evaluar | ADMIN |
| **A02 Unirse con código** | Modal/input PAD-XXXX para que el alumno se una a un curso; feedback de éxito/error | USER |

### Etapa 3 — Dashboard y Management

| Pantalla | Descripción | Rol |
|----------|-------------|-----|
| **P01 Home Profesor** | Header saludo + fecha, métricas (alumnos, evaluaciones, promedio), CTA "Evaluar ahora", lista "Mis cursos", bottom nav | ADMIN |
| **A01 Home Alumno** | Header saludo + nivel, CTA "Únete a un curso" (input código), notificaciones recientes, "Mis cursos", bottom nav | USER |
| **P06 Crear Curso** | Modal: nombre, nivel (Iniciación/Intermedio/Avanzado), horario, días de clase, código invite generado (PAD-XXXX) con copiar | ADMIN |
| **P08 Asignar Rúbrica** | Modal 2 pasos: 1) elegir rúbrica activa del coach, 2) seleccionar alumnos del curso; asigna a N alumnos | ADMIN |
| **P10 Historial** | Lista de evaluaciones del coach (alumno, rúbrica, curso, fecha, score, nivel), filtros, empty state | ADMIN |

## Roles y permisos

Se usa el sistema de roles existente (`user_role` enum `['USER','ADMIN']`). **No se crea `padel_role` ni `padel_profiles`** (decisión confirmada en Etapa 1).

| Rol de sistema | Rol de dominio | Permisos |
|----------------|----------------|----------|
| `ADMIN` | Coach / Profesor | Crear/editar/archivar cursos, ver código invite, asignar rúbricas a alumnos de sus cursos, ver home con métricas, ver historial de sus evaluaciones, evaluar |
| `USER` | Player / Alumno | Registrarse (SCR-02), loguearse (SCR-03), unirse a curso con código (A02), ver home alumno (A01), ver sus cursos y evaluaciones |
| `LOCKED` | — | Nunca permitido en rutas privadas |
| `TEMPORARY` | — | Registro crea TEMPORARY; requiere verificación de email antes de operar (flujo existente) |

Guards: `validateAdmin` para endpoints coach (courses, dashboard teacher, history); `validateUser` + ownership para endpoints alumno (`/api/student/*`, join). Ownership estricto (anti-IDOR): coach solo ve sus cursos; alumno solo ve sus cursos/evaluaciones. El registro público **nunca** puede crear ADMIN (solo USER/TEMPORARY); el rol ADMIN se asigna vía `POST /api/admin/users` (Etapa 1) o seed.

## Modelo de dominio

Derivado de los mockups (COURSES, STUDENTS, RUBRICS, HISTORY, NOTIFICATIONS, invite code PAD-XXXX). Cursos son **nuevos** en Etapa 2; dashboards son **vistas derivadas** de datos existentes (users, courses, enrollments, evaluations).

### Entidades nuevas

| Entidad | Campos | Notas |
|---------|--------|-------|
| `Course` | id, ownerId (FK users, no cascade), name, level (`iniciacion`/`intermedio`/`avanzado`), schedule (texto horario, ej "18:00"), days (jsonb array, ej ["Lun","Mié"]), inviteCode (varchar UNIQUE, formato `PAD-XXXX`), status (`active`/`archived`), createdAt, updatedAt | ownerId = ADMIN; archivar = soft (status=archived) |
| `CourseEnrollment` | id, courseId (FK cascade), studentId (FK users, no cascade), joinedAt | UNIQUE(courseId, studentId); studentId = USER |
| `CourseRubric` | id, courseId (FK cascade), rubricId (FK rubrics, no cascade), assignedById (FK users), assignedAt | UNIQUE(courseId, rubricId); asigna rúbrica activa del coach a un curso |

### Entidades existentes reutilizadas

| Entidad | Uso en Etapa 2/3 |
|---------|-------------------|
| `Rubric` | P08 selecciona rúbricas `active` del coach; P07 tab Rúbricas |
| `Evaluation` | P10 historial (filtro por teacherId + curso); P01 métrica "Evaluaciones"; A01 notificaciones de publicación |
| `EvaluationScore` | P01 métrica "Promedio" (avg totalScore/maxScore) |
| `User` | P08 selecciona alumnos (enrollments del curso); P01/A01 saludo y métricas |

### Métricas de dashboard (derivadas, sin tablas nuevas)

- **P01 Profesor**: `alumnos` = COUNT enrollments de sus cursos; `evaluaciones` = COUNT evaluations donde teacherId=me; `promedio` = AVG(totalScore/maxScore) de sus evaluaciones publicadas; `clases hoy` = cursos con día de hoy.
- **A01 Alumno**: `nivel` = nivel del primer curso activo del alumno; `notificaciones` = últimas N notificaciones del inbox existente (reutiliza `notifications`); `mis cursos` = enrollments activos.

### Reglas de negocio

- `inviteCode` se genera al crear curso (formato `PAD-` + 4 chars alfanuméricos, UNIQUE, case-insensitive lookup).
- Unirse a curso: código válido + curso `active` + alumno no ya inscrito → 201; código inválido → 404; ya inscrito → 409; curso archivado → 404.
- El coach **no** puede unirse a su propio curso con código (403/400).
- Asignar rúbrica (P08): solo rúbricas `active` del coach; solo alumnos inscritos en el curso; re-asignar misma rúbrica al curso → 409 (UNIQUE) o idempotente según decisión de @architect.
- Archivar curso: soft; enrollments y course_rubrics se conservan (FK cascade solo si se decide hard delete — no en este release).
- P10 historial: solo evaluaciones donde teacherId=me; filtros por curso/alumno/estado.
- Registro SCR-02: el selector de rol es UX; el backend **ignora** el rol del body y siempre crea USER/TEMPORARY (seguridad: nunca auto-ADMIN).

## Acceptance Criteria

### Etapa 2 (mínimo 5)

1. **Registro (SCR-02)**: un visitante puede registrarse con email+password+nombre; el selector de rol coach/player se muestra pero el backend crea siempre `USER`/`TEMPORARY` (nunca ADMIN); email duplicado → 400; rate limit aplica. → Unit (validación) + API happy-path SQL real + guard.
2. **Login (SCR-03)**: un usuario registrado y verificado puede loguearse; credenciales inválidas → 401; usuario LOCKED → bloqueado; link a registro. → API happy-path + guard + E2E.
3. **Crear curso (P06)**: ADMIN crea curso con nombre, nivel, horario, días y código invite `PAD-XXXX` generado automáticamente (UNIQUE); el código se muestra con botón copiar. → Unit (generación de código) + API happy-path + E2E.
4. **Lista de cursos (P05)**: ADMIN ve solo sus cursos (cards con nº alumnos, horario, badge código); empty state; CTA crear curso. → API happy-path + ownership (IDOR → 404) + E2E.
5. **Detalle curso (P07)**: ADMIN ve tabs Alumnos (enrollments) y Rúbricas asignadas; copia código invite; acceso a curso ajeno → 404. → API happy-path + guard.
6. **Unirse con código (A02)**: USER se une a un curso activo con código válido → 201 y aparece en "Mis cursos"; código inválido → 404; ya inscrito → 409; curso archivado → 404; coach uniéndose a su propio curso → 400. → API happy-path + edge cases + E2E.
7. **Guards y ownership**: sin sesión → 401 en todos los endpoints de cursos; USER en endpoints coach → 403; ADMIN en endpoints alumno → 403. → API guard tests.
8. **API docs**: todos los endpoints nuevos documentados en `lib/api-docs/spec.ts`. → Gate `--api-docs`.

### Etapa 3 (mínimo 5)

1. **Home Profesor (P01)**: ADMIN ve métricas reales (alumnos, evaluaciones, promedio) calculadas de DB, CTA "Evaluar ahora" → flujo P09, lista "Mis cursos", empty state sin cursos. → API happy-path + E2E.
2. **Home Alumno (A01)**: USER ve saludo, CTA unirse a curso, notificaciones recientes (inbox existente) y "Mis cursos"; empty states. → API happy-path + E2E.
3. **Asignar rúbrica (P08)**: ADMIN elige rúbrica activa + alumnos inscritos del curso y asigna (persiste `course_rubrics`); curso sin alumnos → empty state y botón deshabilitado; rúbrica ya asignada → 409 o idempotente. → Unit (query) + API happy-path + E2E.
4. **Historial (P10)**: ADMIN ve sus evaluaciones (alumno, rúbrica, curso, fecha, score, nivel) con filtros; empty state; solo evaluaciones propias (IDOR → 404). → API happy-path + guard.
5. **Métricas correctas**: promedio = AVG(totalScore/maxScore) de evaluaciones publicadas del coach; alumnos = COUNT enrollments de sus cursos; evaluaciones = COUNT propias. → Unit (queries de métricas).
6. **Guards y ownership**: sin sesión → 401; USER en dashboard/historial coach → 403; ADMIN en dashboard alumno → 403. → API guard tests.
7. **API docs**: endpoints nuevos en `lib/api-docs/spec.ts`. → Gate `--api-docs`.
8. **Calidad global**: `npx tsc --noEmit` 0 errores, ESLint 0 errores, build exitoso, cobertura sin regresión >3%. → Gates `--typecheck --lint --build --coverage`.

## Edge Cases

- Código invite duplicado al generar (colisión) → regenerar (retry) o 500 controlado.
- Código invite con mayúsculas/minúsculas → lookup case-insensitive.
- Curso sin alumnos al asignar rúbrica → empty state P08, botón deshabilitado.
- Alumno ya inscrito intenta unirse de nuevo → 409 con mensaje claro.
- Coach intenta unirse a su propio curso → 400.
- Curso archivado: no aparece en P05 activos ni acepta joins; historial de evaluaciones intacto.
- Coach sin cursos → empty state P01/P05.
- Alumno sin cursos → empty state A01.
- Coach sin evaluaciones → empty state P10.
- Promedio sin evaluaciones publicadas → 0 o "—" (no división por cero).
- Registro con email ya existente → 400 (flujo existente).
- Usuario TEMPORARY intenta operar → flujo de verificación de email existente (no bypass).
- Nivel de curso inválido → 400 (enum cerrado).
- Días de clase vacíos → permitido o 400 según decisión de @architect (mockup muestra selector multi-día).
- Asignar rúbrica archivada → 400 (solo `active`).
- Asignar rúbrica de otro coach → 404 (ownership).

## Out-of-Scope

- **Etapa 4**: Templates de rúbricas (P04, `rubric_templates` + seed) y Splash (SCR-01) — release futuro.
- **Etapa 5**: Admin CRUD de templates y gestión avanzada de usuarios (solo API, sin UI).
- **Notificaciones push al publicar evaluación** (el inbox existe; el trigger de evento `evaluation.published` es post-MVP).
- **Edición/borrado de enrollments por el alumno** (salir de curso) — post-MVP.
- **Pagos, planes, clases con pista/fecha real** (el mockup muestra "Pista 3" pero no hay entidad de clases).
- **`padel_role` / `padel_profiles`** — reemplazado por USER/ADMIN.
- **Snapshot de rúbrica al publicar** (post-MVP, ya documentado en Etapa 1).
- **Niveles editables de rúbrica** (escala fija 4 niveles).
- **Auto-registro con rol ADMIN** (seguridad: nunca).

## Dependencias

- Auth existente: `validateUser` / `validateAdmin` (`lib/auth/admin-guard.ts`), flujo register/signin/verify-email, auditoría (`lib/audit/helpers.ts`), `lib/api-docs/spec.ts`.
- Etapa 1: tablas `rubrics`/`evaluations`/`evaluation_scores`, queries `lib/db/queries/padel/*`, `POST /api/admin/users` (crear jugadores), guards de padel.
- **Nueva capacidad**: tablas `courses`, `course_enrollments`, `course_rubrics` + migración Drizzle vía `pnpm run db:generate` (nunca SQL a mano) + `db:migrate` + verificación de columnas post-migración.
- Patrón a seguir: queries puras en `lib/db/queries/padel/`, validaciones Zod en `lib/validations/padel.ts`, guards server-side + auditoría en mutaciones (crear/editar/archivar curso, join, asignar rúbrica).
- Mockups: `components/preview/etapa3-dashboard-management.tsx` (P01/A01/P06/P08/P10) como referencia de UI; Etapa 2 sin mockup → @ui-designer puede generar `components/preview/etapa2-onboarding-cursos.tsx` si se requiere antes de implementar.

## Tests Requeridos

| Tipo | Archivos | Cubre |
|------|----------|-------|
| Unit | `tests/unit/db/courses.test.ts` | schema + queries (CRUD, enrollments, course_rubrics, ownership filters, métricas) |
| Unit | `tests/unit/validations/padel.test.ts` (ampliar) | Zod: course create/update, join, assign rubric, list queries |
| Unit | `tests/unit/padel/course-code.test.ts` | generación/validación de inviteCode (formato, colisión, case-insensitive) |
| Unit | `tests/unit/padel/dashboard.test.ts` | métricas P01/A01 (counts, promedio, sin división por cero) |
| API guard | `tests/api/padel/courses-guard.spec.ts` | 401/403 por endpoint (admin vs user vs sin sesión) |
| API happy | `tests/api/padel/courses-happy.spec.ts`, `dashboard-happy.spec.ts`, `history-happy.spec.ts`, `join-happy.spec.ts` | SQL real contra NeonDB (1 happy-path por endpoint + edge cases join) |
| E2E | `tests/e2e/onboarding.spec.ts` (registro→login), `course-flow.spec.ts` (crear curso→join→asignar rúbrica), `dashboard.spec.ts` (P01/A01/P10) | flujo feliz navegable |

## Archivos Estimados (referencia para @architect)

- `lib/db/schema.ts` (+3 tablas, +1 enum `course_level`, +1 enum `course_status`) o split `lib/db/schema/padel.ts`
- `lib/db/queries/padel/courses.ts`, `dashboard.ts` (métricas)
- `app/api/courses/**` (GET/POST, [id] GET/PUT/DELETE, [id]/rubrics, join), `app/api/dashboard/**` (teacher/student), `app/api/history/**` (~12-15 routes)
- `app/(app)/cursos/**`, `app/(app)/dashboard/**` o integración en `app/(app)/` existente, `app/(public)/register` + `login` (SCR-02/SCR-03 reales)
- `components/padel/**` (course-card, course-detail, join-modal, create-course-modal, assign-rubric-modal, history-list, dashboard-metrics)
- `lib/api-docs/spec.ts` (+paths/schemas)
- `tests/**` (unit + API + E2E)