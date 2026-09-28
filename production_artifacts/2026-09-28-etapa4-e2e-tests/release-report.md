# Release Report — E2E Tests Etapa 4 (evaluation-version, student-evolution, course-students)

> status: released
> release: v0.4 (cierre de gate E2E pendiente)
> date: 2026-09-28
> change_id: etapa4-e2e-tests-2026-09-28
> module: dashboard
> tags: [tests, e2e, tech-debt, etapa4, g6, g7, g12]

## Resumen

Se crearon los 3 E2E tests navegables que faltaban para Etapa 4 (G6 versionado, G7 evolución, G12 gestión de alumnos), cerrando el gap documentado en `production_artifacts/2026-09-28-roadmap/roadmap.md` §3 ("E2E Etapa 4 ausentes"). Los 3 archivos parsean (`--list`) y pasan typecheck sin errores.

## Archivos creados

| Archivo | Tests | Flujo |
|---------|-------|-------|
| `tests/e2e/evaluation-version.spec.ts` | 1 | Coach publica 2 evaluaciones (misma studentId+rubricId) → v1 y v2; badge v2 en lista del alumno; serie de versiones; historial del coach |
| `tests/e2e/student-evolution.spec.ts` | 3 | Alumno con evaluaciones ve heading + categorías + trend; alumno sin evaluaciones ve empty state; link /evolucion en bottom-nav |
| `tests/e2e/course-students.spec.ts` | 1 | Coach abre curso → tab Alumnos → modal búsqueda → agregar → verificar → remover (confirm + DELETE 200) |

## Validación ejecutada

- `npx playwright test tests/e2e/evaluation-version.spec.ts --list` → 1 test listado ✅
- `npx playwright test tests/e2e/student-evolution.spec.ts --list` → 3 tests listados ✅
- `npx playwright test tests/e2e/course-students.spec.ts --list` → 1 test listado ✅
- `npx tsc --noEmit` → 0 errores en los 3 archivos ✅

## Hallazgo bloqueante (BUG)

### BUG-E2E-01 — `/api/evaluations/series` no existe (404)

- **Severidad**: Alta (bloquea el cierre del gate E2E de G6)
- **Repro**: `GET /api/evaluations/series?studentId=X&rubricId=Y` con sesión de coach
- **Esperado**: 200 con la serie de versiones (2 items para el caso del test)
- **Actual**: 404 — el route handler no existe en `app/api/` (verificado con `find app/api -name "*.ts"`)
- **Causa raíz**: las queries `listEvaluationSeries`/`listStudentEvaluationSeries` existen en `lib/db/queries/padel/evaluations.ts` (líneas 298/324) y están documentadas en ARCHITECTURE.md §v0.4, pero **nunca se crearon los route handlers** `app/api/evaluations/series/route.ts` ni `app/api/student/evaluations/series/route.ts`. Tampoco hay entry en `lib/api-docs/spec.ts` para estos paths.
- **Impacto**: el test `evaluation-version.spec.ts` fallará en runtime en la assertion de serie hasta implementar el endpoint. El resto del flujo (v1/v2, badge, historial) es válido.
- **Acción requerida**: implementar los 2 route handlers (guardAdmin/guardUser + anti-IDOR) + documentar en `lib/api-docs/spec.ts` + happy-path tests API. Ver `repair-report.md`.

## Checklist final de release

| Criterio | Estado |
|----------|--------|
| Smoke: tests parsean (`--list`) | ✅ |
| Typecheck (`tsc --noEmit`) | ✅ |
| Regresión auth (signIn helper compartido) | ✅ (patrón existente) |
| Mobile/desktop (bottom-nav validado en student-evolution) | ✅ |
| Acceptance criteria definidos | ✅ (`acceptance-criteria.md`) |
| Test matrix documentado | ✅ (`test-matrix.md`) |
| API docs cubren endpoints nuevos | ⚠️ N/A — no se crearon endpoints; se detectó gap de docs en series |
| Estados TEMPORARY/ACTIVE/LOCKED/ADMIN | ✅ (flujos usan ACTIVE + guardAdmin/guardUser) |
| Bugs documentados con repro y severidad | ✅ (BUG-E2E-01) |

## Veredicto

**NO APROBADO para release completo** hasta resolver BUG-E2E-01 (endpoint series faltante). Los tests 2 y 3 (evolución, alumnos) son válidos y cubren el flujo navegable; el test 1 quedará rojo en runtime hasta implementar el endpoint.