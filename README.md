# Métrica Pádel — Plataforma de Evaluación Deportiva

Aplicación web para coaches y jugadores de pádel. Permite crear rúbricas, evaluar jugadores con scoring por criterios, gestionar cursos, y que los alumnos vean su evolución en el tiempo.

## Stack

- **Next.js 16** App Router + TypeScript 5.8
- **Auth.js** (NextAuth v5) — credenciales, JWT y sliding sessions
- **NeonDB** (PostgreSQL serverless) + **Drizzle ORM**
- **Tailwind CSS v4** + **shadcn/ui** + **Radix UI**
- **Zod** para validación
- **Jest** (unit) + **Playwright** (API/E2E)
- **ESLint** + **gitleaks** + **semgrep** + **Sentry** (opcional)

## Roles

| Rol | Alcance | Descripción |
|-----|---------|-------------|
| `ADMIN` | Coach | Crea rúbricas, gestiona cursos, evalúa jugadores, publica evaluaciones |
| `USER` | Jugador | Ve evaluaciones publicadas, se une a cursos, sigue su evolución |

## Features

### Evaluación (core)

- **Rúbricas**: CRUD completo con 6 categorías (reglas, técnica básica, técnica específica, táctica, física, actitud equipo) y 4 niveles (Excelente/Bueno/Aceptable/En desarrollo)
- **Evaluaciones**: scoring en vivo por criterio, publicación con validación de cobertura dimensional (soft-block), versionado automático por (alumno, rúbrica)
- **Evolución del alumno**: tendencia up/down/stable por categoría, comparación entre versiones, página dedicada `/evolucion`
- **Dashboard coach**: métricas COUNT/AVG de evaluaciones y alumnos por curso

### Cursos

- Crear/editar/archivar cursos con código de invitación `PAD-XXXX`
- Gestión de alumnos: agregar/remover manualmente, unirse por código
- Rúbricas asignadas por curso
- Historial de evaluaciones con filtros por curso/alumno/estado

### Autenticación y Seguridad

- Registro público con email verificación (OTP 6 dígitos)
- Login con JWT + sliding session configurable (TTL en DB)
- Estados de usuario: TEMPORARY (sin verificar), ACTIVE, LOCKED
- Guards server-side (`guardUser`/`guardAdmin`) + auditoría en mutaciones
- Rate limit en endpoints públicos
- CSRF token fetch para producción

### Notificaciones

- Push notifications (Web Push + VAPID) con service worker
- Inbox de notificaciones con paginación por cursor
- Preferencias por canal (inbox/push) × categoría
- Prompt no intrusivo para activar push
- Admin settings para habilitar/deshabilitar canales

### Admin / Marketing

- Gestión de usuarios: CRUD, promoción USER→ADMIN, bloqueo/desbloqueo
- CMS de marketing: páginas, blog, productos, categorías, configuración
- 10 block types para páginas de marketing (hero, features, CTA, etc.)

### Infraestructura

- Neon Preview Branch para aislamiento de DB en preview deploys
- Supercommit system (`/supercommitpre` para desarrollo, `/supercommitpro` para deploy)
- Harness de validación con 14+ gates (typecheck, lint, tests, build, secrets, SAST, etc.)
- Agent team OpenCode con 12 agentes especializados

## Requisitos

- Node.js 20 (ver `.nvmrc`)
- pnpm 9 (`corepack prepare pnpm@9.15.0 --activate`)
- Una base de datos NeonDB (PostgreSQL)

