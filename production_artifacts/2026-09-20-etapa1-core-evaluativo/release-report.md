# Release Report — Etapa 1: Core Evaluativo

> change_id: `etapa1-core-evaluativo` | module: `padel` | date: 2026-09-20
> status: **BLOCKED** (no aprobado)

## Verdict

**NO APROBADO** — 1 blocker: faltan los E2E tests navegables requeridos por el spec (AC 2/3/4/5) y por el quality gate `tests` ("E2E test creado si la feature afecta UI"). La feature modifica UI (P02/P03/P09/A03) y `tests/e2e/` solo contiene `marketing-public.spec.ts` y `notifications.spec.ts`; no existen `rubric-editor.spec.ts`, `evaluation-flow.spec.ts` ni `student-view.spec.ts`.

## Validaciones ejecutadas

| Gate | Comando | Resultado |
|------|---------|-----------|
| typecheck | `npx tsc --noEmit` | ✅ 0 errores |
| lint | `pnpm run lint` | ✅ 0 errores (114 warnings no bloqueantes) |
| unit | `pnpm run test:unit` | ✅ 25 suites / 319 tests passed |
| build | `pnpm run build` | ✅ exitoso (rutas padel: /rubricas, /evaluar, /evaluaciones, /api/*) |
| api-docs | `lib/api-docs/spec.ts` | ✅ 10 endpoints padel documentados (paths + schemas) |
| coverage padel | Jest | ✅ score.ts 100%, validations/padel.ts 100%, db/queries/padel 96.37% |
| FEATURES.md | — | ✅ entry `etapa1-core-evaluativo` presente |

## Cobertura de tests

| Tipo | Archivos | Estado |
|------|----------|--------|
| Unit | `tests/unit/db/rubrics.test.ts`, `evaluations.test.ts`, `admin-users.test.ts` | ✅ |
| Unit | `tests/unit/validations/padel.test.ts` | ✅ |
| Unit | `tests/unit/padel/score.test.ts` | ✅ |
| API guard | `tests/api/padel/guard.spec.ts` (18 tests) | ✅ |
| API happy-path | `rubrics-happy.spec.ts`, `evaluations-happy.spec.ts`, `student-happy.spec.ts`, `admin-users-happy.spec.ts` (SQL real) | ✅ |
| E2E | `tests/e2e/rubric-editor.spec.ts`, `evaluation-flow.spec.ts`, `student-view.spec.ts` | ❌ **FALTAN** |

## Bugs encontrados

Ninguno funcional detectado en las validaciones ejecutadas.

## Acción requerida

1. @app-engineer debe crear los 3 E2E specs (flujo feliz navegable: crear rúbrica → evaluar → publicar → alumno ve y marca leído), siguiendo el patrón de `tests/e2e/notifications.spec.ts` (helpers `createUser`/`signIn`, skip sin `DATABASE_URL`).
2. Re-ejecutar `pnpm run test:e2e` con servidor + `DATABASE_URL`.
3. Re-correr este release report para aprobación.