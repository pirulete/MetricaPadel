# DB Plan — Etapa 1: Core Evaluativo

> change_id: etapa1-core-evaluativo
> release: v0.1
> date: 2026-09-20
> module: db
> tags: [rubrics, evaluations, padel, db, migration]
> status: in-progress

## Resumen

Se agregan 3 enums y 6 tablas al schema existente (`lib/db/schema.ts`, sin split — decisión D2 del technical-design). No se modifican tablas existentes (`users`, `sessions`, `audit_logs`, marketing, notifications). Retrocompatibilidad total.

## Enums nuevos (3)

| Enum | Valores | Uso |
|------|---------|-----|
| `rubric_category` | `tecnica` \| `tactica` \| `fisica` \| `actitud` | Categoría de rúbrica (P03) |
| `rubric_status` | `draft` \| `active` \| `archived` | Soft archive (D6: nunca hard delete) |
| `evaluation_status` | `draft` \| `published` | Borradores invisibles para el alumno |

## Tablas nuevas (6)

| Tabla | Columnas clave | FKs / Índices | Notas |
|-------|----------------|---------------|-------|
| `rubrics` | id uuid PK, ownerId FK users (no action), title varchar(200), category enum, status enum default `draft`, createdAt, updatedAt | `rubrics_owner_idx` (ownerId) | ownerId = coach (ADMIN) |
| `rubric_levels` | id uuid PK, rubricId FK cascade, name varchar(100), score int, sortOrder int | `rubric_levels_rubric_idx` (rubricId) | Niveles fijos 4 (D8) |
| `rubric_criteria` | id uuid PK, rubricId FK cascade, name varchar(200), sortOrder int | `rubric_criteria_rubric_idx` (rubricId) | Mínimo 1 criterio |
| `rubric_descriptors` | id uuid PK, criteriaId FK cascade, levelId FK cascade, text text | UNIQUE `rubric_descriptors_criteria_level_idx` (criteriaId, levelId) | Matriz descriptores |
| `evaluations` | id uuid PK, studentId FK users (no action), teacherId FK users (no action), rubricId FK rubrics (no action), status enum default `draft`, totalScore int, maxScore int, globalComment text, publishedAt, readAt, createdAt, updatedAt | `evaluations_student_idx`, `evaluations_teacher_idx`, `evaluations_rubric_idx` | totalScore/maxScore denormalizados (D4) |
| `evaluation_scores` | id uuid PK, evaluationId FK cascade, criteriaId FK rubric_criteria (no action), levelId FK rubric_levels (no action), score int, comment text | UNIQUE `evaluation_scores_evaluation_criteria_idx` (evaluationId, criteriaId) | FKs sin cascade protegen historial |

## Decisiones de diseño

- **FKs de `evaluation_scores` a criteria/levels sin cascade**: si se edita la rúbrica, los scores apuntan a filas que siguen existiendo (historial protegido).
- **`rubrics.ownerId` sin cascade**: no se borra el coach con sus rúbricas.
- **`evaluations.studentId/teacherId/rubricId` sin cascade**: historial estable.
- **Niveles fijos 4** creados al crear rúbrica (Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1) — no editables en Etapa 1.
- **Sin snapshot de rúbrica** (riesgo aceptado en spec; mitigación post-MVP `rubricSnapshot` jsonb).

## Queries nuevas (`lib/db/queries/padel/`)

| Archivo | Funciones | Ownership |
|---------|-----------|-----------|
| `rubrics.ts` | `createRubric` (transacción levels+criteria+descriptors), `getRubricById`, `listRubrics` (counts), `updateRubric` (reemplazo criteria), `archiveRubric` (soft) | Filtro `ownerId` (anti-IDOR) |
| `evaluations.ts` | `createEvaluation`, `getEvaluationById`, `getStudentEvaluationById` (solo published), `listEvaluations`, `listStudentEvaluations`, `saveEvaluationScores` (recalcula totalScore), `publishEvaluation` (valida criterios), `markEvaluationRead` (idempotente) | `teacherId` / `studentId` |
| `admin-users.ts` | `createActiveUser` (bcrypt + ACTIVE + USER), `listPlayers` (search ILIKE) | — |

## Migración

- `drizzle/0004_broken_sinister_six.sql` generada vía `pnpm run db:generate` (nunca SQL a mano).
- Orden cronológico verificado en `drizzle/meta/_journal.json` (idx 4, tag `0004_broken_sinister_six`).
- Ver detalle en `migration-notes.md`.

## Tests

- `tests/unit/db/rubrics.test.ts` — create (transacción), get por owner, list con counts, update reemplazo, archive, ownership ajeno → null.
- `tests/unit/db/evaluations.test.ts` — create borrador, get coach/alumno, list coach/alumno, save scores (recalcula totalScore), publish (not_found/not_draft/incomplete/ok), markRead idempotente.
- `tests/unit/db/admin-users.test.ts` — createActiveUser (hash, ACTIVE, USER, email lowercase), listPlayers.

## Archivos modificados

- `lib/db/schema.ts` (+3 enums, +6 tablas, +relations, +types)
- `lib/db/queries/index.ts` (+export padel)
- `lib/db/queries/padel/index.ts` (nuevo)
- `lib/db/queries/padel/rubrics.ts` (nuevo)
- `lib/db/queries/padel/evaluations.ts` (nuevo)
- `lib/db/queries/padel/admin-users.ts` (nuevo)
- `drizzle/0004_broken_sinister_six.sql` (nuevo)
- `drizzle/meta/0004_snapshot.json` (nuevo)
- `tests/unit/db/rubrics.test.ts`, `tests/unit/db/evaluations.test.ts`, `tests/unit/db/admin-users.test.ts` (nuevos)