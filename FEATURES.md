# FEATURES — Registro de Cambios

## ✨ Project Blueprint: questionnaire + scaffolding para nuevos proyectos (2026-09-16)

> status: proposed
> release: v0.3
> date: 2026-09-16
> change_id: project-blueprint
> module: infra
> tags: [blueprint, scaffolding, templates, init]

### Problema

Cada proyecto nuevo requiere ~2 horas de setup manual (copiar, renombrar, configurar, migrar). No hay questionnaire que guíe las decisiones, ni templates por tipo de proyecto, ni script de scaffolding.

### Solución Implementada

- **`blueprint/questionnaire.md`** — 15 preguntas agrupadas en 3 bloques (Identidad, Features, Dominio) con tipos de respuesta definidos.
- **`blueprint/config-mapping.md`** — mapeo respuestas → acciones concretas (archivo a tocar + valor a escribir).
- **`blueprint/patterns/*.md`** — 5 templates de proyecto (saas, ecommerce, blog, services, education) con schema base, endpoints y UI pages.
- **`blueprint/templates/*.ts`** — snippets de schema, queries, API y tests.
- **`scripts/init-project.mjs`** — scaffolding automatizado: copia + renombrado + env + migrate + validate; acepta `--from-blueprint answers.json`.
- **`blueprint/README.md`** — documentación del flujo completo.

### Archivos Modificados

- `blueprint/questionnaire.md`, `blueprint/config-mapping.md`, `blueprint/patterns/*.md`, `blueprint/templates/*.ts`, `scripts/init-project.mjs`, `blueprint/README.md` (nuevos)

### Tests

- `tests/unit/init-project.test.ts` — smoke test del script (dry-run con answers.json mínimo).

### Variables de Entorno

Ninguna nueva.

## ✨ Harness refactor: módulos + risk-rules (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: harness-refactor
> module: infra
> tags: [harness, modules, refactor, risk-policy]

### Problema

`scripts/validate-harness.js` era monolítico (989 líneas) difícil de mantener y testear. StreetMove ya había extraído la lógica en módulos reutilizables (`lib/modules/harness/`), pero el skeleton no los tenía.

### Solución Implementada

- **Módulos extraídos** en `lib/modules/harness/`: `runner.js` (process-tree-safe spawn), `status.js` (status.json I/O), `evidence.js` (evidence manifest + completion claim), `gates.js` (definición declarativa de gates), `validate.js` (orquestador), `types.js` (JSDoc types).
- **Checks** en `lib/modules/harness/checks/`: `artifacts.js` (artifact completeness), `features.js` (FEATURES.md consistency), `migrations.js` (migration journal check).
- **Risk policy** en `lib/policy/`: `risk-rules.js` (clasificación de riesgo por patrón de ruta, adaptado sin dominio StreetMove) + `risk-policy.ts` (tipos TypeScript).
- **Entry point**: `validate-harness.js` monolito se mantiene intacto por ahora (los módulos están listos para usar en refactor futuro).

### Archivos Creados

- `lib/modules/harness/runner.js`, `status.js`, `evidence.js`, `gates.js`, `validate.js`, `types.js`, `risk-policy.ts`
- `lib/modules/harness/checks/artifacts.js`, `features.js`, `migrations.js`, `index.js`
- `lib/policy/risk-rules.js`, `risk-policy.ts`

### Tests

- Harness validado con `--typecheck --lint --tests` PASS
- 204 unit tests passing; `npx tsc --noEmit` 0 errores

## ✨ Notification Inbox: UI del buzón de notificaciones (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: notification-inbox
> module: ui
> tags: [notifications, inbox, ui, badge, dropdown]

### Problema

El mecanismo de notificaciones (engine, API, DB) existía pero no había UI para que el usuario viera sus notificaciones. Faltaba el inbox page, el badge en el header, el dropdown de preview y los filtros.

### Solución Implementada

- **`app/(app)/notifications/page.tsx`**: inbox completo con header "Marcar todo como leído", filtros (Todas/No leídas), lista con `notification-item`, "Cargar más" (cursor pagination), empty/loading/error states.
- **`components/notifications/notification-badge.tsx`**: badge del header con icono Bell + contador de no leídas (poll 30s via hook).
- **`components/notifications/notification-dropdown.tsx`**: dropdown con últimas 10 notificaciones, "Marcar todo como leído", "Ver todas" → `/notifications`.
- **`components/notifications/notification-item.tsx`**: card individual de notificación con icono, título, body, timestamp, estado read/unread.
- **`components/notifications/notification-filters.tsx`**: tabs "Todas" / "No leídas" con aria-selected.
- **`components/notifications/empty-state.tsx`**: BellOff + "Sin notificaciones" reutilizable.
- **`components/layout/header-with-notifications.tsx`**: wrapper client del header del área privada + badge.

### Archivos Modificados

- `app/(app)/notifications/page.tsx` (nuevo), `components/notifications/notification-badge.tsx` (nuevo), `components/notifications/notification-dropdown.tsx` (nuevo), `components/notifications/notification-item.tsx`, `components/notifications/notification-filters.tsx` (nuevo), `components/notifications/empty-state.tsx` (nuevo), `components/layout/header-with-notifications.tsx` (nuevo), `app/(app)/layout.tsx`

