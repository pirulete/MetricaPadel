# Config Mapping — Questionnaire → Acciones

Mapeo completo de cada respuesta del `questionnaire.md` a una acción concreta sobre archivos del proyecto.

---

## Bloque A — Identidad

| Pregunta | Respuesta | Acción | Archivos |
|----------|-----------|--------|----------|
| Q1 | `"fit-tracker"` | `package.json.name="fit-tracker"`, `.engram/config.json.project_name="fit-tracker"`, `app/layout.tsx metadata.title="fit-tracker"`, `lib/api-docs/spec.ts info.title="fit-tracker API"` | `package.json`, `.engram/config.json`, `app/layout.tsx`, `lib/api-docs/spec.ts` |
| Q2 | `"SaaS para fitness"` | `app/layout.tsx metadata.description="..."`, `package.json.description="..."` | `app/layout.tsx`, `package.json` |
| Q3 | `saas` | Copiar snippets del pattern `saas` a schema, queries, API, UI, tests | `lib/db/schema.ts` (append), `lib/db/queries/saas.ts`, `app/api/plans/route.ts`, `app/api/projects/route.ts`, `app/api/subscriptions/route.ts`, `app/api/api-keys/route.ts`, `app/(public)/pricing/page.tsx`, `app/(app)/dashboard/projects/page.tsx` |
| Q3 | `ecommerce` | Copiar snippets del pattern `ecommerce` | `lib/db/schema.ts` (append), `lib/db/queries/ecommerce.ts`, `app/api/products/route.ts`, `app/api/cart/route.ts`, `app/api/orders/route.ts`, `app/(public)/shop/page.tsx`, `app/(app)/account/orders/page.tsx` |
| Q3 | `blog` | Copiar snippets del pattern `blog` | `lib/db/schema.ts` (append), `lib/db/queries/blog.ts`, `app/api/posts/route.ts`, `app/(public)/blog/page.tsx`, `app/admin/posts/page.tsx` |
| Q3 | `services` | Copiar snippets del pattern `services` | `lib/db/schema.ts` (append), `lib/db/queries/services.ts`, `app/api/services/route.ts`, `app/api/bookings/route.ts`, `app/(public)/services/page.tsx`, `app/(app)/account/bookings/page.tsx` |
| Q3 | `education` | Copiar snippets del pattern `education` | `lib/db/schema.ts` (append), `lib/db/queries/education.ts`, `app/api/courses/route.ts`, `app/api/courses/[slug]/enroll/route.ts`, `app/(public)/courses/page.tsx`, `app/(app)/account/courses/page.tsx` |
| Q3 | `none` | No aplicar pattern | — |
| Q4 | `{ "primary": "#2563eb" }` | Reemplazar `--primary` oklch en `globals.css`, actualizar `--ring` y `--chart-*` | `app/globals.css` |
| Q5 | `{ "lang": "es", "timezone": "America/Argentina/Buenos_Aires" }` | `app/layout.tsx html lang="es"`, `.env.local APP_TIMEZONE="America/Argentina/Buenos_Aires"` | `app/layout.tsx`, `.env.local` |

---

## Bloque B — Features del skeleton

