# Technical Design — Cierre de Gaps en User Flows (G3, G4, G9, G11)

> status: in-progress
> release: v0.3
> date: 2026-09-21
> change_id: gaps-user-flows
> module: api+auth+db
> tags: [admin, promotion, users, password, notifications, inbox, enrollment, padel, api, audit]

## Resumen

4 gaps de user-flow cerrados con endpoints API + trigger de notificación, reutilizando infraestructura existente (guards, auditoría, engine de notificaciones, queries padel). **Sin cambios de esquema DB** (0 migraciones). **Sin email/Resend** — G4 devuelve la password generada en la respuesta API.

## Decisiones de diseño

| # | Decisión | Justificación |
|---|----------|---------------|
| D1 | G3 usa `guardAdmin` + query `promoteUser` que filtra `role='USER'`; ya-ADMIN o inexistente → `null` → 404 | Anti-IDOR: recurso no aplicable = 404, nunca 403 |
| D2 | G4: `adminCreateUserSchema.password` pasa a `.optional()`; si ausente, `generatePassword()` en `lib/padel/password.ts` (crypto.randomBytes, charset sin ambiguos) | La password generada se devuelve UNA vez en `generatedPassword`; nunca se persiste en claro |
| D3 | G9: nuevo trigger `triggerEvaluationPublished(studentId, evaluationId)` en `lib/notifications/triggers.ts`; `groupId = evaluationId` (uuid) | `notifications.group_id` es `uuid` — el groupId DEBE ser el id de la evaluación, no un string `evaluation.published:${id}` (fallaría el cast uuid). Dedup real del engine = ventana 1h (no 24h como decía el spec; se alinea con `checkDuplicateNotification`) |
| D4 | G9: llamada fire-and-forget con try/catch en publish route — el publish nunca falla por el engine | AC4 del spec |
| D5 | G11: `DELETE /api/courses/[id]/enrollment` con guardUser + ACTIVE + role USER (mismo patrón que join) | Solo el alumno se auto-desinscribe; ADMIN → 403 |
| D6 | G11: query `deleteEnrollment` retorna `null` si no existe enrollment → 404 | Anti-IDOR; doble DELETE → 404 |
| D7 | Auditoría: G3 `auditUpdate` (role USER→ADMIN), G4 `auditCreate` existente (sin password), G11 `auditDelete` | Convención existente |

## Impacto por capa

| Capa | Impacto |
|------|---------|
| **app/api** | +2 route handlers nuevos (`promote`, `enrollment` DELETE), +2 modificados (`admin/users` POST, `evaluations/[id]/publish` POST) |
| **lib/db/queries** | +2 queries nuevas (`promoteUser`, `deleteEnrollment`), +1 modificada (`createActiveUser` password opcional) |
| **lib/validations** | `adminCreateUserSchema` password opcional |
| **lib/padel** | +1 utilidad nueva (`password.ts`) |
| **lib/notifications** | +1 trigger nuevo (`triggerEvaluationPublished`) |
| **lib/api-docs** | +2 paths nuevos, +1 schema nuevo, +1 schema modificado |
| **auth** | Sin cambios en guards; G3/G4 usan `guardAdmin`, G11 usa `guardUser` existentes |
| **DB** | Sin cambios de esquema (0 migraciones) |
| **UI** | Sin cambios (solo API; E2E valida el ciclo navegable) |

## Contratos API (contract first)

### G3 — `POST /api/admin/users/{id}/promote`

- **Auth**: `guardAdmin` (401 sin sesión, 403 USER).
- **Params**: `id` uuid (`padelIdParamsSchema`).
- **200**: `{ user: { id, email, firstName, lastName, role: "ADMIN", status } }`
- **400**: id no uuid. **404**: usuario inexistente o ya ADMIN. **500**: error interno.
- **Auditoría**: `auditUpdate("user", id, { role: "USER" }, { role: "ADMIN" }, { userId: adminId, ...ctx })`.
- **Retrocompatibilidad**: endpoint nuevo, no rompe nada.

