# Test Matrix — E2E Etapa 4 (G6/G7/G12)

> change_id: etapa4-e2e-tests-2026-09-28
> date: 2026-09-28

## Resumen

| Archivo | Tests | Parse (`--list`) | Typecheck | Runtime |
|---------|-------|------------------|-----------|---------|
| `tests/e2e/evaluation-version.spec.ts` | 1 | ✅ | ✅ | ⚠️ Falla en assertion de serie (BUG-E2E-01) |
| `tests/e2e/student-evolution.spec.ts` | 3 | ✅ | ✅ | Pendiente (requiere servidor + DB) |
| `tests/e2e/course-students.spec.ts` | 1 | ✅ | ✅ | Pendiente (requiere servidor + DB) |

## Detalle por test

### evaluation-version.spec.ts — "publicar dos veces genera v1 y v2 + badge v2 + serie + historial"

| Paso | Assertion | Estado esperado |
|------|-----------|-----------------|
| signIn coach + POST /api/evaluations | 201 | ✅ |
| PUT /api/evaluations/[id] (scores) | 200 | ✅ |
| POST /api/evaluations/[id]/publish (1ª) | 200 + `version === 1` | ✅ |
| POST /api/evaluations/[id]/publish (2ª) | 200 + `version === 2` | ✅ |
| Login alumno → /evaluaciones | badge `v2` y `v1` visibles en evaluation-card | ✅ |
| GET /api/evaluations/series?studentId&rubricId | 200 + 2 items con versiones [1,2] | ❌ **404 — endpoint no existe (BUG-E2E-01)** |
| Coach → /historial | "Player EvalVer" + título rúbrica + "Publicada" | ✅ |

### student-evolution.spec.ts

| Test | Assertions | Estado esperado |
|------|-----------|-----------------|
| alumno con evaluaciones | heading "Mi evolución"; categoría "Técnica Básica"; badge "Mejorando" (trend up 3→4); badge `v2` | ✅ |
| alumno sin evaluaciones | heading "Mi evolución"; empty state "Sin datos de evolución todavía" | ✅ |
| bottom-nav USER | link "Evolución" visible con href `/evolucion` | ✅ |

### course-students.spec.ts — "tab Alumnos → agregar alumno → verificar → remover"

| Paso | Assertion | Estado esperado |
|------|-----------|-----------------|
| /cursos/[id] | tab "Alumnos" y "Rúbricas" visibles | ✅ |
| Click "Agregar alumno" | dialog visible + heading "Agregar alumno" | ✅ |
| Buscar por email | resultado "Player CourseStu" visible | ✅ |
| Click "Agregar" | email y nombre visibles en lista | ✅ |
| Click remover (confirm aceptado) | DELETE responde 200 | ✅ |
| Post-remover | email y nombre ya no visibles | ✅ |

## Setup / Cleanup

- **beforeAll**: usuarios (ADMIN coach, USER alumno) con bcrypt + SQL real; rúbrica con criterio/niveles/descriptors; curso activo; evaluaciones publicadas con versiones (v1/v2) y scores.
- **afterAll**: borrado en cascada manual (evaluation_scores → evaluations → rubric_descriptors → rubric_criteria → rubric_levels → rubrics → course_enrollments → course_rubrics → courses → users).
- **Helpers**: `serverUp()` (tests/api/auth/helpers.ts) para skip si no hay servidor; `signIn()` (tests/api/admin/marketing/helpers.ts) con cookie jar compartido con el browser context.

## Clasificación

- **Bug real**: BUG-E2E-01 (endpoint `/api/evaluations/series` ausente) — no es test desactualizado; el feature G6 quedó incompleto (queries sin route handler).
- **Tests**: correctos según spec de Etapa 4 y comportamiento real de la UI (evaluation-card badge v2, evolution-view trend, course-detail tabs).