| Pregunta | Respuesta | Acción | Archivos |
|----------|-----------|--------|----------|
| Q6 | `["cms", "push", "notifications"]` | Incluir features: CMS marketing, push notifications, inbox | Incluidos por defecto. Si se excluyen, no copiar módulos correspondientes |
| Q6 | `[]` (nada) | Solo skeleton base sin features de negocio | Excluir `lib/marketing/`, `lib/notifications/`, `lib/push/`, `app/admin/marketing/` |
| Q7 | `"stripe"` | Agregar `stripe` a `package.json` dependencies | `package.json` |
| Q7 | `"mercadopago"` | Agregar `mercadopago` a `package.json` dependencies | `package.json` |
| Q7 | `"none"` | No agregar dependencia de pagos | — |
| Q8 | `"welcome+reset"` | Incluir templates: `welcome.tsx`, `reset-password.tsx` | `lib/email/templates/` |
| Q8 | `"verify+reset"` (default) | Solo templates esenciales | `lib/email/templates/verify.tsx`, `lib/email/templates/reset-password.tsx` |
| Q9 | `"gtm"` | Agregar `NEXT_PUBLIC_GTM_ID` a `.env.local` | `.env.local` |
| Q9 | `"none"` | No configurar analytics | — |
| Q10 | `"sentry"` | Agregar `@sentry/nextjs`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` a `.env.local` | `package.json`, `.env.local` |
| Q10 | `"none"` | No configurar error tracking | — |

---

## Bloque C — Dominio

| Pregunta | Respuesta | Acción | Archivos |
|----------|-----------|--------|----------|
| Q11 | `["rutinas", "ejercicios"]` | Crear tablas: `rutinas`, `ejercicios` con Drizzle schema | `lib/db/schema.ts` (append) |
| Q12 | `{ "rutinas": ["hasMany:ejercicios"] }` | Agregar FK: `ejercicios.rutinaId → rutinas.id` | `lib/db/schema.ts` |
| Q13 | `["USER", "TRAINER", "ADMIN"]` | Agregar enum `user_role` con valores extendidos, actualizar guards | `lib/db/schema.ts`, `lib/auth/admin-guard.ts` |
| Q14 | `["home", "pricing"]` | Crear páginas públicas base | `app/(public)/page.tsx`, `app/(public)/pricing/page.tsx` |
| Q15 | `{ "metrics": ["clientes_activos"] }` | Crear query de métricas + dashboard card | `lib/db/queries/metrics.ts`, `app/(app)/dashboard/page.tsx` |

---

## Tabla de renombrado (aplicada por init-project.mjs)

| Archivo | Campo | Transformación |
|---------|-------|----------------|
| `package.json` | `name` | `<Q1>` |
| `package.json` | `version` | `"0.1.0"` |
| `.engram/config.json` | `project_name` | `<Q1>` |
| `app/layout.tsx` | `metadata.title` | `<Q1>` |
| `app/layout.tsx` | `metadata.description` | `<Q2>` |
| `app/layout.tsx` | `html lang` | `<Q5.lang>` |
| `app/globals.css` | `--primary`, `--ring`, `--chart-*` | `<Q4>` (oklch) |
| `lib/api-docs/spec.ts` | `info.title` | `"<Q1> API"` |
| `lib/api-docs/spec.ts` | `info.version` | `"0.1.0"` |
| `scripts/lighthouse.mjs` | `PAGES` | según Q14 |
| `scripts/pagespeed.mjs` | `PAGES` | según Q14 |

---

## Generación de .env.local

El script genera `.env.local` desde `.env.example` (solo si no existe) sustituyendo:

| Variable | Valor | Fuente |
|----------|-------|--------|
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | default |
| `APP_TIMEZONE` | `<Q5.timezone>` | Q5 |
| `RESEND_FROM_EMAIL` | `noreply@<domain>` | Q1 como dominio |

> **No genera secrets** — imprime comandos para generarlos después.

---

<!-- mapping:start -->
```json
{
  "version": 1,
  "questions": {
    "Q1_name": { "type": "string", "targets": ["package.json:name", ".engram/config.json:project_name", "app/layout.tsx:metadata.title", "lib/api-docs/spec.ts:info.title"] },
    "Q2_description": { "type": "string", "targets": ["app/layout.tsx:metadata.description", "package.json:description"] },
    "Q3_pattern": { "type": "enum", "values": ["saas", "ecommerce", "blog", "services", "education", "none"], "targets": ["pattern"] },
    "Q4_colors": { "type": "object", "fields": ["primary", "primaryDark"], "targets": ["app/globals.css:--primary", "app/globals.css:--ring"] },
    "Q5_locale": { "type": "object", "fields": ["lang", "timezone"], "targets": ["app/layout.tsx:html.lang", ".env.local:APP_TIMEZONE"] },
    "Q6_features": { "type": "multi-select", "values": ["cms", "push", "notifications", "blog", "shop", "terms", "avatar"], "targets": ["features"] },
    "Q7_payments": { "type": "enum", "values": ["stripe", "mercadopago", "lemon-squeezy", "none"], "targets": ["package.json:dependencies"] },
    "Q8_emails": { "type": "string", "targets": ["lib/email/templates/"] },
    "Q9_analytics": { "type": "enum", "values": ["gtm", "ga4", "plausible", "umami", "none"], "targets": [".env.local:NEXT_PUBLIC_GTM_ID"] },
    "Q10_error_tracking": { "type": "enum", "values": ["sentry", "highlight", "logrocket", "none"], "targets": ["package.json:dependencies", ".env.local:SENTRY_DSN"] },
    "Q11_entities": { "type": "string[]", "targets": ["lib/db/schema.ts:tables"] },
    "Q12_relations": { "type": "object", "targets": ["lib/db/schema.ts:foreign_keys"] },
    "Q13_roles": { "type": "string[]", "targets": ["lib/db/schema.ts:enums", "lib/auth/admin-guard.ts"] },
    "Q14_pages": { "type": "string[]", "targets": ["app/(public)/"] },
    "Q15_metrics": { "type": "object", "targets": ["app/(app)/dashboard/page.tsx", "lib/db/queries/metrics.ts"] }
  },
  "rename": {
    "package.json": { "name": "Q1", "version": "0.1.0" },
    ".engram/config.json": { "project_name": "Q1" },
    "app/layout.tsx": { "metadata.title": "Q1", "metadata.description": "Q2", "html.lang": "Q5.lang" },
    "app/globals.css": { "--primary": "Q4.primary", "--ring": "Q4.primary", "--chart-1": "Q4.primary" },
    "lib/api-docs/spec.ts": { "info.title": "Q1 + ' API'", "info.version": "0.1.0" },
    "scripts/lighthouse.mjs": { "PAGES": "Q14" },
    "scripts/pagespeed.mjs": { "PAGES": "Q14" }
  },
  "patterns": {
    "saas": {
      "tables": ["plans", "subscriptions", "projects", "api_keys"],
      "files": {
        "lib/db/schema.ts": "append",
        "lib/db/queries/saas.ts": "create",
        "app/api/plans/route.ts": "create",
        "app/api/projects/route.ts": "create",
        "app/api/subscriptions/route.ts": "create",
        "app/api/api-keys/route.ts": "create",
        "app/(public)/pricing/page.tsx": "create",
        "app/(app)/dashboard/projects/page.tsx": "create"
      }
    },
    "ecommerce": {
      "tables": ["products", "orders", "order_items", "carts"],
      "files": {
        "lib/db/schema.ts": "append",
        "lib/db/queries/ecommerce.ts": "create",
        "app/api/products/route.ts": "create",
        "app/api/cart/route.ts": "create",
        "app/api/orders/route.ts": "create",
        "app/(public)/shop/page.tsx": "create",
        "app/(app)/account/orders/page.tsx": "create"
      }
    },
    "blog": {
      "tables": ["posts", "post_categories", "post_tags", "comments"],
      "files": {
        "lib/db/schema.ts": "append",
        "lib/db/queries/blog.ts": "create",
        "app/api/posts/route.ts": "create",
        "app/(public)/blog/page.tsx": "create",
        "app/admin/posts/page.tsx": "create"
      }
    },
    "services": {
      "tables": ["services", "providers", "bookings", "reviews"],
      "files": {
        "lib/db/schema.ts": "append",
        "lib/db/queries/services.ts": "create",
        "app/api/services/route.ts": "create",
        "app/api/bookings/route.ts": "create",
        "app/(public)/services/page.tsx": "create",
        "app/(app)/account/bookings/page.tsx": "create"
      }
    },
    "education": {
      "tables": ["courses", "lessons", "enrollments", "quizzes"],
      "files": {
        "lib/db/schema.ts": "append",
        "lib/db/queries/education.ts": "create",
        "app/api/courses/route.ts": "create",
        "app/api/courses/[slug]/enroll/route.ts": "create",
        "app/(public)/courses/page.tsx": "create",
        "app/(app)/account/courses/page.tsx": "create"
      }
    }
  }
}
```
<!-- mapping:end -->