### Tests

- `tests/e2e/notifications.spec.ts`: sin sesión → redirect a `/login`; con sesión → heading "Notificaciones" visible.
- Suite completa: 247 tests passing; `npx tsc --noEmit` 0 errores; ESLint 0 errores.

### Variables de Entorno

Ninguna nueva.

## ✨ Push infrastructure: hooks + service worker + componentes de notificaciones (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: push-infra-hooks-sw
> module: dashboard
> tags: [push, pwa, notifications, hooks, service-worker, ui]

### Problema

El mecanismo push (endpoints API, schema DB, engine) ya existía (I4), pero faltaba la capa client: hooks de suscripción/inbox, service worker estático y componentes de infraestructura (registro SW, soft prompt, preferencias). Sin esto el inbox y el badge del header (I5) no tienen de dónde leer estado.

### Solución Implementada

- **`hooks/use-push-subscription.ts`** (nuevo): detecta soporte (`PushManager`), obtiene VAPID key de `/api/user/push/vapid-key`, subscribe (SW ready → `PushManager.subscribe` → POST `/api/user/push/subscription`), unsubscribe (browser + DELETE por endpoint), maneja `pushsubscriptionchange` (re-subscribe o persiste `newSubscription`). Estado: `isPushSupported`, `isSubscribed`, `permission`, `loading`.
- **`hooks/use-notifications.ts`** (nuevo): inbox client con `fetchNotifications({category?, unread?, reset?})` paginado por cursor, `fetchUnreadCount()` con polling 30s + `visibilitychange`, `markAsRead(ids)` / `markAllAsRead()` (PATCH batch), `deleteNotification(id)` (DELETE soft), `fetchPreferences()` / `updatePreference(channel, category, enabled)`. Exporta `UseNotificationsReturn` y `NotificationItem`.
- **`public/sw.js`** (nuevo): SW estático minimalista — `push` (muestra notificación con data.title/body/url), `notificationclick` (focus + navegación + POST `/api/user/push/click` fire-and-forget), `pushsubscriptionchange` (re-subscribe).
- **`components/notifications/service-worker-registrar.tsx`** (nuevo): registra `/sw.js` con scope `/` solo en producción o localhost (nunca http remoto); limpia workers viejos de `/serwist/`.
- **`components/notifications/push-soft-prompt.tsx`** (nuevo): banner no intrusivo tras 2da interacción o 30s; respeta "no mostrar de nuevo" (localStorage) y cooldown 14d tras "Ahora no"; botones Activar / Ahora no / No mostrar de nuevo.
- **`components/notifications/preference-toggles.tsx`** (nuevo): toggles canal (inbox/push) × categoría (system/account/billing/marketing/social/custom) con `Switch` de shadcn/ui; default enabled=true.
- **`lib/notifications/priority.ts`**: exporta `TYPE_ICONS` para lookup estático (satisface `react-hooks/static-components`).
- **`components/notifications/notification-item.tsx`** (scaffold I5 previo): fix lint `static-components` (lookup estático en vez de `getNotificationIcon()` en render).
- **`components/notifications/notification-badge.tsx`** (nuevo): badge del header — icono Bell + contador de no leídas (poll 30s vía hook); sin no leídas solo icono; click abre el dropdown (Popover).
- **`components/notifications/notification-dropdown.tsx`** (nuevo): dropdown del header — últimas 10 notificaciones, "Marcar todo como leído", "Ver todas" → `/notifications`, empty state.
- **`components/notifications/notification-filters.tsx`** (nuevo): tabs "Todas" / "No leídas" (rol=tablist, aria-selected).
- **`components/notifications/empty-state.tsx`** (nuevo): BellOff + "Sin notificaciones" (muted), reutilizable.
- **`app/(app)/notifications/page.tsx`** (nuevo): inbox completo — header con "Marcar todo como leído", filtros, lista (notification-item), "Cargar más" (cursor), empty/loading/error states, layout `Section`.
- **`components/layout/header-with-notifications.tsx`** (nuevo): wrapper client del header del área privada + badge; usado por `app/(app)/layout.tsx` (server).

### Archivos Modificados

- `hooks/use-push-subscription.ts` (nuevo), `hooks/use-notifications.ts` (nuevo), `public/sw.js` (nuevo), `components/notifications/service-worker-registrar.tsx` (nuevo), `components/notifications/push-soft-prompt.tsx` (nuevo), `components/notifications/preference-toggles.tsx` (nuevo), `lib/notifications/priority.ts`, `components/notifications/notification-item.tsx`, `components/notifications/notification-badge.tsx` (nuevo), `components/notifications/notification-dropdown.tsx` (nuevo), `components/notifications/notification-filters.tsx` (nuevo), `components/notifications/empty-state.tsx` (nuevo), `app/(app)/notifications/page.tsx` (nuevo), `components/layout/header-with-notifications.tsx` (nuevo), `app/(app)/layout.tsx`

### Tests