## Setup

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
cp .env.example .env.local   # llenar DATABASE_URL y NEXTAUTH_SECRET
pnpm run db:migrate          # crea las tablas
pnpm run dev                 # http://localhost:3000
```

> **Nota pnpm:** pnpm ≥11 requiere Node 22. Este proyecto usa Node 20, así que fija pnpm 9 con corepack antes de `pnpm install`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `pnpm run dev` | Dev server |
| `pnpm run build` | `next build` + migraciones |
| `pnpm run start` | Servidor de producción |
| `pnpm run lint` / `lint:fix` | ESLint |
| `pnpm run test:unit` | Jest — `tests/unit/*.test.ts` |
| `pnpm run test:e2e` | Playwright — `tests/e2e/` |
| `npx playwright test tests/api/` | Playwright — `tests/api/*.spec.ts` |
| `pnpm run db:generate` | Genera migración Drizzle desde `lib/db/schema.ts` |
| `pnpm run db:migrate` | Aplica migraciones a la DB |
| `pnpm run db:studio` | Drizzle Studio (ver/editar datos) |
| `pnpm run security:secrets` | gitleaks (secrets) |
| `pnpm run security:sast` | semgrep (SAST) |
| `pnpm run security:deps` | `pnpm audit --audit-level=high` |
| `node scripts/validate-harness.js --all` | Todos los gates de validación |

## Estructura de Carpetas

```
app/
  (public)/          # páginas públicas (landing, login, register, blog, shop, /[slug])
  (app)/             # área privada autenticada
    dashboard/       # dashboard por rol (coach/jugador)
    cursos/          # lista + detalle de cursos
    evaluar/         # canvas de scoring (coach)
    evaluaciones/    # lista de evaluaciones (coach)
    evolucion/       # evolución del alumno
    rubricas/        # biblioteca + editor de rúbricas
    historial/       # historial con filtros
    settings/        # perfil + cambio de contraseña
    notifications/   # inbox de notificaciones
  admin/             # back-office
    users/           # gestión de usuarios
    marketing/       # CMS (pages, blog, products, categories, settings)
  api/               # route handlers
    auth/            # autenticación
    user/            # endpoints del usuario (push, notifications, profile)
    admin/           # endpoints admin (users, marketing, notifications)
    rubrics/         # CRUD rúbricas
    evaluations/     # CRUD evaluaciones + publish
    courses/         # CRUD cursos + join + rubrics + students
    dashboard/       # métricas por rol
    student/         # endpoints del alumno (evaluations, evolution, courses)
    history/         # historial con filtros
components/
  ui/                # primitivas shadcn/ui
  padel/             # componentes de padel (30+)
  admin/             # componentes admin
  notifications/     # push/inbox UI
  layout/            # header, footer, sidebar
lib/
  db/                # schema Drizzle + queries
  padel/             # lógica de negocio (score, evolution, course-code, etc.)
  auth/              # guards, validaciones, schemas
  notifications/     # engine, triggers, priority
  push/              # sender, preferences, push-log
  audit/             # helpers de auditoría (20+ eventos)
  api-docs/          # spec OpenAPI de endpoints
hooks/               # use-push-subscription, use-notifications
tests/
  unit/              # Jest
  api/               # Playwright API tests
  e2e/               # Playwright E2E tests
drizzle/             # migraciones Drizzle (8 migraciones)
production_artifacts/# artifacts de workflows
```

## Estructura de Rutas

| Ruta | Sección | Guard |
|------|---------|-------|
| `/` · `/login` · `/register` | Pública | ninguno |
| `/dashboard` | Privada | `validateUser` |
| `/cursos` · `/evaluar` · `/evaluaciones` · `/evolucion` | Privada | `validateUser` |
| `/rubricas` · `/historial` · `/settings` | Privada | `validateUser` |
| `/admin` · `/admin/users` | Back-office | `validateAdmin` |
| `/api/auth/*` | Autenticación | — |
| `/api/user/*` | Usuario autenticado | `guardUser` |
| `/api/admin/*` | Endpoints admin | `guardAdmin` + auditoría |

## Variables de Entorno

Las requeridas están documentadas en `.env.example`. Las principales:

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | Sí | URL de conexión NeonDB |
| `NEXTAUTH_SECRET` | Sí (producción) | Secret para JWT (fallback en dev) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | No | Web Push VAPID private key |
| `VAPID_SUBJECT` | No | Web Push subject (mailto:) |
| `SESSION_ACCESS_TOKEN_TTL` | No | TTL sesión en min (default 15) |
| `SENTRY_AUTH_TOKEN` | No | Sentry (si falta, se desactiva) |
| `NEON_API_KEY` | No | Neon branching (si falta, fallback local) |

## Convenciones de Tests

| Tipo | Ubicación | Framework | Comando |
|------|-----------|-----------|---------|
| Unit | `tests/unit/*.test.ts` | Jest | `pnpm run test:unit` |
| API | `tests/api/*.spec.ts` | Playwright | `npx playwright test tests/api/` |
| API happy-path | `tests/api/*-happy.spec.ts` | Playwright | idem |
| E2E | `tests/e2e/` | Playwright | `pnpm run test:e2e` |

Reglas:
- Todo cambio de código incluye unit tests y API tests.
- Todo endpoint nuevo tiene al menos 1 happy-path con SQL real contra la DB.
- Toda feature que modifique UI incluye al menos 1 E2E del flujo feliz.
- Todo endpoint nuevo se documenta en `lib/api-docs/spec.ts`.

## Git Workflow

```
rama-preview ← todos los workflows commitean aquí
     │
     ▼  (cuando el usuario decide deploy)
    main ← /supercommitpro ejecuta merge --no-ff + validación + push
```

| Comando | Acción |
|---------|--------|
| `/supercommitpre` | Sync con main + commit a rama-preview |
| `/supercommitpro` | Commit a rama-preview + merge a main (deploy) |

Ningún workflow (excepto `/supercommitpro`) ejecuta `git checkout main`, `git merge`, ni `git push origin main`.

## Agent Team OpenCode

El repo incluye un equipo de agentes para trabajar con OpenCode. Ver `AGENTS.md` para roles completos.

| Comando | Descripción |
|---------|-------------|
| `/ship-feature <idea>` | Feature end-to-end: spec → diseño → implementación → QA → release |
| `/design <idea>` | UX/UI design: alternativas con tradeoffs + mockup navegable |
| `/fix-problems <alcance>` | Triage de errores del panel Problems con fix mínimo |
| `/ponytail-review <path>` | Revisa código existente por sobreingeniería |
| `/validate` | Ejecuta los gates de validación completos |

**Agentes**: `@pm`, `@architect`, `@db-engineer`, `@auth-security`, `@app-engineer`, `@admin-engineer`, `@qa-release`, `@qa-fix`, `@architect-fix`, `@ponytail-reviewer`, `@ui-designer`, `@qa-validator`.

## Referencias

- `AGENTS.md` — roles de agentes, workflows, quality gates
- `ARCHITECTURE.md` — convenciones técnicas, migraciones, seguridad
- `FEATURES.md` — registro de 31 features implementadas con metadata de tracking
- `QUICKSTART.md` — cómo partir un proyecto nuevo desde este skeleton
