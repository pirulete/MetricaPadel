# Release Scope — v0.4: Evolución del Alumno y Gestión de Alumnos por Curso

> status: proposed
> release: v0.4
> date: 2026-09-21
> change_id: etapa4-evolution-management
> module: api+db+ui
> tags: [release-scope, padel, evaluations, evolution, courses, enrollment]

## Objetivo del Release

Cerrar los 3 gaps HIGH restantes del loop evaluativo (`production_artifacts/2026-09-21-user-flows-v2.md` §7): G6 (re-evaluación/versiones), G7 (evolución/comparativa del alumno) y G12 (gestión de alumnos por curso desde el coach).

## Features Incluidas

| Feature | change_id | Módulo | Prioridad | Depende de |
|---|---|---|---|---|
| G6 — Versiones de evaluación | g6-evaluation-versions | api+db+ui | HIGH | — |
| G7 — Vista de evolución alumno | g7-student-evolution | api+ui | HIGH | G6 |
| G12 — Gestión de alumnos por curso | g12-course-students | api+db+ui | HIGH | — |

## Orden de Ejecución

1. **G6** (base de datos + publish con versión + series API) — prerequisito de G7.
2. **G7** (lógica pura `evolution.ts` + endpoint + página `/evolucion`).
3. **G12** (queries enrollment + 3 endpoints + UI tab Alumnos) — puede ejecutarse en paralelo con G6/G7.

## Impacto Esperado

- **DB**: 1 migración (`0006_*`): `evaluations.version` + índice `(studentId, rubricId, status)` + backfill de versiones legacy. Sin tablas nuevas.
- **API**: 5 endpoints nuevos (`GET /api/evaluations/series`, `GET /api/student/evaluations/series`, `GET /api/student/evolution`, `POST /api/courses/[id]/students`, `DELETE /api/courses/[id]/students/[studentId]`, `GET /api/courses/[id]/students/search`) + 1 modificado (`POST /api/evaluations/[id]/publish` → `version` en respuesta).
- **UI**: 1 página nueva (`/evolucion`), 3 componentes nuevos/modificados (`evolution-view`, `scoring-canvas` badge versión, `course-detail` tab Alumnos), `bottom-nav` + link.
- **Tests**: unit (evaluations, evolution, enrollments), API happy-path con SQL real + guards, E2E por feature (3 nuevos).
- **API docs**: `lib/api-docs/paths/{padel,courses}.ts` + `schemas/{padel,courses}.ts` actualizados.

## Criterios de Salida (Definition of Done)

- [ ] Migración `0006_*` aplicada y verificada (`SELECT column_name FROM information_schema.columns WHERE table_name='evaluations' AND column_name='version'`).
- [ ] Gates del harness: typecheck 0 errores, lint 0 errores, build OK, unit tests + API tests + E2E pasando, cobertura del módulo padel sin regresión >3%.
- [ ] Todos los endpoints nuevos documentados en `lib/api-docs/spec.ts`.
- [ ] FEATURES.md actualizado con entrada `etapa4-evolution-management` (status: released al cerrar).
- [ ] Auditoría presente en todas las mutaciones (publish, add/remove student).
- [ ] Anti-IDOR verificado: recurso ajeno → 404 en los 3 gaps.

## Out-of-Scope (v0.4)

- G1 (edición de perfil desde admin), G2 (export CSV), G13 (notificación al coach al marcar leída), G14 (plantillas de rúbrica en UI), G15 (paginación en listados), G16 (soft-delete de evaluaciones), G17 (E2E Etapa 1 pendientes).
- Charts con librería externa para la evolución (UI nativa).
- Comparativa de tendencia para el coach (solo alumno).

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Backfill de versiones legacy incorrecto | Migración con UPDATE ordenado por publishedAt; verificación SQL post-migración |
| Regresión de cobertura en módulo padel | Unit tests por query nueva + baseline `--coverage` |
| Anti-IDOR roto en series/evolution | Tests 404 explícitos por endpoint |
| UI de tendencia sin charts | Badge/divs nativos, sin dependencias nuevas |

## Artifacts Relacionados

- `production_artifacts/2026-09-21-etapa4-evolution-management/feature-spec.md`
- `production_artifacts/2026-09-21-user-flows-v2.md` (§7 gaps)