- `tests/unit/hooks/use-push-subscription.test.ts` (nuevo): mock PushManager/Notification/fetch — soporte, suscripción existente, subscribe happy-path, permiso denegado, unsubscribe, listener pushsubscriptionchange.
- `tests/unit/hooks/use-notifications.test.ts` (nuevo): mock fetch — carga inicial, paginación con cursor, reset, markRead/markAllAsRead/deleteNotification, preferencias GET/PUT, polling 30s, visibilitychange.
- `tests/e2e/notifications.spec.ts` (nuevo): sin sesión → redirect a `/login`; con sesión (signIn Auth.js + SQL real) → heading "Notificaciones" visible.
- Suite completa: 247 tests passing; `npx tsc --noEmit` 0 errores; ESLint 0 errores.

### Variables de Entorno

- Ninguna nueva (usa `NEXT_PUBLIC_VAPID_PUBLIC_KEY` ya documentada).

## ✨ Sync StreetMove → skeleton: audit helpers push/notifications + env VAPID + fix-problems gates (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: infra-sync-port
> module: infra
> tags: [sync, audit, push, notifications, env, workflow]

### Problema

El diff `eda408ce..HEAD` de StreetMove agrega helpers de auditoría genéricos para push/notifications, vars de entorno genéricas (VAPID, session TTL, TikTok pixel) y gates de confirmación al workflow fix-problems. El skeleton carecía de estos helpers y gates.

### Solución Implementada

- **Audit**: 7 helpers genéricos portados a `lib/audit/helpers.ts` — `auditPushSubscriptionCreated`, `auditPushSubscriptionRevoked`, `auditPushDirectSent`, `auditPushBroadcastSent`, `auditNotificationHidden`, `auditNotificationDeleted`, `auditBroadcastDeleted` (para feature I4 Push/notifications futura).
- **Env**: `.env.example` + `NEXT_PUBLIC_TIKTOK_PIXEL_ID`, `OPENCODE_ZEN_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SESSION_ACCESS_TOKEN_TTL`.
- **Workflow**: `.opencode/commands/fix-problems.md` + sección 4.5 (entry FEATURES.md para fixes Tier M/L) + sección "Commit y Push" con gate de confirmación (nunca merge/push a main).

### Archivos Modificados

- `lib/audit/helpers.ts`, `.env.example`, `.opencode/commands/fix-problems.md`, `tests/unit/audit/helpers.test.ts`

### Tests

- `tests/unit/audit/helpers.test.ts` ampliado: 13 casos (7 nuevos helpers). Suite passing; `npx tsc --noEmit` 0 errores; ESLint 0 errores.

### Variables de Entorno

- `NEXT_PUBLIC_TIKTOK_PIXEL_ID`, `OPENCODE_ZEN_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SESSION_ACCESS_TOKEN_TTL`

### SKIP (dominio StreetMove / ya portado)

- `schema.ts` (avatarUrl ya portado; pushPreferences/notificationCategory/refresh_tokens son dominio o I4 Push), queries/auth.ts `updateUserAvatar` (ya existe), queries/index.ts (sin queries/notifications en skeleton), `lib/db/index.ts` (max:5 ya existe), `lib/utils.ts` `formatDocumentBytes` (ya existe), `next.config.mjs` (CSP frame-src + remotePatterns blob ya portados; serwist SKIP), `scripts/migrate.ts` (verificación plan_type = dominio), `package.json` (test:mutation requiere stryker; serwist/web-push/blob = I4 Push), `lib/validations/notifications.ts` (módulo inexistente en skeleton), AGENTS.md (reglas ya presentes; entries version.ts/ROADMAP.md = release-process StreetMove).

## ✨ Sync StreetMove → skeleton: session_config + TTL configurable + sesiones persistentes (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: auth-sync-port
> module: auth+db
> tags: [sync, security, session, ttl]

### Problema

El diff `eda408ce..HEAD` de StreetMove introduce TTL de sesión configurable (`session_config` + `getSessionConfig`) y cambia el patrón de sesión: JWT cookie long-lived (30 días) con la sesión DB como gate real (sliding window). El skeleton seguía con 15 min hardcodeados en dos puntos de `auth.ts`.

### Solución Implementada

- **DB**: tabla singleton `session_config` (`access_token_ttl` default 15) + migración `drizzle/0002_slippery_satana.sql` vía `db:generate`.
- **Queries**: `lib/db/queries/session-config.ts` (`getSessionConfig`/`updateSessionConfig`) con fallback env `SESSION_ACCESS_TOKEN_TTL` leído en call-time (no module-load) para testabilidad; export en lib/db/queries/index.ts.
- **auth.ts**: `validateCredentials` y sliding session del callback `jwt` leen el TTL de `session_config` con try-catch graceful (fallback 15 min si la tabla no existe). `session.maxAge` 15 min → 30 días (JWT cookie long-lived; el gate real es la sesión DB + sliding window).
- **Env**: `SESSION_ACCESS_TOKEN_TTL` documentada en `.env.example`.

### Archivos Modificados

- `lib/db/schema.ts`, `lib/db/queries/session-config.ts` (nuevo), `lib/db/queries/index.ts`, `auth.ts`, `.env.example`, `drizzle/0002_slippery_satana.sql` (nuevo)

