# Technical Design — Neon Preview Branch (Ambient Isolation)

- **status**: proposed
- **release**: v0.5
- **date**: 2026-09-25
- **change_id**: neon-preview-branch
- **module**: infra
- **tags**: [infra, db, ci-cd, env, vercel, neon]

## 1. Problema

Hoy `DATABASE_URL` apunta a una sola base Neon (main) en todos los ambientes. Los preview deploys de Vercel comparten la DB de producción: cualquier migración o dato de prueba generado por un preview contamina producción. No existe aislamiento de ambiente ni forma de probar migraciones contra un branch limpio antes de mergear a main.

## 2. Objetivo

1. Crear un branch `preview` en Neon (aislamiento de datos).
2. `/supercommitpre` asegura que el branch `preview` exista y aplica migraciones pendientes.
3. Vercel Preview deploy usa automáticamente la DB del branch `preview` (sin tocar código de la app).

## 3. Decisiones de diseño

### D1 — `pg` es suficiente; NO agregar `@neondatabase/serverless`

Neon soporta conexiones TCP estándar de `pg`. El proyecto ya usa `pg` + `drizzle-orm/node-postgres` y funciona en producción contra Neon. `@neondatabase/serverless` solo aporta valor en edge/serverless runtimes con conexiones HTTP — no es nuestro caso (Next.js Node runtime). Agregarlo sería churn sin beneficio.

**Impacto en `lib/db/index.ts`: NINGUNO.** El pool lee `process.env.DATABASE_URL` en runtime; cada ambiente (prod/preview/dev) inyecta su propia URL. No hay cambio de código.

### D2 — Branch fijo `preview` con connection string estable (no reset destructivo por defecto)

Estrategia: **un solo branch llamado `preview` creado una vez desde `main`**. El connection string del branch es estable mientras el branch exista (el endpoint `ep-*` no cambia). Esto permite:

- Configurar `DATABASE_URL` de Vercel Preview **una sola vez** en el dashboard (sin API de Vercel, sin churn de connection strings).
- `/supercommitpre` solo hace `ensure` (crear si falta) + `db:migrate` contra el branch.

**Reset opcional**: Neon API expone `POST /projects/{id}/branches/{branch_id}/restore` (Reset from parent) que restaura el branch al head del parent **sin cambiar el endpoint host** → el connection string sigue estable. Se ofrece como flag `--reset` para limpiar datos de preview cuando se necesite, no por defecto.

Alternativa descartada: recrear el branch (delete + create) en cada push. Cambia el endpoint host → connection string nuevo → requiere actualizar env vars de Vercel vía API/CLI (`vercel env add`) → complejidad y token extra. YAGNI.

### D3 — Migraciones: supercommitpre migra preview; el build de Vercel también migra (idempotente)

- `/supercommitpre` (paso 2) ejecuta `ensure` + `db:migrate` contra el branch preview.
- El build script (`next build && pnpm run db:migrate`) sigue igual: en Vercel Preview corre contra la DB preview (por env var), en Production contra main. Drizzle migrator es idempotente (tabla `drizzle.__drizzle_migrations`), así que la doble ejecución es segura.
- **Orden crítico**: supercommitpre debe asegurar el branch ANTES del push, para que el primer preview deploy no falle por branch inexistente.

### D4 — Script CLI `scripts/neon-preview-branch.ts` + lógica pura en `lib/neon/branching.ts`

- `lib/neon/branching.ts`: funciones puras testables (client API con `fetch` global de Node 22, sin dependencias nuevas): `ensurePreviewBranch`, `resetPreviewBranch`, `listBranches`, `deleteBranch`, `cleanupStaleBranches`, `maskConnectionString`, `validateBranchName`.
- `scripts/neon-preview-branch.ts`: wrapper CLI con flags `--ensure` (default), `--reset`, `--cleanup`, `--migrate`, `--dry-run`. Lee `.env.local` vía `dotenv` (ya es dependencia). Imprime solo la URL enmascarada, nunca el password.
- Se ejecuta con `npx tsx` (patrón existente de `scripts/migrate.ts`).

### D5 — Env vars

| Variable | Dónde | Valor |
|----------|-------|-------|
| `DATABASE_URL` | Vercel Production | Neon main branch |
| `DATABASE_URL` | Vercel Preview | Neon preview branch (estable) |
| `DATABASE_URL` | Local (`.env.local`) | Docker localhost (sin cambio) |
| `NEON_API_KEY` | `.env.local` (local, nunca commitear) | API key scoped al proyecto (rol operator/admin) |
| `NEON_PROJECT_ID` | `.env.local` | ID del proyecto Neon (Settings → Project ID) |
| `NEON_PARENT_BRANCH` | `.env.local` (default `main`) | Branch padre del preview |
| `NEON_PREVIEW_BRANCH` | `.env.local` (default `preview`) | Nombre del branch de preview |

`NEON_API_KEY`/`NEON_PROJECT_ID` NO van a Vercel: el branching corre localmente en supercommitpre. Vercel solo necesita `DATABASE_URL` por scope.

