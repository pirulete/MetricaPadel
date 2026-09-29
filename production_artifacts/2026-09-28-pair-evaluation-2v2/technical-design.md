# Technical Design — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> status: proposed
> module: dashboard+api+db+ui
> tags: [padel, evaluation, pair, scoring, ui, api, db, audit, transaction]

## 1. Resumen de Decisiones

| # | Decisión | Resolución | Justificación |
|---|----------|-----------|---------------|
| D1 | ¿Migración de DB? | **NO** — schema `evaluations` suficiente | Las 2 filas por pareja son evaluaciones normales (studentId/teacherId/rubricId/courseId/status/version). No se necesita columna nueva. |
| D2 | ¿Columna `pairId`? | **NO** en esta iteración | La relación de pareja se infiere del evento de auditoría `pair_evaluation_published` (student_a_id/student_b_id). Ninguna query actual necesita reconstruir la pareja. YAGNI: dashboard de métricas de pareja es out-of-scope. |
| D3 | Dimensión `reglas` | **COMPARTIDA** (default) | Análisis de dominio: en pádel las reglas se aplican como unidad de pareja durante el partido (orden de saque, red, límites). El conmutador por criterio permite des-sincronizar cualquier criterio si el coach detecta brecha individual — sin cambio de modelo. Consistente con el payload de ejemplo del spec (shared: 3, individual: 3). |
| D4 | Endpoints | 3 nuevos: `POST /api/evaluations/pair`, `PUT /api/evaluations/pair`, `POST /api/evaluations/pair/publish` | Espejo del flujo 1v1 (create → save → publish) con atomicidad por operación. |
| D5 | Auditoría en transacción | `PAIR_EVALUATION_PUBLISHED` insertado **dentro** de la transacción de publish | CA-06 + R2 del spec exigen atomicidad 2 inserts + auditoría. Desviación deliberada del patrón 1v1 (audit post-transacción) justificada por el requisito. |
| D6 | `courseId` en pareja | **Requerido** en create y publish | RF-01 es course-scoped; CA-07 valida inscripción de ambos alumnos (404 anti-IDOR). |
| D7 | `shared_criteria_count` / `individual_criteria_count` | Derivados de los **scores reales** al publicar (criterios donde A.levelId === B.levelId vs distintos) | El schema actual es 1 categoría por rúbrica (`rubrics.category`), por lo que el ejemplo del spec (3+3 en una rúbrica) no es reproducible con conteo por categoría. El conteo por scores refleja el estado real de sincronización (incluye toggles desactivados). |
| D8 | Notificaciones al publicar en pareja | **No se disparan** | Out-of-scope explícito del spec. `triggerEvaluationPublished` no se invoca en pair publish. |
| D9 | `alreadyEvaluated` (R5 coverage) | **No se computa** en pair publish | No está en acceptance criteria; evita 2 queries extra. Out-of-scope. |
| D10 | `durationSeconds` | Opcional en Zod, default 0, solo en metadata de auditoría | Sin columna DB. Medido client-side desde el mount del canvas hasta el click de publicar. |
| D11 | Env vars nuevas | **Ninguna** | `.env.example` sin cambios. Verificado. |
| D12 | UI | Componente nuevo `PairScoringCanvas` (no refactor del 1v1) | R1: mantener modo 1v1 intacto. El canvas 1v1 (355 líneas) no se toca; se extrae solo lógica pura a `lib/padel/pair.ts`. |

## 2. Impacto por Capa

