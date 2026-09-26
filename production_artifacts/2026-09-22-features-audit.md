# FEATURES.md Audit — 2026-09-22

> status: released
> release: docs
> date: 2026-09-22
> change_id: features-audit
> module: docs
> tags: [audit, features, documentation, tracking]
> Fuentes: `FEATURES.md` (772 líneas, 19 entradas), `git log --oneline` (26 commits), `production_artifacts/` (16 directorios), `tests/e2e/` y `tests/api/padel/` (verificación de claims).

---

## 1. Tabla de TODAS las features (git log ↔ FEATURES.md)

| # | Feature / Commit | change_id | Existe en FEATURES.md? | Status correcto? | Notas |
|---|---|---|---|---|---|
| 1 | Etapa 1: Core Evaluativo (`2ef1a53`) | `etapa1-core-evaluativo` | ✅ Sí | ✅ released v0.1 | Nota E2E "pendiente" ahora STALE (ver §3) |
| 2 | Etapa 2+3: Onboarding, Cursos, Dashboard (`22ba45b`) | `etapa2-3-onboarding-dashboard` | ✅ Sí | ✅ released v0.2 | |
| 3 | G3/G4/G9/G11 user-flow fixes (`9c14306`) | `gaps-user-flows` | ✅ Sí | ✅ released v0.3 | |
| 4 | G5: Perfil/Settings (`515dfe0`) | `g5-profile-settings` | ✅ Sí | ✅ released v0.3 | |
| 5 | G8: Detalle curso alumno (`515dfe0`) | `student-course-detail` | ✅ Sí | ✅ released v0.3 | |
| 6 | G10: Admin users CRUD (`515dfe0`) | `g10-admin-users-ui` | ✅ Sí | ✅ released v0.3 | |
| 7 | R5: Cobertura dimensional soft-block (`515dfe0`) | `r5-dimensional-coverage` | ✅ Sí | ✅ released v0.3 | |
| 8 | G6/G7/G12: Evolución + gestión alumnos (`c54ab35`) | `etapa4-evolution-management` | ✅ Sí | ✅ in-progress v0.4 | Status CORRECTO: E2E `evaluation-version/student-evolution/course-students` NO existen en `tests/e2e/` (verificado) |
| 9 | **G17: E2E Etapa 1 (`3e3cf33`)** | — | ❌ **NO** | — | 3 specs creados (rubric-editor, evaluation-flow, student-view), 32 tests E2E pass. Artifact `2026-09-21-fix-g17-e2e-tests/` vacío |
| 10 | **Landing page redesign (`4e0f30e` + `0c70dda`)** | — | ❌ **NO** | — | Hero/features/how-it-works/stats/CTA en español, `app/(public)/page.tsx` |
| 11 | **Fix login ClientFetchError (`25fb736`)** | — | ❌ **NO** | — | `signIn()` → direct fetch en login |
| 12 | **Fix TEMPORARY dashboard (`a946c99`)** | — | ❌ **NO** | — | Banner verify-email en vez de 403 en dashboard |
| 13 | **Fix Vercel build (6 commits: `0741470`, `a6f2978`, `064d4e3`, `1e81e4e`, `524c6ac`, `7b8555f`)** | — | ❌ **NO** | — | NEXTAUTH_SECRET, skip migraciones existentes, root page + not-found + error boundary, Sentry skip, page conflict |
| 14 | **Fix DB graceful fallback (`a3e729a`, `8b1c314`)** | — | ❌ **NO** | — | Layout/páginas públicas con fallback si DB no responde |
| 15 | **Fix padel API tests role checks (`8d21182`)** | — | ❌ **NO** | — | Fix menor de tests (rol checks) |
| 16 | Mockups `/preview/etapa1` + Etapa 3/4 (`cd03e74`, `6fa4d46`) | — | ⚠️ Parcial | — | Mockup etapa1 referenciado en entry Etapa 1; `etapa3-dashboard-management.tsx` y `etapa4-templates-polish.tsx` siguen en `components/preview/` sin referencia |
| 17 | Push Notifications + Inbox (genérico) | `push-notifications` | ✅ Sí | ✅ released v0.3 | ⚠️ change_id DUPLICADO con #18 |
| 18 | API endpoints push + inbox | `push-notifications` | ✅ Sí | ⚠️ change_id duplicado | Mismo change_id que #17 — entrada duplicada |
| 19 | Push infra hooks + SW | `push-infra-hooks-sw` | ✅ Sí | ✅ released v0.3 | |
| 20 | Notification Inbox UI | `notification-inbox` | ✅ Sí | ✅ released v0.3 | |
| 21 | Sync audit helpers + env VAPID | `infra-sync-port` | ✅ Sí | ✅ released v0.3 | |
| 22 | Sync session_config + TTL | `auth-sync-port` | ✅ Sí | ✅ released v0.3 | |
| 23 | Sync hardening auth + T&C + avatar | `streetmove-sync-port` | ✅ Sí | ✅ released v0.2 | |
| 24 | Harness Sync improvements | `2026-08-02-harness-improvements` | ✅ Sí | ✅ released v0.2 | |
| 25 | Marketing CMS | `marketing-cms` | ✅ Sí | ✅ released v0.1 | QA REJECTED documentado (correcto) |
| 26 | Harness refactor módulos | `harness-refactor` | ✅ Sí | ✅ released v0.3 | Falta sección "Variables de Entorno" (menor) |
| 27 | Project Blueprint | `project-blueprint` | ✅ Sí | ⚠️ propuesto pero con "Solución Implementada" | Inconsistencia status vs contenido |
| 28 | Init skeleton_base (`d66cb2b`, `42caf66`) | — | N/A | N/A | Chore, no feature |
| 29 | Docker postgres (`557e749`) | — | N/A | N/A | Chore infra |
| 30 | production_artifacts en repo (`ca9c6a8`) | — | N/A | N/A | Chore |

