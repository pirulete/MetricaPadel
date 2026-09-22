# Feature Spec — Etapa 1: Core Evaluativo (Rúbricas + Evaluaciones)

> status: proposed
> release: v0.1
> date: 2026-09-20
> change_id: etapa1-core-evaluativo
> module: admin+api+db+ui
> tags: [rubrics, evaluations, padel, db, migration, api, ui]

## Problema

La app de evaluación de pádel no tiene capacidad de rúbricas ni evaluaciones (greenfield). El mockup `components/preview/etapa1-core-evaluativo.tsx` define el loop de valor: el coach crea una rúbrica → evalúa a un alumno → el alumno ve su evaluación publicada. Sin este loop no hay producto. El blueprint previo (`2026-09-20-rubricas-blueprint/technical-design.md`) proponía 16 pantallas con cursos y templates; el usuario confirmó un alcance reducido: **solo 4 pantallas, cursos fuera de alcance (Etapa 2), y roles de sistema USER/ADMIN en lugar de un rol de dominio coach/player**.

## Objetivo

Entregar el core evaluativo completo: ADMIN (coach) crea usuarios jugadores, crea/edita rúbricas, evalúa alumnos y publica; USER (player) ve sus evaluaciones publicadas y las marca como leídas. Cero dependencia de cursos.

## Alcance (4 pantallas del mockup)

| Pantalla | Descripción | Rol |
|----------|-------------|-----|
| **P09 Evaluar Alumno** | Canvas: sticky header con alumno + rúbrica + score en vivo, selector de nivel (4 cards) por criterio, nota opcional por criterio, comentario global, barra inferior Guardar Borrador / Publicar | ADMIN |
| **P03 Editor Rúbrica** | Formulario: título + categoría (Técnica/Táctica/Física/Actitud), niveles fijos 4, matriz de descriptores por criterio (scroll horizontal en móvil), añadir criterio | ADMIN |
| **A03 Detalle Evaluación** | Read-only alumno: hero con score total + barra de progreso, comentario del profesor, desglose por criterio (nivel + descriptor), botón "Marcar como leído", empty state "Aún no tienes evaluaciones" | USER |
| **P02 Biblioteca Rúbricas** | Tabs Activas/Archivadas, cards (título, categoría, nº criterios, nº niveles, badge estado), menú contextual, botón Nueva Rúbrica, empty state | ADMIN |

## Roles y permisos

Se usa el sistema de roles existente (`user_role` enum `['USER','ADMIN']`). **No se crea `padel_role` ni `padel_profiles`** (decisión del usuario; reemplaza la propuesta del blueprint).

| Rol de sistema | Rol de dominio | Permisos |
|----------------|----------------|----------|
| `ADMIN` | Coach / Profesor | Crear usuarios jugadores, crear/editar/archivar rúbricas, crear borradores de evaluación, evaluar, publicar |
| `USER` | Player / Alumno | Ver sus evaluaciones publicadas (A03), marcar como leídas |
| `LOCKED` | — | Nunca permitido en rutas privadas |
| `TEMPORARY` | — | No puede operar (solo si explícitamente declarado; aquí no) |

Guards: `validateAdmin` para endpoints coach (rubrics, evaluations, admin/users); `validateUser` + ownership para endpoints alumno (`/api/student/*`). Ownership estricto (anti-IDOR): coach solo ve sus rúbricas/evaluaciones; alumno solo ve las suyas.

## Modelo de dominio

Derivado del mockup (LEVELS, CRITERIA, descriptors, TOTAL_SCORE/MAX_SCORE). Cursos y templates **no** existen en Etapa 1.

### Entidades

