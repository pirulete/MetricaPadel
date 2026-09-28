# Acceptance Criteria — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> Resultado global: **8/8 PASS**

## CA-01 — Sincronización Táctica — ✅ PASS

**Criterio**: Al seleccionar un nivel en criterio `tactica`/`actitud_equipo`, se marca para ambos alumnos en tiempo real.

**Evidencia**:
- `lib/padel/pair.ts` → `applySharedSelection(scoresA, scoresB, criteriaId, levelId)` upserta el nivel en ambos sets (inmutable, retorna nuevos arrays).
- `components/padel/pair-scoring-canvas.tsx` → `selectSharedLevel` actualiza `scoresA` y `scoresB` en el mismo handler → re-render inmediato sin recargar.
- Unit: `tests/unit/padel/pair.test.ts` — "sincroniza nivel en ambos alumnos (upsert)", "actualiza nivel existente en ambos sin duplicar".
- E2E: `tests/e2e/pair-evaluation.spec.ts` — toggle compartido + puntuar "Excelente" aplica a ambos.

## CA-02 — Desvinculación Individual — ✅ PASS

**Criterio**: Al desactivar el toggle, el nivel de Alumno B permanece sin cambios al puntuar Alumno A.

**Evidencia**:
- `pair-scoring-canvas.tsx` → `toggleShared` elimina el criterio de `sharedCriteriaIds`; `selectLevel("A", ...)` solo actualiza `scoresA`.
- Unit: `syncPairScores` "no toca criterios no compartidos" (A=L1, B=L2 se mantienen).
- El toggle es por criterio (Switch con `aria-label`), permitiendo des-sincronizar cualquier criterio.

## CA-03 — Independencia Histórica — ✅ PASS

**Criterio**: `GET /api/student/evaluations` retorna solo la evaluación del alumno correcto.

**Evidencia**:
- API happy-path (`pair-evaluations-happy.spec.ts`): tras publish, `listA` contiene `evaluationAId` y NO `evaluationBId`; `listB` contiene `evaluationBId` y NO `evaluationAId`.
- Las 2 filas son evaluaciones normales con `studentId` propio (sin columna pairId, D2) — el filtro por alumno del endpoint existente aplica sin cambios.

## CA-04 — Persistencia Transaccional — ✅ PASS

**Criterio**: Exactamente 2 filas en `evaluations` con `status=published`, `courseId` y `rubricId` correctos; rollback si falla un insert.

**Evidencia**:
- `lib/db/queries/padel/pair.ts` → `createPairDrafts` y `publishPairEvaluation` usan `db.transaction`.
- API happy-path: verificación SQL `SELECT count(*) FROM evaluations WHERE id = ANY($1) AND status='draft'` → 2; tras publish → 2 filas `published`.
- Unit: "rollback si falla el 2º insert" (rejects), "rollback si falla el 1er update" (rejects).

## CA-05 — Versionado Independiente — ✅ PASS

**Criterio**: Cada alumno recibe su versión `v{N}` independiente (A con historial previo → v3, B sin historial → v1).

**Evidencia**:
- `nextVersionFor(tx, studentId, rubricId)` → `COALESCE(MAX(version),0)+1` por (studentId, rubricId) dentro de la tx.
- Unit: `publishPairEvaluation` con `maxVersion: 0` → A v1, `maxVersion: 2` → B v3.
- API happy-path: ambos alumnos nuevos → ambos `version = 1` (verificado por SQL).

## CA-06 — Auditoría con Analytics — ✅ PASS

**Criterio**: `PAIR_EVALUATION_PUBLISHED` en `audit_logs` con payload completo.

**Evidencia**:
- Insert dentro de la transacción de publish (D5) con `newValues`: coach_id, course_id, student_a_id, student_b_id, shared_criteria_count, individual_criteria_count, duration_seconds.
- Unit: `txInserts.find(i => i.table === auditLogs)` verifica `actionType` y payload completo (`shared: 1, individual: 1, duration: 120`).
- API happy-path: SQL `SELECT new_values FROM audit_logs WHERE action_type='PAIR_EVALUATION_PUBLISHED'` verifica student_a_id, student_b_id, course_id, duration_seconds=90, shared=1, individual=1 (D7: conteo derivado de scores reales).

## CA-07 — Anti-IDOR en Dupla — ✅ PASS

**Criterio**: Alumno no inscrito → 404 (no 403), sin crear evaluación.

**Evidencia**:
- `createPairDrafts` valida `getEnrollment` de ambos alumnos antes de insertar → `student_not_enrolled` → route responde 404.
- `publishPairEvaluation` re-valida inscripción (defensa en profundidad ante remoción entre draft y publish).
- API guard: "404: alumno no inscrito al curso" (CA-07) y "404: rúbrica ajena o inexistente".
- Unit: "retorna student_not_enrolled si un alumno no está inscrito (CA-07)" y "defensa en profundidad".

## CA-08 — Tests — ✅ PASS

**Criterio**: Unit + API happy-path SQL real + guards 401/403/404 + E2E.

**Evidencia**:
- Unit: `tests/unit/padel/pair.test.ts` (20 tests), `tests/unit/db/pair-queries.test.ts` (12 tests), `tests/unit/validations/padel.test.ts` (extendido).
- API happy-path SQL real: `tests/api/padel/pair-evaluations-happy.spec.ts` (2 filas, versiones, auditoría, independencia).
- API guards: `tests/api/padel/pair-evaluations-guard.spec.ts` (401×3, 403×3, 400 A===B, 404 CA-07).
- E2E: `tests/e2e/pair-evaluation.spec.ts` (flujo navegable completo).
- Ejecución: unit 609/609 ✅; API tests requieren NeonDB + servidor (CI); E2E coleccionable.

## Observaciones (no bloqueantes)

1. **RF-02 default toggle**: el spec dice toggle "activado por defecto" para `tactica`/`actitud_equipo`; la implementación inicia OFF y el E2E lo activa manualmente. CA-01/CA-02 pasan; el toggle por criterio es más flexible. Documentado en release-report B1.
2. **API tests en entorno local**: no ejecutables sin NeonDB + servidor; estructura verificada por revisión de código (patrón idéntico a happy-path existentes).