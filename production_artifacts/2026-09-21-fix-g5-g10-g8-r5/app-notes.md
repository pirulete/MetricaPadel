# App Notes — R5 Cobertura Dimensional Soft-Block

> change_id: r5-dimensional-coverage
> module: api+ui
> date: 2026-09-21
> status: released

## Qué se implementó

1. `checkDimensionalCoverage(studentId, currentRubricCategory)` en `lib/padel/score.ts` — query `SELECT DISTINCT r.category` con JOIN `evaluations → rubrics`, filtro `student_id` + `status='published'`. Retorna `{ alreadyEvaluated, coveredCategories }`.
2. `POST /api/evaluations/[id]/publish` — tras publicar, obtiene la categoría de la rúbrica y llama a `checkDimensionalCoverage`; respuesta `{ evaluation, alreadyEvaluated }`. Soft-block: nunca bloquea el publish.
3. `components/padel/scoring-canvas.tsx` — toast warning si `alreadyEvaluated`; el botón Publicar sigue habilitado.

## Decisiones

- La función vive en `lib/padel/score.ts` (junto a `validatePublish`) por indicación del spec, aunque ahora el archivo mezcla lógica pura con acceso a DB.
- La categoría de la rúbrica se consulta en el route handler (select de 1 columna) porque `publishEvaluation` no la expone; no se modificó la capa de queries.
- Tests API usan categorías distintas por test (`tecnica_basica` / `tactica`) para no depender del orden de ejecución de Playwright.

## Tests

- `tests/unit/padel/coverage.test.ts` — db mockeado (patrón `jest.mock("@/lib/db")` con chain `selectDistinct`).
- `tests/api/padel/coverage-happy.spec.ts` — SQL real contra NeonDB.

## Pendiente

- Nada. E2E no requerido: el cambio de UI es un toast condicional sobre un flujo ya cubierto por E2E existentes de publish.