### 2.1 DB (sin migración)
- **Schema**: sin cambios. `evaluations` ya soporta 2 filas independientes por pareja.
- **Queries nuevas** (`lib/db/queries/padel/pair.ts`, ~200 líneas):
  - `createPairDrafts({studentAId, studentBId, teacherId, rubricId, courseId})` — transacción: 2 inserts `status=draft`, `version=null`. Rollback si falla el 2º.
  - `savePairEvaluationScores(teacherId, {evaluationAId, evaluationBId, scoresA, scoresB, globalCommentA?, globalCommentB?})` — transacción: reutiliza helper tx-scoped por borrador.
  - `publishPairEvaluation(teacherId, {evaluationAId, evaluationBId, durationSeconds?}, auditContext)` — transacción: valida completitud de ambos, cómputo de versión por alumno (`COALESCE(MAX(version),0)+1` por (studentId, rubricId) dentro de la tx), 2 updates a published, insert de auditoría `PAIR_EVALUATION_PUBLISHED` en la misma tx.
- **Refactor menor** (`lib/db/queries/padel/evaluations.ts`, +30 líneas):
  - Extraer `saveEvaluationScoresTx(tx, teacherId, id, input)` del cuerpo de `saveEvaluationScores` (comportamiento idéntico; `saveEvaluationScores` queda como wrapper).
  - Extraer `countMissingCriteria(tx, rubricId, evaluationId)` del cuerpo de `publishEvaluation` (reutilizado por `publishPairEvaluation`).
- **Validación de inscripción**: reutilizar `getEnrollment(courseId, studentId)` de `enrollments.ts` (ya existe) dentro de las transacciones de create y publish.

### 2.2 Auth / Seguridad
- **Sin cambios** en `auth.ts`, guards globales ni roles. Se reutiliza `guardAdmin` (coach = ADMIN, status ACTIVE).
- **Anti-IDOR** (patrón existente, 404 no 403):
  - Rúbrica debe pertenecer al coach (`getRubricById(teacherId, rubricId)` → 404).
  - Ambos alumnos deben existir y ser role USER (`getPlayerById` → 404).
  - Ambos alumnos deben estar inscritos al curso (`getEnrollment` → 404, CA-07) — en create y re-validado en publish (defensa en profundidad ante remoción entre draft y publish).
- **Auditoría**: evento `PAIR_EVALUATION_PUBLISHED` con payload `{coach_id, course_id, student_a_id, student_b_id, shared_criteria_count, individual_criteria_count, duration_seconds}` insertado dentro de la transacción de publish.
- **Rate limit**: no aplica (endpoints de coach autenticado, consistente con los endpoints de evaluación existentes).
- **Nuevas env vars**: ninguna.

### 2.3 API (contract-first)
Ver sección 4. 3 endpoints nuevos, todos `guardAdmin` + Zod.

### 2.4 UI
- **Nueva página** `app/(app)/evaluar/pareja/page.tsx` (~60 líneas): entrada desde el detalle de curso.
- **Nuevo componente** `components/padel/pair-student-picker.tsx` (~120 líneas): lista alumnos inscritos del curso (`GET /api/courses/[id]/students`), selección de exactamente 2 distintos (Alumno A / Alumno B), botón deshabilitado con 1 o 3+ seleccionados.
- **Nuevo componente** `components/padel/pair-scoring-canvas.tsx` (~400 líneas): estado `studentAId`/`studentBId`, `scoresA`/`scoresB`, set de criterios sincronizados, conmutador "Evaluar en Pareja" por criterio (Switch de shadcn), columnas A/B para criterios individuales, fila única sincronizada para compartidos, comentarios siempre por alumno, score en vivo por alumno, `durationSeconds` medido desde mount.
- **Modificación menor** `components/padel/course-detail.tsx` (+15 líneas): botón "Evaluar en Pareja" junto al botón "Evaluar" existente (link a `/evaluar/pareja?courseId=X`).
- **Retrocompatibilidad**: `ScoringCanvas` 1v1 y `StudentPicker` intactos.