### Tests

- `tests/unit/db/session-config.test.ts` (5 casos: fila existente, default 15, fallback env, update, upsert insert). Suite unit completa 171/171 passing; `npx tsc --noEmit` 0 errores.

### Variables de Entorno

- `SESSION_ACCESS_TOKEN_TTL` (minutos, default 15; la fila en `session_config` tiene prioridad)

### SKIP (dominio StreetMove / dead code)

- `stepUpVerifiedAt` + cookie `step_up_verified` (step-up auth inexistente en skeleton), `guardGamificationAccess` plan `TOTAL`, rutas gamification/rewards, `types/auth.ts` `avatarUrl` (ya portado).

## ✨ Push Notifications + Notification Inbox (genérico whitelabel) (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: push-notifications
> module: api+db+ui
> tags: [push, pwa, notifications, inbox]

### Problema

El skeleton no tiene notificaciones push ni inbox. El sitio público (marketing CMS) no puede comunicarse con usuarios autenticados: no hay forma de avisar eventos de cuenta (bienvenida, email verificado), ni entregar mensajes in-app persistentes, ni habilitar/deshabilitar canales desde admin. StreetMove lo resolvió con ~40 archivos, 6 tablas DB y 13 endpoints, pero con lógica de dominio fitness que no aplica a proyectos whitelabel.

### Solución Propuesta (spec en `production_artifacts/2026-08-23-push-notifications/feature-spec.md`)

- **DB**: 4 tablas (`notifications`, `push_subscriptions`, `push_click_events`, `notification_preferences`) + 4 enums + índices; una migración Drizzle vía `db:generate`.
- **Engine**: `lib/notifications/engine.ts` (inbox-first + dedup por `groupId` + dispatch), `events.ts`, `priority.ts` (P1-P3), `triggers.ts` (2 ejemplos: `account.welcome`, `account.email_verified`).
- **Push**: `lib/push/sender.ts` (web-push + VAPID), `preferences.ts`, `push-log.ts`; `public/sw.js`; soft-prompt + SW registrar.
- **API**: 13 endpoints (user push: subscription/vapid-key/click; user notifications: list/batch/[id]/unread-count/preferences; admin: settings GET/PUT con auditoría).
- **UI**: badge, dropdown, item, filters, preference-toggles, inbox page `app/(app)/notifications`, admin page `app/admin/notifications`.
- **Deps**: `web-push` (^3.6.7) + `@types/web-push` (dev). **Env**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (server-only), `VAPID_SUBJECT`.

### Tests (requeridos)

- Unit: engine (dedup), priority, sender (404/410 → revoke), preferences, queries notifications/push, hooks.
- API: subscription, vapid-key, notifications, unread-count, preferences, admin settings — guard 401/403 + happy-path SQL real.
- E2E: `tests/e2e/notifications.spec.ts` (soft-prompt → subscribe → badge → dropdown → inbox → admin toggle).

### Out-of-Scope

Crons de dominio (plan-expiring, class-reminders), triggers fitness, rich push, email notifications, broadcast admin (v2), `push_notification_log`.

## ✨ Sync StreetMove → skeleton: hardening auth + T&C + avatar (data layer) (2026-08-21)

> status: released
> release: v0.2
> date: 2026-08-21
> change_id: streetmove-sync-port
> module: auth+db+api
> tags: [sync, security, terms, avatar]

### Problema

El skeleton está desincronizado del fuente StreetMove (SHA `82a4db38` vs última sync `eda408ce`). Entre los cambios no portados hay fixes de seguridad críticos F3/F4: `bcrypt.compare()` lanza excepción con hashes corruptos/no-bcrypt, rompiendo el login (CredentialsSignin) en vez de devolver credenciales inválidas. El fuente también incorpora capacidades genéricas whitelabel que el skeleton necesita: avatar de perfil (capa de datos), Terms & Conditions versionados, pooling `max: 5`, formateador de bytes y reglas de trabajo de migraciones/.env.

### Solución Propuesta (spec en `production_artifacts/2026-08-21-streetmove-sync-port/feature-spec.md`)

- **Auth hardening (crítico)**: nuevo `lib/auth/password.ts` (`isBcryptHash` + `comparePassword`, nunca lanza); `auth.ts` aplica F3/F4, propaga `avatarUrl` en JWT/session y check `requiresTermsAcceptance` graceful (mapping `phone`).
- **DB**: `users.avatar_url` + tablas `terms_versions`/`user_terms_acceptance` + relations; migración Drizzle; `lib/db/queries/terms.ts`; `updateUserAvatar()`. SKIP `planType 'TOTAL'` y `user_documents`.
- **Auditoría**: `auditAvatarUploaded/Deleted`, `auditTermsAccepted`, `auditTermsVersionPublished`.
- **Types**: `avatarUrl?` + `requiresTermsAcceptance?` en next-auth.d.ts y auth.ts.
- **Infra menor**: `pool max: 5`, `formatDocumentBytes()`, `.nvmrc`, `jest.config.js`.
- **Docs/config**: reglas "verificar columnas tras migrar" y "nunca sobrescribir .env.local"; `.env.example` merge LOOP_*; `date-utils` solo `getIsoDayOfWeek`.
- **Deps**: `@tiptap/*` + `dompurify` (rich text + XSS sanitize blog CMS).

