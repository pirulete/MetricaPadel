# Test Matrix — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso (v0.9)

> change_id: 2026-10-03-super-admin-academy-ownership
> Fecha: 2026-10-04
> Validador: @qa-release

## Leyenda

- ✅ PASS (ejecutado localmente)
- ⏸️ BLOCKED (escrito, requiere servidor + DATABASE_URL — no ejecutado, circuit breaker)
- ⚠️ PRE-EXISTENTE (fallo no relacionado con la feature)

## Unit tests (Jest) — ejecutados ✅

| Suite | Tests | Resultado |
|-------|-------|-----------|
| `tests/unit/padel/academy-requests.test.ts` | lógica pura requests (canAssignAcademyRole, validateRequestPayload) | ✅ PASS |
| `tests/unit/padel/academy-ownership.test.ts` | invariantes transfer/roles (último OWNER, self-transfer) | ✅ PASS |
| `tests/unit/padel/academy-schemas.test.ts` | schemas Zod academy | ✅ PASS |
| `tests/unit/db/academy-migration.test.ts` | plan migración ownership | ✅ PASS |
| `tests/unit/db/academy-requests-queries.test.ts` | queries requests | ✅ PASS |
| `tests/unit/db/academy-ownership-queries.test.ts` | transfer/role/restore queries | ✅ PASS |
| `tests/unit/db/academy-queries.test.ts` | queries academies | ✅ PASS |
| `tests/unit/auth/academy-super-admin-guard.test.ts` | guard compuesto (22 tests) | ✅ PASS |
| **Total (patrón academy)** | **123 tests / 9 suites** | ✅ **PASS** |

## API tests (Playwright) — escritos, NO ejecutados ⏸️

| Spec | Cubre | Tests | Resultado |
|------|-------|-------|-----------|
| `tests/api/padel/academy-requests-happy.spec.ts` | SQL real: join/create/approve/reject | 4 | ⏸️ BLOCKED (sin servidor) |
| `tests/api/padel/academy-requests-guard.spec.ts` | 401/403/400/404/409 | 15 | ⏸️ BLOCKED |
| `tests/api/padel/academy-ownership-happy.spec.ts` | SQL real: create SA/transfer/role/restore | 2 | ⏸️ BLOCKED |
| `tests/api/padel/academy-ownership-guard.spec.ts` | 401/403/400/404 | 13 | ⏸️ BLOCKED |
| `tests/api/padel/academies-guard.spec.ts` (MOD) | POST ADMIN → 403 | — | ⏸️ BLOCKED |
| `tests/api/padel/academies-happy.spec.ts` (MOD) | crear con SUPER_ADMIN | — | ⏸️ BLOCKED |
| `tests/api/padel/pdf-happy.spec.ts` (MOD) | setup SA | — | ⏸️ BLOCKED |
| `tests/api/padel/members-happy.spec.ts` (MOD) | setup SA | — | ⏸️ BLOCKED |
| `tests/api/padel/institutional-rubrics-happy.spec.ts` (MOD) | setup SA | — | ⏸️ BLOCKED |

## E2E (Playwright) — escrito, NO ejecutado ⏸️

| Spec | Flujo | Resultado |
|------|-------|-----------|
| `tests/e2e/academy-super-admin.spec.ts` | login SA → aprueba solicitud → gestiona academias (1 test) | ⏸️ BLOCKED (sin servidor) |

## Mapeo endpoint → test

| Endpoint | Guard test | Happy-path (SQL real) |
|----------|------------|----------------------|
| POST /api/academies (SA) | academies-guard (ADMIN→403) | academies-happy + ownership-happy |
| POST /api/academy-requests | requests-guard | requests-happy |
| GET /api/academy-requests | requests-guard | requests-happy |
| POST /api/academy-requests/[id]/approve | requests-guard | requests-happy |
| POST /api/academy-requests/[id]/reject | requests-guard | requests-happy |
| GET /api/academy-requests/available-academies | requests-guard | requests-happy |
| POST /api/academies/[id]/transfer-ownership | ownership-guard | ownership-happy |
| POST /api/academies/[id]/restore | ownership-guard | ownership-happy |
| PUT /api/academies/[id]/members/[userId] | ownership-guard | ownership-happy |

## Fallos conocidos

| Spec | Fallo | Clasificación |
|------|-------|---------------|
| `promote.spec.ts` / `promote-happy.spec.ts` | 3 fallos (403 vs 404) | ⚠️ PRE-EXISTENTE, NO relacionado con v0.9 — requiere triage separado |

## Gates locales ejecutados

| Gate | Resultado |
|------|-----------|
| `npx tsc --noEmit` | ✅ 0 errores |
| `pnpm run lint` | ✅ 0 errores (248 warnings pre-existentes) |
| `pnpm run test:unit` (patrón academy) | ✅ 123/123 PASS |
| E2E / API con DB | ⏸️ BLOCKED — sin servidor `next dev` corriendo |