### D6 — Seguridad

- `NEON_API_KEY` es secreto: vive en `.env.local`, nunca en git (gitleaks lo detectaría). Crear key **scoped al proyecto** con rol `operator` (create/reset branches) — no owner global.
- El connection string del branch preview es una credencial full-access a datos de preview: tratarlo como secreto; solo en Vercel Preview env vars y `.env.local`.
- El script **nunca imprime** el connection string completo: `maskConnectionString()` muestra `postgresql://***@ep-xxx.../neondb`.
- Branch viejo: `--cleanup` borra branches que no estén en allowlist (`main`, `preview`) con más de N días (default 14). El branch preview nunca queda "viejo" porque `--ensure` + `db:migrate` lo mantienen al día; `--reset` lo limpia bajo demanda.
- Límites Neon: plan free = 10 branches/proyecto. Usamos 1 (`preview`). `--cleanup` previene acumulación.

## 4. Contratos

No hay endpoints HTTP nuevos → **no aplica `lib/api-docs/spec.ts`**. El "contrato" es el CLI:

```
npx tsx scripts/neon-preview-branch.ts [--ensure|--reset|--cleanup] [--migrate] [--dry-run]
```

Exit codes: `0` OK, `1` error (API key faltante, API error, migración fallida). `--dry-run` no muta nada.

## 5. Archivos a tocar

| Archivo | Cambio | Tamaño est. |
|---------|--------|-------------|
| `lib/neon/branching.ts` | **NUEVO** — client API Neon + helpers puros | ~180 |
| `scripts/neon-preview-branch.ts` | **NUEVO** — CLI wrapper | ~120 |
| `tests/unit/neon-branching.test.ts` | **NUEVO** — unit tests (mock fetch) | ~150 |
| `.opencode/commands/supercommitpre.md` | Paso 2: reemplazar `db:migrate` local por `neon-preview-branch --ensure --migrate` (fallback a local si no hay NEON_API_KEY) | ~15 |
| `.env.example` | Documentar `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH`, `NEON_PREVIEW_BRANCH` | ~10 |
| `ARCHITECTURE.md` | Nueva sección "Neon Preview Branch" (estrategia env vars + script) | ~30 |
| `FEATURES.md` | Entry del cambio | ~25 |

**Sin cambios**: `lib/db/index.ts`, `drizzle.config.ts`, `scripts/migrate.ts`, `package.json` (sin dependencias nuevas), `vercel.json` (no existe, no se crea).

## 6. Configuración manual en Vercel (una vez)

1. Neon Console → crear branch `preview` desde `main` (o dejar que el script lo cree con `--ensure`).
2. Copiar connection string del branch preview.
3. Vercel Dashboard → Project → Settings → Environment Variables:
   - `DATABASE_URL` → Environments: **Production** = main branch
   - `DATABASE_URL` → Environments: **Preview** = preview branch
   - (opcional) `DATABASE_URL` → Environments: **Development** = local Docker
4. `.env.local`: agregar `NEON_API_KEY`, `NEON_PROJECT_ID`.

## 7. Flujo resultante

```
/supercommitpre
  1. sync con main
  2. npx tsx scripts/neon-preview-branch.ts --ensure --migrate   ← asegura branch preview + migra
  3. run_common (stage, drizzle, evidence, version, commit, push)
  4. push → Vercel Preview deploy → build corre db:migrate contra DB preview (idempotente)
```

## 8. Tests requeridos

| Tipo | Archivo | Cubre |
|------|---------|-------|
| Unit (Jest) | `tests/unit/neon-branching.test.ts` | `ensurePreviewBranch` (crea si falta / reusa si existe), `maskConnectionString` (nunca expone password), `validateBranchName`, `cleanupStaleBranches` (allowlist), parse de respuestas API (mock `fetch`) |

No aplican API tests (no hay endpoint HTTP), ni E2E (no hay UI), ni happy-path SQL (no toca queries de negocio). El gate `--coverage` no aplica a módulos nuevos de scripts/lib sin baseline previo; se documenta como riesgo aceptado si el harness lo exige.

## 9. Rollout

1. Implementar `lib/neon/branching.ts` + `scripts/neon-preview-branch.ts` + unit tests.
2. Actualizar `.env.example`, `supercommitpre.md`, `ARCHITECTURE.md`, `FEATURES.md`.
3. Configuración manual Vercel + Neon (sección 6).
4. Ejecutar `node scripts/validate-harness.js --typecheck --lint --tests --build`.
5. Commit a rama-preview vía `/supercommitpre` (que ya ejercita el nuevo paso 2).

## 10. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Preview deploy falla si branch no existe (push directo sin supercommitpre) | Documentar que supercommitpre es el único path de push; `--ensure` en el paso 2 |
| Doble migración (supercommitpre + build Vercel) | Drizzle migrator idempotente |
| API key con permisos excesivos | Key scoped al proyecto, rol operator |
| Límite de branches free (10) | 1 branch en uso + `--cleanup` |