| Entidad | Campos | Notas |
|---------|--------|-------|
| `Rubric` | id, ownerId (FK users), title, category (tecnica/tactica/fisica/actitud), status (`draft`/`active`/`archived`), createdAt, updatedAt | ownerId = ADMIN |
| `RubricLevel` | id, rubricId (FK cascade), name, score (integer), sortOrder | Etapa 1: fijos 4 niveles (Excelente 4, Bueno 3, Aceptable 2, En desarrollo 1) |
| `RubricCriterion` | id, rubricId (FK cascade), name, sortOrder | Mínimo 1 criterio |
| `RubricDescriptor` | id, criteriaId (FK cascade), levelId (FK cascade), text | UNIQUE(criteriaId, levelId) |
| `Evaluation` | id, studentId (FK users), teacherId (FK users), rubricId (FK rubrics), status (`draft`/`published`), totalScore, maxScore, globalComment, publishedAt, readAt, createdAt | totalScore/maxScore denormalizados (historial estable) |
| `EvaluationScore` | id, evaluationId (FK cascade), criteriaId (FK rubric_criteria), levelId (FK rubric_levels), score, comment | UNIQUE(evaluationId, criteriaId) |

### Reglas de negocio

- `maxScore = criterios × 4`; `totalScore = Σ score del nivel seleccionado por criterio` (score en vivo en P09).
- Publicar exige todos los criterios con nivel seleccionado (400 si falta alguno).
- Borrar rúbrica = soft archive (`status=archived`), nunca hard delete (las evaluaciones la referencian).
- Editar una rúbrica publicada no altera evaluaciones históricas (totalScore/maxScore denormalizados). **Riesgo aceptado**: sin snapshot en Etapa 1 (mitigación post-MVP: `rubricSnapshot` jsonb).
- "Marcar como leído" es idempotente (set `readAt` si null).
- Los borradores de evaluación nunca son visibles para el alumno.

## Acceptance Criteria

1. **Creación de usuarios jugadores**: ADMIN puede crear un usuario `USER` (email, nombre, password) vía `POST /api/admin/users`; el usuario queda `ACTIVE` y puede loguearse. → Unit (validación Zod + query) + API happy-path con SQL real + guard 401/403.
2. **Editor de rúbrica (P03)**: ADMIN crea/edita una rúbrica con título, categoría, niveles fijos 4 y matriz de descriptores por criterio (mínimo 1 criterio); se persiste con sus levels/criteria/descriptors. → Unit (schema/queries) + API happy-path + E2E.
3. **Biblioteca (P02)**: ADMIN lista sus rúbricas con tabs Activas/Archivadas, crea nueva y archiva una existente (soft). → API happy-path + E2E.
4. **Evaluar (P09)**: ADMIN selecciona alumno + rúbrica, elige nivel por criterio con score en vivo, agrega notas por criterio y comentario global, guarda borrador y publica. → Unit (cálculo de score) + API happy-path + E2E.
5. **Detalle alumno (A03)**: USER ve sus evaluaciones publicadas con score total, comentario del profesor y desglose por criterio; puede marcar como leída (idempotente); empty state si no tiene. → API happy-path + E2E.
6. **Guards y ownership**: sin sesión → 401; USER en endpoints coach → 403; ADMIN en endpoints alumno → 403; coach no accede a rúbricas/evaluaciones ajenas; alumno no accede a evaluaciones ajenas (IDOR). → API guard tests.
7. **API docs**: todos los endpoints nuevos documentados en `lib/api-docs/spec.ts` (paths + schemas). → Gate `--api-docs`.
8. **Calidad**: `npx tsc --noEmit` 0 errores, ESLint 0 errores, build exitoso, cobertura del módulo sin regresión >3% vs baseline. → Gates `--typecheck --lint --build --coverage`.

## Edge Cases

- Rúbrica sin criterios → 400 (mínimo 1 criterio).
- Publicar evaluación con criterio sin nivel → 400.
- Rúbrica con 0 descriptores en un nivel → 400 (cada criterio requiere 4 descriptores en Etapa 1).
- Alumno sin evaluaciones → empty state A03.
- Biblioteca sin rúbricas → empty state P02.
- Evaluación borrador → invisible para el alumno (solo publicadas).
- Marcar como leído repetido → idempotente, sin error.
- Archivar rúbrica usada en evaluaciones → permitido (soft), evaluaciones históricas intactas.
- Títulos de rúbrica duplicados → permitidos (sin UNIQUE).
- Score en vivo: cambiar nivel recalcula totalScore al instante (P09).
- Categoría inválida → 400 (enum cerrado).

