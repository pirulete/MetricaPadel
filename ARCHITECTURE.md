# Arquitectura y Convenciones Técnicas

## Descripción General

Proyecto whitelabel con Next.js 16 App Router. Arquitectura de datos híbrida: Auth.js maneja autenticación y sesiones (JWT + sliding session), mientras los datos de perfil y negocio viven en NeonDB usando Drizzle ORM.

## Tecnologías Utilizadas

- **Next.js 16**: Framework React con App Router
- **TypeScript 5.8**: Tipado estricto
- **Auth.js (NextAuth v5)**: Autenticación con credenciales (JWT strategy)
- **NeonDB**: Base de datos PostgreSQL serverless
- **Drizzle ORM**: ORM tipado para consultas
- **Resend**: Envío de emails (verificación)
- **Tailwind CSS v4**: Estilos utilitarios con CSS variables
- **shadcn/ui + Radix UI**: Componentes accesibles
- **Zod**: Validación de schemas
- **Sentry**: Error tracking (opcional)

## Estados de Usuario

| Estado | Significado |
|--------|-------------|
| `TEMPORARY` | Registrado pero email no verificado |
| `ACTIVE` | Email verificado, puede operar |
| `LOCKED` | Bloqueado por intentos fallidos o admin |

Principio: **NUNCA permitir LOCKED** en rutas privadas. TEMPORARY solo si explícitamente declarado.

## Roles

| Rol | Alcance |
|-----|---------|
| `USER` | Área privada (`app/(app)`) |
| `ADMIN` | Back-office (`app/admin`) + área privada |

## Estructura de Carpetas

- `app/(public)` — páginas públicas (landing, login, register, blog, shop, `/[slug]` dinámicas)
- `app/(app)` — área privada autenticada (dashboard, settings, notifications)
- `app/admin` — back-office (requiere `validateAdmin`)
  - `app/admin/marketing/` — CMS de marketing (pages, blog, products, categories, settings)
- `app/api/` — route handlers
  - `app/api/auth/` — endpoints de autenticación
  - `app/api/user/` — endpoints del usuario autenticado
    - `app/api/user/push/` — push subscriptions Web Push/VAPID (vapid-key, subscription, click)
    - `app/api/user/notifications/` — inbox (listado paginado, mark-read, soft-delete, unread-count, preferencias)
  - `app/api/public/` — endpoints públicos de marketing (lectura cacheada + contact con rate limit)
  - `app/api/admin/` — endpoints admin (guard + auditoría obligatorios)
    - `app/api/admin/marketing/` — CRUD del CMS (pages, sections, blog, products, categories, settings, revalidate)
    - `app/api/admin/notifications/` — settings globales de notificaciones (pushEnabled/inboxEnabled)
- `components/` — componentes React
  - `components/ui/` — primitivos shadcn/ui
  - `components/marketing/` — render público del CMS: `blocks/` (10 block types), `block-renderer.tsx`, `block-states.tsx`, `post-content.tsx`
  - `components/layout/` — header/footer/nav públicos del CMS (server-driven desde settings; `header.tsx` client con drawer móvil vaul)
  - `components/notifications/` — infraestructura push/inbox client: `service-worker-registrar.tsx` (registra `/sw.js`), `push-soft-prompt.tsx`, `preference-toggles.tsx`, `notification-badge.tsx`, `notification-dropdown.tsx`, `notification-item.tsx`, `notification-filters.tsx`, `empty-state.tsx`
  - `components/admin/marketing/` — editor admin del CMS (Stack Builder, forms, listados)
  - `components/preview/` — mockups efímeros (se eliminan al implementar)
- `hooks/` — hooks custom
  - `hooks/use-push-subscription.ts` — suscripción Web Push (VAPID, PushManager, pushsubscriptionchange)
  - `hooks/use-notifications.ts` — inbox client (lista paginada, unread polling 30s, mark-read, soft-delete, preferencias)
