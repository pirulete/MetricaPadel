# Test Matrix — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28

## 1. Matriz de Tests por Tipo

| Tipo | Archivo | Tests | Cubre | Resultado |
|------|---------|-------|-------|-----------|
| Unit | `tests/unit/padel/pair.test.ts` | 20 | `isSharedCategory`, `applySharedSelection` (CA-01), `syncPairScores` (CA-02), `computePairTotals`, `validatePairPublish`, `computePairAuditCounts`, `buildPairAuditPayload` | ✅ 20/20 |
| Unit | `tests/unit/db/pair-queries.test.ts` | 12 | `createPairDrafts` (2 drafts, rollback 2º insert, CA-07), `savePairEvaluationScores` (RF-06, 404/403/not_draft), `publishPairEvaluation` (CA-05 versiones, CA-06 audit en tx, rollback update, incomplete, not_found, student_not_enrolled) | ✅ 12/12 |
| Unit | `tests/unit/validations/padel.test.ts` (extendido) | +18 refs | `pairEvaluationCreateSchema` (A===B → 400), save/publish schemas | ✅ |
| API happy | `tests/api/padel/pair-evaluations-happy.spec.ts` | 1 (SQL real) | CA-03/04/05/06: create→save→publish→2 filas SQL, versiones, auditoría payload, independencia alumno, re-publish 400 | ⚠️ requiere NeonDB + servidor |
| API guard | `tests/api/padel/pair-evaluations-guard.spec.ts` | 8 | 401×3 (sin sesión), 403 USER×3, 400 (A===B), 404 (no inscrito CA-07, rúbrica ajena, publish inexistente) | ⚠️ requiere NeonDB + servidor |
| E2E | `tests/e2e/pair-evaluation.spec.ts` | 1 | Flujo navegable: curso → Evaluar en Pareja → 2 alumnos → rúbrica → toggle compartido (CA-01) → guardar → publicar → /evaluaciones | ✅ coleccionable |

## 2. Cobertura de Acceptance Criteria

| CA | Criterio | Unit | API happy | API guard | E2E |
|----|----------|------|-----------|-----------|-----|
| CA-01 | Sincronización táctica en tiempo real | ✅ `applySharedSelection` | — | — | ✅ toggle + score compartido |
| CA-02 | Desvinculación individual | ✅ `syncPairScores` no toca no-compartidos | — | — | — |
| CA-03 | Independencia histórica (`GET /api/student/evaluations`) | — | ✅ solo eval propia | — | — |
| CA-04 | Persistencia transaccional (2 filas) | ✅ rollback 2º insert / update | ✅ 2 filas SQL | — | — |
| CA-05 | Versionado independiente | ✅ v1 vs v3 | ✅ versiones SQL | — | — |
| CA-06 | Auditoría con analytics | ✅ payload en tx | ✅ payload SQL | — | — |
| CA-07 | Anti-IDOR dupla (404) | ✅ `student_not_enrolled` | — | ✅ 404 no inscrito | — |
| CA-08 | Tests (unit+API+E2E) | ✅ | ✅ | ✅ | ✅ |

## 3. Regresión 1v1

| Área | Evidencia |
|------|-----------|
| `saveEvaluationScores` / `publishEvaluation` | Refactor puro: extracción de `saveEvaluationScoresTx` y `countMissingCriteria` (diff verificado, comportamiento idéntico) |
| `tests/unit/db/evaluations.test.ts` | ✅ adaptado y pasando (609/609 total) |
| `ScoringCanvas` 1v1 / `StudentPicker` | Sin cambios (D12) |
| Endpoints 1v1 | Sin cambios (aditivos los de pareja) |

## 4. Gates

| Gate | Estado |
|------|--------|
| `--typecheck` | ✅ 0 errores |
| `--unit` | ✅ 609/609 |
| `--lint` | ⚠️ 2 errores pre-existentes (`scripts/loop-metrics.js`, fuera del diff) |
| `--api` | ⚠️ requiere NeonDB + servidor (CI) |
| `--e2e` | ✅ coleccionable (requiere servidor para ejecutar) |
| `--api-docs` | ✅ 3 paths + 4 schemas |
| `--coverage` | ✅ `lib/padel/pair.ts` 100% stmts; módulos 1v1 sin tocar |
| `--secrets` / `--sast` | Sin hallazgos nuevos (sin archivos sensibles nuevos) |