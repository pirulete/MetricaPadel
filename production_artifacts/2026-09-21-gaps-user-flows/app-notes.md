# App Notes — Cierre de Gaps en User Flows (G3, G4, G9, G11)

> change_id: gaps-user-flows
> date: 2026-09-21
> module: api+auth+db
> agent: @app-engineer

## Implementado

### G3 — Promote USER to ADMIN
- `app/api/admin/users/[id]/promote/route.ts` — POST, guardAdmin, auditUpdate, 404 si inexistente/ya ADMIN.
- `lib/db/queries/padel/promote.ts` — `promoteUser(id)` (update role ADMIN filtrado por role='USER', retorna null si no aplica). Exportado desde `index.ts`.

### G4 — Admin crea student con password generada
- `app/api/admin/users/route.ts` — POST: `password` opcional; si ausente → `generateRandomPassword()` → `generatedPassword` en respuesta (una sola vez). Nunca en auditCreate ni logs.
- `lib/padel/password.ts` — `generateRandomPassword()`: 12 chars, crypto.randomBytes, charset sin I/l/0/O/1, mezcla de clases (mayúscula/minúscula/dígito/símbolo), shuffle Fisher-Yates.
- `lib/validations/padel.ts` — `adminCreateUserSchema.password` → `.optional()`.

### G9 — Notificación al publicar evaluación
- `lib/notifications/triggers.ts` — `triggerEvaluationPublished(studentId, evaluationId)`: type success, priority P1, category system, `groupId = evaluationId` (uuid, dedup 1h del engine), ctaUrl `/evaluaciones/${id}`.
- `app/api/evaluations/[id]/publish/route.ts` — llamada fire-and-forget con try/catch tras publish ok (el publish nunca falla por el engine).

### G11 — Alumno sale del curso
- `app/api/courses/[id]/enrollment/route.ts` — DELETE, guardUser + ACTIVE + role USER (ADMIN → 403), auditDelete, 404 si no inscrito.
- `lib/db/queries/padel/enrollments.ts` — `deleteEnrollment(courseId, studentId)` (delete + returning, null si no existe).

## API Docs
- `lib/api-docs/paths/padel.ts` — +path `/api/admin/users/{id}/promote`; POST `/api/admin/users` actualizado (generatedPassword).
- `lib/api-docs/schemas/padel.ts` — `AdminUserInput.password` opcional; +`AdminUserCreateResponse`.
- `lib/api-docs/paths/courses.ts` — +path `/api/courses/{id}/enrollment` (DELETE).

## Tests
- Unit: `tests/unit/padel/password.test.ts`, `tests/unit/notifications/triggers.test.ts`, `tests/unit/db/admin-users.test.ts` (+promoteUser), `tests/unit/db/enrollments.test.ts` (+deleteEnrollment). 357/357 pasando.
- API guard: `promote.spec.ts`, `admin-users-password.spec.ts`, `evaluation-published.spec.ts`, `course-leave.spec.ts`.
- API happy-path (SQL real): `promote-happy.spec.ts`, `admin-users-password-happy.spec.ts`, `evaluation-published-happy.spec.ts`, `course-leave-happy.spec.ts`.
- E2E: `tests/e2e/gaps-user-flows.spec.ts`.

## Verificación
- `npx tsc --noEmit`: 0 errores.
- `pnpm run lint`: 0 errores (solo warnings pre-existentes).
- `pnpm run test:unit`: 30 suites / 357 tests OK.
- `npx next build`: OK.
- Playwright `--list`: 25 tests nuevos compilan.

## Pendiente
- @auth-security: revisión guards + confirmar que ninguna password en claro llega a audit_logs.
- @ponytail-reviewer: simplificación.
- @qa-release: validación final + test-matrix.