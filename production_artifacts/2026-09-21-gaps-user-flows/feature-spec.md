# Feature Spec — Cierre de Gaps en User Flows (G3, G4, G9, G11)

> status: proposed
> release: v0.3
> date: 2026-09-21
> change_id: gaps-user-flows
> module: api+auth+db
> tags: [admin, promotion, users, password, notifications, inbox, enrollment, padel, api, audit]

## Problema

El documento `production_artifacts/2026-09-21-user-flows.md` (§4) detecta 4 gaps que bloquean flujos end-to-end reales:

- **G3**: No existe endpoint para promover USER→ADMIN. Un coach registrado por web queda USER y no puede operar (solo seed/DB manual).
- **G4**: `POST /api/admin/users` crea ACTIVE sin entregar credenciales al alumno — no sabe su password.
- **G9**: No hay trigger `evaluation.published` en el inbox. El alumno no recibe aviso al publicarse una evaluación.
- **G11**: No existe endpoint para que el alumno abandone un curso.

## Objetivo

Cerrar los 4 gaps con endpoints API + trigger de notificación, reutilizando infraestructura existente (guards, auditoría, engine de notificaciones, queries padel). **Sin integración de email (sin Resend)** — G4 devuelve la password generada en la respuesta API.

---

## G3 — Promoción Coach → ADMIN

### Problema
No hay endpoint ni UI para promover USER→ADMIN. Solo seed/DB manual. Un coach registrado por web queda USER y no puede operar (D6 impide auto-ADMIN en registro).

### Solución
Endpoint superadmin `POST /api/admin/users/[id]/promote` (guardAdmin + auditoría) que cambia `users.role` de `USER` a `ADMIN`. No requiere email ni verificación adicional. El ADMIN que promueve queda auditado.

### Acceptance Criteria
1. `POST /api/admin/users/:id/promote` con sesión ADMIN y `id` de un usuario `USER` → 200, `role: "ADMIN"` en respuesta, `status` intacto.
2. Sin sesión → 401; sesión USER → 403 (guardAdmin server-side).
3. `id` inexistente o usuario ya ADMIN → 404 (anti-IDOR, no 403).
4. Se registra auditoría `auditUpdate` con actor (ADMIN que promueve), target (usuario promovido) y cambio `role: USER→ADMIN`.
5. El usuario promovido puede operar rutas coach inmediatamente (guardAdmin) sin re-login (rol leído de DB en cada request).

### Edge Cases
- Promover a un usuario `LOCKED` o `TEMPORARY`: permitido (rol cambia; estado sigue bloqueando rutas privadas).
- Promover a un usuario ya `ADMIN`: 404 (recurso no aplicable) — idempotencia NO requerida.
- Promover a sí mismo: permitido (un ADMIN ya es ADMIN; si es USER no puede llamar el endpoint).

### Out-of-scope
- UI de promoción en `app/admin` (solo API).
- Rol superadmin separado (no existe en el modelo; ADMIN = coach + plataforma).
- Notificación por email al promovido.

---

## G4 — Crear estudiante con password conocida

### Problema
`POST /api/admin/users` exige `password` en el body (schema actual) pero la respuesta NO la devuelve. El alumno creado por admin no conoce sus credenciales y no hay email (sin Resend).

### Solución
Modificar `POST /api/admin/users`: si el body NO incluye `password`, el servidor genera una password segura (bcrypt hash para DB) y la devuelve **una sola vez** en la respuesta como `generatedPassword`. Si el admin envía `password`, se respeta y NO se devuelve en claro (ya la conoce). El alumno recibe la password por canal offline (el admin se la comunica).

### Acceptance Criteria
1. `POST /api/admin/users` sin `password` → 201 con `user` + `generatedPassword` (string en claro, ≥8 chars, mezcla de clases de caracteres).
2. `POST /api/admin/users` con `password` explícita → 201, `generatedPassword` ausente, password hasheada con bcrypt en DB (nunca en claro).
3. La password generada permite login real: `POST /api/auth/signin` con email + `generatedPassword` → 200 sesión.
4. Guard: sin sesión → 401; USER → 403. Email duplicado → 409. Auditoría `auditCreate` existente se mantiene (sin incluir password en claro).
5. La password generada NO se persiste en claro ni en audit_logs ni en logs.

### Edge Cases
- Generación con colisión/entropía: usar `crypto.randomBytes` (≥12 bytes) + charset sin ambiguos (I/l/0/O/1).
- Admin envía `password` < 8 chars → 400 (schema existente).
- Alumno con password generada que hace reset → flujo existente (TEMPORARY + re-verificación) sin cambios.

### Out-of-scope
- Envío de credenciales por email (sin Resend).
- Expiración de `generatedPassword` (se entrega una vez en la respuesta; si se pierde, admin usa reset-password).
- UI admin para mostrar la password (solo API).

---

## G9 — Notificación al publicar evaluación

### Problema
No hay trigger `evaluation.published` en el inbox. El alumno solo se entera al entrar a `/evaluaciones` (user-flows §2.5).

### Solución
Agregar trigger `evaluation.published` en `lib/notifications/triggers.ts` (patrón existente `triggerWelcome`/`triggerEmailVerified`) y llamarlo en `POST /api/evaluations/[id]/publish` tras publicar con éxito. Usa el engine existente (`createNotification`) → inbox-first, respeta preferencias y dedup por `groupId` (ventana 24h). CTA a `/evaluaciones/[id]`.

