# Change Map — Neon Preview Branch

- **change_id**: neon-preview-branch
- **date**: 2026-09-25
- **module**: infra
- **release**: v0.5

## Resumen

Aislamiento de ambiente de preview vía Neon database branching: branch fijo `preview`, connection string estable, script CLI para ensure/reset/cleanup, integración en `/supercommitpre`, env vars por scope en Vercel. Sin cambios en `lib/db/index.ts`, `drizzle.config.ts`, `scripts/migrate.ts` ni dependencias nuevas.

## Archivos nuevos

| Archivo | Est. líneas | Contenido |
|---------|-------------|-----------|
| `lib/neon/branching.ts` | ~180 | Client API Neon (fetch Node 22): `ensurePreviewBranch`, `resetPreviewBranch`, `listBranches`, `deleteBranch`, `cleanupStaleBranches`, `maskConnectionString`, `validateBranchName` |
| `scripts/neon-preview-branch.ts` | ~120 | CLI: flags `--ensure`/`--reset`/`--cleanup`/`--migrate`/`--dry-run`; lee `.env.local`; exit 0/1 |
| `tests/unit/neon-branching.test.ts` | ~150 | Unit tests con `fetch` mockeado: ensure (crea/reusa), mask (nunca expone password), validate, cleanup allowlist |

## Archivos modificados

| Archivo | Cambio | Est. líneas delta |
|---------|--------|-------------------|
| `.opencode/commands/supercommitpre.md` | Paso 2: `pnpm run db:migrate` local → `npx tsx scripts/neon-preview-branch.ts --ensure --migrate` con fallback a local si falta `NEON_API_KEY` | ~15 |
| `.env.example` | Documentar `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH` (default main), `NEON_PREVIEW_BRANCH` (default preview) | ~10 |
| `ARCHITECTURE.md` | Sección "Neon Preview Branch": estrategia env vars Vercel por scope, flujo supercommitpre, script | ~30 |
| `FEATURES.md` | Entry con metadata (status proposed, release v0.5, module infra, tags [infra, db, ci-cd, env, vercel, neon]) | ~25 |

## Archivos explícitamente SIN cambio (justificación)

| Archivo | Por qué NO cambia |
|---------|-------------------|
| `lib/db/index.ts` | Lee `DATABASE_URL` en runtime; `pg` funciona con Neon (TCP). D1 |
| `drizzle.config.ts` | `db:generate` corre contra DB local (`.env.local`); el diff de schema no depende del ambiente |
| `scripts/migrate.ts` | Usa `process.env.DATABASE_URL`; para migrar preview se inyecta la URL del branch vía env |
| `package.json` | Sin dependencias nuevas (fetch global Node 22, dotenv ya existe) |
| `vercel.json` | No existe; auto-detection de Vercel cubre el caso |

## Configuración manual (no código)

1. Neon Console: branch `preview` desde `main` (o `--ensure`).
2. Vercel Dashboard → Settings → Environment Variables:
   - `DATABASE_URL` Production = main branch
   - `DATABASE_URL` Preview = preview branch
3. `.env.local`: `NEON_API_KEY` (scoped, rol operator), `NEON_PROJECT_ID`.

## Impacto por capa

| Capa | Impacto |
|------|---------|
| Auth | Ninguno |
| Dashboard | Ninguno |
| Admin | Ninguno |
| Sitio público | Ninguno |
| DB | Branch Neon `preview` (fuera del schema Drizzle; sin migración nueva) |
| API | Ningún endpoint nuevo → `lib/api-docs/spec.ts` NO aplica |
| Tests | Unit: `tests/unit/neon-branching.test.ts`. No aplican API/E2E/happy-path |
| Env vars | `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH`, `NEON_PREVIEW_BRANCH` (documentadas en `.env.example`) |
| Docs | `ARCHITECTURE.md`, `FEATURES.md` |

## Orden de ejecución

1. @app-engineer (o @db-engineer): `lib/neon/branching.ts` + `scripts/neon-preview-branch.ts` + unit tests.
2. @architect: `.env.example`, `supercommitpre.md`, `ARCHITECTURE.md`, `FEATURES.md`.
3. Configuración manual Vercel/Neon (usuario).
4. @qa-release: `validate-harness.js --typecheck --lint --tests --build` + smoke del CLI (`--dry-run`).

## Retrocompatibilidad

- `DATABASE_URL` sigue siendo la única variable de conexión; los ambientes solo cambian su valor por scope.
- `scripts/migrate.ts` y `lib/db/index.ts` intactos → cero riesgo de regresión en runtime.
- supercommitpre conserva fallback: si `NEON_API_KEY` no está definida, ejecuta `db:migrate` local como hoy.