### 2.5 Lógica pura
- **Nuevo módulo** `lib/padel/pair.ts` (~120 líneas, sin imports server-side, patrón de `score.ts`):
  - `SHARED_CATEGORIES = ['tactica', 'actitud_equipo', 'reglas']` (D3)
  - `INDIVIDUAL_CATEGORIES = ['tecnica_basica', 'tecnica_especifica', 'fisica']`
  - `isSharedCategory(category)` → boolean
  - `applySharedSelection(scoresA, scoresB, criteriaId, levelId)` → `{scoresA, scoresB}` (sincroniza nivel en ambos)
  - `syncPairScores(scoresA, scoresB, sharedCriteriaIds)` → al activar el toggle, copia A→B en los criterios compartidos
  - `computePairTotals(scoresA, scoresB, levelScoreById)` → `{totalA, totalB, maxScore}`
  - `validatePairPublish(scoresA, scoresB, criteriaCount)` → boolean (ambos completos)
  - `computePairAuditCounts(scoresA, scoresB)` → `{shared, individual}` (D7)
  - `buildPairAuditPayload(...)` → payload de auditoría

### 2.6 Validaciones (Zod)
- `lib/validations/padel.ts` (+40 líneas):
  - `pairEvaluationCreateSchema` — studentAId uuid, studentBId uuid, rubricId uuid, courseId uuid; refine `studentAId !== studentBId` → 400.
  - `pairEvaluationSaveSchema` — evaluationAId/evaluationBId uuid, scoresA/scoresB (shape de `evaluationSaveSchema`), globalCommentA/globalCommentB opcionales.
  - `pairEvaluationPublishSchema` — evaluationAId/evaluationBId uuid, durationSeconds integer ≥ 0 opcional.

### 2.7 API Docs
- `lib/api-docs/paths/padel.ts` (+80 líneas): 3 paths nuevos bajo tag `Padel Admin`.
- `lib/api-docs/schemas/padel.ts` (+60 líneas): `PairEvaluationCreateInput`, `PairEvaluationSaveInput`, `PairEvaluationPublishInput`, `PairEvaluationResponse`.

## 3. Archivos a Tocar (resumen)

| Archivo | Acción | Líneas est. | Agente |
|---------|--------|-------------|--------|
| `lib/db/queries/padel/pair.ts` | Crear | ~200 | @db-engineer |
| `lib/db/queries/padel/evaluations.ts` | Refactor (extraer tx helpers) | 422→~450 | @db-engineer |
| `lib/padel/pair.ts` | Crear | ~120 | @app-engineer |
| `lib/validations/padel.ts` | Extender | 145→~185 | @app-engineer |
| `app/api/evaluations/pair/route.ts` | Crear (POST + PUT) | ~150 | @app-engineer |
| `app/api/evaluations/pair/publish/route.ts` | Crear (POST) | ~120 | @app-engineer |
| `components/padel/pair-student-picker.tsx` | Crear | ~120 | @app-engineer |
| `components/padel/pair-scoring-canvas.tsx` | Crear | ~400 | @app-engineer |
| `app/(app)/evaluar/pareja/page.tsx` | Crear | ~60 | @app-engineer |
| `components/padel/course-detail.tsx` | Modificar (botón) | 247→~262 | @app-engineer |
| `lib/audit/helpers.ts` | Extender (helper + constante) | 539→~559* | @auth-security |
| `lib/api-docs/paths/padel.ts` | Extender | 346→~426 | @app-engineer |
| `lib/api-docs/schemas/padel.ts` | Extender | 306→~366 | @app-engineer |
| `tests/unit/padel/pair.test.ts` | Crear | ~150 | @app-engineer |
| `tests/unit/db/pair-queries.test.ts` | Crear | ~150 | @db-engineer |
| `tests/unit/validations/padel.test.ts` | Extender | — | @app-engineer |
| `tests/api/padel/pair-evaluations-happy.spec.ts` | Crear | ~180 | @app-engineer |
| `tests/api/padel/pair-evaluations-guard.spec.ts` | Crear | ~120 | @app-engineer |
| `tests/e2e/pair-evaluation.spec.ts` | Crear | ~100 | @app-engineer |
| `FEATURES.md` | Actualizar (entrada v0.8) | — | @qa-release |
| `ARCHITECTURE.md` | Actualizar (sección Padel v0.8) | — | @architect |

