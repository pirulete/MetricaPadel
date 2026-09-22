# Change Map — Etapa 1: Core Evaluativo

> change_id: etapa1-core-evaluativo
> release: v0.1
> date: 2026-09-20

## Resumen de impacto

| Área | Archivos nuevos | Archivos modificados | Total |
|------|-----------------|----------------------|-------|
| DB | 0 | 1 | 1 |
| Queries | 3 | 0 | 3 |
| Lógica padel | 1 | 0 | 1 |
| Validaciones | 1 | 0 | 1 |
| API routes | 9 | 0 | 9 |
| API docs | 2 | 1 | 3 |
| UI páginas | 7 | 0 | 7 |
| Componentes | 7 | 0 | 7 |
| Tests | 13 | 0 | 13 |
| Docs | 0 | 2 | 2 |
| **Total** | **43** | **4** | **47** |

## Archivos por agente

### @db-engineer (orden 1)

| Archivo | Acción | Tamaño est. | Notas |
|---------|--------|-------------|-------|
| `lib/db/schema.ts` | Modificar | ~540 (excepción 500 líneas aplica a schema.ts) | +3 enums (`rubric_status`, `evaluation_status`, `rubric_category`), +6 tablas, +relations |
| `drizzle/0004_*.sql` | Generar | ~150 | vía `pnpm run db:generate` + `db:migrate` + verificación columnas |
| `lib/db/queries/padel/rubrics.ts` | Crear | ~180 | CRUD transaccional + list con counts + archive + ownership |
| `lib/db/queries/padel/evaluations.ts` | Crear | ~200 | CRUD + scores + publish + markRead + ownership |
| `lib/db/queries/padel/admin-users.ts` | Crear | ~60 | createActiveUser (bcrypt) + listPlayers |
| `tests/unit/db/rubrics.test.ts` | Crear | ~150 | |
| `tests/unit/db/evaluations.test.ts` | Crear | ~170 | |
| `tests/unit/db/admin-users.test.ts` | Crear | ~80 | |

### @auth-security (orden 2)

| Archivo | Acción | Tamaño est. | Notas |
|---------|--------|-------------|-------|
| `lib/auth/admin-guard.ts` | Sin cambios | — | Reutiliza guardAdmin/guardUser/validateAdmin/validateUser |
| `app/api/admin/users/route.ts` | Crear (revisar) | ~90 | Validar creación ACTIVE + auditoría + 409 |
| `production_artifacts/.../auth-impact.md` | Crear | — | |
| `production_artifacts/.../security-checklist.md` | Crear | — | |

### @app-engineer (orden 3)

| Archivo | Acción | Tamaño est. | Notas |
|---------|--------|-------------|-------|
| `lib/validations/padel.ts` | Crear | ~120 | Schemas Zod sección 5.5 |
| `lib/padel/score.ts` | Crear | ~40 | Funciones puras score |
| `app/api/admin/users/route.ts` | Crear | ~90 | GET + POST |
| `app/api/rubrics/route.ts` | Crear | ~110 | GET + POST |
| `app/api/rubrics/[id]/route.ts` | Crear | ~140 | GET + PUT + DELETE |
| `app/api/evaluations/route.ts` | Crear | ~110 | GET + POST |
| `app/api/evaluations/[id]/route.ts` | Crear | ~130 | GET + PUT |
| `app/api/evaluations/[id]/publish/route.ts` | Crear | ~70 | POST |
| `app/api/student/evaluations/route.ts` | Crear | ~70 | GET |
| `app/api/student/evaluations/[id]/route.ts` | Crear | ~80 | GET |
| `app/api/student/evaluations/[id]/read/route.ts` | Crear | ~60 | POST |
| `lib/api-docs/paths/padel.ts` | Crear | ~300 | 15 paths |
| `lib/api-docs/schemas/padel.ts` | Crear | ~200 | Schemas OpenAPI |
| `lib/api-docs/spec.ts` | Modificar | ~330 | +imports, +2 tags |
| `app/(app)/rubricas/page.tsx` | Crear | ~120 | P02 biblioteca |
| `app/(app)/rubricas/nueva/page.tsx` | Crear | ~40 | P03 wrapper |
| `app/(app)/rubricas/[id]/page.tsx` | Crear | ~50 | P03 editor |
| `app/(app)/evaluar/page.tsx` | Crear | ~60 | P09 nuevo |
| `app/(app)/evaluar/[id]/page.tsx` | Crear | ~60 | P09 resume |
| `app/(app)/evaluaciones/page.tsx` | Crear | ~100 | A03 lista + empty |
| `app/(app)/evaluaciones/[id]/page.tsx` | Crear | ~90 | A03 detalle |
| `components/padel/scoring-canvas.tsx` | Crear | ~220 | Score en vivo (mayor complejidad) |
| `components/padel/rubric-editor.tsx` | Crear | ~180 | Matriz descriptores |
| `components/padel/rubric-viewer.tsx` | Crear | ~100 | Read-only alumno |
| `components/padel/rubric-card.tsx` | Crear | ~70 | Card biblioteca |
| `components/padel/evaluation-card.tsx` | Crear | ~60 | Card lista alumno |
| `components/padel/student-picker.tsx` | Crear | ~60 | Selector alumno P09 |
| `components/padel/empty-state.tsx` | Crear | ~40 | Reutilizable |
| `tests/unit/validations/padel.test.ts` | Crear | ~120 | |
| `tests/unit/padel/score.test.ts` | Crear | ~60 | |
| `tests/api/padel/guard.spec.ts` | Crear | ~200 | 401/403/IDOR |
| `tests/api/padel/admin-users-happy.spec.ts` | Crear | ~80 | SQL real |
| `tests/api/padel/rubrics-happy.spec.ts` | Crear | ~150 | SQL real |
| `tests/api/padel/evaluations-happy.spec.ts` | Crear | ~170 | SQL real |
| `tests/api/padel/student-happy.spec.ts` | Crear | ~120 | SQL real |
| `tests/e2e/rubric-editor.spec.ts` | Crear | ~120 | P02+P03 |
| `tests/e2e/evaluation-flow.spec.ts` | Crear | ~150 | P09 |
| `tests/e2e/student-view.spec.ts` | Crear | ~120 | A03 |
| `ARCHITECTURE.md` | Modificar | — | Sección Padel Evaluativo |
| `FEATURES.md` | Modificar | — | Entrada del cambio |

### @qa-release (orden 5)

| Archivo | Acción | Notas |
|---------|--------|-------|
| `production_artifacts/.../test-matrix.md` | Crear | |
| `production_artifacts/.../acceptance-criteria.md` | Crear | |
| `production_artifacts/.../release-report.md` | Crear | |

## Archivos que NO se tocan

- `auth.ts`, `lib/auth/admin-guard.ts` (reutilización)
- `lib/db/queries/auth.ts` (se reutiliza `bcrypt`; no se modifica)
- `drizzle.config.ts` (schema sigue en `lib/db/schema.ts`)
- `.env.example` (sin variables nuevas)
- `AGENTS.md` (sin cambios de roles/workflows)
- Endpoints existentes (`/api/auth/*`, `/api/user/*`, `/api/admin/marketing/*`)

## Orden de ejecución

1. @db-engineer → schema + migración + queries + unit tests DB
2. @auth-security → revisión guards/auditoría + auth-impact
3. @app-engineer → validaciones + score + endpoints + api-docs + UI + tests
4. @ponytail-reviewer → simplificación
5. @qa-release → E2E + release

## Gates a validar

`--typecheck --lint --tests --e2e --build --coverage --api-docs --api_integration --features --docs`