### Solución Implementada (release v0.2 — APROBADO por @qa-release 2026-08-23)

- **Auth hardening F3/F4**: `lib/auth/password.ts` (`isBcryptHash` + `comparePassword`, nunca lanza); `auth.ts` aplica F3/F4, propaga `avatarUrl` en JWT/session y check `requiresTermsAcceptance` graceful.
- **DB**: `users.avatar_url` + tablas `terms_versions`/`user_terms_acceptance` + relations; migración `drizzle/0001_romantic_gambit.sql` (generada, pendiente de aplicar con DATABASE_URL); `lib/db/queries/terms.ts`; `updateUserAvatar()`.
- **Auditoría**: `auditAvatarUploaded/Deleted`, `auditTermsAccepted`, `auditTermsVersionPublished`.
- **Infra menor**: `pool max: 5`, `formatDocumentBytes()`, `.nvmrc`, `jest.config.js`.
- **Fix de test infra**: `playwright.config.ts` testDir "tests/e2e" → "tests" + testMatch "**/*.spec.ts" (descubre `tests/api/`; 38 fallos latentes saneados con server probe).
- **API tests auth creados**: `tests/api/auth/signin-guard.spec.ts` (400/401 + no-session) y `signin-happy.spec.ts` (SQL real + auditoría LOGIN + cleanup), con helper `helpers.ts` (serverUp + uniqueIp anti-rate-limit).

### Archivos Modificados (plan)

- `lib/auth/password.ts` (nuevo), `lib/db/queries/terms.ts` (nuevo)
- `auth.ts`, `lib/db/schema.ts`, `lib/db/queries/auth.ts`, `lib/db/queries/index.ts`, `lib/audit/helpers.ts`
- `types/next-auth.d.ts`, `types/auth.ts`, `lib/db/index.ts`, `lib/utils.ts`
- `.nvmrc`, `jest.config.js`, `AGENTS.md`, `.agents/agents.md`, `.env.example`, `lib/date-utils.ts`, `lib/api-docs/spec.ts`, `package.json`
- `drizzle/*` (migración)

### Tests (requeridos)

- `tests/unit/auth/password.test.ts` — isBcryptHash/comparePassword (hash corrupto, válido, null).
- `tests/unit/db/terms.test.ts` — requiresTermsAcceptance (is_current/is_blocking, aceptación).
- `tests/unit/audit/helpers.test.ts` — avatar + terms auditors.
- `tests/unit/` — updateUserAvatar, formatDocumentBytes, callbacks JWT/session.
- `tests/api/auth/` — 401 guard (hash corrupto) + happy-path login con SQL real. **Creados**: `signin-guard.spec.ts`, `signin-happy.spec.ts`, `helpers.ts` (re-validación iteración 2: 9/9 ACs PASS).

### Variables de Entorno

- `.env.example`: `LOOP_METRICS_FILE`, `LOOP_TIMERS_FILE`, `LOOP_REWORK_THRESHOLD` (merge). Mantiene `APP_TIMEZONE`.

## ✨ Harness Sync: mejoras genéricas desde StreetMove (2026-08-02)

> status: released
> release: v0.2
> date: 2026-08-02
> change_id: 2026-08-02-harness-improvements
> module: api
> tags: [harness, coverage, ci, tests, tooling]

### Problema

El skeleton se mantiene sincronizado con el harness de StreetMove (proyecto fuente). Al comparar el fuente con la última sync (`d2a8cb2b`), aparecieron mejoras genéricas del harness no portadas: gate de cobertura con baseline por módulo, baseline de cantidad de tests, fallback a `gh` CLI en el script de espera de CI, declaración de `engines`/`packageManager`, y una plantilla de hoja de trabajo retomable para tareas interrumpibles.

### Solución Implementada

- **Gate `--coverage`**: amplía el radar de cobertura a `app/api/`, `components/` y `hooks/` (antes solo `lib/`) y detecta regresiones >3% por módulo contra `.validation/coverage-baseline.json`. Usa `jest.coverage.config.js` (sin thresholds duros) y reporta baseline forward-looking.
- **Baseline de tests**: `validate-harness.js` registra el conteo de tests en `.validation/baseline.json` y expone `test_coverage_delta` en `.validation/status.json`. Comando de unit tests con `pipefail` + `maxBuffer` 64MB.
- **Fallback `gh` CLI**: `wait-for-ci.js` intenta `gh api` cuando GitHub API devuelve 401/403/404 sin token (repos privados autenticados vía `gh auth login`).
- **`engines`/`packageManager`** en `package.json` (node >=22, pnpm >=9).
- **`.agents/templates/task-worksheet.md`**: plantilla para tareas interrumpibles (timeout/contexto) — qué se hizo, qué queda, cómo validar. Adaptada al whitelabel (sin gates AOSE del fuente).
- **Regla de cobertura** documentada en `AGENTS.md` y `.agents/agents.md`: no reducir cobertura del módulo afectado >3% sin justificación.