---

## 2. Entradas MISSING (implementado pero NO documentado)

| # | Feature | Commits | Evidencia |
|---|---|---|---|
| M1 | **G17 — E2E de Etapa 1** (rubric-editor, evaluation-flow, student-view) | `3e3cf33` | 3 specs en `tests/e2e/`, 32 tests E2E pass; carpeta artifact `2026-09-21-fix-g17-e2e-tests/` existe pero vacía |
| M2 | **Landing page redesign** (hero, features, how it works, stats, CTA — español) | `4e0f30e`, `0c70dda` | `app/(public)/page.tsx` +138/-16 |
| M3 | **Fix login ClientFetchError** (signIn → direct fetch) | `25fb736` | `app/(public)/login/page.tsx` |
| M4 | **Fix TEMPORARY dashboard** (banner verify-email en vez de 403) | `a946c99` | `app/(app)/dashboard/page.tsx` |
| M5 | **Fix Vercel build** (6 fixes: NEXTAUTH_SECRET, migraciones skip, root page, Sentry, page conflict) | `0741470`, `a6f2978`, `064d4e3`, `1e81e4e`, `524c6ac`, `7b8555f` | `auth.ts`, `next.config.mjs`, migraciones, root pages |
| M6 | **Fix DB graceful fallback** en páginas públicas | `a3e729a`, `8b1c314` | `app/(public)/layout.tsx` + páginas |
| M7 | **Fix padel API tests role checks** | `8d21182` | Fix menor de tests (opcional agrupar con Etapa 1) |

**Gaps R1-R4 (rúbricas)**: NO requieren entry — nunca fueron implementados (siguen abiertos en `2026-09-21-rubric-gap-analysis.md` y `2026-09-21-pending-features.md`). Solo R5 (evaluaciones) fue implementado y está documentado ✅.

---