## Out-of-Scope (Etapa 2+)

- **Cursos** (P05/P06/P07/P08, `courses`, `course_students`, `course_rubrics`, invite codes) — Etapa 2.
- **Templates** (P04, `rubric_templates` + seed) — Etapa 4.
- **Gestión de alumnos** más allá de creación admin de usuarios (sin auto-registro con rol, sin edición de perfil, sin listado paginado complejo).
- **`padel_role` / `padel_profiles`** — reemplazado por USER/ADMIN (decisión confirmada).
- **Historial (P10)**, **dashboards (P01/A01)**, **notificaciones al publicar**, **splash (SCR-01)**.
- **Niveles editables** (escala fija 4 niveles en Etapa 1).
- **Snapshot de rúbrica al publicar** (post-MVP).
- **Registro público con selector de rol** (SCR-02).

## Dependencias

- Auth existente: `validateUser` / `validateAdmin` (`lib/auth/admin-guard.ts`), auditoría (`lib/audit/helpers.ts`), `lib/api-docs/spec.ts`.
- **Nueva capacidad**: no existe endpoint admin de creación de usuarios → se crea `POST /api/admin/users` (mínimo) + `GET /api/admin/users` (listar jugadores para el picker de P09).
- Migración Drizzle vía `pnpm run db:generate` (nunca SQL a mano) + `db:migrate` + verificación de columnas post-migración.
- Patrón a seguir: queries puras en `lib/db/queries/` (como marketing), validaciones Zod en `lib/validations/`, guards server-side + auditoría en mutaciones.

## Tests Requeridos

| Tipo | Archivos | Cubre |
|------|----------|-------|
| Unit | `tests/unit/db/rubrics.test.ts`, `tests/unit/db/evaluations.test.ts` | schema + queries (CRUD, archive, scores, ownership filters) |
| Unit | `tests/unit/validations/padel.test.ts` | Zod: rubric, evaluation, scores, admin user create |
| Unit | `tests/unit/padel/score.test.ts` | cálculo totalScore/maxScore, publish validation |
| API guard | `tests/api/padel/guard.spec.ts` | 401/403 por endpoint (admin vs user vs sin sesión) |
| API happy | `tests/api/padel/rubrics-happy.spec.ts`, `evaluations-happy.spec.ts`, `student-happy.spec.ts`, `admin-users-happy.spec.ts` | SQL real contra NeonDB (1 happy-path por endpoint) |
| E2E | `tests/e2e/rubric-editor.spec.ts`, `evaluation-flow.spec.ts`, `student-view.spec.ts` | flujo feliz navegable (crear rúbrica → evaluar → publicar → alumno ve y marca leído) |

## Archivos Estimados (referencia para @architect)

- `lib/db/schema.ts` (+6 tablas, +2 enums: `rubric_status`, `evaluation_status`) o split `lib/db/schema/padel.ts`
- `lib/db/queries/padel/rubrics.ts`, `evaluations.ts`, `admin-users.ts`
- `lib/auth/padel-guards.ts` (si se requiere algo más que validateAdmin/validateUser)
- `app/api/admin/users/route.ts`, `app/api/rubrics/**`, `app/api/evaluations/**`, `app/api/student/**` (~15 routes)
- `app/(app)/evaluar/**`, `app/(app)/rubricas/**`, `app/(app)/evaluaciones/**` (o rutas equivalentes de las 4 pantallas)
- `components/padel/**` (scoring-canvas, rubric-editor, rubric-viewer, evaluation-card, empty/loading/error states)
- `lib/api-docs/spec.ts` (+15 paths)
- `tests/**` (unit + API + E2E)