# Change Map — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: etapa2-3-onboarding-dashboard
> release: v0.2
> date: 2026-09-21
> Límite: 500 líneas por archivo (excepciones: lib/constants/*, lib/db/schema.ts, scripts/*)

## Resumen de tamaño

| Tipo | Archivos | Líneas estimadas |
|------|----------|------------------|
| DB | 4 (schema.ts + 3 queries) | ~700 |
| API | 9 route handlers | ~700 |
| UI | 5 páginas + 10 componentes | ~1100 |
| Lógica pura | 2 archivos | ~120 |
| Validaciones | 1 (ampliar) | ~+60 |
| API docs | 3 (2 nuevos + spec.ts) | ~450 |
| Tests | 12 | ~1600 |
| Docs | 3 | ~150 |

## DB (agente: @db-engineer)

| Archivo | Acción | Líneas est. | Split | Notas |
|---------|--------|-------------|-------|-------|
| `lib/db/schema.ts` | Modificar | 564 → ~690 | No (excepción 500 líneas) | +2 enums, +3 tablas, +relations, +types, `evaluations.courseId` nullable |
| `lib/db/queries/padel/courses.ts` | Crear | ~260 | No | CRUD cursos, enrollments, course_rubrics, join, ownership |
| `lib/db/queries/padel/dashboard.ts` | Crear | ~120 | No | Métricas teacher/student |
| `lib/db/queries/padel/history.ts` | Crear | ~80 | No | Historial + filtros |
| `lib/db/queries/padel/index.ts` | Modificar | 3 → ~6 | No | Exportar nuevos módulos |
| `drizzle/0005_*.sql` | Generado | ~120 | No | Vía `pnpm run db:generate` (nunca SQL a mano) |

## Lógica pura (agente: @app-engineer)

| Archivo | Acción | Líneas est. | Notas |
|---------|--------|-------------|-------|
| `lib/padel/course-code.ts` | Crear | ~50 | generateInviteCode (retry), normalize, validate |
| `lib/padel/dashboard.ts` | Crear | ~70 | computeAverage (null-safe), deriveLevel, isClassToday |

## Validaciones (agente: @app-engineer)

| Archivo | Acción | Líneas est. | Notas |
|---------|--------|-------------|-------|
| `lib/validations/padel.ts` | Modificar | 80 → ~140 | courseCreate/Update, courseJoin, courseRubricAssign, historyQuery |

## API (agente: @app-engineer, con @auth-security en guards)

| Archivo | Acción | Líneas est. | Guard | Notas |
|---------|--------|-------------|-------|-------|
| `app/api/auth/register/route.ts` | Modificar | 128 → ~140 | público + rate limit | `role?` opcional ignorado (nunca ADMIN) |
| `app/api/courses/route.ts` | Crear | ~90 | guardAdmin | GET list + POST create |
| `app/api/courses/[id]/route.ts` | Crear | ~130 | guardAdmin + owner | GET detail, PUT, DELETE soft archive |
| `app/api/courses/join/route.ts` | Crear | ~80 | guardUser | POST join (404/409/400) |
| `app/api/courses/[id]/rubrics/route.ts` | Crear | ~90 | guardAdmin + owner | GET list + POST assign (409) |
| `app/api/dashboard/teacher/route.ts` | Crear | ~60 | guardAdmin | Métricas P01 |
| `app/api/dashboard/student/route.ts` | Crear | ~60 | guardUser | A01 (nivel, cursos, notificaciones) |
| `app/api/history/route.ts` | Crear | ~70 | guardAdmin + teacherId | P10 + filtros |

## UI (agente: @app-engineer)

| Archivo | Acción | Líneas est. | Pantalla |
|---------|--------|-------------|----------|
| `app/(public)/register/page.tsx` | Modificar | 11 → ~120 | SCR-02 |
| `app/(public)/login/page.tsx` | Modificar | 11 → ~110 | SCR-03 |
| `app/(app)/dashboard/page.tsx` | Modificar | 11 → ~40 | Router por rol (P01/A01) |
| `app/(app)/cursos/page.tsx` | Crear | ~80 | P05 |
| `app/(app)/cursos/[id]/page.tsx` | Crear | ~100 | P07 |
| `app/(app)/historial/page.tsx` | Crear | ~70 | P10 |

## Componentes (agente: @app-engineer)

| Archivo | Acción | Líneas est. | Notas |
|---------|--------|-------------|-------|
| `components/padel/bottom-nav.tsx` | Crear | ~60 | Compartido P01/A01 |
| `components/padel/course-card.tsx` | Crear | ~60 | P05 |
| `components/padel/course-detail.tsx` | Crear | ~120 | P07 tabs Alumnos/Rúbricas |
| `components/padel/create-course-modal.tsx` | Crear | ~120 | P06 |
| `components/padel/join-course-modal.tsx` | Crear | ~80 | A02 |
| `components/padel/assign-rubric-modal.tsx` | Crear | ~140 | P08 2 pasos |
| `components/padel/history-list.tsx` | Crear | ~110 | P10 + filtros |
| `components/padel/dashboard-metrics.tsx` | Crear | ~70 | P01 métricas |
| `components/padel/teacher-dashboard.tsx` | Crear | ~90 | P01 |
| `components/padel/student-dashboard.tsx` | Crear | ~90 | A01 |

## API Docs (agente: @app-engineer)

| Archivo | Acción | Líneas est. | Notas |
|---------|--------|-------------|-------|
| `lib/api-docs/paths/courses.ts` | Crear | ~250 | ~13 endpoints |
| `lib/api-docs/schemas/courses.ts` | Crear | ~180 | DTOs cursos/dashboard/history |
| `lib/api-docs/spec.ts` | Modificar | 299 → ~320 | imports, tags, register/evaluations desc |

## Tests (agente: @app-engineer + @qa-release)

| Archivo | Acción | Líneas est. | Tipo |
|---------|--------|-------------|------|
| `tests/unit/db/courses.test.ts` | Crear | ~250 | Unit |
| `tests/unit/padel/course-code.test.ts` | Crear | ~80 | Unit |
| `tests/unit/padel/dashboard.test.ts` | Crear | ~100 | Unit |
| `tests/unit/validations/padel.test.ts` | Modificar | +60 | Unit |
| `tests/api/padel/courses-guard.spec.ts` | Crear | ~120 | API guard |
| `tests/api/padel/courses-happy.spec.ts` | Crear | ~180 | API happy SQL real |
| `tests/api/padel/join-happy.spec.ts` | Crear | ~120 | API happy + edge cases |
| `tests/api/padel/dashboard-happy.spec.ts` | Crear | ~120 | API happy SQL real |
| `tests/api/padel/history-happy.spec.ts` | Crear | ~100 | API happy + IDOR |
| `tests/e2e/onboarding.spec.ts` | Crear | ~120 | E2E |
| `tests/e2e/course-flow.spec.ts` | Crear | ~150 | E2E |
| `tests/e2e/dashboard.spec.ts` | Crear | ~130 | E2E |

## Docs (agente: @architect + @qa-release)

| Archivo | Acción | Notas |
|---------|--------|-------|
| `ARCHITECTURE.md` | Modificar | Sección Padel: tablas nuevas, evaluations.courseId, endpoints, migración 0005 |
| `FEATURES.md` | Modificar | Entrada con metadata del change_id al cierre |
| `production_artifacts/2026-09-21-etapa2-3-onboarding-dashboard/auth-impact.md` | Crear | @auth-security |
| `production_artifacts/2026-09-21-etapa2-3-onboarding-dashboard/security-checklist.md` | Crear | @auth-security |
| `production_artifacts/2026-09-21-etapa2-3-onboarding-dashboard/db-plan.md` + `migration-notes.md` | Crear | @db-engineer |
| `production_artifacts/2026-09-21-etapa2-3-onboarding-dashboard/app-notes.md` | Crear | @app-engineer |
| `production_artifacts/2026-09-21-etapa2-3-onboarding-dashboard/ponytail-review-report.md` | Crear | @ponytail-reviewer |
| `production_artifacts/2026-09-21-etapa2-3-onboarding-dashboard/release-report.md` + `test-matrix.md` + `acceptance-criteria.md` + `evidence-manifest.json` | Crear | @qa-release |

## Sin cambios

- `auth.ts`, `lib/auth/admin-guard.ts`, `lib/auth/protected-routes.ts` (guards reutilizados; solo documentar en auth-impact).
- `.env.example` (sin variables nuevas).
- `AGENTS.md` (sin cambios de roles/workflows).
- Tablas Etapa 1 `rubrics`/`rubric_levels`/`rubric_criteria`/`rubric_descriptors`/`evaluation_scores` (intactas; solo `evaluations.courseId` aditivo).

## Orden de ejecución

1. @db-engineer (schema → migración 0005 → queries → unit tests)
2. @auth-security (guards/registro/auditoría)
3. @app-engineer (API → UI → api-docs → tests)
4. @ponytail-reviewer
5. @qa-release (E2E + artifacts finales)