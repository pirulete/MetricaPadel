# Test Matrix — Etapa 1: Core Evaluativo

> change_id: `etapa1-core-evaluativo` | date: 2026-09-20

## Resumen

| Capa | Suites | Tests | Estado |
|------|--------|-------|--------|
| Unit (Jest) | 25 (global) | 319 passed | ✅ |
| API guard (Playwright) | `tests/api/padel/guard.spec.ts` | 18 | ✅ |
| API happy-path (SQL real) | 4 specs | 4 | ✅ |
| E2E (Playwright) | — | 0 | ❌ **FALTAN** |

## Unit tests — módulo padel

| Archivo | Cubre | Estado |
|---------|-------|--------|
| `tests/unit/db/rubrics.test.ts` | schema + queries CRUD/archive/ownership | ✅ |
| `tests/unit/db/evaluations.test.ts` | schema + queries scores/publish/ownership | ✅ |
| `tests/unit/db/admin-users.test.ts` | query creación/listado usuarios admin | ✅ |
| `tests/unit/validations/padel.test.ts` | Zod rubric/evaluation/scores/admin user | ✅ |
| `tests/unit/padel/score.test.ts` | computeMaxScore/TotalScore, validatePublish | ✅ |

## API tests — endpoints padel (10)

| Endpoint | Guard 401/403 | Happy-path SQL real |
|----------|---------------|---------------------|
| GET/POST `/api/admin/users` | ✅ guard.spec | ✅ admin-users-happy.spec.ts |
| GET/PUT/DELETE `/api/admin/users/{id}` | ✅ guard.spec | ✅ admin-users-happy.spec.ts |
| GET/POST `/api/rubrics` | ✅ guard.spec | ✅ rubrics-happy.spec.ts |
| GET/PUT/DELETE `/api/rubrics/{id}` | ✅ guard.spec | ✅ rubrics-happy.spec.ts |
| GET/POST `/api/evaluations` | ✅ guard.spec | ✅ evaluations-happy.spec.ts |
| GET/PUT `/api/evaluations/{id}` | ✅ guard.spec | ✅ evaluations-happy.spec.ts |
| POST `/api/evaluations/{id}/publish` | ✅ guard.spec | ✅ evaluations-happy.spec.ts |
| GET `/api/student/evaluations` | ✅ guard.spec | ✅ student-happy.spec.ts |
| GET `/api/student/evaluations/{id}` | ✅ guard.spec | ✅ student-happy.spec.ts |
| POST `/api/student/evaluations/{id}/read` | ✅ guard.spec | ✅ student-happy.spec.ts |

## E2E tests — requeridos por spec, NO creados

| Archivo esperado | Flujo | Estado |
|------------------|-------|--------|
| `tests/e2e/rubric-editor.spec.ts` | P03: crear/editar rúbrica navegable | ❌ |
| `tests/e2e/evaluation-flow.spec.ts` | P09: evaluar → publicar | ❌ |
| `tests/e2e/student-view.spec.ts` | A03: alumno ve y marca leído | ❌ |

**Bloqueante**: el quality gate `tests` exige ≥1 E2E happy-path navegable por feature que modifique UI. Patrón de referencia: `tests/e2e/notifications.spec.ts` (helpers `createUser`/`signIn`, `test.skip(!process.env.DATABASE_URL)`).