# Test Matrix — SPEC-EPIC-01 Academia & Branding Institucional

> change_id: spec-epic-01-academia-branding | fecha: 2026-09-26 | release: v0.6

## Resumen

| Suite | Total | Passed | Failed | Skipped | Flaky |
|-------|-------|--------|--------|---------|-------|
| Unit (Jest) | 493 | 493 | 0 | 0 | 0 |
| API (Playwright) | 113 | 112 | 1 | 79* | 1 |
| E2E (Playwright) | 85 | 85 | 0 | 0 | 0 |

\* 79 skipped = tests que requieren DATABASE_URL o condiciones no presentes (skip graceful).

## Tests nuevos de SPEC-EPIC-01

| Archivo | Tests | Cobertura | Resultado |
|---------|-------|-----------|-----------|
| `tests/api/padel/academies-guard.spec.ts` | 15 | 401 sin sesión (11 endpoints), 403 USER, 400 slug inválido, 404 anti-IDOR | ✅ |
| `tests/api/padel/academies-happy.spec.ts` | 2 | POST crea + OWNER + GET lista/detalle + PUT + logo + DELETE archive (SQL real); slug duplicado 409 | ✅ |
| `tests/api/padel/members-happy.spec.ts` | 2 | invite → accept → list → remove + último OWNER 400; invite crea usuario TEMPORARY (SQL real) | ✅ |
| `tests/api/padel/institutional-rubrics-happy.spec.ts` | 1 | OWNER crea institucional; COACH lee pero 403 PUT/DELETE/create (SQL real) | ✅ |
| `tests/api/padel/pdf-happy.spec.ts` | 1 | PDF válido con branding + draft 400 + ajeno 404 (SQL real) | ✅ |
| `tests/e2e/academy-branding.spec.ts` | 1 | Flujo navegable: login → crear academia → invitar → rúbrica institucional → evaluar → exportar PDF | ✅ |

## Cobertura de endpoints (happy-path SQL real)

| Endpoint | Guard 401/403 | Happy-path SQL | PDF/UI |
|----------|---------------|----------------|--------|
| GET/POST /api/academies | ✅ | ✅ | — |
| GET/PUT/DELETE /api/academies/[id] | ✅ | ✅ | — |
| POST /api/academies/[id]/logo | ✅ | ✅ | — |
| POST /api/academies/[id]/members/invite | ✅ | ✅ | — |
| POST /api/academies/[id]/members/[userId]/accept | ✅ | ✅ | — |
| GET /api/academies/[id]/members | ✅ | ✅ | — |
| DELETE /api/academies/[id]/members/[userId] | ✅ | ✅ | — |
| GET/POST /api/academies/[id]/rubrics | ✅ | ✅ | — |
| GET /api/evaluations/[id]/pdf | ✅ | ✅ | ✅ E2E botón |
| PUT/DELETE /api/rubrics/[id] (MOD institucional) | ✅ | ✅ | — |

## Bugs documentados

| ID | Severidad | Estado | Archivo test | Detalle |
|----|-----------|--------|--------------|---------|
| BUG-01 | MEDIA | ✅ Corregido | academies-happy.spec.ts | Slug duplicado → 500 en vez de 409 (Drizzle envuelve 23505 en cause) |
| BUG-02 | ALTA | ✅ Corregido | E2E login | Login UI roto en dev (csrf 404 → json() throw) |
| BUG-03 | MEDIA | ✅ Corregido | academy-branding.spec.ts | "Exportar PDF" inalcanzable para coach (RubricViewer usaba endpoint alumno) |
| BUG-04 | BAJA | ✅ Corregido | onboarding.spec.ts | Test usaba heading role inexistente (CardTitle = div) |
| BUG-05 | MEDIA | 🔴 Abierto (pre-existente, marketing) | pages-happy.spec.ts:119 | Home guard: DELETE única home publicada → 200 en vez de 400 (aislamiento de tests) |

## Fallos pre-existentes fuera de scope

1. **`tests/api/admin/marketing/pages-happy.spec.ts:119`** — "home guard: no eliminar la única página publicada home": DELETE devuelve 200 en vez de 400. Causa: `countPublishedPages()` cuenta páginas publicadas residuales de tests previos del mismo run (aislamiento). Módulo marketing, no relacionado con SPEC-EPIC-01.
2. **`tests/api/public/marketing-happy.spec.ts:138`** — flaky: POST /api/public/contact rate limit (depende del bucket de rate limit por IP). No relacionado.

## Notas de ejecución

- Servidor dev en `http://localhost:3000` (Next.js dev).
- DB: NeonDB local vía `.env.local` — migración `0008` aplicada manualmente (la DB no tenía tabla `drizzle.__drizzle_migrations`; se ejecutó el SQL de 0008 directo).
- Los happy-path tests requieren `DATABASE_URL`; sin ella hacen skip graceful.