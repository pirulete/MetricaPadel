# Release Scope — Cierre de Gaps en User Flows (G3, G4, G9, G11)

> status: proposed
> release: v0.3
> date: 2026-09-21
> change_id: gaps-user-flows
> module: api+auth+db
> tags: [admin, promotion, users, password, notifications, inbox, enrollment, padel, api, audit]

## Objetivo del release

Cerrar 4 gaps funcionales detectados en `production_artifacts/2026-09-21-user-flows.md` (§4) que bloquean flujos end-to-end: promoción de coach a ADMIN (G3), entrega de credenciales al crear estudiante (G4), notificación inbox al publicar evaluación (G9) y salida de curso (G11). **Sin email/Resend.** Sin migración de DB (cambios aditivos en queries y endpoints existentes).

## In Scope

### API (endpoints)

| Método + Path | Guard | Gap | Propósito |
|---------------|-------|-----|-----------|
| `POST /api/admin/users/[id]/promote` (nuevo) | guardAdmin | G3 | Promover USER→ADMIN (auditUpdate) |
| `POST /api/admin/users` (modificar) | guardAdmin | G4 | `password` opcional; si ausente, generar y devolver `generatedPassword` en respuesta |
| `DELETE /api/courses/[id]/enrollment` (nuevo) | guardUser (ACTIVE) | G11 | Alumno se auto-desinscribe (auditDelete) |
| `POST /api/evaluations/[id]/publish` (modificar) | guardAdmin | G9 | Tras publicar, disparar trigger `evaluation.published` (inbox) |

Todos documentados en `lib/api-docs/spec.ts` (paths + schemas). Auditoría en mutaciones (promote, create user, leave course, publish).

### Lógica / Queries

- `lib/db/queries/padel/admin-users.ts`: +`promoteUser(userId)`; `createActiveUser` acepta password opcional (genera hash si ausente).
- `lib/db/queries/padel/enrollments.ts`: +`deleteEnrollment(courseId, studentId)` → `{ ok: true }` o `not_found`.
- `lib/notifications/triggers.ts`: +`triggerEvaluationPublished(studentId, evaluationId)` — `createNotification` con `groupId: evaluation.published:${id}` (dedup 24h), `ctaUrl: /evaluaciones/${id}`, category account, P2.
- `lib/validations/padel.ts`: `adminCreateUserSchema.password` opcional; params schema para promote y enrollment.
- Utilidad de generación de password (nueva, `lib/padel/password.ts` o inline): `crypto.randomBytes` ≥12 bytes, charset sin ambiguos, ≥8 chars.

### Tests

- **Unit** (`tests/unit/`): generación password (formato/entropía), promoteUser, deleteEnrollment, trigger evaluation.published (payload + dedup).
- **API** (`tests/api/`): guard 401/403 + happy-path SQL real por endpoint (promote, admin-users-password con login real, evaluation-published con notificación en DB, course-leave con enrollment eliminado).
- **E2E** (`tests/e2e/`): 1 flujo feliz navegable del ciclo completo (promote → crear alumno → login → join → publish → notificación → leave).

## Out of Scope (este release)

- Email/Resend (ningún gap lo usa).
- UI admin de usuarios (G10), remover alumnos por coach (G12), detalle de curso para USER (G8).
- Migración de DB (no se toca schema.ts).
- Push notification nueva (el engine ya despacha push si el canal está habilitado).

## Riesgos / Notas

- `generatedPassword` se devuelve una sola vez en la respuesta; si se pierde, el admin usa reset-password (flujo existente).
- El trigger de notificación es fire-and-forget: un fallo del engine no debe romper el publish.
- Promover a un usuario LOCKED/TEMPORARY cambia el rol pero el estado sigue bloqueando rutas privadas (sin cambio de comportamiento).