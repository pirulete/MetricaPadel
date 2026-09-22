# Release Report — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: `etapa2-3-onboarding-dashboard`
> release: v0.2
> date: 2026-09-21
> module: auth+api+db+ui
> tags: [courses, onboarding, dashboard, enrollment, padel, db, migration, api, ui]
> status: **RELEASED**

## Resumen

Release de Etapa 2 (Onboarding y Cursos) + Etapa 3 (Dashboard y Management) sobre el core evaluativo de Etapa 1 (v0.1). Entrega registro/login reales (SCR-02/03), cursos con códigos de invitación (P05/P06/P07/A02), dashboards por rol (P01/A01) e historial con filtros (P10).

## Gates de Validación Ejecutados

| Gate | Comando | Resultado |
|------|---------|-----------|
| Typecheck | `npx tsc --noEmit` | ✅ 0 errores |
| Lint | `pnpm run lint` | ✅ 0 errores (117 warnings preexistentes) |
| Unit tests | `pnpm run test:unit` | ✅ 27 suites / 342 tests passed |
| Build | `pnpm run build` | ✅ exitoso (Next.js 16, incluye `db:migrate` skip sin DATABASE_URL) |
| API tests (padel) | `DATABASE_URL=... npx playwright test tests/api/padel/` | ✅ 39 passed (11.1s) — guards 401/403 + happy-path SQL real + edge cases |
| API docs | `lib/api-docs/spec.ts` | ✅ `coursesPaths` + `coursesSchemas` + tags `Padel Courses`/`Padel Dashboard` (~13 endpoints) |
| E2E (nuevos) | `tests/e2e/onboarding.spec.ts`, `course-flow.spec.ts`, `dashboard.spec.ts` | ✅ creados por @qa-release (auth-guard + render + API guards) |

## Cobertura de Tests por Endpoint Nuevo

| Endpoint | Guard (401/403) | Happy-path SQL real |
|----------|-----------------|---------------------|
| `GET/POST /api/courses` | `courses-guard.spec.ts` | `courses-happy.spec.ts` |
| `GET/PUT/DELETE /api/courses/[id]` | `courses-guard.spec.ts` | `courses-happy.spec.ts` |
| `POST /api/courses/join` | `courses-guard.spec.ts` | `join-happy.spec.ts` (201 + 404/409/400) |
| `GET/POST /api/courses/[id]/rubrics` | `courses-guard.spec.ts` | `courses-happy.spec.ts` (assign + 409) |
| `GET /api/dashboard/teacher` | `courses-guard.spec.ts` | `dashboard-happy.spec.ts` |
| `GET /api/dashboard/student` | `courses-guard.spec.ts` | `dashboard-happy.spec.ts` |
| `GET /api/history` | `courses-guard.spec.ts` | `history-happy.spec.ts` (filtros + IDOR 404) |
| `POST /api/auth/register` (role ignorado D6) | — | `admin-users-happy.spec.ts` + unit validations |

## Regresión Auth y Estados

- ✅ 401 sin sesión en todos los endpoints nuevos (guard tests).
- ✅ 403 de rol: USER en endpoints coach, ADMIN en endpoints alumno (SQL real).
- ✅ 404 anti-IDOR: recurso ajeno → 404 (no 403) en rúbricas, cursos, historial.
- ✅ Registro nunca auto-ADMIN (D6): backend ignora `role`, siempre USER/TEMPORARY.
- ✅ Estados TEMPORARY/ACTIVE/LOCKED respetados por guards existentes (`validateUser`/`validateAdmin`).

## Bugs Encontrados

Ninguno bloqueante. Ver `test-matrix.md` para detalle de casos validados.

## Checklist Final de Release

- [x] Typecheck 0 errores
- [x] Lint 0 errores
- [x] Unit tests 342 passed
- [x] Build exitoso
- [x] API tests 39 passed (guards + happy-path SQL real)
- [x] API docs actualizadas (`lib/api-docs/spec.ts`)
- [x] E2E tests creados por feature (onboarding, course-flow, dashboard)
- [x] FEATURES.md actualizado (status → released)
- [x] Acceptance criteria verificados (ver `acceptance-criteria.md`)
- [x] Migración `0005_goofy_charles_xavier.sql` generada vía `db:generate` (ver `migration-notes.md`)

## Decisión

**APROBADO** — release v0.2 listo para merge.

## Notas

- E2E happy-path navegable completo (registro→login→crear curso→join→asignar rúbrica) requiere entorno con seed y email real; los E2E creados cubren auth-guard + render + API guards, consistente con el patrón existente `padel-evaluation.spec.ts`.
- `classesToday` usa `days.length > 0` como proxy (simplificación documentada en `app-notes.md`).