### G4 — `POST /api/admin/users` (modificado)

- **Auth**: `guardAdmin`.
- **Body**: `adminCreateUserSchema` con `password` opcional (`.optional()`).
- **201 sin password en body**: `{ user: {...}, generatedPassword: "<claro>" }` — password generada (≥8 chars, mezcla de clases, charset sin I/l/0/O/1), hasheada bcrypt en DB.
- **201 con password en body**: `{ user: {...} }` — sin `generatedPassword`; password respetada y hasheada.
- **400**: email inválido / password < 8 chars. **409**: email duplicado. **401/403**: guards.
- **Auditoría**: `auditCreate` existente — **nunca incluir password ni generatedPassword**.
- **Retrocompatibilidad**: cambio aditivo (password sigue aceptada); clientes existentes no se rompen.

### G9 — trigger `evaluation.published` (sin endpoint nuevo)

- **Disparo**: `POST /api/evaluations/{id}/publish` tras `publishEvaluation` ok.
- **Payload**: `createNotification({ userId: studentId, type: "success", priority: "P2", category: "custom", title: "Nueva evaluación publicada", body: "Tu coach publicó una evaluación", ctaUrl: "/evaluaciones/{id}", ctaLabel: "Ver evaluación", groupId: evaluationId })`.
- **Dedup**: `groupId = evaluationId` (uuid) → re-publicar no duplica (ventana 1h del engine).
- **Fire-and-forget**: try/catch + `console.error`; el publish responde 200 aunque el engine falle.
- **Edge**: evaluación sin `studentId` → warning, no notificar.

### G11 — `DELETE /api/courses/{id}/enrollment`

- **Auth**: `guardUser` + `status === "ACTIVE"` + `role === "USER"` (ADMIN → 403, mismo patrón que join).
- **Params**: `id` uuid (`padelIdParamsSchema`).
- **200**: `{ ok: true }`. **400**: id no uuid. **401/403**: guards. **404**: no inscrito (o curso inexistente). **500**: error interno.
- **Auditoría**: `auditDelete("course_enrollment", enrollmentId, { courseId, studentId }, { userId: studentId, ...ctx })`.
- **Retrocompatibilidad**: endpoint nuevo; `course_enrollments` UNIQUE(courseId, studentId) liberado permite re-join.

## Archivos a tocar

| Archivo | Cambio | Tamaño est. |
|---------|--------|-------------|
| `app/api/admin/users/[id]/promote/route.ts` | **NUEVO** — POST promote | ~60 |
| `app/api/courses/[id]/enrollment/route.ts` | **NUEVO** — DELETE enrollment | ~70 |
| `app/api/admin/users/route.ts` | POST: manejar password opcional + `generatedPassword` en respuesta | ~110 |
| `app/api/evaluations/[id]/publish/route.ts` | POST: llamar trigger fire-and-forget tras publish ok | ~75 |
| `lib/db/queries/padel/admin-users.ts` | +`promoteUser(id)` (filtra role USER, update role ADMIN, retorna null si no aplica); `createActiveUser` password opcional | ~110 |
| `lib/db/queries/padel/enrollments.ts` | +`deleteEnrollment(courseId, studentId)` (delete, retorna fila o null) | ~125 |
| `lib/validations/padel.ts` | `adminCreateUserSchema.password` → `.optional()` | ~130 |
| `lib/padel/password.ts` | **NUEVO** — `generatePassword()` (crypto.randomBytes ≥12 + charset sin ambiguos) | ~35 |
| `lib/notifications/triggers.ts` | +`triggerEvaluationPublished(studentId, evaluationId)` | ~60 |
| `lib/api-docs/paths/padel.ts` | +path `/api/admin/users/{id}/promote`; actualizar POST `/api/admin/users` (generatedPassword) | ~300 |
| `lib/api-docs/schemas/padel.ts` | +`AdminUserCreateResponse` (user + generatedPassword opcional); `AdminUserInput.password` opcional | ~260 |
| `lib/api-docs/paths/courses.ts` | +path `/api/courses/{id}/enrollment` (DELETE) | ~210 |