### Archivos Modificados

- `scripts/validate-harness.js`
- `scripts/wait-for-ci.js`
- `jest.coverage.config.js` (nuevo)
- `package.json`
- `.agents/templates/task-worksheet.md` (nuevo)
- `AGENTS.md`
- `.agents/agents.md`
- `tests/unit/wait-for-ci.test.ts` (nuevo)
- `tests/unit/harness-baseline.test.ts` (nuevo)
- `production_artifacts/2026-08-02-harness-improvements/sync-report.md`

### Tests

- `tests/unit/wait-for-ci.test.ts` — 22 tests (fallback gh CLI + regresión de API checks).
- `tests/unit/harness-baseline.test.ts` — 10 tests (extractTestCount, delta de tests, regresión de cobertura).

### Variables de Entorno

Ninguna nueva.

## ✨ Marketing CMS: páginas de marketing genéricas editables desde admin (2026-08-08)

> status: released
> release: v0.1
> date: 2026-08-08
> change_id: marketing-cms
> module: admin+api+db+ui
> tags: [cms, marketing, cache, admin, migration]

### Problema

El sitio público del skeleton es solo placeholders (login, register, home estática). Cada cliente whitelabel necesita landing pages, blog, catálogo y páginas informativas editables sin tocar código, y no existe CMS, layout público (header/footer) ni tablas de contenido de marketing.

### Cambios de DB Implementados (Fase 1 · @db-engineer, 2026-08-09)

- **Schema**: +2 enums (`marketing_status`, `marketing_block_type`), +6 tablas (`marketing_pages`, `marketing_sections`, `marketing_posts`, `marketing_products`, `marketing_categories`, `marketing_settings`), relations Drizzle, índices `(page_id, sort_order)` y `(category_id)`, FK sections→pages `onDelete cascade`, products→categories `onDelete set null`, slugs UNIQUE.
- **Migración**: `drizzle/0000_narrow_puff_adder.sql` generada con `pnpm run db:generate` (baseline completo del repo: 10 tablas). drizzle/meta/_journal.json cronológico (idx 0). Sin SQL a mano ni custom SQL.
- **Queries**: `lib/db/queries/marketing/` (pages, sections, posts, products, categories, settings) — puras sin caché; `getPageBySlug` batched (sin N+1); `reorderSections` batch con paso 1024; productos con left join a categoría; `price` documentado como string (numeric pg).
- **Tests unit**: `tests/unit/marketing/schema.test.ts` + `queries.test.ts` — 44 tests verdes.
- Docs: `production_artifacts/2026-08-08-marketing-cms/db-plan.md`, `migration-notes.md`.

### Solución Propuesta (spec en `production_artifacts/2026-08-08-marketing-cms/feature-spec.md`)

- 6 tablas nuevas (`marketing_pages`, `marketing_sections`, `marketing_posts`, `marketing_products`, `marketing_categories`, `marketing_settings`) con 10 block types (hero, features_grid, pricing, testimonials, cta_banner, faq, contact_form, stats, product_grid, blog_list) validados con Zod.
- Rutas públicas renderizadas desde DB con `unstable_cache` + `revalidateTag` (tags `pages:${slug}`, `posts`, `products`, `settings`, `navigation`; TTL fallback 300s).
- Admin panel `/admin/marketing/` (pages + editor de secciones con reorder, blog, products + categories, settings) protegido con `validateAdmin` + auditoría.
- Cero dependencias nuevas (Next.js nativo + Drizzle + UI kit existente).

### Archivos Modificados (plan)

- `lib/db/schema.ts`, `lib/db/queries/` — tablas y queries marketing
- `lib/marketing/` — schemas Zod, cache helpers, reserved-slugs
- `app/(public)/layout.tsx`, `app/(public)/page.tsx`, `app/(public)/blog/*`, `app/(public)/shop/*`, `app/(public)/[slug]/page.tsx`
- `components/marketing/blocks/*` — 10 componentes de bloque
- `app/api/public/*`, `app/api/admin/marketing/*`
- `app/admin/marketing/*` — CRUD UI

### Tests (plan)

- `tests/unit/marketing/` — schemas Zod, queries, cache/revalidate, slugs reservados, reorder
- `tests/api/admin/marketing/` — guards 401/403
- `tests/api/*-happy.spec.ts` — happy-path con SQL real por endpoint
- `tests/e2e/` — 1 público (home desde DB + navegación) + 1 admin (crear/publicar/verificar)

### Cambios de App/Dashboard Implementados (Fase 2-3 · @app-engineer, 2026-08-09)

