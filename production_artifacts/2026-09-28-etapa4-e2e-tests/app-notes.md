# App Notes — Fix BUG-E2E-01: GET /api/evaluations/series

> change_id: fix-evaluations-series-route-2026-09-28
> date: 2026-09-28
> module: dashboard
> status: released

## Qué se hizo

- Creado `app/api/evaluations/series/route.ts` (GET): `guardAdmin` + query params `studentId`/`rubricId` validados con Zod (uuid) + `listEvaluationSeries(teacherId, studentId, rubricId)` → `{ series }`.
- Anti-IDOR: la query scopa por `teacherId` de la sesión; alumno/rúbrica ajenos → `[]` (patrón existente, no 404).
- Actualizado `lib/api-docs/spec.ts` (path `/api/evaluations/series` + schema `EvaluationSeriesItem`).

## Archivos

| Archivo | Acción |
|---------|--------|
| `app/api/evaluations/series/route.ts` | ✨ Nuevo |
| `lib/api-docs/paths/padel.ts` | 🔧 path nuevo |
| `lib/api-docs/schemas/padel.ts` | 🔧 schema `EvaluationSeriesItem` |
| `tests/api/padel/guard.spec.ts` | 🔧 +401 sin sesión, +403 USER |
| `tests/api/padel/evaluation-series-happy.spec.ts` | ✨ happy-path SQL real |

## Validación

- `npx tsc --noEmit`: 0 errores.
- `npx playwright test tests/e2e/evaluation-version.spec.ts --list`: parsea (1 test).
- Happy-path y guards parsean (20 tests en 2 archivos). No ejecutables localmente: sin servidor dev ni Postgres local (`DATABASE_URL` apunta a localhost:5432 no levantado) — corren en CI con NeonDB.

## Pendiente

- `app/api/student/evaluations/series/route.ts` (G6 alumno) sigue sin implementar — fuera de alcance de este fix.