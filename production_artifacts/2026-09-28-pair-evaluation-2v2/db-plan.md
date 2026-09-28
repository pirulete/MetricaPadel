# DB Plan — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> status: in-progress
> module: db
> tags: [padel, evaluation, pair, transaction, audit]

## 1. Decisión de Esquema

- **D1: Sin migración.** El schema `evaluations` ya soporta 2 filas independientes por pareja (studentId/teacherId/rubricId/courseId/status/version). No se agrega columna.
- **D2: Sin columna `pairId`.** La relación de pareja se infiere del evento de auditoría `PAIR_EVALUATION_PUBLISHED` (student_a_id/student_b_id). YAGNI.
- **D6: `courseId` requerido** en create y publish (validación de inscripción de ambos alumnos, CA-07).

## 2. Queries Nuevas (`lib/db/queries/padel/pair.ts`)

| Query | Transacción | Validaciones | Auditoría |
|-------|-------------|--------------|-----------|
| `createPairDrafts` | 2 inserts draft (rollback si falla el 2º) | `getEnrollment` × 2 (404 CA-07) | `auditCreate` × 2 (patrón existente, post-tx) |
| `savePairEvaluationScores` | `saveEvaluationScoresTx` × 2 (rollback si falla B, RF-06) | existencia (404), ownership (403), draft | — |
| `publishPairEvaluation` | 2 updates published + audit insert (D5) | existencia/ownership/draft, re-check inscripción (defensa en profundidad), `countMissingCriteria` × 2, versión por alumno | `PAIR_EVALUATION_PUBLISHED` dentro de la tx |

Resultados como uniones discriminadas (`PairDraftsResult` / `PairSaveResult` / `PairPublishResult`) para que los route handlers mapeen 404/403/400 (patrón `PublishResult` existente).

## 3. Refactor (`lib/db/queries/padel/evaluations.ts`)

- `saveEvaluationScoresTx(tx, teacherId, id, input)` — extraído del cuerpo de `saveEvaluationScores` (comportamiento idéntico; `saveEvaluationScores` queda como wrapper transaccional).
- `countMissingCriteria(tx, rubricId, evaluationId)` — extraído del cuerpo de `publishEvaluation` (comportamiento idéntico; reutilizado por `publishPairEvaluation`).
- Nota: `publishEvaluation` ahora carga criteria 2 veces (1 dentro de `countMissingCriteria`, 1 para maxScore). Tests existentes actualizados con la entrada extra en la cola (`tests/unit/db/evaluations.test.ts`).
- `lib/db/queries/padel/index.ts`: +`export * from './pair'` (aditivo).

## 4. Versionado por Alumno (CA-05)

- `COALESCE(MAX(version),0)+1` por (studentId, rubricId) entre publicadas, dentro de la tx (patrón G6).
- Cada alumno de la pareja recibe su propia versión (independiente): `nextVersionFor(tx, studentId, rubricId)`.

## 5. Auditoría (D5)

- Evento `PAIR_EVALUATION_PUBLISHED` insertado **dentro** de la transacción de publish (desviación deliberada del patrón 1v1, exigida por CA-06/R2). Insert directo vía `tx.insert(auditLogs)` (los helpers `auditCreate`/`auditUpdate` usan `db` global, no tx).
- Payload (`newValues`): `{coach_id, course_id, student_a_id, student_b_id, shared_criteria_count, individual_criteria_count, duration_seconds}`.
- `shared/individual` derivados de los scores reales (D7): criterios donde A.levelId === B.levelId vs distintos. Helper local `computePairAuditCounts` (la versión pura de `lib/padel/pair.ts` puede reemplazarla sin cambio de contrato).

## 6. Verificación

- [x] Sin migración: `pnpm run db:generate` NO se ejecuta (schema.ts sin cambios).
- [x] `drizzle/meta/_journal.json` sin cambios (git status limpio en drizzle/).
- [x] Tests: `tests/unit/db/pair-queries.test.ts` (12 casos) + actualización de `tests/unit/db/evaluations.test.ts` (2 casos).
- [x] Typecheck 0 errores; lint 0 errores (warnings de `any` permitidos — `tx: any` es contrato del task).
- [x] Suite unit completa: 578 tests / 46 suites pasan.