- **Schemas Zod** (`lib/marketing/schemas/`): 10 block types + entidades (page/post/product/category/settings/contact). Anti-XSS: se prohíben esquemas `javascript:`/`data:`/`vbscript:` en href e imágenes (solo http(s)); `parseBlockConfig` para validación/registry.
- **Cache** (`lib/marketing/cache.ts`): `unstable_cache` + tags (`pages:${slug}`, `posts`, `products`, `settings`, `navigation`) + TTL 300s; `invalidateForEntity` y `revalidateMarketing` (firma Next 16 `revalidateTag(tag, { expire })`).
- **Reserved slugs**: `lib/marketing/reserved-slugs.ts` (login, register, admin, api, blog, shop, dashboard, settings, home) + `isReservedSlug()`.
- **UI wrappers**: `aspect-ratio`, `separator`, `navigation-menu` (Radix) y `carousel` (embla, accesible, con `orientation` en contexto).
- **10 blocks** (`components/marketing/blocks/`): hero, features_grid, pricing, testimonials (carousel), cta_banner, faq, contact_form (client, POST `/api/public/contact`), stats, product_grid y blog_list (client, consumen la API pública cacheada para poder renderizarse también en el preview admin con un solo renderer). Estados loading/empty/error (`block-states.tsx`); error en preview admin con `showErrors`.
- **Layout público** (`components/layout/`): `header.tsx` (client, nav desktop con navigation-menu + drawer móvil vaul, fallback mínimo si CMS vacío), `footer.tsx`, `nav-menu.tsx`.
- **Rutas públicas**: `app/(public)/layout.tsx` con header/footer dinámicos desde `getCachedNavigation`; page.tsx renderiza `home` desde DB con fallback al hero estático; app/(public)/[slug]/page.tsx (reserved → notFound + `generateMetadata`); app/(public)/blog/page.tsx, app/(public)/blog/[slug]/page.tsx (contenido tipográfico validado con Zod), app/(public)/shop/page.tsx, app/(public)/shop/[slug]/page.tsx; `loading.tsx` con `BlockSkeleton`.
- **API pública** (`app/api/public/`): `pages/[slug]`, `posts`, `posts/[slug]`, `products`, `products/[slug]`, `settings/navigation` (GET cacheadas con `Cache-Control: public, s-maxage=300`) y `contact` (POST, Zod + rate limit `checkPublicRateLimit`).
- **Seed local**: `scripts/seed-marketing.ts` (`pnpm run seed:marketing`) — home publicada con 4 secciones, settings, categoría + 2 productos, 2 posts.
- **API docs**: `lib/api-docs/paths/public-marketing.ts` + lib/api-docs/schemas/marketing.ts compuestos en `spec.ts` (tag `Marketing Public`).

### Tests (Fase 2-3)

- `tests/unit/marketing/schemas.test.ts` — 10 blockTypes válidos/inválidos + entidades + anti-XSS (47 tests con cache.test.ts)
- `tests/unit/marketing/cache.test.ts` — tags/TTL correctos, `invalidateForEntity`, `revalidateMarketing`, defaults de navigation
- `tests/api/public/marketing-happy.spec.ts` — happy-path con SQL real de endpoints públicos (requiere seed + servidor; data-dependent tests se skipean si no hay seed)

### Cambios de Admin Implementados (Fase 4 · @admin-engineer, 2026-08-09)

- **API admin** (`app/api/admin/marketing/`, 12 rutas): CRUD de `pages`, `pages/[id]` (con secciones), `sections` (POST add / PUT reorder con paso 1024), `sections/[sectionId]` (PATCH/DELETE), `blog`, `blog/[id]`, `products`, `products/[id]`, `categories`, `categories/[id]`, `settings` (GET/PATCH upsert por key), `revalidate` (tags whitelist). Todas con `guardAdmin` server-side + auditoría (`auditCreate/Update/Delete`, `auditAdminAction` para revalidate) + Zod en body + `invalidateForEntity`/`revalidateMarketing` tras mutaciones.
- **Home guard**: no renombrar ni borrar la página `home` publicada si es la única publicada (400).
- **Config de bloque validada** contra `BLOCK_TYPE_REGISTRY` en POST/PATCH de secciones (400 si shape inválido).
- **Slug checks**: reservados (`isReservedSlug` → 400) y duplicados (409).
- **Admin UI** (`app/admin/marketing/` + `components/admin/marketing/`): layout con sidebar (Pages/Blog/Products/Categories/Settings), listados con Table + Badge estado + publish/unpublish + AlertDialog delete; Stack Builder de página (Tabs Editar/Preview, preview con `<BlockRenderer showErrors>`), `section-stack` con DnD nativo HTML5 + botones up/down, `section-editor` + `section-type-forms/` (10 forms por blockType sobre primitivas compartidas), `post-editor` (bloques heading/paragraph/list), `product-editor` (categorías en Select), `category-manager`, `settings-form` (siteName/logo/navLinks/footerLinks). Feedback con Sonner.
- **Hook** `hooks/use-admin-fetch.ts`: fetch con loading/error/reload compliant con `react-hooks/set-state-in-effect`.
- **API docs**: `lib/api-docs/paths/admin-marketing.ts` (14 paths) + schemas admin en lib/api-docs/schemas/marketing.ts, compuestos en `spec.ts` con tag `Marketing Admin`.

### Tests (Fase 4)

