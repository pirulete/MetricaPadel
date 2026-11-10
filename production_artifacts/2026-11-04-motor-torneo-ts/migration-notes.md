# Migration Notes — `0014_spooky_puppet_master`

> change_id: `2026-11-04-motor-torneo-ts` · chunk **F0a**
> generada por `pnpm run db:generate` (nunca SQL a mano)
> fecha: `2026-11-04`

---

## 1. Identificación

| Campo | Valor |
|---|---|
| Archivo | `drizzle/0014_spooky_puppet_master.sql` |
| Journal idx | `14` (`tag: 0014_spooky_puppet_master`, `when: 1793811047880`) |
| Anterior | `0013_spotty_felicia_hardy` (Agenda de clases v0.11) |
| Snapshot | `drizzle/meta/0014_snapshot.json` |
| Sentencias | 59 statements (`--> statement-breakpoint`) · 161 líneas |
| Contenido | 4 `CREATE TYPE` + 11 `CREATE TABLE` + 10 UNIQUE + 10 INDEX + 20 FK |

**Orden cronológico verificado**: `_journal.json` termina en `idx 14` y el `when`
(1793811047880) es mayor que el de `0013` (1793799161838). No se editó el journal
manualmente (solo lo escribió `drizzle-kit`).

**Custom SQL**: **no fue necesario**. `drizzle-kit` emitió el `WHERE` del índice parcial
correctamente:

```sql
CREATE UNIQUE INDEX "tournament_runs_active_uq" ON "tournament_runs"
  USING btree ("tournament_id") WHERE status in ('queued', 'running');
```

---

## 2. Ejecución local

```bash
# .env.local declara DATABASE_URL=localhost:5432, pero el contenedor de dev
# (padel-evaluation-db-5434) publica 5432→5434. Se migró el Postgres local en 5434.
DATABASE_URL="postgres://padel:***@localhost:5434/padel_evaluation" pnpm run db:migrate
```

Resultado:

```
[v0] ✓ Database connection successful
[v0] 14 migrations already tracked in __drizzle_migrations
[v0] Applying 0014_spooky_puppet_master (59 statements)...
[v0]   ✓ 0014_spooky_puppet_master applied cleanly
[v0] ✓ All critical tables verified
```

> Intento previo con el `DATABASE_URL` literal de `.env.local` (puerto 5432) falló en
> `SELECT 1`: ese puerto no está escuchando. **No** se usó `DATABASE_URL_PROD`.
> Acción sugerida (fuera de este chunk): alinear `.env.local` al puerto 5434 o mapear
> 5432:5432 en `docker-compose.dev.yml`.

---

## 3. Verificación post-migración (obligatoria, R-06)

Consultas a `information_schema` / `pg_indexes` contra la DB local ya migrada:

| Verificación | Resultado |
|---|---|
| Tablas `tournament%` | **11** ⇒ agenda_slots, blocks, categories, groups, matches, persons, runs, team_availability, team_members, teams, tournaments |
| Enums `tournament%` | **4** (`tournament_status`, `tournament_phase`, `tournament_run_status`, `tournament_match_round`) |
| Columnas de `tournament_runs` | `id, tournament_id, requested_by, status, params, engine_status, objective, mip_gap, time_ms, diagnostics, error, slots_count, dispatch_attempts, last_dispatch_at, created_at, started_at, finished_at` |
| `tournament_runs_active_uq` es **parcial** | ✅ `WHERE (status = ANY (ARRAY['queued'::tournament_run_status, 'running'::tournament_run_status]))` |
| Índices de `tournament_runs` | 4 (`active_uq` parcial, `pkey`, `tournament_created`, `tournament_status`) |
| DDL sobre tablas no-tournament | **0** (`grep` de `ALTER/DROP/CREATE` sin coincidencias fuera de `tournament_*`) |

Nota: el migrador puede reportar "exitoso" sin ejecutar el SQL (patrón conocido); por eso
la verificación se hizo por catálogo y no por el exit code.

---

## 4. Rollback

La migración es **100 % aditiva** (ningún objeto existente fue alterado), así que el
rollback es un `DROP` en orden inverso de dependencias:

```sql
-- 0014 rollback (solo si es imprescindible; destruye datos de torneos)
BEGIN;
DROP TABLE IF EXISTS "tournament_agenda_slots" CASCADE;
DROP TABLE IF EXISTS "tournament_runs" CASCADE;
DROP TABLE IF EXISTS "tournament_matches" CASCADE;
DROP TABLE IF EXISTS "tournament_team_availability" CASCADE;
DROP TABLE IF EXISTS "tournament_team_members" CASCADE;
DROP TABLE IF EXISTS "tournament_teams" CASCADE;
DROP TABLE IF EXISTS "tournament_persons" CASCADE;
DROP TABLE IF EXISTS "tournament_groups" CASCADE;
DROP TABLE IF EXISTS "tournament_categories" CASCADE;
DROP TABLE IF EXISTS "tournament_blocks" CASCADE;
DROP TABLE IF EXISTS "tournaments" CASCADE;
DROP TYPE IF EXISTS "tournament_match_round";
DROP TYPE IF EXISTS "tournament_run_status";
DROP TYPE IF EXISTS "tournament_phase";
DROP TYPE IF EXISTS "tournament_status";
DELETE FROM drizzle.__drizzle_migrations WHERE hash = (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1);
COMMIT;
```

Tras el rollback: restaurar `lib/db/schema.ts` (quitar la sección Torneos y las dos
entradas de `usersRelations`), borrar `drizzle/0014_*.sql` + `drizzle/meta/0014_snapshot.json`
y eliminar la entrada `idx 14` del journal **solo** vía `drizzle-kit` (regenerar).