- `public/` — assets estáticos; `public/sw.js` es el Service Worker de push (estático, sin build)
- `lib/` — lógica de negocio
  - `lib/db/` — schema Drizzle + queries (`queries/marketing/` para el CMS, `queries/notifications.ts`, `queries/session-config.ts`)
  - `lib/marketing/` — lógica del CMS: schemas Zod de block types, cache (`unstable_cache` + tags), slugs reservados, reorder
  - `lib/notifications/` — motor de notificaciones: `engine.ts` (inbox-first + dedup por groupId + dispatch), `events.ts` (tipos de evento), `priority.ts` (P1-P3 + TYPE_ICONS), `triggers.ts` (ejemplos: `account.welcome`, `account.email_verified`)
  - `lib/push/` — infraestructura Web Push: `sender.ts` (web-push + VAPID, manejo 404/410 → revoke), `preferences.ts` (canal/categoría), `push-log.ts` (log de envíos)
  - `lib/modules/harness/` — módulos del harness de validación: `risk-policy.ts` (tipos RiskLevel/RiskResult)
  - `lib/policy/` — reglas de riesgo: `risk-rules.js` (CJS, JSDoc types, patrones de archivos sensibles)
  - `lib/auth/` — guards, validaciones, schemas (`admin-guard.ts`, `password.ts`, `protected-routes.ts`)
  - `lib/audit/` — helpers de auditoría (20+ eventos: auth, avatar, terms, push, notifications, marketing)
  - `lib/api-docs/` — spec OpenAPI de endpoints
  - `lib/rate-limit.ts` — rate limiting por IP
  - `lib/validations/notifications.ts` — schemas Zod para endpoints de notificaciones

### Caché del CMS de Marketing
- Las queries Drizzle (`lib/db/queries/marketing/*`) son puras y NO cachean.
- La caché vive en `lib/marketing/cache.ts`: `unstable_cache` con tags (`pages:${slug}`, `posts`, `products`, `settings`, `navigation`) y TTL fallback 300s.
- Toda mutación admin revalida los tags de la entidad afectada vía `revalidateTag` (helper `invalidateForEntity`); invalidación manual: `POST /api/admin/marketing/revalidate`.
- Slugs reservados para `/[slug]`: `lib/marketing/reserved-slugs.ts` (login, register, admin, api, blog, shop, dashboard, settings).
- Esquema de DB: enums `marketing_status` (draft/published) y `marketing_block_type` (10 block types); tablas `marketing_pages`, `marketing_sections` (FK page cascade, índice page_id+sort_order), `marketing_posts`, `marketing_products` (FK categoría set null, índice category_id, `price` numeric → string en pg), `marketing_categories`, `marketing_settings` (PK key). Migración baseline: `drizzle/0000_*.sql`.

### Push Notifications + Notification Inbox

- **Tablas DB** (4): `notifications` (inbox con type/priority/title/body/read/deletedAt/groupId), `push_subscriptions` (Web Push endpoints por usuario, status active/revoked), `push_click_events` (CTR analytics), `notification_preferences` (canal × categoría, UNIQUE userId+channel+category).
- **Enums DB** (5): `notification_type_enum`, `notification_priority_enum` (P1-P3), `notification_category_enum` (system/account/billing/marketing/social/custom), `push_subscription_status` (active/revoked), `notification_channel` (inbox/push).
- **Índices**: `notifications_user_deleted_idx`, `notifications_category_idx`, `push_subscriptions_user_endpoint_idx` (UNIQUE), `push_subscriptions_user_status_idx`, `push_subscriptions_status_idx`, `push_subscriptions_endpoint_idx`, `push_click_events_user_clicked_idx`, `notification_preferences_user_channel_category_idx` (UNIQUE).
- **Migraciones**: `0000_narrow_puff_adder.sql` (baseline + marketing), `0001_romantic_gambit.sql` (avatar + terms), `0002_slippery_satana.sql` (session_config TTL), `0003_tired_tenebrous.sql` (notifications + push).
- **Engine**: `lib/notifications/engine.ts` — inbox-first (siempre persiste), dedup por `groupId` (ventana 24h), dispatch a canales habilitados según preferencias.
- **Push sender**: `lib/push/sender.ts` — web-push + VAPID, manejo 404/410 → revoke automático de suscripción.
- **Feature flags**: `lib/notifications/feature-flags.ts` (`isInboxEnabled`, `isPushEnabled`) con patrón cache de marketing.
- `tests/`
  - `tests/unit/` — Jest (`.test.ts`)
  - `tests/api/` — Playwright API (`.spec.ts`)
  - `tests/e2e/` — Playwright E2E
- `drizzle/` — migraciones Drizzle
- `production_artifacts/` — artifacts de workflows
- `.opencode/` — agent team y comandos
- `.agents/` — workflows y patrones

## Padel Evaluativo — Core (v0.1)