Ningún archivo supera 300 líneas estimadas → sin splits.

## Tests mapeados

### Unit (`tests/unit/`)
| Archivo | Cubre |
|---------|-------|
| `tests/unit/padel/password.test.ts` | **NUEVO** — formato ≥8 chars, mezcla de clases, charset sin ambiguos, entropía (randomBytes) |
| `tests/unit/db/admin-users.test.ts` | **MODIFICAR** — `promoteUser` (rol cambia, null si ya ADMIN/inexistente), `createActiveUser` con/sin password |
| `tests/unit/db/enrollments.test.ts` | **MODIFICAR** — `deleteEnrollment` (fila eliminada, null si no existe) |
| `tests/unit/notifications/triggers.test.ts` | **NUEVO** — `triggerEvaluationPublished` payload correcto + groupId = evaluationId + dedup |

### API (`tests/api/`)
| Archivo | Cubre |
|---------|-------|
| `tests/api/padel/promote.spec.ts` | **NUEVO** — guard 401/403, 404 ya-ADMIN/inexistente |
| `tests/api/padel/promote-happy.spec.ts` | **NUEVO** — SQL real: role ADMIN en DB + auditoría |
| `tests/api/padel/admin-users-password.spec.ts` | **NUEVO** — guard 401/403, 400 password corta, 409 duplicado |
| `tests/api/padel/admin-users-password-happy.spec.ts` | **NUEVO** — SQL real: sin password → generatedPassword + login real con ella; con password → sin generatedPassword |
| `tests/api/padel/evaluation-published.spec.ts` | **NUEVO** — guard 401/403, publish sin criterios → 400 |
| `tests/api/padel/evaluation-published-happy.spec.ts` | **NUEVO** — SQL real: notificación creada en `notifications` para studentId + aparece en dashboard/student |
| `tests/api/padel/course-leave.spec.ts` | **NUEVO** — guard 401/403 (ADMIN), 404 no inscrito |
| `tests/api/padel/course-leave-happy.spec.ts` | **NUEVO** — SQL real: enrollment eliminado + ya no en dashboard/student ni lista coach |

### E2E (`tests/e2e/`)
| Archivo | Cubre |
|---------|-------|
| `tests/e2e/gaps-user-flows.spec.ts` | **NUEVO** — ciclo feliz navegable: admin promueve coach → coach crea alumno con password generada → alumno login → join curso → coach publica evaluación → alumno ve notificación → alumno sale del curso |

## Orden de ejecución de agentes

1. **@db-engineer** — queries `promoteUser`, `deleteEnrollment`, `createActiveUser` password opcional + unit tests DB. (Sin migraciones.)
2. **@app-engineer** — `lib/padel/password.ts`, validations, triggers, 2 routes nuevos, 2 routes modificados + unit tests + API tests + E2E + api-docs.
3. **@auth-security** — revisión de guards/auditoría de los 3 endpoints (G3/G4/G11) + confirmar que ninguna password en claro llega a audit_logs.
4. **@ponytail-reviewer** — revisión de simplicidad antes de QA.
5. **@qa-release** — test-matrix, acceptance-criteria, release-report.

## Seguridad

- G3/G4: `guardAdmin` server-side; G11: `guardUser` + ACTIVE + role USER.
- Anti-IDOR: 404 para recurso ajeno/no aplicable (nunca 403).
- G4: password generada solo en respuesta HTTP; **nunca** en audit_logs ni logs; hash bcrypt en DB.
- Auditoría en las 3 mutaciones (auditUpdate / auditCreate / auditDelete).

## Variables de entorno

Sin variables nuevas. `.env.example` sin cambios.

## Documentación

- `lib/api-docs/spec.ts`: actualizado vía `paths/padel.ts`, `schemas/padel.ts`, `paths/courses.ts` (gate api-docs).
- `ARCHITECTURE.md`: sin cambios (no cambia stack ni estructura).
- `AGENTS.md`: sin cambios.
- `FEATURES.md`: entrada nueva al completar (responsable: @app-engineer).