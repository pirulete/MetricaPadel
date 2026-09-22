# Test Matrix — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: `etapa2-3-onboarding-dashboard`
> release: v0.2
> date: 2026-09-21

## Resultado Global

| Suite | Comando | Resultado |
|-------|---------|-----------|
| Unit (Jest) | `pnpm run test:unit` | ✅ 27 suites / 342 tests |
| API (Playwright) | `DATABASE_URL=... npx playwright test tests/api/padel/` | ✅ 39 passed (11.1s) |
| E2E (Playwright) | `tests/e2e/onboarding|course-flow|dashboard.spec.ts` | ✅ creados (auth-guard + render) |
| Typecheck | `npx tsc --noEmit` | ✅ 0 errores |
| Lint | `pnpm run lint` | ✅ 0 errores |

## Unit Tests (nuevos/ampliados)

| Archivo | Cubre | Estado |
|---------|-------|--------|
| `tests/unit/padel/course-code.test.ts` | `generateInviteCode` formato `PAD-XXXX`, colisión retry, case-insensitive | ✅ |
| `tests/unit/padel/dashboard.test.ts` | `deriveLevel`, `isClassToday`, métricas sin división por cero | ✅ |
| `tests/unit/validations/padel.test.ts` (ampliado) | Zod: courseCreate/Update, join (normalización `^PAD-[A-Z0-9]{4}$`), assign rubric, historyQuery | ✅ |

## API Tests (Playwright, SQL real contra NeonDB)

| Archivo | Endpoints | Casos | Estado |
|---------|-----------|-------|--------|
| `tests/api/padel/courses-guard.spec.ts` | courses, join, rubrics, dashboard, history | 401 sin sesión (todos), 403 USER→coach, 403 ADMIN→alumno | ✅ |
| `tests/api/padel/courses-happy.spec.ts` | courses CRUD + [id]/rubrics | POST crea curso + GET lista/detalle + PUT + DELETE archive + assign rubrics + 409 | ✅ |
| `tests/api/padel/join-happy.spec.ts` | courses/join | 201 join + 404 código inválido + 409 ya inscrito + 400 coach propio | ✅ |
| `tests/api/padel/dashboard-happy.spec.ts` | dashboard/teacher, dashboard/student | métricas COUNT/AVG + nivel derivado + cursos | ✅ |
| `tests/api/padel/history-happy.spec.ts` | history | lista evaluaciones coach + filtros courseId/studentId/status + IDOR 404 | ✅ |
| `tests/api/padel/guard.spec.ts` (regresión Etapa 1) | rubrics, evaluations, student, admin/users | 401/403/404 IDOR | ✅ |
| `tests/api/padel/admin-users-happy.spec.ts` (regresión) | admin/users | POST jugador ACTIVE + GET + 409 duplicado | ✅ |

## E2E Tests (nuevos por @qa-release)

| Archivo | Feature | Casos |
|---------|---------|-------|
| `tests/e2e/onboarding.spec.ts` | SCR-02/03 | register render (selector coach/player + campos), validación client-side, login render, dashboard requiere auth, guards API register/courses |
| `tests/e2e/course-flow.spec.ts` | P05/P06/P07/A02 | cursos requiere auth, cursos render autenticado, detalle requiere auth, guards API courses/join/rubrics |
| `tests/e2e/dashboard.spec.ts` | P01/A01/P10 | dashboard requiere auth, dashboard render autenticado, historial requiere auth, guards API dashboard/history |

## Bugs / Hallazgos

| Severidad | Hallazgo | Repro | Estado |
|-----------|----------|-------|--------|
| — | Ninguno bloqueante | — | — |
| Info | E2E happy-path navegable completo requiere seed + email real (patrón existente auth-guard) | entorno CI sin seed | Documentado en release-report |

## Cobertura de Endpoints Nuevos (gate `api_integration`)

- ✅ Cada endpoint nuevo tiene ≥1 happy-path con SQL real contra NeonDB.
- ✅ Guards 401/403 cubren todos los endpoints.
- ✅ API docs: `lib/api-docs/paths/courses.ts` + `schemas/courses.ts` + tags en `spec.ts`.