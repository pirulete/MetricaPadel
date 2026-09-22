# Auth Impact — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: etapa2-3-onboarding-dashboard
> module: auth
> date: 2026-09-21
> status: in-progress

## 1. Resumen de impacto en autenticación

No se modifican `auth.ts` ni los guards existentes (`validateUser`/`validateAdmin`/`guardUser`/`guardAdmin` en `lib/auth/admin-guard.ts`). Se reutilizan tal cual. El impacto se concentra en: (a) registro nunca-ADMIN, (b) rutas protegidas nuevas para cursos/join/dashboard/historial, (c) auditoría de mutaciones, (d) anti-IDOR por ownership.

## 2. Registro nunca-ADMIN (D6) — VERIFICADO

**Estado actual del código (verificado en `app/api/auth/register/route.ts` + `lib/db/queries/auth.ts`):**

- `registerSchema` (Zod) NO incluye campo `role`. Solo `email`, `password`, `firstName`, `lastName`.
- `createUser(email, firstName, lastName, password, status="TEMPORARY")` **no acepta parámetro `role`** — no hay forma de pasar un rol desde el handler.
- La tabla `users` tiene `role: userRoleEnum("role").notNull().default('USER')` — el default de DB es `USER`.
- Resultado: **todo registro público crea USER/TEMPORARY. Es imposible auto-ADMIN por esta vía.**

**Requisito para @app-engineer al ampliar el handler (SCR-02):**
- El schema del body puede agregar `role: z.enum(['coach','player']).optional()` — **UX pura**.
- El handler DEBE ignorar el campo: no pasarlo a `createUser`, no persistirlo, no derivar rol de él.
- No cambiar la firma de `createUser` para aceptar rol. Si se necesita, usar un wrapper que descarte `role` explícitamente.
- El único camino a ADMIN sigue siendo: seed/script interno o `POST /api/admin/users` (guardAdmin, solo ADMIN existente).

## 3. Rutas protegidas nuevas (`lib/auth/protected-routes.ts`)

Se agregaron 11 entradas (referencia para route handlers, no middleware automático):

| Endpoint | Guard | Estados | Roles | Ownership |
|----------|-------|---------|-------|-----------|
| `GET /api/courses` | guardAdmin | ACTIVE | ADMIN | ownerId=me |
| `POST /api/courses` | guardAdmin | ACTIVE | ADMIN | ownerId=me |
| `GET /api/courses/[id]` | guardAdmin | ACTIVE | ADMIN | ownerId=me, 404 si ajeno |
| `PUT /api/courses/[id]` | guardAdmin | ACTIVE | ADMIN | ownerId=me, 404 si ajeno |
| `DELETE /api/courses/[id]` | guardAdmin | ACTIVE | ADMIN | ownerId=me, 404 si ajeno (soft) |
| `POST /api/courses/[id]/rubrics` | guardAdmin | ACTIVE | ADMIN | ownerId=me, 404 si ajeno |
| `GET /api/courses/[id]/rubrics` | guardAdmin | ACTIVE | ADMIN | ownerId=me, 404 si ajeno |
| `POST /api/courses/join` | guardUser | ACTIVE | — | alumno; 400 own_course, 404, 409 |
| `GET /api/dashboard/teacher` | guardAdmin | ACTIVE | ADMIN | teacherId=me |
| `GET /api/dashboard/student` | guardUser | ACTIVE | — | studentId=me |
| `GET /api/history` | guardAdmin | ACTIVE | ADMIN | teacherId=me |

Principios respetados: LOCKED nunca permitido (guard existente); TEMPORARY no admitido en estos endpoints (solo el flujo de verificación existente); rutas de coach exigen ADMIN+ACTIVE.

## 4. Ownership de cursos — VERIFICADO (anti-IDOR)

Verificado en `lib/db/queries/padel/courses.ts` y `enrollments.ts`:

- `listCourses(ownerId)` → `WHERE courses.ownerId = ownerId`.
- `getCourseById(ownerId, id)` → `WHERE id AND ownerId` → null si ajeno → 404 (no 403).
- `updateCourse(ownerId, id, data)` → `WHERE id AND ownerId` → null si ajeno.
- `archiveCourse(ownerId, id)` → `WHERE id AND ownerId` → null si ajeno.
- `joinCourse(studentId, inviteCode)` → transacción: valida `course.ownerId === studentId` → `own_course` (400); curso `status !== 'active'` → `archived` (404); ya inscrito → `already_enrolled` (409). UNIQUE(courseId, studentId) respalda en DB.
- `listStudentCourses(studentId)` → solo cursos activos del alumno.
- `assignRubricToCourse(courseId, rubricId, assignedById)` → el route handler debe validar antes: curso propio (ownerId) y rúbrica propia + `status='active'` (404 si no); UNIQUE(courseId, rubricId) → 409 (D2).

**Requisito para @app-engineer:** en `POST /api/courses/[id]/rubrics`, validar ownership del curso Y de la rúbrica antes de insertar; traducir error de constraint UNIQUE a 409.

## 5. Auditoría requerida

Mutaciones sensibles que DEBEN auditarse vía `lib/audit/helpers.ts` (entity names consistentes con Etapa 1):

| Acción | Helper | Entity |
|--------|--------|--------|
| Crear curso | `auditCreate` | `course` |
| Editar curso | `auditUpdate` | `course` |
| Archivar curso | `auditDelete` | `course` (metadata archive) |
| Join a curso | `auditCreate` | `course_enrollment` |
| Asignar rúbrica a curso | `auditCreate` | `course_rubric` |

Contexto: `{ userId: session.user.id, ...extractRequestContext(request) }` (patrón existente en rubrics/evaluations).

## 6. Estados de usuario por ruta

- Cursos/join/dashboard/historial: **solo ACTIVE**.
- LOCKED: bloqueado por guard existente (401/403).
- TEMPORARY: no accede a estos endpoints; solo al flujo de verificación existente (verify-email/resend-code).

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Selector coach/player en registro sugiere auto-ADMIN | D6: handler ignora `role`; `createUser` no acepta rol; default DB `USER`. Documentado aquí y en security-checklist. |
| IDOR en cursos (alumno lee curso ajeno) | Todos los endpoints de coach scoped por `ownerId`; join solo por inviteCode; 404 en vez de 403. |
| Coach se une a su propio curso | `joinCourse` valida `ownerId === studentId` → 400. |
| Re-asignar rúbrica | UNIQUE(courseId, rubricId) → 409 (D2). |
| InviteCode adivinable | `PAD-XXXX` (4 chars alfanuméricos = 36^4 ≈ 1.6M combinaciones) + UNIQUE + lookup case-insensitive. Riesgo residual bajo; aceptado para MVP. |
| Archivar curso con historial | Soft delete (D7): enrollments/course_rubrics/evaluations se conservan. |

## 8. Archivos tocados por @auth-security

- `lib/auth/protected-routes.ts` — 11 rutas nuevas documentadas.
- `production_artifacts/2026-09-21-etapa2-3-onboarding-dashboard/auth-impact.md` — este archivo.
- `production_artifacts/2026-09-21-etapa2-3-onboarding-dashboard/security-checklist.md` — checklist.

## 9. Pendiente para @app-engineer

- Ampliar `registerSchema` con `role?: 'coach'|'player'` ignorado (D6).
- Implementar route handlers con guards + ownership + auditoría según esta referencia.
- Tests: `tests/api/padel/courses-guard.spec.ts` (401/403), `join-happy.spec.ts` (400 own_course, 404, 409), `dashboard-happy.spec.ts`, `history-happy.spec.ts` (IDOR 404).