## 3. Entradas INCORRECTAS / PROBLEMAS

| # | Entrada | Problema | Severidad |
|---|---|---|---|
| I1 | `push-notifications` (x2) | **change_id duplicado**: la entrada "Push Notifications + Notification Inbox (genérico whitelabel)" y "API endpoints push notifications + inbox" comparten `change_id: push-notifications`. La segunda es la capa API de la primera. | Media |
| I2 | Etapa 1 (`etapa1-core-evaluativo`) | Nota "E2E (pendiente @qa-release): rubric-editor.spec.ts, evaluation-flow.spec.ts, student-view.spec.ts" — **STALE**: esos 3 specs YA existen (G17, commit `3e3cf33`). Debe actualizarse a "completado vía G17". | Media |
| I3 | `project-blueprint` | `status: proposed` pero contiene sección "Solución Implementada" con archivos creados (`blueprint/`, `scripts/init-project.mjs`). Inconsistente: o es released o la sección es un plan. | Baja |
| I4 | `harness-refactor` | Sin sección "Variables de Entorno" (las demás entradas incluyen "Ninguna nueva"). | Baja |
| I5 | Etapa 4 (`etapa4-evolution-management`) | Status `in-progress` es **CORRECTO** (E2E pendientes confirmados: los 3 specs no existen en `tests/e2e/`). Sin acción. | — |
| I6 | Mockups Etapa 3/4 (`etapa3-dashboard-management.tsx`, `etapa4-templates-polish.tsx`) | Siguen en `components/preview/` sin entry que los referencie (el mockup etapa1 sí está referenciado). Menor — los mockups son efímeros. | Baja |

---

## 4. Recomendaciones

1. **Agregar entry G17** (`change_id: g17-e2e-etapa1`, status released, release v0.3, module tests, tags [e2e, padel, tests]) — cierra el único gap "Alta" de pending-features.md y el tech-debt "E2E faltantes Etapa 1".
2. **Agregar entry Landing page redesign** (`change_id: landing-redesign`, status released, release v0.3, module marketing+ui, tags [landing, ui, marketing]).
3. **Agregar entry Fix Vercel build** (`change_id: fix-vercel-build`, status released, release v0.3, module infra, tags [vercel, build, deploy, fix]) — agrupa los 6 commits.
4. **Agregar entry Fix login + TEMPORARY dashboard** (pueden ser 1 entry `fix-auth-ux` o 2 separados; ambos son fixes de UX de auth, release v0.3).
5. **Agregar entry Fix DB graceful fallback** (release v0.1, module infra) — opcional, puede agruparse con Etapa 1.
6. **Resolver duplicado `push-notifications`**: renombrar la segunda entrada a `change_id: push-notifications-api` (o fusionar ambas en una sola entrada con sub-secciones).
7. **Actualizar nota E2E de Etapa 1** (I2): marcar los 3 specs como completados vía G17.
8. **Corregir `project-blueprint`** (I3): cambiar status a `released` o renombrar la sección a "Solución Propuesta".
9. **Registrar en Engram** la decisión de auditoría y el estado real de G17/landing/fixes para futuras sesiones.

---

## 5. Resumen

- **19 entradas** en FEATURES.md; **14 features core** correctamente documentadas con metadata válida.
- **7 features/fixes implementados sin entry** (G17, landing redesign, fix login, fix TEMPORARY, fix Vercel build, DB graceful fallback, fix tests padel).
- **1 duplicado** de change_id (`push-notifications`).
- **1 nota stale** (E2E Etapa 1 — ya completados vía G17).
- **2 inconsistencias menores** de formato (`project-blueprint`, `harness-refactor`).
- **Etapas 1-4**: status correctos (v0.1/v0.2/v0.3 released; v0.4 in-progress verificado contra filesystem).
- **Gaps G3-G12, R5**: todos documentados ✅. **R1-R4**: correctamente ausentes (no implementados).