# Change Map — Cierre de Gaps en User Flows (G3, G4, G9, G11)

> status: in-progress
> release: v0.3
> date: 2026-09-21
> change_id: gaps-user-flows
> module: api+auth+db
> tags: [admin, promotion, users, password, notifications, inbox, enrollment, padel, api, audit]

## Resumen

4 gaps cerrados sin cambios de esquema DB (0 migraciones). Todos reutilizan guards, auditoría, engine de notificaciones y queries padel existentes.

## Archivos NUEVOS

| Archivo | Gap | Tamaño est. | Agente |
|---------|-----|-------------|--------|
| `app/api/admin/users/[id]/promote/route.ts` | G3 | ~60 | @app-engineer |
| `app/api/courses/[id]/enrollment/route.ts` | G11 | ~70 | @app-engineer |
| `lib/padel/password.ts` | G4 | ~35 | @app-engineer |
| `tests/unit/padel/password.test.ts` | G4 | ~50 | @app-engineer |
| `tests/unit/notifications/triggers.test.ts` | G9 | ~60 | @app-engineer |
| `tests/api/padel/promote.spec.ts` | G3 | ~80 | @app-engineer |
| `tests/api/padel/promote-happy.spec.ts` | G3 | ~90 | @app-engineer |
| `tests/api/padel/admin-users-password.spec.ts` | G4 | ~80 | @app-engineer |
| `tests/api/padel/admin-users-password-happy.spec.ts` | G4 | ~110 | @app-engineer |
| `tests/api/padel/evaluation-published.spec.ts` | G9 | ~80 | @app-engineer |
| `tests/api/padel/evaluation-published-happy.spec.ts` | G9 | ~110 | @app-engineer |
| `tests/api/padel/course-leave.spec.ts` | G11 | ~80 | @app-engineer |
| `tests/api/padel/course-leave-happy.spec.ts` | G11 | ~110 | @app-engineer |
| `tests/e2e/gaps-user-flows.spec.ts` | G3+G4+G9+G11 | ~180 | @app-engineer |

## Archivos MODIFICADOS

| Archivo | Cambio | Tamaño est. | Agente |
|---------|--------|-------------|--------|
| `app/api/admin/users/route.ts` | POST: password opcional + `generatedPassword` en respuesta | ~110 | @app-engineer |
| `app/api/evaluations/[id]/publish/route.ts` | POST: trigger fire-and-forget tras publish ok | ~75 | @app-engineer |
| `lib/db/queries/padel/admin-users.ts` | +`promoteUser`; `createActiveUser` password opcional | ~110 | @db-engineer |
| `lib/db/queries/padel/enrollments.ts` | +`deleteEnrollment` | ~125 | @db-engineer |
| `lib/validations/padel.ts` | `adminCreateUserSchema.password` → `.optional()` | ~130 | @app-engineer |
| `lib/notifications/triggers.ts` | +`triggerEvaluationPublished` | ~60 | @app-engineer |
| `lib/api-docs/paths/padel.ts` | +path promote; actualizar POST admin/users | ~300 | @app-engineer |
| `lib/api-docs/schemas/padel.ts` | +`AdminUserCreateResponse`; password opcional | ~260 | @app-engineer |
| `lib/api-docs/paths/courses.ts` | +path enrollment DELETE | ~210 | @app-engineer |
| `tests/unit/db/admin-users.test.ts` | +tests promoteUser / createActiveUser | ~150 | @db-engineer |
| `tests/unit/db/enrollments.test.ts` | +tests deleteEnrollment | ~130 | @db-engineer |

## Archivos SIN CAMBIO (verificados)

- `lib/db/schema.ts` — sin cambios de esquema
- `lib/notifications/engine.ts` — reutilizado tal cual (dedup 1h por groupId)
- `lib/audit/helpers.ts` — `auditUpdate`/`auditCreate`/`auditDelete` existentes
- `lib/auth/admin-guard.ts` — `guardAdmin`/`guardUser` existentes
- `auth.ts`, `.env.example`, `ARCHITECTURE.md`, `AGENTS.md` — sin cambios

## Dependencias entre cambios

1. `lib/padel/password.ts` (G4) → `admin-users.ts` + `admin/users/route.ts` + validations
2. `admin-users.ts promoteUser` (G3) → `promote/route.ts`
3. `enrollments.ts deleteEnrollment` (G11) → `enrollment/route.ts`
4. `triggers.ts triggerEvaluationPublished` (G9) → `publish/route.ts`
5. api-docs (paths/schemas) → después de los routes (contratos ya definidos en technical-design)

## Orden de implementación

1. @db-engineer: queries (admin-users, enrollments) + unit tests DB
2. @app-engineer: password.ts → validations → triggers → routes → api-docs → unit/API/E2E tests
3. @auth-security: revisión guards + auditoría (sin password en claro)
4. @ponytail-reviewer: simplificación
5. @qa-release: validación final

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| `generatedPassword` en logs/auditoría | Nunca incluir password en `auditCreate`; revisión @auth-security |
| groupId string no-uuid rompe cast | `groupId = evaluationId` (uuid) — D3 |
| Engine de notificaciones falla y rompe publish | Fire-and-forget con try/catch — D4 |
| Dedup spec 24h vs engine 1h | Alineado con engine existente (1h); documentado en technical-design |