# Release Scope — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> status: proposed
> release: v0.2
> date: 2026-09-21
> change_id: etapa2-3-onboarding-dashboard
> module: auth+api+db+ui
> tags: [courses, onboarding, dashboard, enrollment, padel, db, migration, api, ui]

## Objetivo del release

Segundo release funcional de la app de evaluación de pádel: onboarding real (registro/login), cursos con código de invitación, homes con métricas e historial. 10 pantallas (5 Etapa 2 + 5 Etapa 3), roles USER/ADMIN existentes, 3 tablas nuevas y ~12-15 endpoints. Sin templates (Etapa 4), sin splash.

## In Scope

### DB (migración `0005_*` vía `db:generate`)

- +2 enums: `course_level` (`iniciacion`/`intermedio`/`avanzado`), `course_status` (`active`/`archived`).
- +3 tablas: `courses`, `course_enrollments`, `course_rubrics`.
- Índices: `courses(ownerId)`, `courses(inviteCode)` UNIQUE, `course_enrollments(courseId)`, `course_enrollments(studentId)`, `course_rubrics(courseId)`; UNIQUE: `course_enrollments(courseId, studentId)`, `course_rubrics(courseId, rubricId)`.
- FKs cascade: enrollments/rubrics → courses. FKs users/rubrics sin cascade (protección histórica).
- Sin cambios en tablas de Etapa 1 (rubrics/evaluations intactas).

### API (endpoints nuevos, contract-first)

| Método + Path | Guard | Propósito |
|---------------|-------|-----------|
| `POST /api/auth/register` (ampliar) | público + rate limit | SCR-02: crear USER/TEMPORARY (rol del body ignorado, nunca ADMIN) |
| `POST /api/auth/signin` (existente) | público | SCR-03: login |
| `GET /api/courses` | validateAdmin (owner) | P05: lista cursos propios |
| `POST /api/courses` | validateAdmin | P06: crear curso + generar inviteCode |
| `GET /api/courses/[id]` | validateAdmin (owner) | P07: detalle (alumnos + rúbricas) |
| `PUT /api/courses/[id]` | validateAdmin (owner) | Editar curso (P06/P07) |
| `DELETE /api/courses/[id]` | validateAdmin (owner) | Soft archive (P05) |
| `POST /api/courses/join` | validateUser | A02: unirse con código (404 inválido, 409 ya inscrito, 400 propio) |
| `POST /api/courses/[id]/rubrics` | validateAdmin (owner) | P08: asignar rúbrica activa al curso |
| `GET /api/courses/[id]/rubrics` | validateAdmin (owner) | P07: tab Rúbricas |
| `GET /api/dashboard/teacher` | validateAdmin | P01: métricas (alumnos, evaluaciones, promedio, clases hoy) |
| `GET /api/dashboard/student` | validateUser | A01: nivel, notificaciones, mis cursos |
| `GET /api/history` | validateAdmin (teacher) | P10: historial de evaluaciones propias + filtros |

Todos documentados en `lib/api-docs/spec.ts` (paths + schemas). Auditoría en mutaciones sensibles (crear/editar/archivar curso, join, asignar rúbrica).

### UI (10 pantallas)

- **Etapa 2**: SCR-02 Registro (selector rol coach/player, backend siempre USER), SCR-03 Login (errores 401/LOCKED), P05 Cursos (cards + empty), P07 Detalle Curso (tabs Alumnos/Rúbricas + copiar código), A02 Unirse con código (modal/input PAD-XXXX).
- **Etapa 3**: P01 Home Profesor (métricas + CTA evaluar + mis cursos + bottom nav), A01 Home Alumno (CTA unirse + notificaciones + mis cursos + bottom nav), P06 Modal Crear Curso, P08 Modal Asignar Rúbrica (2 pasos), P10 Historial (filtros + empty).

Sin componentes nuevos: Button/Card/Badge/Tabs/Input/Textarea/Label/Select/Separator del UI kit existente (validado en mockup Etapa 3).

### Tests

- Unit: queries courses/enrollments/course_rubrics, métricas dashboard, generación inviteCode, validaciones Zod.
- API: guard 401/403 + happy-path SQL real por endpoint (mínimo 1 por endpoint) + edge cases join (404/409/400).
- E2E: onboarding (registro→login), course-flow (crear curso→join→asignar rúbrica), dashboard (P01/A01/P10).

## Out of Scope (este release)

- Templates (P04) y Splash (SCR-01) — Etapa 4.
- Admin CRUD de templates y gestión avanzada de usuarios — Etapa 5.
- Notificaciones push al publicar evaluación (trigger `evaluation.published` post-MVP).
- Salir de curso (alumno), pagos, clases con pista/fecha real.
- `padel_role` / `padel_profiles`, snapshot de rúbrica, niveles editables.
- Auto-registro con rol ADMIN (seguridad: backend siempre USER).

## Criterios de Release (gates)

| Gate | Criterio |
|------|----------|
| `--typecheck` | 0 errores TS |
| `--lint` | 0 errores ESLint |
| `--tests` | Unit + API passing |
| `--e2e` | 3 E2E specs passing |
| `--build` | Build exitoso |
| `--coverage` | Sin regresión >3% vs `.validation/coverage-baseline.json` |
| `--api-docs` | ~13 endpoints en `lib/api-docs/spec.ts` |
| `--api_integration` | Happy-path con SQL real contra NeonDB |
| `--features` / `--docs` | FEATURES.md actualizado, metadata válida |

## Rollout

1. @db-engineer: schema + migración `0005_*` + queries (courses, dashboard) + unit tests.
2. @auth-security: validar guards (validateAdmin/validateUser), registro nunca-ADMIN, auditoría, auth-impact.md.
3. @app-engineer: APIs + 10 pantallas + api-docs + tests.
4. @ponytail-reviewer: revisión de simplicidad.
5. @qa-release: E2E + test-matrix + release-report + acceptance-criteria.

## Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Registro público con selector de rol podría sugerir auto-ADMIN | Alta | Backend ignora rol del body; siempre USER/TEMPORARY; documentado en spec y auth-impact |
| Código invite colisión al generar | Baja | Retry de generación o 500 controlado; UNIQUE en DB |
| Métricas de dashboard con datos incompletos (promedio sin publicadas) | Media | Queries con COALESCE/guardas; UI muestra "—" |
| P08 asigna rúbrica a curso pero no crea evaluaciones (alcance) | Media | `course_rubrics` persiste la asignación; el flujo de evaluar (P09) filtra por curso en post-MVP |
| Etapa 2 sin mockup propio | Baja | Reutilizar patrones de Etapa 1/3; @ui-designer puede generar mockup previo |

## Métricas de Loop

- Registrar al cerrar: `node scripts/loop-metrics.js --record etapa2-3-onboarding-dashboard --iterations <n> --gates-failed <n> --module dashboard`