# App Notes — Etapa 4: Evolución del Alumno y Gestión de Alumnos por Curso (G6 + G7 + G12)

> status: in-progress
> release: v0.4
> date: 2026-09-21
> change_id: etapa4-evolution-management
> module: api+ui
> tags: [padel, evaluations, versions, evolution, courses, enrollment, api, ui]

---

## Resumen

Implementación de la capa de aplicación (routes + UI + docs + tests) sobre la capa DB ya completada (migración `0007_*`, queries en `lib/db/queries/padel/`).

## Archivos Nuevos

| Archivo | Propósito |
|---|---|
| `lib/padel/evolution.ts` | Lógica pura G7: `computeTrend(scores)` → up/down/stable; `groupByCategory<T>` genérica. Sin imports server-side. |
| `app/api/student/evolution/route.ts` | GET — guardUser + ACTIVE + role USER; `listStudentEvolution` → grupos con trend. Anti-IDOR por studentId de sesión. |
| `app/(app)/evolucion/page.tsx` | Server component: `auth()` + `listStudentEvolution` + `computeTrend`/`groupByCategory` → `<EvolutionView>`. |
| `components/padel/evolution-view.tsx` | Client: tarjeta por categoría (flecha trend, última vs anterior, lista de versiones con badge v{N}). |
| `components/padel/add-student-modal.tsx` | Client: Dialog con búsqueda debounced 300ms → `GET /students/search`, click agrega → `POST /students`. |
| `app/api/courses/[id]/students/route.ts` | POST — guardAdmin + ownership curso (404 anti-IDOR) + `addStudentToCourse` (400/404/409) + auditCreate. |
| `app/api/courses/[id]/students/[studentId]/route.ts` | DELETE — guardAdmin + ownership + `removeStudentFromCourse` (404) + auditDelete. |
| `app/api/courses/[id]/students/search/route.ts` | GET ?q= — guardAdmin + ownership + `searchCourseCandidates` (limit 20). Solo lectura, sin auditoría. |
| `lib/api-docs/paths/evolution.ts` | Paths OpenAPI G7 (tag `Padel Evolution`). |
| `tests/unit/padel/evolution.test.ts` | 7 casos, 100% cobertura. |
| `tests/api/padel/student-evolution-happy.spec.ts` | Happy-path SQL real: 2 categorías, versiones 1/2, trend stable, 403 ADMIN. |
| `tests/api/padel/course-students-happy.spec.ts` | Happy-path SQL real: add 201, dup 409, search excluye inscritos, remove 200/404, IDOR 404. |
| `tests/api/padel/course-students.spec.ts` | Guards: 401 sin sesión (4 endpoints) + 403 de rol (USER en coach, ADMIN en evolution). |

## Archivos Modificados

| Archivo | Cambio |
|---|---|
| `components/padel/evaluation-card.tsx` | +`version` en tipo; badge `v{N}` cuando version > 1. |
| `components/padel/scoring-canvas.tsx` | +state `version`; badge `v{N}` en header al editar evaluación existente. |
| `components/padel/bottom-nav.tsx` | +item `/evolucion` (icono TrendingUp) en USER_ITEMS. |
| `components/padel/course-detail.tsx` | Tab Alumnos: botón "Agregar alumno" (AddStudentModal), botón remover por fila con confirmación + `router.refresh()`. |
| `lib/validations/padel.ts` | +`courseStudentAddSchema`, +`courseStudentSearchQuerySchema` (+types). |
| `lib/api-docs/paths/courses.ts` | +3 endpoints G12 (`/students`, `/students/{studentId}`, `/students/search`). |
| `lib/api-docs/schemas/padel.ts` | +`EvolutionGroupDto`. |
| `lib/api-docs/schemas/courses.ts` | +`CourseStudentAddInput`, +`CourseEnrollmentDto`, +`CourseStudentCandidateDto`. |
| `lib/api-docs/spec.ts` | Compone `evolutionPaths` + tag `Padel Evolution`. |
| `FEATURES.md` | Entrada etapa4 actualizada a in-progress con solución implementada. |

## Decisiones

- **Página `/evolucion` como server component** (no client fetch): los datos ya viven en la sesión (studentId) y la query es scoped; evita un round-trip extra. La API route se mantiene para docs/tests y consumo externo.
- **`groupByCategory` genérica** (`T extends { category: string }`): acepta el shape completo de `StudentEvolutionItem` sin acoplar la lib pura al tipo de DB.
- **Trend sobre `totalScore`** (no por criterio): el spec original mencionaba delta por criterio; se simplificó a total (criterio de aceptación: flecha por categoría). `computeTrend` es pura y recibe `number[]` — extender a criterios es aditivo.
- **Anti-IDOR**: ownership del curso verificado con `getCourseById(ownerId, id)` → 404 antes de mutar; `addStudentToCourse`/`removeStudentFromCourse` ya son scoped.
- **Auditoría**: `auditCreate` en add (entity `course_enrollment`), `auditDelete` en remove. Search es read-only sin auditoría (consistente con `/students` GET del detalle).

## Verificación Local

- `npx tsc --noEmit` → 0 errores.
- `npx eslint` sobre los 22 archivos tocados → 0 errores.
- `npx jest tests/unit` → 397 passed (33 suites).
- `npx next build` → OK, `/evolucion` registrado.
- API tests: 8 tests listados (happy-path requieren servidor + DATABASE_URL; guards 401 corren sin DB).

## Pendiente (QA)

- E2E: `evaluation-version.spec.ts`, `student-evolution.spec.ts`, `course-students.spec.ts`.
- Ejecutar happy-path API con servidor + NeonDB.
- Gate `--coverage` (módulo padel sin regresión >3%).