\* `lib/audit/helpers.ts` ya supera 500 líneas (539). Excepción documentada: es una lista plana de wrappers de auditoría; dividirla tocaría todos los callers y queda fuera de alcance. Se agrega un solo helper + constante.

**Ningún archivo nuevo supera 500 líneas** (máximo: `pair-scoring-canvas.tsx` ~400).

## 4. Contratos API (contract-first)

### 4.1 POST /api/evaluations/pair — Crear borradores de pareja
```
Request (application/json):
{
  studentAId: string(uuid),   // requerido
  studentBId: string(uuid),   // requerido, !== studentAId
  rubricId:   string(uuid),   // requerido, debe pertenecer al coach
  courseId:   string(uuid)    // requerido, ambos alumnos deben estar inscritos
}

201 Created:
{
  evaluationA: { id, studentId, teacherId, rubricId, courseId, status: "draft", version: null, ... },
  evaluationB: { id, studentId, teacherId, rubricId, courseId, status: "draft", version: null, ... }
}

400: Zod inválido (incl. studentAId === studentBId)
401: No autenticado
403: Sin rol ADMIN / status != ACTIVE
404: Rúbrica no encontrada o no del coach | alumno no encontrado o no USER | alumno no inscrito al curso (CA-07)
500: Error interno
```
Auditoría: `CREATE` por cada borrador (2 filas, patrón existente).

### 4.2 PUT /api/evaluations/pair — Guardar scores de ambos borradores
```
Request (application/json):
{
  evaluationAId: string(uuid),   // requerido
  evaluationBId: string(uuid),   // requerido
  scoresA: [{ criteriaId: uuid, levelId: uuid, comment?: string }],  // min 1, max 100
  scoresB: [{ criteriaId: uuid, levelId: uuid, comment?: string }],  // min 1, max 100
  globalCommentA?: string,
  globalCommentB?: string
}

200 OK:
{
  evaluationA: { id, status: "draft", totalScore, ... },
  evaluationB: { id, status: "draft", totalScore, ... }
}

400: Zod inválido
401: No autenticado
403: Sin rol ADMIN
404: Algún borrador no encontrado, no del teacher o ya publicado (rollback total)
500: Error interno
```
Transaccional: si falla el save de B, rollback del save de A (RF-06).

### 4.3 POST /api/evaluations/pair/publish — Publicar pareja (transaccional)
```
Request (application/json):
{
  evaluationAId: string(uuid),   // requerido
  evaluationBId: string(uuid),   // requerido
  durationSeconds?: integer >= 0 // opcional, default 0
}

200 OK:
{
  evaluationA: { id, studentId, rubricId, courseId, status: "published", version: N, totalScore, maxScore, publishedAt },
  evaluationB: { id, studentId, rubricId, courseId, status: "published", version: M, totalScore, maxScore, publishedAt }
}

400: Algún borrador ya publicado | faltan criterios en A o B (con missingCount)
401: No autenticado
403: Sin rol ADMIN
404: Alguna evaluación no encontrada / no del teacher / alumno ya no inscrito al curso (re-check)
500: Error interno
```
Transacción (R2/R3): 2 updates a published + cómputo de versión por alumno dentro de la tx + insert `PAIR_EVALUATION_PUBLISHED` en la misma tx (D5). Sin notificaciones (D8), sin coverage check (D9).

## 5. Tests Requeridos