### Acceptance Criteria
1. Publicar una evaluación (draft→published) crea 1 notificación en `notifications` para `studentId` de la evaluación, con `type`, `priority`, `category`, `ctaUrl: /evaluaciones/:id`.
2. La notificación aparece en `GET /api/dashboard/student` (notificaciones recientes) y en el inbox del alumno.
3. Re-publicar la misma evaluación (si fuera posible) NO duplica: dedup por `groupId` estable (ej: `evaluation.published:${id}`).
4. Si el engine falla (DB error), el publish NO se rompe: el error se loguea y la evaluación queda publicada (fire-and-forget con try/catch).
5. Guard existente intacto: publish sigue requiriendo guardAdmin + validación de criterios completos (400 si falta nivel).

### Edge Cases
- Evaluación sin `studentId` (no debería existir por schema): no notificar, loguear warning.
- Alumno con preferencias `inbox` deshabilitadas: el engine respeta preferencias (no se crea o no se muestra según canal).
- Publicar evaluación de alumno que ya no está en el curso: notificar igual (studentId es el target, no el enrollment).

### Out-of-scope
- Push notification (solo inbox; el engine ya despacha push si el canal está habilitado — no se agrega lógica nueva).
- Notificación al coach.
- UI nueva en el inbox (reutiliza la existente).

---

## G11 — Salir de curso (enrollment delete)

### Problema
No existe endpoint para que el alumno abandone un curso (user-flows §2.3 solo cubre join).

### Solución
Endpoint `DELETE /api/courses/[id]/enrollment` (guardUser, ACTIVE) que elimina el `course_enrollments` del alumno autenticado (`studentId = session.user.id`). Auditoría `auditDelete`. No afecta evaluaciones históricas (FK studentId sin cascade en evaluations).

### Acceptance Criteria
1. `DELETE /api/courses/:id/enrollment` con sesión USER inscrito en el curso → 200 `{ ok: true }`, fila de enrollment eliminada (verificable en DB).
2. Sin sesión → 401; ADMIN (coach) → 403 (solo el alumno se auto-desinscribe; el coach usa archive de curso).
3. Alumno NO inscrito en el curso → 404 (anti-IDOR, no 403).
4. Curso `archived` → el alumno puede salir igualmente (200).
5. Auditoría `auditDelete` con actor = alumno, target = enrollment.
6. Tras salir, el alumno ya no aparece en `GET /api/dashboard/student` (mis cursos) ni en la lista de alumnos del coach (`GET /api/courses/[id]`).

### Edge Cases
- Salir de un curso donde tiene evaluaciones publicadas: permitido; las evaluaciones históricas se conservan (FK sin cascade).
- Re-join después de salir: permitido con el mismo inviteCode (UNIQUE courseId+studentId ya liberado).
- Doble DELETE (ya salió): 404.

### Out-of-scope
- Remover alumnos por el coach (G12 — queda pendiente).
- UI de "Salir del curso" (solo API; la UI se puede conectar en etapa posterior).

---

## Dependencias

- G3: `lib/db/queries/padel/admin-users.ts` (nueva query `promoteUser`), `lib/validations/padel.ts` (params schema), `lib/audit/helpers.ts` (auditUpdate existente).
- G4: `lib/db/queries/padel/admin-users.ts` (`createActiveUser` — aceptar password opcional), `lib/validations/padel.ts` (`adminCreateUserSchema` — password opcional), utilidad de generación (nueva, en `lib/padel/` o inline).
- G9: `lib/notifications/triggers.ts` (nuevo trigger), `app/api/evaluations/[id]/publish/route.ts` (llamada post-publish), `lib/notifications/engine.ts` (existente, sin cambios).
- G11: `lib/db/queries/padel/enrollments.ts` (nueva query `deleteEnrollment`), `app/api/courses/[id]/enrollment/route.ts` (nuevo), `lib/validations/padel.ts` (params schema).

## Tests requeridos

- **Unit** (`tests/unit/`): generación de password (formato/entropía), query promoteUser (rol cambia), query deleteEnrollment (fila eliminada, 404 si no existe), trigger evaluation.published (payload correcto + dedup groupId).
- **API** (`tests/api/`): por endpoint — guard 401/403 + happy-path SQL real contra NeonDB:
  - `promote.spec.ts` + `promote-happy.spec.ts` (G3)
  - `admin-users-password.spec.ts` + `-happy.spec.ts` (G4: login con generatedPassword)
  - `evaluation-published.spec.ts` + `-happy.spec.ts` (G9: notificación creada en DB)
  - `course-leave.spec.ts` + `-happy.spec.ts` (G11: enrollment eliminado)
- **E2E** (`tests/e2e/`): flujo feliz navegable — admin promueve coach → coach crea alumno con password generada → alumno login → join curso → coach publica evaluación → alumno ve notificación → alumno sale del curso (mínimo 1 E2E que cubra el ciclo).

## Out-of-scope global

- Integración de email / Resend (ninguno de los 4 gaps usa email).
- UI admin de usuarios (G10) y remover alumnos por coach (G12) — quedan pendientes.
- Cambios en el modelo de roles (no se crea superadmin ni `padel_role`).