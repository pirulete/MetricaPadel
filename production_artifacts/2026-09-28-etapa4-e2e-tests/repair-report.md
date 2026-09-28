# Repair Report — BUG-E2E-01: `/api/evaluations/series` no implementado

> change_id: etapa4-e2e-tests-2026-09-28
> date: 2026-09-28
> severity: Alta
> clasificación: fix por contrato (feature G6 incompleta)

## Síntoma

`GET /api/evaluations/series?studentId=X&rubricId=Y` devuelve 404. El E2E `evaluation-version.spec.ts` falla en la assertion de serie de versiones.

## Causa raíz

La feature G6 (Etapa 4) implementó las queries `listEvaluationSeries` (coach) y `listStudentEvaluationSeries` (alumno) en `lib/db/queries/padel/evaluations.ts` (líneas 298 y 324) y las documentó en ARCHITECTURE.md §v0.4, pero **nunca se crearon los route handlers**:

- `app/api/evaluations/series/route.ts` (GET, guardAdmin, anti-IDOR teacherId)
- `app/api/student/evaluations/series/route.ts` (GET, guardUser + ACTIVE + role USER, anti-IDOR studentId)

Tampoco hay entries en `lib/api-docs/spec.ts` para estos paths (verificado: grep "series" sin matches).

## Plan de reparación

| # | Acción | Perfil | Archivos |
|---|--------|--------|----------|
| 1 | Crear `GET /api/evaluations/series` con `guardAdmin` + query params studentId/rubricId validados con Zod + `listEvaluationSeries` + anti-IDOR (404/[]) | @app-engineer | `app/api/evaluations/series/route.ts` |
| 2 | Crear `GET /api/student/evaluations/series` con `guardUser` + ACTIVE + role USER + `listStudentEvaluationSeries` | @app-engineer | `app/api/student/evaluations/series/route.ts` |
| 3 | Documentar ambos endpoints en `lib/api-docs/spec.ts` (paths + schemas) | @app-engineer | `lib/api-docs/paths/padel.ts`, `lib/api-docs/spec.ts` |
| 4 | Happy-path tests API con SQL real (2 versiones publicadas) + guards 401/403 | @app-engineer | `tests/api/padel/evaluation-series-happy.spec.ts`, `tests/api/padel/evaluation-series-guard.spec.ts` |
| 5 | Re-ejecutar `evaluation-version.spec.ts` completo | @qa-release | — |

## Riesgo

Bajo: las queries ya existen y están testeadas a nivel unit (`tests/unit/db/evaluations.test.ts` describe "listEvaluationSeries"/"listStudentEvaluationSeries"). Solo falta el wiring HTTP + docs + tests API.