| Tipo | Archivo | Cubre |
|------|---------|-------|
| Unit | `tests/unit/padel/pair.test.ts` | `isSharedCategory`, `applySharedSelection`, `syncPairScores`, `computePairTotals`, `validatePairPublish`, `computePairAuditCounts`, `buildPairAuditPayload` (R4) |
| Unit | `tests/unit/db/pair-queries.test.ts` | `createPairDrafts` (rollback si 2º insert falla), `publishPairEvaluation` (versión por alumno CA-05, rollback si falla un update, audit en tx) |
| Unit | `tests/unit/validations/padel.test.ts` (extender) | `pairEvaluationCreateSchema` (A===B → 400), publish schema (durationSeconds) |
| API happy | `tests/api/padel/pair-evaluations-happy.spec.ts` | SQL real contra NeonDB: create → save → publish → 2 filas (CA-04), versiones independientes (CA-05), auditoría con payload (CA-06), `GET /api/student/evaluations` por alumno independiente (CA-03) |
| API guard | `tests/api/padel/pair-evaluations-guard.spec.ts` | 401, 403, 400 (A===B), 404 (alumno no inscrito CA-07, rúbrica ajena) |
| E2E | `tests/e2e/pair-evaluation.spec.ts` | Flujo navegable: curso → Evaluar en Pareja → 2 alumnos → rúbrica → toggle criterio compartido (CA-01) → publicar → éxito |

## 6. Orden de Ejecución de Agentes

| # | Agente | Alcance | Depende de |
|---|--------|---------|-----------|
| 1 | @db-engineer | `pair.ts` queries + refactor `evaluations.ts` + `tests/unit/db/pair-queries.test.ts` + verificación "sin migración" | — |
| 2 | @app-engineer | `lib/padel/pair.ts`, Zod, route handlers, UI, api-docs, tests unit/API/E2E | 1 (queries) |
| 3 | @auth-security | Revisión guards/anti-IDOR/auditoría de los 3 endpoints, `lib/audit/helpers.ts`, `auth-impact.md`, `security-checklist.md` | 2 (endpoints) |
| 4 | @ponytail-reviewer | Simplificación (gate antes de QA) | 2, 3 |
| 5 | @qa-release | CA-01..CA-08, regresión 1v1, test-matrix, release-report, FEATURES.md | 4 |

## 7. Retrocompatibilidad

- **Sin migración** → todas las queries existentes intactas.
- `publishEvaluation` y `saveEvaluationScores` mantienen comportamiento idéntico (extracción de helpers tx-scoped es refactor puro).
- `ScoringCanvas` 1v1, `StudentPicker`, endpoints 1v1: sin cambios.
- Endpoints nuevos son aditivos; `lib/api-docs/spec.ts` se extiende, no se modifica lo existente.

## 8. Riesgos y Mitigaciones

| Riesgo | Severidad | Mitigación |
|--------|-----------|-----------|
| R1 — Complejidad UI | Media | Lógica pura en `lib/padel/pair.ts` (testeable); componente nuevo sin tocar 1v1 |
| R2 — Atomicidad | Alta | `db.transaction` en las 3 queries; tests de rollback en unit + happy-path |
| R3 — Carrera versionado | Alta | `MAX(version)+1` por alumno dentro de la tx (patrón existente) |
| R4 — Regresión cobertura | Media | Unit tests de `pair.ts` + gate `--coverage` |
| R5 — Spec ambiguo (payload 3+3) | Baja | D7: conteo derivado de scores reales; documentado |
| R6 — Retry tras pérdida de respuesta | Baja | Mismo comportamiento que 1v1: retry → 400 "ya publicada"; el cliente trata 400 not_draft como éxito y verifica con GET |

## 9. Verificaciones Obligatorias

- [x] `.env.example` — sin nuevas variables (D11)
- [x] `lib/api-docs/spec.ts` — se extiende con 3 paths + 4 schemas (sección 4)
- [x] Tests mapeados (sección 5): unit + API happy-path SQL real + guards + E2E
- [x] Sin migración de DB (sección 2.1)
- [x] Sin dependencias nuevas
- [x] ARCHITECTURE.md se actualizará con sección "Padel Evaluativo — Evaluación en Pareja (v0.8)"