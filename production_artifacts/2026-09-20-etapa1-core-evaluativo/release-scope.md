# Release Scope — Etapa 1: Core Evaluativo

> status: proposed
> release: v0.1
> date: 2026-09-20
> change_id: etapa1-core-evaluativo
> module: admin+api+db+ui
> tags: [rubrics, evaluations, padel, db, migration, api, ui]

## Objetivo del release

Primer release funcional de la app de evaluación de pádel: el loop completo coach → rúbrica → evaluación → alumno, con 4 pantallas del mockup y roles de sistema USER/ADMIN. Sin cursos, sin templates, sin registro con rol.

## In Scope

### DB (migración `0004_*` vía `db:generate`)

- +2 enums: `rubric_status` (`draft`/`active`/`archived`), `evaluation_status` (`draft`/`published`).
- +6 tablas: `rubrics`, `rubric_levels`, `rubric_criteria`, `rubric_descriptors`, `evaluations`, `evaluation_scores`.
- Índices: `rubrics(ownerId)`, `rubric_levels(rubricId)`, `rubric_criteria(rubricId)`, `rubric_descriptors(criteriaId)`, `evaluations(studentId)`, `evaluations(teacherId)`, `evaluations(rubricId)`, `evaluation_scores(evaluationId)`; UNIQUE: `rubric_descriptors(criteriaId, levelId)`, `evaluation_scores(evaluationId, criteriaId)`.
- FKs cascade: levels/criteria/descriptors → rubrics; scores → evaluations. FKs users/rubrics en evaluations sin cascade (protección histórica).

### API (15 endpoints nuevos, contract-first)

| Método + Path | Guard | Propósito |
|---------------|-------|-----------|
| `POST /api/admin/users` | validateAdmin | Crear usuario jugador (USER, ACTIVE) |
| `GET /api/admin/users` | validateAdmin | Listar jugadores (picker P09) |
| `GET /api/rubrics` | validateAdmin (owner) | Biblioteca P02 (filtro status) |
| `POST /api/rubrics` | validateAdmin | Crear rúbrica (P03) |
| `GET /api/rubrics/[id]` | validateAdmin (owner) | Detalle rúbrica (editor) |
| `PUT /api/rubrics/[id]` | validateAdmin (owner) | Editar rúbrica (P03) |
| `DELETE /api/rubrics/[id]` | validateAdmin (owner) | Soft archive (P02) |
| `GET /api/evaluations` | validateAdmin (teacher) | Listar evaluaciones propias (borradores + publicadas) |
| `POST /api/evaluations` | validateAdmin | Crear borrador `{studentId, rubricId}` |
| `GET /api/evaluations/[id]` | validateAdmin (teacher) | Detalle evaluación (P09 resume) |
| `PUT /api/evaluations/[id]` | validateAdmin (teacher) | Guardar scores + comentarios (P09) |
| `POST /api/evaluations/[id]/publish` | validateAdmin (teacher) | Publicar (P09) |
| `GET /api/student/evaluations` | validateUser (owner) | Listar evaluaciones publicadas del alumno |
| `GET /api/student/evaluations/[id]` | validateUser (owner) | Detalle A03 |
| `POST /api/student/evaluations/[id]/read` | validateUser (owner) | Marcar como leído (idempotente) |

Todos documentados en `lib/api-docs/spec.ts` (paths + schemas). Auditoría en mutaciones sensibles (crear/editar rúbrica, crear/publicar evaluación, crear usuario).

### UI (4 pantallas)

- P09 Evaluar Alumno (scoring canvas con score en vivo, notas por criterio, comentario global, guardar/publicar)
- P03 Editor Rúbrica (título, categoría, niveles fijos, matriz de descriptores, añadir criterio)
- A03 Detalle Evaluación (read-only alumno + marcar leído + empty state)
- P02 Biblioteca Rúbricas (tabs activas/archivadas, cards, archivar, empty state)

Sin componentes nuevos: Button/Card/Badge/Tabs/Input/Textarea/Label/Select/Separator del UI kit existente.

### Tests

- Unit: queries rubrics/evaluations, validaciones Zod, cálculo de score, guards.
- API: guard 401/403 + happy-path SQL real por endpoint (mínimo 1 por endpoint).
- E2E: rubric-editor, evaluation-flow (coach), student-view (alumno).

## Out of Scope (este release)

- Cursos (Etapa 2): `courses`, `course_students`, `course_rubrics`, invite codes, P05/P06/P07/P08.
- Templates (Etapa 4): `rubric_templates`, seed, P04.
- `padel_role` / `padel_profiles` (reemplazado por USER/ADMIN).
- Registro público con selector de rol (SCR-02).
- Historial (P10), dashboards (P01/A01), notificaciones al publicar, splash (SCR-01).
- Niveles editables, snapshot de rúbrica al publicar, gestión avanzada de alumnos.

## Criterios de Release (gates)

| Gate | Criterio |
|------|----------|
| `--typecheck` | 0 errores TS |
| `--lint` | 0 errores ESLint |
| `--tests` | Unit + API passing |
| `--e2e` | 3 E2E specs passing |
| `--build` | Build exitoso |
| `--coverage` | Sin regresión >3% vs `.validation/coverage-baseline.json` |
| `--api-docs` | 15 endpoints en `lib/api-docs/spec.ts` |
| `--api_integration` | Happy-path con SQL real contra NeonDB |
| `--features` / `--docs` | FEATURES.md actualizado, metadata válida |

## Rollout

1. @db-engineer: schema + migración `0004_*` + queries + unit tests.
2. @auth-security: validar guards (validateAdmin/validateUser), auditoría, auth-impact.md.
3. @app-engineer: APIs + 4 pantallas + api-docs + tests.
4. @ponytail-reviewer: revisión de simplicidad.
5. @qa-release: E2E + test-matrix + release-report + acceptance-criteria.

## Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Editar rúbrica publicada altera evaluaciones históricas | Media | totalScore/maxScore denormalizados; snapshot post-MVP |
| Creación de usuarios admin es capacidad nueva (no existía) | Media | Endpoint mínimo con validación Zod + auditoría; sin auto-registro |
| Canvas P09 (score en vivo) es el item de mayor complejidad UI | Media | Prototipar primero; estado local + persistencia en borrador |

## Métricas de Loop

- Registrar al cerrar: `node scripts/loop-metrics.js --record etapa1-core-evaluativo --iterations <n> --gates-failed <n> --module admin`