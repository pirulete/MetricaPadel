# App Notes — Etapa 1: Core Evaluativo

> change_id: etapa1-core-evaluativo
> release: v0.1
> date: 2026-09-20
> agente: @app-engineer

## Resumen

Implementación de la capa de aplicación del Core Evaluativo: validaciones Zod, lógica pura de score, 10 route handlers (15 endpoints), API docs OpenAPI, 7 páginas UI y 8 componentes padel, más tests unit y API.

## Archivos creados

### Lógica
- `lib/validations/padel.ts` — schemas Zod (adminCreateUser, rubricCreate/Update, evaluationCreate/Save, list queries, id params).
- `lib/padel/score.ts` — `computeMaxScore(criteriaCount) = criteriaCount × 4`, `computeTotalScore`, `validatePublish`.

### API routes (10 handlers / 15 endpoints)
- `app/api/admin/users/route.ts` — GET (lista jugadores ?search=) + POST (crea USER ACTIVE, 409 duplicado, audita).
- `app/api/admin/users/[id]/route.ts` — GET detalle jugador (404 si no USER).
- `app/api/rubrics/route.ts` — GET (?status=) + POST (transacción levels+criteria+descriptors, audita).
- `app/api/rubrics/[id]/route.ts` — GET detalle + PUT (reemplazo criteria) + DELETE (archive soft).
- `app/api/evaluations/route.ts` — GET (?status=) + POST (valida rúbrica del coach y alumno USER → 404).
- `app/api/evaluations/[id]/route.ts` — GET (enrich student+rubric) + PUT (scores, recalcula totalScore).
- `app/api/evaluations/[id]/publish/route.ts` — POST (400 si incompleto/no-draft, audita).
- `app/api/student/evaluations/route.ts` — GET lista published del alumno.
- `app/api/student/evaluations/[id]/route.ts` — GET detalle con scores enriquecidos (criterionName/levelName/descriptor).
- `app/api/student/evaluations/[id]/read/route.ts` — POST mark-read idempotente.

### API docs
- `lib/api-docs/paths/padel.ts` — 15 paths (tags `Padel Admin` / `Padel Student`).
- `lib/api-docs/schemas/padel.ts` — schemas OpenAPI (Rubric, Evaluation, StudentEvaluation, AdminUser…).
- `lib/api-docs/spec.ts` — imports + tags + paths + schemas.

### UI (7 páginas / 8 componentes)
- Páginas coach (validateAdmin server): `app/(app)/rubricas/page.tsx`, `rubricas/nueva/page.tsx`, `rubricas/[id]/page.tsx`, `evaluar/page.tsx`, `evaluar/[id]/page.tsx`.
- Páginas alumno (client, layout validateUser): `app/(app)/evaluaciones/page.tsx`, `evaluaciones/[id]/page.tsx`.
- Componentes: `components/padel/{empty-state,rubric-card,rubric-library,rubric-editor,student-picker,scoring-canvas,evaluation-card,rubric-viewer}.tsx`.

### Tests
- `tests/unit/validations/padel.test.ts` (22 tests) y `tests/unit/padel/score.test.ts` (8 tests) — 100% coverage en lib nuevos.
- `tests/api/padel/guard.spec.ts` — 401 sin sesión (15 endpoints) + 403 rol + 404 IDOR (SQL real).
- `tests/api/padel/admin-users-happy.spec.ts`, `rubrics-happy.spec.ts`, `evaluations-happy.spec.ts`, `student-happy.spec.ts` — happy-path con SQL real contra NeonDB.

## Archivos modificados
- `lib/db/queries/padel/admin-users.ts` — +`getPlayerById` (detalle jugador para admin [id] y validación de alumno).
- `lib/auth/protected-routes.ts` — +`GET /api/admin/users/[id]`.
- `lib/api-docs/spec.ts`, `ARCHITECTURE.md`, `FEATURES.md`.

## Decisiones
- **Paths de API**: se siguieron los del change-map + protected-routes (`/api/rubrics`, `/api/evaluations`, `/api/student/evaluations`), no `/api/user/rubrics` del prompt (el contrato ya estaba documentado y protegido).
- **Enrichment de detalle** (student/rubric en coach, criterionName/levelName/descriptor en alumno) se hace en el route handler con `db.query` directo; las queries padel quedan intactas.
- **Nombres de componentes**: se usaron los del change-map (`scoring-canvas`, `rubric-viewer`, `rubric-card`, `evaluation-card`, `student-picker`, `empty-state`) + `rubric-library` como wrapper client de P02.

## Validación
- `npx tsc --noEmit` → 0 errores.
- `npx jest` → 319 tests pasan (25 suites).
- `npx next build` → build exitoso, 10 rutas API + 7 páginas registradas.
- ESLint en archivos nuevos → 0 errores (1 warning `no-explicit-any` en cast de auditoría, patrón existente).

## Pendiente
- E2E tests (`rubric-editor.spec.ts`, `evaluation-flow.spec.ts`, `student-view.spec.ts`) → @qa-release.
- Verificación de migración `0004_*` aplicada en NeonDB (db-engineer).