- **Roles**: `ADMIN` = coach (crea jugadores, rúbricas, evalúa, publica); `USER` = alumno (ve evaluaciones publicadas, marca leído). Sin `padel_role`.
- **Tablas DB** (6): `rubrics` (ownerId FK users no cascade, category enum, status draft/active/archived), `rubric_levels` (4 niveles fijos: Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1), `rubric_criteria`, `rubric_descriptors` (UNIQUE criteria+level), `evaluations` (studentId/teacherId/rubricId, status draft/published, totalScore/maxScore denormalizados, publishedAt, readAt), `evaluation_scores` (FK criteria/levels sin cascade → historial protegido).
- **Enums DB** (3): `rubric_category` (tecnica/tactica/fisica/actitud), `rubric_status`, `evaluation_status`.
- **Ownership anti-IDOR**: toda query recibe `ownerId`/`teacherId`/`studentId` y filtra; recurso ajeno → 404 (no 403).
- **Endpoints** (10 route handlers / 15 endpoints): `app/api/admin/users` (GET+POST+[id]), `app/api/rubrics` (GET+POST+[id] GET/PUT/DELETE archive), `app/api/evaluations` (GET+POST+[id] GET/PUT+publish), `app/api/student/evaluations` (GET+[id]+read). Guards `guardAdmin`/`guardUser` + auditoría en mutaciones.
- **UI**: `app/(app)/rubricas` (P02 biblioteca + P03 editor), `app/(app)/evaluar` (P09 canvas score en vivo), `app/(app)/evaluaciones` (A03 lista + detalle alumno). Componentes en `components/padel/`.
- **Lógica pura**: `lib/padel/score.ts` (computeMaxScore/TotalScore, validatePublish); validaciones Zod en `lib/validations/padel.ts`.
- **Migración**: `0004_*` (enums + 6 tablas + índices).

## Convenciones de Migraciones

- **Siempre usar `pnpm run db:generate` tras modificar `lib/db/schema.ts`** — nunca crear SQL a mano.
- Verificar orden cronológico en `drizzle/meta/_journal.json` después de cada `db:generate`.
- Si se requiere custom SQL (DO blocks, data migrations): ejecutar `db:generate` primero, luego agregar el SQL custom al archivo generado, y re-ejecutar `db:generate` para actualizar el snapshot.
- No editar `_journal.json` manualmente (salvo reparaciones de emergencia documentadas).
- Ejecutar migraciones: `pnpm run db:migrate` (requiere `DATABASE_URL`).

## Convenciones de Seguridad

- `auth.ts` — config Auth.js. `NEXTAUTH_SECRET` requerida en producción (fallback automático en dev). Sesión JWT long-lived (30 días) con la sesión DB como gate real: el callback `jwt` valida `sessions.token` y aplica sliding window con TTL configurable vía tabla `session_config` (fallback env `SESSION_ACCESS_TOKEN_TTL`, default 15 min).
- Guards en `lib/auth/admin-guard.ts`: `validateUser`, `validateAdmin`, `guardUser`, `guardAdmin`.
- Toda mutación sensible debe auditarse vía `lib/audit/helpers.ts` (audit_logs).
- Todo endpoint público requiere rate limit (`lib/rate-limit.ts`) + Cache-Control + security headers.
- Todo endpoint admin requiere guard server-side + auditoría en mutaciones.
- `lib/auth/protected-routes.ts` documenta el guard y estados permitidos por endpoint (referencia, no middleware automático).

## Pruebas y Calidad

| Tipo | Ubicación | Comando |
|------|-----------|---------|
| Unit (Jest) | `tests/unit/` | `pnpm run test:unit` |
| API (Playwright) | `tests/api/` | `npx playwright test tests/api/` |
| E2E (Playwright) | `tests/e2e/` | `pnpm run test:e2e` |
| Lint | — | `pnpm run lint` |
| Typecheck | — | `npx tsc --noEmit` |
| Secrets | — | `pnpm run security:secrets` |
| SAST | — | `pnpm run security:sast` |

Reglas:
- Todo cambio de código debe incluir unit tests (Jest) y API tests (Playwright) correspondientes.
- Todo endpoint nuevo debe tener al menos 1 test happy-path con SQL real contra la DB, además de los tests de guard (401/403).
- Todo feature que modifique UI debe incluir al menos 1 test E2E navegable.
- Todo endpoint nuevo debe documentarse en `lib/api-docs/spec.ts`.

### Gates de Validación

`node scripts/validate-harness.js --all` ejecuta: typecheck, lint, unit tests, API tests, E2E, build, secrets, SAST, api integration, code review, audit deps, env vars.

El resultado se guarda en `.validation/status.json`. Si `status = "fail"`, **no se puede iniciar ningún workflow** hasta resolver.

## Agent Team

Ver `AGENTS.md` para roles de agentes, workflows y quality gates. La asignación de modelos por agente está en `.opencode/agents/*.md`.

### Sistemas de Memoria (MCP)

| Sistema | Propósito | Prioridad |
|---------|-----------|-----------|
| **codebase-memory-mcp** | Grafo de código fuente (funciones, rutas, imports) | 1 (primero) |
| **Engram** | Memoria persistente de decisiones entre sesiones | 2 |
| **headroom** | Compresión de contexto para ahorrar tokens | 3 |