`audit_logs` no se ve afectado (no hay FK entrantes hacia `tournament_*`).

---

## 5. Riesgos residuales

| Riesgo | Estado |
|---|---|
| R-05 (drizzle-kit no emite `WHERE`) | **descartado** — el índice salió parcial y se verificó en `pg_indexes` |
| R-06 (migración "exitosa" sin SQL) | **mitigado** — verificación por catálogo (§3) |
| Deploy a producción | pendiente: `pnpm run db:migrate` con el `DATABASE_URL` de prod (lo ejecuta el release, no este chunk) |

---

## 6. F0c — instance / runs / tests (sin migración)

> chunk **F0c** · `lib/db/queries/torneos/{instance,runs}.ts` + `tests/unit/db/tournament-queries.test.ts`
> **No toca `schema.ts` ni `drizzle/`** ⇒ no hay `db:generate` ni cambio de journal pendiente.

### 6.1 Archivos

| Archivo | Contenido | Anti-IDOR |
|---|---|---|
| `lib/db/queries/torneos/instance.ts` | `buildInstance(tournamentId, ownerId): Promise<Instancia \| null>` — 1 guard de ownership + 8 lecturas en paralelo (bloques, categorías, grupos, parejas, personas, miembros, disponibilidad, partidos) y mapeo determinista (`sortOrder`/`idx`/`code`, personas ordenadas por `documentId`). Ubicación aquí, no en `lib/motor-torneo/` (AC-05, §1.1) | `ownerId` ajeno o torneo inexistente ⇒ `null` |
| `lib/db/queries/torneos/runs.ts` | `createRun` (23505 ⇒ `run_active`), `claimRun` (UPDATE…`WHERE status='queued'` `RETURNING*`), `finishRun` (1 tx: terminal + métricas + batch slots + `tournaments.status='agenda_draft'` solo `succeeded`/`invalid`), `getRun` (+`includeSlots` con join a matches/categorías), `listRecentRuns`, `reapStaleRuns` + `decideReapAction` (puro) | `getRun({ ownerId })` valida el torneo vía `getTournamentById` ⇒ `null` = 404 |
| `tests/unit/db/tournament-queries.test.ts` | 30 tests: mapper DB→Instancia, transiciones, idempotencia de `claimRun`, `finishRun` (slots/agenda_draft/not_running), DTO `numeric → number`, clamp de límites, reaper (fresco, <2 intentos, ≥2, >300 s, running colgado, idempotencia) | — |

### 6.2 Máquina de estados implementada (`runs.ts`)

| Desde | Hacia | Función | Guarda |
|---|---|---|---|
| — | `queued` | `createRun` | UNIQUE parcial `tournament_runs_active_uq` ⇒ SQLSTATE **23505** ⇒ `run_active` (409). Otros errores se propagan |
| `queued` | `running` | `claimRun` | `WHERE id AND status='queued'`; 0 filas ⇒ `null` (409 `not_claimed`, reintento seguro) |
| `running` | `succeeded`\|`infeasible`\|`invalid`\|`failed` | `finishRun` | `WHERE id AND status='running'`; 0 filas ⇒ `not_running` (nunca slots huérfanos). Transición ilegal se rechaza antes de la tx |
| `queued` | `queued` | `reapStaleRuns` | `dispatchAttempts < 2` **y** edad > 90 s; incrementa `dispatchAttempts` + `lastDispatchAt` |
| `queued` | `failed(dispatch_failed)` | `reapStaleRuns` | `dispatchAttempts ≥ 2` **o** edad > 300 s |
| `running` | `failed(worker_crash)` | `reapStaleRuns` | `startedAt` (fallback `createdAt`) > `maxDuration 300 s + 60 s` |

El reaper es **perezoso** (sin cron) e idempotente: la selección usa el índice `tournament_runs_tournament_status_idx` y cada `UPDATE` vuelve a filtrar por el estado de origen. Devuelve `{ actions, redispatched, failed }`; el re-dispatch real lo hace `lib/torneos/dispatch.ts` (F3a) con los ids de `redispatched`.

### 6.3 Pendiente / notas

- **Import pendiente de F1a**: `instance.ts` importa `type { Instancia } from "@/lib/motor-torneo/types"` (path del contrato §3). Mientras F1a no exista, `npx tsc --noEmit` reporta **solo** `TS2307` en ese import; el resto del repo y el chunk typechean limpio. Los nombres de campo propuestos (`bloques`, `nCanchas`, `categorias`, `grupos`, `parejas`, `personas`, `partidos`; `Bloque` con `dayLabel`/`startTime`/`phase`/`isExtension`/`capacity` por P-5; `Pareja.bloqueados: Set<number>`) deben alinearse en F1a contra `types.ts` (el `tsc` acusará cualquier divergencia en cuanto exista el módulo; no se usó `as Instancia`).
- `lib/db/queries/torneos/index.ts` **no** se tocó (F0c está limitado a 3 archivos): falta añadir el re-export de `instance`/`runs`. Lo consume F2b; 1 línea, sin riesgo.
- `createRun`/`claimRun`/`finishRun` no validan ownership: lo hace el route handler con `getTournamentById` (§6.0) y el worker con `x-worker-secret` (§6.5). Documentado en el JSDoc de `runs.ts`.
- Verificación: `npx jest tests/unit/db/tournament-queries.test.ts` → **30/30 pass**; `npx jest tests/unit/db` → 19 suites / 253 tests pass; `npx eslint` de los 3 archivos → 0 errores (solo warnings `no-explicit-any` del mock, patrón del repo).