- `tests/api/admin/marketing/guard.spec.ts` — 401 (sin sesión) y 403 (sesión USER) en los 26 endpoints admin
- `tests/api/admin/marketing/pages-happy.spec.ts` — CRUD páginas + secciones + reorder + home guard + 409/400 + revalidate (SQL real)
- `tests/api/admin/marketing/blog-happy.spec.ts` — CRUD posts + content inválido 400 + 409 (SQL real)
- `tests/api/admin/marketing/products-happy.spec.ts` — CRUD categorías + productos + FK SET NULL al borrar categoría (SQL real)
- Helper `tests/api/admin/marketing/helpers.ts` — crea usuarios ADMIN/USER (bcrypt+pg), sesión Auth.js (csrf+callback), cleanup hermético por test

### Variables de Entorno

Ninguna nueva.

### QA Release (2026-08-09 · @qa-release) — ⚠️ REJECTED

> Validación en `production_artifacts/2026-08-08-marketing-cms/release-report.md`, `test-matrix.md`, `acceptance-criteria.md`.

- **AC PASS**: AC1 DB+unit tests (88 unit marketing, 123 total verdes), AC2 API pública+caché (unstable_cache + tags + TTL 300), AC3 API admin protegida (guardAdmin + auditoría + Zod, 12 rutas), AC6 invalidación (revalidateTag + revalidate manual).
- **AC FAIL**: AC4 rutas públicas sin E2E (`tests/e2e/` vacío), AC5 admin panel sin E2E admin, AC7 contact sin test 429 rate limit, AC8 build falla en prerender público sin `DATABASE_URL` (layout introdujo dependencia de DB en build para páginas antes estáticas; `RESEND_API_KEY` es fallo pre-existente del baseline auth).
- **Cobertura**: lib 93.9%, gate `--coverage` PASS (sin regresión >3%).
- **Acciones para aprobar**: crear `tests/e2e/marketing-public.spec.ts` + `marketing-admin.spec.ts`, test 429 en contact, opcional fallback del layout si DB no responde, y re-ejecutar harness `--all` con `DATABASE_URL` real (api_integration).

## ✨ API endpoints push notifications + inbox (2026-09-16)

> status: released
> release: v0.3
> date: 2026-09-16
> change_id: push-notifications
> module: api
> tags: [push, notifications, inbox, api, admin]

### Problema

El skeleton no tenía endpoints para push subscriptions (Web Push/VAPID), inbox de notificaciones ni settings globales. El diseño (`push-notifications-design.md` §4) define 13 endpoints contract-first; faltaba la capa API.

### Solución Implementada

- **User push** (guardUser + ACTIVE explícito): `GET /api/user/push/vapid-key` (200 `{publicKey}`, 503 controlado si VAPID no configurado), `POST/DELETE /api/user/push/subscription` (upsert por userId+endpoint / revoke, rate limit por IP, auditoría push), `POST /api/user/push/click` (CTR, rate limit).
- **User notifications** (guardUser + ACTIVE): `GET /api/user/notifications` (cursor pagination + filtros category/unread + `{items,nextCursor,unread}`), `PATCH` batch mark-read, `PATCH/DELETE /api/user/notifications/[id]` (mark single / soft delete + audit NOTIFICATION_HIDDEN), `GET unread-count`, `GET/PUT preferences` (upsert UNIQUE userId+channel+category).
- **Admin** (guardAdmin + auditoría): `GET/PUT /api/admin/notifications/settings` — toggles `pushEnabled`/`inboxEnabled` persistidos en `marketing_settings` (keys `notifications.*`), default pushEnabled = VAPID configurado, revalidateTag(`settings`).
- **Queries nuevas** en `lib/db/queries/notifications.ts`: `setNotificationsRead` (batch read/unread), `getNotificationPreferences`, `upsertNotificationPreference`.
- **Validaciones** `lib/validations/notifications.ts`: subscribe, unsubscribe, click, query, markRead, markSingleRead, params uuid, preference, admin settings.
- **api-docs**: 13 endpoints en `lib/api-docs/paths/notifications.ts` + schemas en lib/api-docs/schemas/notifications.ts.

### Archivos Modificados

- app/api/user/push/vapid-key/route.ts, app/api/user/push/subscription/route.ts, app/api/user/push/click/route.ts (nuevos)
- `app/api/user/notifications/route.ts`, `app/api/user/notifications/[id]/route.ts`, app/api/user/notifications/unread-count/route.ts, app/api/user/notifications/preferences/route.ts (nuevos)
- `app/api/admin/notifications/settings/route.ts` (nuevo)
- `lib/validations/notifications.ts` (nuevo), `lib/db/queries/notifications.ts` (3 queries nuevas)
- `lib/api-docs/paths/notifications.ts`, `lib/api-docs/schemas/notifications.ts`, `lib/api-docs/spec.ts`

### Tests

- `tests/api/user/notifications.spec.ts` — 401 sin sesión (5 endpoints) + happy-path SQL real (lista, unread-count, mark-read, soft-delete, preferencias) con skip graceful sin DB.
- `tests/api/admin/notifications/settings.spec.ts` — 401/403 + PUT happy-path con auditoría (skip graceful sin DB).
- Suite unit 231 tests passing; `npx tsc --noEmit` 0 errores; ESLint 0 errores.

### Variables de Entorno

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ya documentadas en `.env.example`; `vapid-key` devuelve 503 si faltan)
