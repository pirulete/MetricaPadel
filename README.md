# skeleton_base — Skeleton de proyecto Next.js whitelabel

Base de proyecto **Next.js 16** reutilizable para partir aplicaciones nuevas rápido, con parte pública + área privada + back-office, autenticación completa y un agent team OpenCode listo para desarrollar features end-to-end.

Para partir un proyecto nuevo en 5 minutos, ver **[QUICKSTART.md](./QUICKSTART.md)**.

## Stack

- **Next.js 16** App Router + TypeScript 5.8
- **Auth.js** (NextAuth v5) — credenciales, JWT y sliding sessions
- **NeonDB** (PostgreSQL serverless) + **Drizzle ORM**
- **Tailwind CSS v4** + **shadcn/ui** + **Radix UI**
- **Zod** para validación
- **Jest** (unit) + **Playwright** (API/E2E)
- **ESLint** + **gitleaks** + **semgrep** + **Sentry** (opcional)

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
pnpm run db:migrate          # crea las tablas base
pnpm run dev                 # http://localhost:3000
```

> **Nota pnpm:** pnpm ≥11 requiere Node 22. Este proyecto usa Node 20, así que fija pnpm 9 con corepack antes de `pnpm install`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `pnpm run dev` | Dev server |
| `pnpm run build` | `next build` + migraciones |
| `pnpm run start` | Servidor de producción |
| `pnpm run lint` / `lint:fix` | ESLint (fix corrige auto-fixables) |
| `pnpm run test:unit` | Jest — `tests/unit/*.test.ts` |
| `pnpm run test:e2e` | Playwright — `tests/e2e/` |
| `npx playwright test tests/api/` | Playwright — `tests/api/*.spec.ts` |
| `pnpm run db:generate` | Genera migración Drizzle desde `lib/db/schema.ts` |
| `pnpm run db:migrate` | Aplica migraciones a la DB |
| `pnpm run db:studio` | Drizzle Studio (ver/editar datos) |
| `pnpm run security:secrets` | gitleaks (secrets) |
| `pnpm run security:sast` | semgrep (SAST) |
| `pnpm run security:deps` | `pnpm audit --audit-level=high` |
| `pnpm run security:all` | gitleaks + semgrep |
| `node scripts/validate-harness.js --all` | Todos los gates de validación |
| `node scripts/sync-harness.mjs --src ../StreetMove/StreetMoveWebsite --dry-run` | Ver cambios del harness fuente sin tocar nada |
| `node scripts/sync-harness.mjs --src ../StreetMove/StreetMoveWebsite --apply` | Sincronizar COPY + reporte REVIEW desde el fuente |
| `pnpm run perf:all` | Lighthouse + PageSpeed (requiere URL configurada) |

## Estructura de rutas

| Ruta | Sección | Guard |
|------|---------|-------|
| `/` · `/login` · `/register` | Pública — `app/(public)` | ninguno |
| `/dashboard` | Privada — `app/(app)` | `validateUser` |
| `/admin` | Back-office — `app/admin` | `validateAdmin` (rol ADMIN + ACTIVE) |
| `/api/auth/*` | Endpoints de autenticación | — |
| `/api/user/*` | Endpoints del usuario autenticado | `guardUser` |
| `/api/admin/*` | Endpoints admin | `guardAdmin` + auditoría |
| `/api/health` | Health check | — |

## Autenticación

Flujo completo incluido en el skeleton:

1. **Registro** → `POST /api/auth/register` — crea usuario con estado `TEMPORARY`
2. **Verificación de email** → `POST /api/auth/verify-email` (código de 6 dígitos) — pasa a `ACTIVE`
3. **Login** → `POST /api/auth/signin` — JWT + cookie HTTP-only, sliding session de 15 min
4. **Logout** → `POST /api/auth/logout` — invalida solo la sesión activa
5. **Recuperación** → `forgot-password`, `verify-reset-code`, `reset-password`, `resend-code`
6. **Refresco** → `POST /api/auth/refresh-session`

### Estados de usuario

| Estado | Significado |
|--------|-------------|
| `TEMPORARY` | Registrado, email sin verificar |
| `ACTIVE` | Email verificado, puede operar |
| `LOCKED` | Bloqueado (5 intentos fallidos o admin) |

Principio: **nunca permitir LOCKED** en rutas privadas. TEMPORARY solo si se declara explícitamente.

### Guards

En `lib/auth/admin-guard.ts`:
- `validateUser()` — redirige a `/login` si no hay sesión (server component/layout)
- `validateAdmin()` — exige rol `ADMIN` + status `ACTIVE` (server component/layout)
- `guardUser(session)` — retorna `NextResponse` 401/403 (route handler)
- `guardAdmin(session)` — retorna `NextResponse` 401/403 (route handler)

El email es inmutable desde profile. Toda mutación sensible debe registrarse en `audit_logs` (ver `lib/audit/helpers.ts`).

## Modelo de datos

Tablas base en `lib/db/schema.ts`:

| Tabla | Propósito |
|-------|-----------|
| `users` | id, email, firstName, lastName, phone, passwordHash, status, role (USER/ADMIN), failedAttempts, emailVerifiedAt |
| `email_verifications` | Códigos OTP de 6 dígitos |
| `sessions` | Sesiones activas (token, expiresAt, lastActivityAt) |
| `audit_logs` | Auditoría de mutaciones sensibles |

### Agregar tablas del dominio

```bash
# 1. Editar lib/db/schema.ts (ej: agregar tabla 'products')
# 2. Generar migración
pnpm run db:generate
# 3. Aplicar
pnpm run db:migrate
# 4. Documentar queries en lib/db/queries/
```

Reglas de migraciones (ver `ARCHITECTURE.md`):
- Siempre usar `db:generate` tras modificar `schema.ts` — nunca crear SQL a mano.
- No editar `drizzle/meta/_journal.json` manualmente.
- Para custom SQL: `db:generate` → agregar SQL al archivo generado → re-ejecutar `db:generate`.

## Convenciones de tests (obligatorias)

| Tipo | Ubicación | Framework | Comando |
|------|-----------|-----------|---------|
| Unit | `tests/unit/*.test.ts` | Jest | `pnpm run test:unit` |
| API | `tests/api/*.spec.ts` | Playwright | `npx playwright test tests/api/` |
| API happy-path | `tests/api/*-happy.spec.ts` | Playwright | idem |
| E2E | `tests/e2e/` | Playwright | `pnpm run test:e2e` |

- Todo cambio de código debe incluir unit tests y API tests correspondientes.
- Todo endpoint nuevo debe tener **al menos 1 happy-path** que ejecute SQL real contra la DB, además de los tests de guard (401/403).
- Toda feature que modifique UI debe incluir **al menos 1 E2E** del flujo feliz navegable.
- Todo endpoint nuevo debe documentarse en `lib/api-docs/spec.ts`.

## Gates de validación

```bash
node scripts/validate-harness.js --all
```

Ejecuta: typecheck, lint, unit tests, API tests, E2E, build, secrets (gitleaks), SAST (semgrep), api integration, code review, audit deps, env vars. Resultado en `.validation/status.json`.

- Si `status = "fail"` → **no se puede iniciar ningún workflow** OpenCode hasta resolver.
- `/validate` (comando OpenCode) es la única forma de resetear el estado a `pass`.

## Agent Team OpenCode

El repo incluye un equipo de agentes para trabajar con OpenCode. La fuente de verdad es `AGENTS.md`.

| Comando | Descripción |
|---------|-------------|
| `/ship-feature <idea>` | Feature end-to-end: spec → diseño → implementación → QA → release |
| `/design <idea>` | UX/UI design: alternativas con tradeoffs + mockup navegable |
| `/fix-problems <alcance>` | Triage de errores del panel Problems con fix mínimo |
| `/fix-failing-test <test>` | Corrige un test roto con cambio mínimo |
| `/ponytail-review <path>` | Revisa código existente por sobreingeniería |
| `/validate` | Ejecuta los gates de validación completos |

Cada workflow genera sus artifacts en `production_artifacts/YYYY-MM-DD-short-slug/`.

**Agentes**: `@pm`, `@architect`, `@db-engineer`, `@auth-security`, `@app-engineer`, `@admin-engineer`, `@qa-release`, `@qa-fix`, `@architect-fix`, `@ponytail-reviewer`, `@ui-designer`, `@qa-validator`.

> Requiere los MCP servers configurados en `opencode.json` (engram, codebase-memory-mcp, headroom).

## Seguridad

- Todo endpoint **público** requiere rate limit (`lib/rate-limit.ts`) + Cache-Control + security headers.
- Todo endpoint **admin** requiere guard server-side (`guardAdmin`) + auditoría en mutaciones.
- `NEXTAUTH_SECRET` es **requerida en producción** (en dev hay fallback automático).
- Revisión de seguridad: `pnpm run security:all` (gitleaks + semgrep).
- Revisa contra OWASP Top 10 cada cambio que toque sesión, RBAC, reset o auditoría.

## Referencias

- `AGENTS.md` — roles de agentes, workflows, quality gates, iteration limits
- `ARCHITECTURE.md` — convenciones técnicas, migraciones, seguridad
- `QUICKSTART.md` — cómo partir un proyecto nuevo desde este skeleton
