# App Notes — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> module: dashboard+api+ui
> tags: [padel, evaluation, pair, scoring, ui, api, transaction]

## Resumen

Implementación de la capa de aplicación (lógica pura, validaciones, endpoints, UI, API docs y tests) de la Evaluación en Pareja 2v2. Las queries transaccionales (`lib/db/queries/padel/pair.ts`) y el helper de auditoría (`lib/audit/helpers.ts`) ya existían (creados por @db-engineer y @auth-security respectivamente) y se reutilizaron sin cambios.

## Archivos Creados

| Archivo | Propósito |
|---------|-----------|
| `lib/padel/pair.ts` | Lógica pura: `SHARED_CATEGORIES`/`INDIVIDUAL_CATEGORIES`, `isSharedCategory`, `applySharedSelection`, `syncPairScores`, `computePairTotals`, `validatePairPublish`, `computePairAuditCounts`, `buildPairAuditPayload` |
| `app/api/evaluations/pair/route.ts` | POST create (2 borradores transaccional, anti-IDOR) + PUT save (transaccional RF-06, audita UPDATE por borrador) |
| `app/api/evaluations/pair/publish/route.ts` | POST publish (transaccional + auditoría PAIR_EVALUATION_PUBLISHED en tx, D5) |
| `components/padel/pair-student-picker.tsx` | Selector de dupla: lista alumnos del curso (`GET /api/courses/[id]`), exactamente 2 distintos (Alumno A/B), botón Continuar deshabilitado sin 2 |
| `components/padel/pair-scoring-canvas.tsx` | Canvas 2 columnas: toggle "Evaluar en Pareja" por criterio (Switch), fila única sincronizada para compartidos, columnas A/B para individuales, comentarios por alumno, score en vivo, `durationSeconds` desde mount |
| `app/(app)/evaluar/pareja/page.tsx` | Página de evaluación en pareja (recibe `courseId` como search param, `validateAdmin`) |
| `tests/unit/padel/pair.test.ts` | Unit tests de lógica pura (R4) |
| `tests/api/padel/pair-evaluations-happy.spec.ts` | Happy-path SQL real: create → save → publish → 2 filas (CA-04), versiones (CA-05), auditoría con payload (CA-06), independencia alumno (CA-03) |
| `tests/api/padel/pair-evaluations-guard.spec.ts` | Guards 401/403/400/404 (CA-07 alumno no inscrito, rúbrica ajena) |
| `tests/e2e/pair-evaluation.spec.ts` | E2E navegable: curso → Evaluar en Pareja → 2 alumnos → rúbrica → toggle compartido (CA-01) → publicar → éxito |

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `lib/validations/padel.ts` | +`pairEvaluationCreateSchema` (refine A!==B → 400), `pairEvaluationSaveSchema`, `pairEvaluationPublishSchema` (durationSeconds int ≥ 0 opcional) + tipos |
| `components/padel/course-detail.tsx` | +botón "Evaluar en Pareja" (link `/evaluar/pareja?courseId=X`) junto a "Evaluar" |
| `lib/api-docs/paths/padel.ts` | +3 paths bajo tag `Padel Admin` (pair create/save/publish) |
| `lib/api-docs/schemas/padel.ts` | +4 schemas (`PairEvaluationCreateInput`, `PairEvaluationSaveInput`, `PairEvaluationPublishInput`, `PairEvaluationResponse`) |
| `tests/unit/validations/padel.test.ts` | +tests de schemas de pareja (A===B → 400, durationSeconds) |

## Decisiones de Implementación

- **`syncPairScores`**: A es la fuente (copia A→B); si A no tiene el criterio compartido pero B sí, A lo toma de B (quedan sincronizados). Corrige el caso donde el toggle se activa tras puntuar solo a B.
- **`computePairTotals.maxScore`**: criterios distintos (unión A∪B) × nivel máximo de la escala (4). Para evaluación completa equivale a `criteriaCount × 4` (patrón `computeMaxScore`).
- **`durationSeconds`**: `startRef` se inicializa en un `useEffect` de mount (no en render — evita el lint rule de impureza de React Compiler); se computa al publicar.
- **Picker de alumnos**: usa `GET /api/courses/[id]` (devuelve `course.students`); el endpoint `GET /api/courses/[id]/students` no existe (solo POST).
- **Auditoría en save**: `PUT /api/evaluations/pair` audita UPDATE por borrador (patrón 1v1); el publish audita dentro de la tx (D5, no duplica).

## Tests

- Unit: `tests/unit/padel/pair.test.ts` (7 describe blocks) + `tests/unit/validations/padel.test.ts` (3 describe blocks nuevos)
- API happy-path: `tests/api/padel/pair-evaluations-happy.spec.ts` (SQL real contra NeonDB)
- API guards: `tests/api/padel/pair-evaluations-guard.spec.ts`
- E2E: `tests/e2e/pair-evaluation.spec.ts`

## Validación

- `npx tsc --noEmit` — 0 errores
- `pnpm run lint` — 0 errores en archivos nuevos (2 errores pre-existentes en `scripts/loop-metrics.js`, no tocados)
- `pnpm run test:unit` — 609 passed (47 suites)
- `npx next build` — exitoso; rutas `/evaluar/pareja`, `/api/evaluations/pair`, `/api/evaluations/pair/publish` registradas

## Pendiente (otros agentes)

- @auth-security: revisión de guards/anti-IDOR/auditoría de los 3 endpoints + `auth-impact.md` + `security-checklist.md`
- @ponytail-reviewer: simplificación
- @qa-release: CA-01..CA-08, regresión 1v1, FEATURES.md, test-matrix, release-report
- @architect: ARCHITECTURE.md sección v0.8