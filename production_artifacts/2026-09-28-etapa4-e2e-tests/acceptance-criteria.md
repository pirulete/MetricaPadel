# Acceptance Criteria — E2E Etapa 4 (G6/G7/G12)

> change_id: etapa4-e2e-tests-2026-09-28
> date: 2026-09-28

## G6 — Versionado de evaluaciones (evaluation-version.spec.ts)

| # | Criterio | Estado |
|---|----------|--------|
| AC-1 | Publicar una evaluación por primera vez asigna `version = 1` | ✅ (assert en test) |
| AC-2 | Publicar una segunda evaluación para el mismo (studentId, rubricId) asigna `version = 2` | ✅ (assert en test) |
| AC-3 | La lista del alumno (`/evaluaciones`) muestra badge `v2` (y `v1`) en evaluation-card cuando version > 1 | ✅ (assert en test) |
| AC-4 | `GET /api/evaluations/series?studentId&rubricId` retorna 200 con 2 versiones ordenadas [1, 2] para el coach | ❌ **BUG-E2E-01 — endpoint no implementado** |
| AC-5 | El coach puede ver el historial (`/historial`) con ambas evaluaciones publicadas | ✅ (assert en test) |
| AC-6 | Los drafts no incrementan versión (version null hasta publicar) | ✅ (cubierto por unit tests existentes) |

### Edge cases

- EC-1: Publicar con criterios sin score → 400 (validado por `publishEvaluation`, no en E2E).
- EC-2: Re-publicar la misma evaluación (ya published) → 400 not_draft.
- EC-3: Serie con alumno/rúbrica ajenos al coach → [] (anti-IDOR, pendiente de implementación del endpoint).

## G7 — Evolución del alumno (student-evolution.spec.ts)

| # | Criterio | Estado |
|---|----------|--------|
| AC-1 | `/evolucion` muestra heading "Mi evolución" para USER | ✅ (assert en test) |
| AC-2 | Cada categoría con evaluaciones muestra trend indicator (Mejorando/En descenso/Estable) | ✅ (assert "Mejorando" con scores 3→4) |
| AC-3 | Alumno sin evaluaciones ve empty state "Sin datos de evolución todavía" | ✅ (assert en test) |
| AC-4 | Bottom-nav de USER incluye link "Evolución" → `/evolucion` | ✅ (assert en test) |
| AC-5 | ADMIN/SUPER_ADMIN son redirigidos a /dashboard (guard server-side) | ✅ (cubierto por unit/guard tests) |

### Edge cases

- EC-1: Una sola evaluación → trend "Estable" (computeTrend con <2 puntos).
- EC-2: Scores iguales → "Estable"; último > anterior → "Mejorando"; último < anterior → "En descenso".
- EC-3: Evaluaciones sin categoría se omiten del agrupado (groupByCategory).

## G12 — Gestión de alumnos en curso (course-students.spec.ts)

| # | Criterio | Estado |
|---|----------|--------|
| AC-1 | Detalle de curso muestra tab "Alumnos" para coach | ✅ (assert en test) |
| AC-2 | Modal "Agregar alumno" abre y permite buscar por nombre/email | ✅ (assert en test) |
| AC-3 | Al agregar un alumno, aparece en la lista de alumnos del curso | ✅ (assert en test) |
| AC-4 | Remover alumno (con confirmación) responde 200 y lo quita de la lista | ✅ (assert en test) |
| AC-5 | Solo se muestran alumnos activos no inscritos en la búsqueda | ✅ (cubierto por API tests happy-path) |

### Edge cases

- EC-1: Agregar alumno ya inscrito → 409 (cubierto por API tests).
- EC-2: Buscar sin resultados → empty state "Sin resultados" en el modal.
- EC-3: Remover conserva las evaluaciones del alumno (DELETE solo borra enrollment).
- EC-4: Curso ajeno al coach → 404 (anti-IDOR, cubierto por API tests).