# Technical Design — Módulo Torneos: motor de agenda en TypeScript (M1)

> change_id: `2026-11-04-motor-torneo-ts`
> status: `in-progress`
> release: `v0.12`
> date: `2026-11-04`
> module: `torneos`
> tags: `[db, api, ui, migration, optimizer, worker]`
> autor: @architect · baseline: `feature-spec.md` + `release-scope.md` + lectura completa de `motor_torneo/` (1372 líneas)
> migración: **`0014_*`** (la `0013_spotty_felicia_hardy.sql` está tomada por Agenda v0.11)

---

## 0. Decisiones cerradas que este diseño NO re-abre

| # | Decisión | Fuente |
|---|---|---|
| D1 | Port TS en `lib/motor-torneo/` sobre el paquete npm `highs` (HiGHS WASM) | usuario / Engram #1711 |
| D2 | Módulo de DB independiente, tablas propias, **sin FK a `courses`/`academies`** | usuario |
| D3 | M1 = cargador real + agenda borrador + UI mínima | usuario |
| D4 | Vercel background function: `timeLimit` clamp `[30s, 240s]`, `maxDuration = 300`, plan B contenedor | usuario |

## 1. Cierre de las preguntas abiertas de @pm (Q1–Q3)

| # | Decisión del @architect |
|---|---|
| **Q1** | **Import del JSON canónico §6** (`POST /api/torneos`), persistencia normalizada transaccional. **No hay CRUD de parejas en M1.** El coach puede exportar el JSON de vuelta (`GET .../instancia`) para corregir y re-importar como torneo nuevo. |
| **Q2** | `bracket.ts` es port determinista de `_construir_cuadro` y los partidos se **materializan** en `tournament_matches` dentro de la transacción de import. Consecuencia dura: el orden de grupos debe ser reproducible ⇒ se materializa `sort_order` en `tournament_categories` y `tournament_groups` (ver §4.2, nota P-3). |
| **Q3** | Rutas bajo `/api/torneos` (español, consistente con `/api/cursos`, `/api/transiciones`). Tablas con prefijo `tournament_`. Worker fuera del namespace público: `/api/internal/tournament-worker`. |

### 1.1 Desviación explícita respecto de `feature-spec.md` §4.4 (resuelve una contradicción del spec)

El spec pide `lib/motor-torneo/instancia.ts` con `buildInstance(tournamentId)` **que lee DB**, pero AC-05 prohíbe que `lib/motor-torneo/**` importe `lib/db`. Ambas cosas no pueden ser ciertas. Resolución:

- `buildInstance(tournamentId)` vive en **`lib/db/queries/torneos/instance.ts`** (server glue, importa schema).
- `lib/motor-torneo/` queda **100 % puro**: recibe `Instancia` ya construida.
- El nombre del archivo del spec no se usa; se documenta aquí y en `change-map.md`.

### 1.2 Otras desviaciones documentadas

| # | Spec decía | Diseño | Motivo |
|---|---|---|---|
| DV-1 | §3 "10 tablas" | **11 tablas** (la tabla de §3 enumera 11 filas) | miscount del spec; AC-01 no fija número |
| DV-2 | enum de rondas `grupo\|8vos\|4tos\|semi\|final` | + `16vos` | `_construir_cuadro` genera `16vos` si una categoría tiene `g > 8` (S=32). Sin esto el import falla con una categoría grande (EC-14) |
| DV-3 | §7 "`lib/audit/helpers.ts`: eventos de torneo" | **no se modifica**: se usan `auditCreate`/`auditUpdate` genéricos con `entityName = 'tournament' \| 'tournament_run'` | ya existe el helper genérico; agregar wrappers específicos es sobreingeniería (ver §11) |
| DV-4 | §4.7 "Worker… invocación server-to-server" | + `dispatchAttempts`/`lastDispatchAt` + **re-dispatch perezoso** | `void fetch()` desde una lambda serverless no es confiable; ver §6.4 |

---

## 2. Impacto por capa

| Capa | Impacto | Detalle |
|---|---|---|
| **auth** | **Nulo** | no se toca `auth.ts`, ni callbacks, ni JWT, ni roles. Se reutiliza `guardAdmin` (ADMIN/SUPER_ADMIN + ACTIVE). El worker usa secreto compartido, no sesión. |
| **DB** | **Alto, aditivo** | 11 tablas nuevas + 4 enums + índices. 1 FK entrante nueva a `users` (`tournaments.ownerId`, `no action`). Cero cambios a tablas existentes. |
| **API** | **Alto, aditivo** | 7 route handlers nuevos en namespaces nuevos. Cero cambios de contrato existente ⇒ retrocompatibilidad trivial. |
| **UI** | **Medio** | 2 páginas en `app/(app)/torneos` + 4 componentes + 1 hook. Sin cambios en `bottom-nav` más allá de 1 entrada. |
| **lib** | **Muy alto** | 13 archivos puros nuevos + 7 de glue. |
| **tests** | **Alto** | 11 unit + 3 API + 1 E2E + fixtures golden. |
| **infra** | **Medio** | 1 dependencia npm (`highs`), `maxDuration=300` en 1 route, 3 env vars. |
| **dominio existente** | **Cero** | AC-13: `courses`, `class_blocks`, `evaluations`, `rubrics`, academias y notificaciones intactos. |

Declaración de ruta: **privada**. `ADMIN|SUPER_ADMIN` + `ACTIVE`. `USER`/`TEMPORARY` → 403. `LOCKED` nunca. **No hay ruta para `USER` en M1** (no hay publicación ⇒ no hay vista de alumno).

---

## 3. `lib/motor-torneo/` — estructura y contrato de cada archivo

Regla de oro (verificada por test estático `purity.test.ts`):
`lib/motor-torneo/**` **no** importa `lib/db`, `next/*`, `server-only`, `@/auth`, `react`, ni `node:fs`. Solo `highs` en `solver.ts`, y `zod` en `loader.ts`. Todo el módulo es **determinista y Jest-testeable**.

| Archivo | Líneas est. | Puerto desde | Contrato público |
|---|---|---|---|
| `types.ts` | 190 | `instancia.py` (dataclasses) | `Bloque`, `Categoria`, `Grupo`, `Pareja`, `Persona`, `Partido`, `CalendarioTramo`, `Instancia`, `TournamentParams`, `MilpModel`, `SolveResult`, `EngineStatus`, `VerificationError`, `Diagnosis`. Sin lógica. |
| `calendar.ts` | 100 | `construir_bloques` (`instancia.py:37`) | `buildBlocks(tramos, courts, capacityOverrides): Bloque[]`. Arita `idx` 0..N-1, `startTime` = `inicio + 75·k` en formato `HH:mm`. Valida: `capacity ≤ courts`, `capacity ≥ 0`, tramos del mismo día sin solape (EC-09). `assertNoOverlap()`. |
| `bracket.ts` | 210 | `_partidos_grupo` (`:128`) + `_construir_cuadro` (`:138`) | `groupPairings(size): Array<[i,j]>` (3→todos contra todos; 4→ciclo A-B,B-C,C-D,D-A). `buildBracket(catCode, groupCodes): CuadroMatch[]` con `code`, `round`, `sourceGroups`, `feeders`, `byes`. `deriveStructure(categorias, grupos, parejas): Partido[]` (previa + final). Determinista: itera `sortOrder`, nunca `Object.keys`. |
| `loader.ts` | 270 | reemplaza a `instancia.py` (D6) | `parseExchangeJson(raw): ExchangeJson` (Zod). `loadInstancia(json): { ok: true, instancia } \| { ok: false, errors: LoaderError[] }` con `path` (`parejas[p101].no_disponible[2]`). Aplica las **4 reglas** + invariantes R0 (§5). No importa DB. Reutiliza `calendar.ts` + `bracket.ts`. |
| `synthetic.ts` | 210 | `generar` (`instancia.py:218`) — **solo tests/fixtures** | `generateSynthetic({ seed, courts, structure }): ExchangeJson` con PRNG propio `mulberry32` (no reproduce `random.Random`). Cabecera `@test-only`: un test verifica que ni `app/` ni el worker lo importan. Existe para property tests y para generar el JSON de casos borde sin dataset real. |
| `model.ts` | 320 | `Modelo._construir` (`modelo.py:72`) — R1/R2/R3/R3b/R5 | `buildModel(inst, params): MilpModel`. Expone `vars`, `lb/ub/integrality`, `cost[]`, tripletas `(row, col, val)`, `rowLo/rowHi`, `colNames/rowNames`, y `stats: { nVars, nConstraints, nNonZeros }`. Incluye `toCSC()` (0-based) para HiGHS. |
| `objective.ts` | 190 | `modelo.py:212-279` | `addObjectiveTerms(builder, inst, params)` → días por pareja, compacidad de grupo (`mx/mn`), bloques seguidos (`e`), finales tempranas (`f`). Separado de `model.ts` solo por tamaño (400 líneas). |
| `solver.ts` | 120 | `Modelo.resolver` (`modelo.py:285`) + `scipy.optimize.milp` | `solveMilp(model, opts): Promise<SolveResult>`. **Único archivo que importa `highs`.** Mapea `time_limit`/`mip_rel_gap`, clampa `timeLimitMs` a `[30_000, min(240_000, TOURNAMENT_MAX_TIME_LIMIT_MS)]`, normaliza `status → EngineStatus` (`optimal \| feasible_time_limit \| infeasible \| unbounded \| error`) y devuelve `assignment: Record<matchId, blockIdx>`. |
| `courts.ts` | 95 | `asignar_canchas` (`modelo.py:315`) | `assignCourts(inst, assignment): Record<matchId, court>`. Voraz: previa repite cancha del bloque-1; final hereda cancha de un alimentador. |
| `verify.ts` | 150 | `verificar` (`verificar.py`) | `verify(inst, assignment, courts, params): VerificationError[]` con `code: 'missing' \| 'capacity' \| 'court_collision' \| 'court_range' \| 'person_overlap' \| 'availability' \| 'precedence' \| 'phase'`. **No importa `model.ts` ni `objective.ts`** (test estático lo garantiza). |
| `diagnostics.ts` | 240 | `semaforo` (`correr.py:23`) + `resumen_calidad` (`correr.py:99`) | `computeSemaforo(inst): Semaforo` (verde <0.85 / amarillo 0.85–1.0 / rojo >1.0, ρ por fase excluyendo extensión; fase sin casillas → `rojo` explícito, sin división por cero). `computeDiagnosis(inst, assignment, courts, solve, errors, params): Diagnosis` con los 6 indicadores estructurados. |
| `engine.ts` | 130 | `correr.py:main` | `runEngine(inst, opts): Promise<EngineResult>` = `buildModel` → `solveMilp` → `assignCourts` → `verify` → `computeDiagnosis`. Devuelve `{ ok, engineStatus, assignment, courts, diagnosis, violations }`. `ok=false` si `infeasible` o si `verify()` no está vacío. |
| `index.ts` | 25 | — | Barrel: solo re-exporta `engine`, `loader`, `types`, `verify`, `diagnostics`, `calendar`, `bracket`. **No** exporta `synthetic`. |

### 3.1 Detalles de fidelidad que el port NO puede perder

- **P-1 · R5 acumulada**: `sum_{b≤t} x[m,b] ≤ sum_{b≤t-sep} x[f,b]` con `sep = 1 + descansoFinal` y el `break` cuando `t - sep >= max_f`. El `break` cambia `nConstraints`; replicarlo es requisito del test de paridad L3.
- **P-2 · R3 por pareja en previa**: no se agrega R3 por *persona* en previa, sino por *pareja* (`partidos_pareja`), salvo dobles (camino potencial). Un port "más correcto" rompe la paridad de tamaño del modelo.
- **P-3 · Orden determinista**: Python depende del orden de inserción de `dict`. En TS **todo** `Object.keys` de dominio se prohíbe; se ordena por `sortOrder` (categorías, grupos) y `code` (parejas, partidos). Sin esto el cuadro y los `code` (`2da-8vos-3`) divergen.
- **P-4 · `doble_dura_en`** sigue siendo una lista de rondas; el modo relajado (BR-04) **no** se porta en M1 (`disponibilidad_dura` siempre `true`), pero el parámetro se conserva en `TournamentParams` para no bloquear M3.
- **P-5 · Nada de `Date`**: bloques son `dayLabel` + `startTime` strings (EC-17). Un test busca `new Date(` en el módulo.

---

## 4. Modelo de datos (Drizzle) — migración `0014_*`

### 4.1 Enums (4)

| Enum | Valores |
|---|---|
| `tournament_status` | `draft`, `agenda_draft`, `archived` |
| `tournament_phase` | `previa`, `final` |
| `tournament_run_status` | `queued`, `running`, `succeeded`, `infeasible`, `failed`, `invalid` |
| `tournament_match_round` | `grupo`, `16vos`, `8vos`, `4tos`, `semi`, `final` |

`engineStatus` se guarda como `varchar(32)` (no enum) para no acoplar la DB a la nomenclatura del solver (`optimal | feasible_time_limit | infeasible | unbounded | error`).

### 4.2 Tablas (11)

| Tabla | Columnas núcleo | Constraints / índices |
|---|---|---|
| `tournaments` | `id` uuid PK, `ownerId` uuid → `users.id` **no action**, `name` varchar(200), `startDate` date, `endDate` date, `status` enum default `draft`, `blockMinutes` int default 75, `courts` int default 8, `params` jsonb default `{}`, `createdAt`, `updatedAt` | `idx (ownerId, updatedAt)` → cursor G15; `idx (ownerId, status)` |
| `tournament_blocks` | `tournamentId` → cascade, `idx` int, `dayLabel` varchar(3), `startTime` varchar(5), `phase` enum, `isExtension` bool default false, `capacity` int | **UNIQUE (tournamentId, idx)** |
| `tournament_categories` | `tournamentId` → cascade, `code` varchar(10), `sex` varchar(1), `level` int, **`sortOrder` int** | **UNIQUE (tournamentId, code)**; `idx (tournamentId, sortOrder)` |
| `tournament_groups` | `tournamentId` → cascade, `categoryId` → cascade, `code` varchar(10), `size` int, **`sortOrder` int** | **UNIQUE (categoryId, code)**; `idx (tournamentId)` |
| `tournament_persons` | `tournamentId` → cascade, `documentId` varchar(50), `sex` varchar(1) null, `displayName` varchar(200) null | **UNIQUE (tournamentId, documentId)** |
| `tournament_teams` | `tournamentId` → cascade, `categoryId` → cascade, `groupId` → cascade, `code` varchar(20), `sortOrder` int | **UNIQUE (tournamentId, code)**; `idx (groupId)`, `idx (tournamentId)` |
| `tournament_team_members` | `teamId` → cascade, `personId` → cascade | **UNIQUE (teamId, personId)**; `idx (personId)` ← lookup doble categoría |
| `tournament_team_availability` | `teamId` → cascade, `blockIdx` int | **UNIQUE (teamId, blockIdx)** |
| `tournament_matches` | `tournamentId` → cascade, `categoryId` → cascade, `phase` enum, `round` enum, `groupId` uuid null, `teamAId`/`teamBId` uuid null, `sourceGroups` jsonb default `[]`, `feeders` jsonb default `[]`, `code` varchar(60) | **UNIQUE (tournamentId, code)**; `idx (tournamentId, phase)`, `idx (categoryId)` |
| `tournament_runs` | `tournamentId` → cascade, `requestedBy` → `users.id` no action, `status` enum default `queued`, `params` jsonb, `engineStatus` varchar(32), `objective` numeric, `mipGap` numeric, `timeMs` int, `diagnostics` jsonb, `error` jsonb, `slotsCount` int, `dispatchAttempts` int default 0, `lastDispatchAt`, `createdAt`, `startedAt`, `finishedAt` | **UNIQUE parcial `tournament_runs_active_uq (tournamentId) WHERE status IN ('queued','running')`** ← garantía DB del 409; `idx (tournamentId, createdAt)` |
| `tournament_agenda_slots` | `runId` → cascade, `matchId` → cascade, `blockIdx` int, `court` int | **UNIQUE (runId, matchId)**, **UNIQUE (runId, blockIdx, court)**, `idx (runId, blockIdx)` |

Notas de implementación:
- El índice UNIQUE parcial se declara con `uniqueIndex(...).on(...).where(sql\`status in ('queued','running')\`)`. Si `drizzle-kit` no emite el `WHERE` (comportamiento esperado en `0.31.x`), el SQL custom se agrega al archivo generado y se re-ejecuta `db:generate` (convención `ARCHITECTURE.md > Convenciones de Migraciones`). **Verificar con `\d tournament_runs` que el índice salió parcial**; sin él, EC-11 depende solo de lógica de aplicación.
- `sourceGroups`/`feeders` guardan **códigos** (`["3ra-G1"]`, `["3ra-8vos-1"]`), no UUIDs ⇒ legibles en SQL y desacoplados de la identidad de fila.
- `params` del torneo: `{ fronteraSabado, descansoFinal, maxSeguidos, bloqueFinalObjetivo, dobleDuraEn, W_* }`. `params` del run: snapshot completo + `timeLimitMs` + `mipRelGap` ⇒ un run es reproducible sin leer el torneo.

### 4.3 Lifecycle del torneo

```
draft ──(1er run terminal succeeded|invalid)──▶ agenda_draft ──(archive)──▶ archived
  │                                                   │
  └────────────────(archive)──────────────────────────┘
```
- `draft`: importado, sin agenda válida. `POST .../agenda` permitido.
- `agenda_draft`: existe al menos un run `succeeded`/`invalid`. `POST .../agenda` permitido (regenera ⇒ nueva corrida, no muta la anterior).
- `archived`: solo lectura. `POST .../agenda` → **409** (EC-13). Instancia y slots históricos consultables.
- Re-import sobre torneo con runs → **409** (EC-10). No hay DELETE de torneo en M1.

### 4.4 Lifecycle del job (`tournament_runs`) + reaper

```
queued ──claim──▶ running ──┬──▶ succeeded        (verify() === [])
   │                        ├──▶ invalid          (verify() !== [] ⇒ slots SÍ se guardan, EC-04)
   │                        ├──▶ infeasible       (0 slots, EC-02)
   │                        └──▶ failed           (error.code, 0 slots, EC-12/EC-15)
   ├──(re-dispatch ≤2)──▶ queued
   └──(reaper)──────────▶ failed (code=dispatch_failed)
```

Transiciones permitidas (validación en `runs.ts`, no triggers):

| Desde | Hacia | Actor | Regla |
|---|---|---|---|
| — | `queued` | `POST .../agenda` | falla si ya hay `queued`/`running` (índice parcial ⇒ 23505 ⇒ 409) |
| `queued` | `running` | worker | `UPDATE ... WHERE id=$1 AND status='queued' RETURNING *` (claim atómico, idempotente) |
| `queued` | `queued` | re-dispatch | `dispatchAttempts < 2` y `createdAt < now - 90s` y sin `startedAt` |
| `queued` | `failed` | reaper | `dispatchAttempts ≥ 2` o `createdAt < now - 300s` ⇒ `error.code='dispatch_failed'` |
| `running` | `succeeded\|infeasible\|invalid\|failed` | worker | escritura final |
| `running` | `failed` | reaper | `startedAt < now - (maxDurationMs + 60s)` ⇒ `error.code='worker_crash'` |

**Reaper = perezoso**, no cron (M1 no agrega cron, coherente con v0.11). Se ejecuta dentro de `GET /api/torneos/[id]` y `GET .../runs/[runId]`, con guarda barata: solo consulta runs activos del torneo (`idx (tournamentId, status)`) y solo escribe si alguno está vencido. Idempotente. Es el mecanismo que garantiza AC-09 (nunca `running` eterno).

---

## 5. Cargador (`loader.ts`) — reglas y códigos

Además de las 4 reglas del spec:

| # | Regla | Error | HTTP |
|---|---|---|---|
| R1 | cada pareja en exactamente 1 grupo, de 1 sola categoría | `duplicate_team` / `orphan_team` / `team_in_two_categories` | 400 (EC-08) |
| R2 | persona en >1 pareja solo si son de categorías distintas | `person_two_teams_same_category` | 400 (EC-07) |
| R3 | `no_disponible` ⊆ bloques de previa, índices existentes | `availability_invalid_block` | 400 (EC-06) |
| R4 | ≤ 8 bloques bloqueados por pareja | `availability_too_many` (lista de parejas) | 400 (EC-05) |
| R0 | **pre-check de viabilidad**: cada partido de previa tiene ≥ 1 bloque de previa permitido para ambas parejas | `match_without_allowed_block` | **422** |
| R5 | tamaño de grupo ∈ {3,4}, grupo no vacío | `group_invalid_size` | 400 (EC-08) |
| R6 | límite de tamaño (EC-14): `partidos ≤ 600` y `partidos × bloques ≤ 120_000` | `instance_too_large` | 422 |

`LoaderError = { code, path, message }`. Todos los errores se acumulan (no se corta en el primero) ⇒ la UI puede listar los 5 campos culpables de una vez.

---

## 6. Contratos API (contract-first)

Convenciones heredadas: `auth()` + guard → Zod → query → `NextResponse.json`; errores `{ error: string, code?: string, details?: ... }`; `runtime = 'nodejs'`.

### 6.0 Guards y anti-IDOR

| Ruta | Guard | Estados | IDOR |
|---|---|---|---|
| `GET/POST /api/torneos` | `guardAdmin` | ACTIVE, ADMIN\|SUPER_ADMIN | lista filtrada por `ownerId` |
| `GET/PUT-ish /api/torneos/[id]` | `guardAdmin` | ídem | query con `id AND ownerId` ⇒ ajeno = **404** |
| `GET /api/torneos/[id]/instancia` | `guardAdmin` | ídem | 404 |
| `POST /api/torneos/[id]/agenda` | `guardAdmin` + rate limit | ídem | 404 |
| `GET /api/torneos/[id]/runs/[runId]` | `guardAdmin` | ídem | 404 si el run no pertenece al torneo del owner |
| `POST /api/torneos/[id]/archive` | `guardAdmin` | ídem | 404 |
| `POST /api/internal/tournament-worker` | **`x-worker-secret`** | n/a (sin sesión) | no aplica: no devuelve datos del torneo, solo su propio `runId` |

`guardAdmin` ya es async-friendly y devuelve `NextResponse|null`. **No se crea guard nuevo.**

### 6.1 `POST /api/torneos` — import (201 / 400 / 409 / 422)

Request (`torneoImportSchema`, `lib/validations/torneos.ts`):
```ts
{
  meta: { name: string(1..200), startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', courts: int 1..24, blockMinutes?: int 30..120 },
  calendario: Array<{ dia: 'Jue'|'Vie'|'Sab'|'Dom', inicio: /^\d{2}:\d{2}$/, bloques: int 1..24,
                      fase: 'previa'|'final', extension: boolean }> (.min(1)),
  capacidad_especial?: Record<`${number}`, int 0..24>,
  categorias: Record<string, { sexo: 'H'|'M', nivel?: int, grupos: Record<string, string[]> }>,
  parejas: Record<string, { personas: [string, string], no_disponible: int[] }>,
}
```
Response 201:
```ts
{ tournamentId: string,
  counts: { blocks: number, categories: number, groups: number, teams: number,
            persons: number, matchesPrevia: number, matchesFinal: number, matches: number } }
```
`400` Zod/LoaderError (con `path`), `409 {code:'runs_exist'}`, `422 {code:'instance_too_large'}`. Efecto: **1 transacción** (0 filas si falla, AC-02). Auditoría `auditCreate('tournament', id, counts)`.

### 6.2 `GET /api/torneos` — list (200)

Query: `?limit=1..50&cursor=<ISO>`. Respuesta `{ items: TournamentSummary[], nextCursor: string|null }` (cursor sobre `updatedAt`, patrón G15).

### 6.3 `GET /api/torneos/[id]` — detalle (200 / 404)

```ts
{ tournament: { id, name, status, startDate, endDate, courts, blockMinutes, params, createdAt, updatedAt },
  counts: { blocks, courts, categories, groups, teams, matches, matchesPrevia, matchesFinal },
  blocks: Array<{ idx, dayLabel, startTime, phase, isExtension, capacity }>,
  activeRun: RunSummary | null,
  currentRun: RunSummary | null }   // currentRun = último succeeded|invalid
```
Efecto lateral: ejecuta el reaper perezoso (§4.4).

### 6.4 `POST /api/torneos/[id]/agenda` — generar (202 / 404 / 409 / 422)

```ts
// request
{ timeLimitMs?: number, mipRelGap?: number, force?: boolean }
```
- `timeLimitMs` se **clampa server-side** a `[30_000, min(240_000, TOURNAMENT_MAX_TIME_LIMIT_MS)]`. Un valor inválido en el body **no** bypassa (AC-09); se ignora y se usa el default. El valor efectivo se guarda en `tournament_runs.params`.
- Pre-check `computeSemaforo` sin escribir. Si `ρ > 1` en alguna fase y `force !== true` → **422** con `{ code:'infeasible_occupancy', semaforo }` (EC-01) y **no se crea run**.
- Si hay run activo (índice parcial) → **409 `{code:'run_active', activeRunId}`** (EC-11).
- Si `archived` → **409 `{code:'archived'}`** (EC-13).
- Respuesta **202** `{ runId, status: 'queued' }` en < 2 s. Dispatch fire-and-forget (§6.4.1). Auditoría `auditCreate('tournament_run', runId)`.

#### 6.4.1 Autenticación y despacho al background function

- **Secreto**: `TOURNAMENT_WORKER_SECRET` (server-only, ≥32 chars). El worker compara con `crypto.timingSafeEqual` sobre `sha256(provided)` vs `sha256(expected)` (longitudes constantes, sin filtrar longitud). Falta el header → **401**. Secreto no configurado en el entorno → **503 `{code:'worker_not_configured'}`** (fail-closed, nunca "sin auth").
- **Dispatch**: `dispatchRun(runId)` hace `fetch(`${workerUrl}/api/internal/tournament-worker`, {method:'POST', headers:{'x-worker-secret','content-type'}, body:{runId}, signal: AbortSignal.timeout(5000)})` **sin esperar el body** (`void ... .catch()`), y suma `dispatchAttempts`/`lastDispatchAt`.
- **Por qué además hay re-dispatch**: en Vercel, una promesa pendiente tras `return` puede morir con la invocación. Por eso el run `queued` sin claim en 90 s se **re-despacha una vez** (máx 2 intentos) y si no, el reaper lo marca `failed(dispatch_failed)`. Resultado: entrega *at-least-once* sobre un claim *atómico* ⇒ el motor corre como máximo una vez por run.
- **URL del worker**: `TOURNAMENT_WORKER_URL ?? ${NEXT_PUBLIC_BASE_URL}/api/internal/tournament-worker`. El override permite plan B contenedor sin tocar código.

### 6.5 `POST /api/internal/tournament-worker` — worker (200 / 401 / 409 / 503)

Route segment config: `runtime='nodejs'`, `dynamic='force-dynamic'`, **`maxDuration = 300`**.

```
1. verificar secreto (401/503)
2. claim atómico: UPDATE tournament_runs SET status='running', startedAt=now()
                  WHERE id=$1 AND status='queued' RETURNING *
   → 0 filas ⇒ 409 {code:'not_claimed'} (idempotente: reintento seguro)
3. buildInstance(tournamentId)  ·  merge params  ·  runEngine(inst, { timeLimitMs, mipRelGap })
4. si engineStatus==='infeasible' → finishRun('infeasible', diagnostics, 0 slots)
   si engineStatus==='error'      → finishRun('failed', error.code)
   si verify().length > 0         → finishRun('invalid',  slots SÍ)
   else                            → finishRun('succeeded', slots)
5. finishRun = 1 transacción: UPDATE run (terminal + métricas + diagnóstico)
                 + INSERT slots (batch) + UPDATE tournaments.status='agenda_draft'
                 ⚠ 0 slots si algo falla (nunca agenda parcial)
6. respuesta 200 { runId, status, timeMs }
```
`error.code ∈ { timeout, worker_crash, solver_error, engine_unavailable, instance_build_failed }`.

### 6.6 `GET /api/torneos/[id]/runs/[runId]` — polling (200 / 404)

Query: `?include=slots` (default: solo resumen). 
```ts
{ runId, status, engineStatus, objective, mipGap, timeMs, slotsCount,
  startedAt, finishedAt, error: {code, message} | null,
  diagnostics: Diagnosis | null,
  slots?: Array<{ matchId, code, categoryCode, phase, round, blockIdx, court }> }
```
Si `include=slots` y el run no terminó ⇒ `slots: []` + `slotsCount: 0`. El polling del hook se detiene en cualquier estado terminal.

### 6.7 `POST /api/torneos/[id]/archive` (200 / 404 / 409)

`{ archived: true }`. `409` si ya está archivado. Auditoría `auditUpdate('tournament', id, {status:'agenda_draft'}, {status:'archived'})`.

### 6.8 Retrocompatibilidad

- 0 endpoints existentes modificados, 0 campos renombrados, 0 cambios de forma de respuesta.
- `lib/api-docs/spec.ts` **solo agrega** `paths`/`schemas`/`tags` (`Torneos`, `Torneos Worker`).
- `lib/auth/protected-routes.ts` **solo agrega** 7 entradas.
- Si M2 introduce `publication`, se hace extendiendo `tournament_runs` (no rompiendo `/agenda`).

---

## 7. Variables de entorno (documentar en `.env.example`)

| Var | Requerida | Default | Uso |
|---|---|---|---|
| `TOURNAMENT_WORKER_SECRET` | **sí en prod** (fail-closed 503) | — | header `x-worker-secret`. ≥32 chars. Generar: `openssl rand -hex 32` |
| `TOURNAMENT_MAX_TIME_LIMIT_MS` | no | `240000` | techo del clamp (AC-09). Bajarlo acelera tests/E2E |
| `TOURNAMENT_WORKER_URL` | no | `${NEXT_PUBLIC_BASE_URL}/api/internal/tournament-worker` | override plan B contenedor |

`.env.example` sí, `.env.local` **nunca se sobrescribe** (regla del repo: solo `Edit` puntual). No se agrega ninguna var `NEXT_PUBLIC_*`.

---

## 8. Dependencias npm

**Solo `highs`** (nueva). Justificación explícita de lo que **no** se agrega:

| Tentación | Por qué no |
|---|---|
| `date-fns`/`Temporal` para bloques | bloques son `dayLabel` + `startTime` strings; `calendar.ts` suma minutos con aritmética entera (EC-17) |
| `lodash`/`ramda` | `Map`/`Set`/`sort` nativos cubren todo |
| `mathjs`/`glpk.js`/`javascript-lp-solver` | D1 cerrada: `highs` |
| `uuid` para groupId de notificaciones | M1 no emite notificaciones |
| `p-limit`/cola externa | 1 run activo por torneo (índice parcial) es toda la concurrencia que M1 necesita |

`highs` entra a `audit_deps`: verificar licencia del binding npm (HiGHS core es MIT), tamaño del `.wasm` (~2–4 MB) y que sea **devDependency-free** para producción. `serverExternalPackages: ['highs']` en `next.config.mjs` **solo si F1 lo exige** (WASM no debe pasar por el bundler). Runtime: `nodejs` obligatorio, **nunca `edge`**.

---

## 9. Tests requeridos

### 9.1 Unit (Jest, `tests/unit/`)

| Archivo | Qué prueba | AC |
|---|---|---|
| `motor-torneo/purity.test.ts` | escaneo estático: `lib/motor-torneo/**` no importa `lib/db`,`next/*`,`server-only`,`react`,`node:fs`; `highs` solo en `solver.ts`; `synthetic` no se importa desde `app/`; no hay `new Date(` | AC-05, EC-17 |
| `motor-torneo/calendar.test.ts` | idx/startTime correctos, capacidad especial, solape → error | AC-02, EC-09 |
| `motor-torneo/bracket.test.ts` | golden `structure.json`: 155 previa + 92 final = 247; grupos 3→3, 4→4 cada pareja 2×; byes; `feeders` acíclicos; sin cruce mismo grupo en 1ª ronda; casos 6/7/8 grupos | AC-03 |
| `motor-torneo/loader.test.ts` | 4 reglas + R0/R5/R6 con `path` exacto; EC-05..EC-09 | AC-02 |
| `motor-torneo/model.test.ts` | **L3 paridad de tamaño** `nVars`/`nConstraints` vs `python-run.json` (±`KNOWN_DELTAS`); cada regla dura detecta su violación | AC-05 |
| `motor-torneo/verify.test.ts` | 6 reglas con agendas corruptas sintéticas; no importa `model/objective` | AC-05 |
| `motor-torneo/diagnostics.test.ts` | semáforo verde/amarillo/rojo, ρ>1, **0 casillas** (EC-16), 6 indicadores | AC-07 |
| `motor-torneo/solver-parity.test.ts` | **L2** sobre `reference/instance.json`: `verify()===[]`, 247 slots, extensión 0, indicadores con tolerancia; nunca igualdad de agenda | AC-06 |
| `db/tournament-queries.test.ts` | mappers, clamp `timeLimitMs`, límites de tamaño, transiciones de estado válidas | AC-09 |
| `validations/torneo.test.ts` | schemas Zod de request | AC-12 |

### 9.2 API (Playwright, `tests/api/torneos/`) — SQL real contra NeonDB

**Clave**: los happy-path usan un torneo **mini** (`synthetic` con 1 categoría / 2 grupos de 3 / 6 partidos / 3 bloques / 2 canchas) ⇒ el motor resuelve en < 1 s y el test no espera 240 s.

| Archivo | Casos |
|---|---|
| `import-happy.spec.ts` | POST import mini (201 + counts) → GET detalle (404 ajeno) → GET instancia (round-trip AC-04) |
| `agenda-happy.spec.ts` | POST agenda (202, <2 s) → invocar worker con secreto → GET run hasta `succeeded` → `slotsCount === matches` → `include=slots` coherente |
| `torneos-guard.spec.ts` | 401 sin sesión, 403 `USER`/`TEMPORARY`, 404 torneo ajeno, 409 doble POST, 409 archived, 422 `force=false` con ρ>1, 400 regla de cargador |
| `worker-guard.spec.ts` | 401 sin header, 401 secreto incorrecto, 409 `not_claimed` (run ya tomado) |

### 9.3 E2E (Playwright, `tests/e2e/torneo-agenda.spec.ts`)

1 flujo navegable: `/torneos` → import (fixture mini JSON) → `/torneos/[id]` → "Generar agenda" → polling a terminal → grilla canchas × bloques con celdas + leyenda + semáforo + panel de diagnóstico; asserts de 375 px sin scroll horizontal. Estados `empty`, `loading`, `error`, `corriendo` cubiertos por renders condicionales.

### 9.4 Cobertura

`lib/motor-torneo/**` es lógica pura y densamente testeada (objetivo ≥ 80 % del módulo). La UI aporta poco: el gate `--coverage` exige **no bajar >3 %** de la línea base; `diagnostics.ts`/`limits.ts` puros absorben el riesgo.

---

## 10. Test de paridad Python ↔ TS (cómo se hace exactamente)

**No se reproduce `random.Random` (Mersenne Twister) en TS.** Se invierte la dirección: Python produce las fixtures, TS debe consumirlas.

### 10.1 Generación (una vez, manual, commiteada)

`scripts/torneo-export-fixtures.py` (nuevo, ~120 líneas) importa `instancia.generar` + `modelo.Modelo` del prototipo congelado y escribe en `tests/fixtures/torneo/`:

| Fixture | Contenido |
|---|---|
| `reference/instance.json` | instancia completa en forma canónica §6 **+** derivados (`personas`, `partidos[]` con `code/phase/round/groupId/teamA/teamB/sourceGroups/feeders`, `bloques[]` con `idx/dia/hora/fase/extension/cap`) |
| `reference/structure.json` | solo estructura derivada (bloques + partidos) — golden del port de `bracket.ts` |
| `reference/python-run.json` | `seed=7`, `tiempo=300`: `modelStats {nVars, nRest}`, `status`, `objective`, `mipGap`, `time`, `verificador: []` (debe estar vacío), los 6 indicadores del `resumen.txt` y `agenda: {matchId: {bloque, cancha}}` |
| `reference/instance-seed3.json` + `python-run-seed3.json` | segunda muestra (robustez del port) |
| `mini.json` | caso mini para API/E2E |

Comando documentado en el README del módulo: `python3 scripts/torneo-export-fixtures.py --seed 7 --tiempo 300`. **Nunca corre en CI** (CI no tiene Python + scipy). Las fixtures son el contrato congelado.

### 10.2 Tres niveles de paridad

| Nivel | Test | Igualdad exigida |
|---|---|---|
| **L1 · Estructural** | `bracket.test.ts` | **exacta** contra `structure.json`: códigos, rondas, orden, `sourceGroups`, `feeders`, byes. Aquí un bug de port es silencioso y caro ⇒ igualdad byte a byte |
| **L2 · Validez** | `solver-parity.test.ts` | `verify()===[]`, 247 slots, ocupación ≤ cap, extensión 0. Indicadores con tolerancia explícita (`INDICATOR_TOLERANCE`: exacta para conteos estructurales, ±2 grupos para `gruposComoUnidad`, ≥ Python para `parejas1Dia`). **Nunca** igualdad de agenda (HiGHS no es determinista entre versiones) |
| **L3 · Tamaño de modelo** | `model.test.ts` | `nVars`/`nConstraints` **exactos** vs `python-run.json`. Es la prueba más barata de que no se perdió ni una restricción; cualquier desvío intencional debe declararse en `KNOWN_DELTAS` con justificación |

### 10.3 Cross-check opcional (manual, @qa-release)

`scripts/torneo-verify-with-python.py` toma la agenda que produjo TS (`agenda.json`) y la pasa por el `verificar.py` original. Se corre a mano cuando cambie cualquier archivo del módulo puro; no está en CI.

---

## 11. Decisiones de simplicidad (para @ponytail-reviewer)

- Un solo módulo puro con 13 archivos, cada uno < 350 líneas. **Sin clases**: `MilpModel` es un objeto plano + funciones `buildModel`/`addObjectiveTerms`. Nada de `class Modelo`.
- Sin capa `service/` ni `repository/` adicional: route handler → `lib/validations` → `lib/db/queries/torneos/*` → `lib/motor-torneo`. Tres saltos, como el resto del repo.
- Sin cola externa, sin cron, sin worker separado: índice parcial + claim atómico + reaper perezoso.
- Sin wrappers nuevos en `lib/audit`: se usa el genérico.
- `synthetic.ts` existe **solo** porque los tests y las fixtures mini lo necesitan. Si @ponytail-reviewer demuestra que `mini.json` manual basta, se elimina.

---

## 12. Orden de ejecución de agentes y chunks

| Fase | Agente | Chunk (≤5 archivos / ≤400 líneas) | Gate de salida |
|---|---|---|---|
| **F0a** | @db-engineer | `lib/db/schema.ts` + `drizzle/0014_*` + verificación `information_schema` | 11 tablas, 4 enums, índice parcial confirmado con `\d tournament_runs` |
| **F0b** | @db-engineer | `queries/torneos/{index,tournaments,import}.ts` | import transaccional 0-filas-on-error (unit) |
| **F0c** | @db-engineer | `queries/torneos/{instance,runs}.ts` + `tests/unit/db/tournament-queries.test.ts` | `buildInstance` round-trip; claim/reaper idempotentes |
| **F1a** | @app-engineer | `scripts/torneo-export-fixtures.py` (ejecutado por @architect) + `lib/motor-torneo/{types,calendar}.ts` | fixtures commiteadas; calendar test verde |
| **F1b** | @app-engineer | `model.ts` + `objective.ts` + `solver.ts` + `scripts/torneo-smoke.ts` | **GATE F1** (§12.1) — bloqueante |
| **F1c** | @app-engineer | `verify.ts` + `courts.ts` + `engine.ts` + `purity.test.ts` | AC-05, AC-06 sobre fixture |
| **F2a** | @app-engineer | `bracket.ts` + `loader.ts` + `lib/validations/torneos.ts` | L1 exacta, AC-02/AC-03 |
| **F2b** | @app-engineer | `diagnostics.ts` + `synthetic.ts` + `app/api/torneos/route.ts` + `[id]/route.ts` + `[id]/instancia/route.ts` | import+detalle+instancia happy con SQL real |
| **F2-review** | @ponytail-reviewer | diff del port completo | reporte; net-negative preferido |
| **F3a** | @app-engineer | `app/api/torneos/[id]/agenda/route.ts` + `runs/[runId]/route.ts` + `archive/route.ts` + `lib/torneos/{dispatch,limits}.ts` | 202/409/422, reaper |
| **F3b** | @app-engineer + @auth-security | `app/api/internal/tournament-worker/route.ts` + `lib/auth/protected-routes.ts` + revisión de secreto/anti-IDOR/auditoría | AC-08/AC-09/AC-10 |
| **F4a** | @app-engineer | `app/(app)/torneos/page.tsx` + `components/torneos/{tournament-list,tournament-import-modal}.tsx` | lista + import |
| **F4b** | @app-engineer | `[id]/page.tsx` + `components/torneos/{agenda-grid,diagnostics-panel}.tsx` + `hooks/use-tournament-run.ts` | AC-11, 375 px |
| **F5** | @qa-release | `tests/api/torneos/*` (3-4) + `tests/e2e/torneo-agenda.spec.ts` + `lib/api-docs/{paths,spec}` + `.env.example` + `FEATURES.md` | AC-12, gates |

Cross-Agent Review obligatorio: cambio >5 archivos (§ AGENTS) ⇒ `design-review.md` tras F2b y tras F4b.

### 12.1 GATE F1 — criterio de aceptación del spike (bloqueante, no negociable)

Ejecutar **dentro de una invocación real de Vercel** (no local), con `scripts/torneo-smoke.ts` invocado por el worker route temporal:

| Métrica | Umbral |
|---|---|
| `verify()` sobre el caso de referencia | **0 errores** |
| slots persistidos | **247** (155 + 92) |
| `nVars` / `nConstraints` vs Python | iguales (L3) |
| wall time total (load + solve + persist) | **≤ 270 000 ms** con `timeLimitMs = 240 000` |
| `process.memoryUsage().rss` pico | **≤ 1024 MB** |
| cold start (1ª invocación con WASM) | **≤ 10 000 ms** |
| bundle del chunk server con `highs` | **≤ 10 MB** |
| plan Hobby (60 s de techo) | descartado: se requiere Pro/Fluid |

Si falla cualquiera → **detener el workflow**, no avanzar a F2, generar `escalation-report.md` y activar plan B (contenedor: mismo `lib/motor-torneo`, mismo contrato `POST {runId}`, `TOURNAMENT_WORKER_URL` apunta al contenedor).

---

## 13. Riesgos técnicos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | WASM + 240 s no cabe en la función (bundle/memoria/cold start) | Media | **Bloqueante** | **GATE F1** antes de F2; `serverExternalPackages`; plan B contenedor ya cableado por `TOURNAMENT_WORKER_URL` |
| R-02 | Disharge fire-and-forget se pierde en serverless | Alta | Run colgado | claim atómico + re-dispatch ≤2 + reaper `dispatch_failed` (§6.4.1) |
| R-03 | Divergencia del port en R5 acumulada | Media | Agenda inválida | verificador independiente + L3 (`nConstraints`) + `structure.json` exacto |
| R-04 | Orden no determinista (`Object.keys`) altera códigos de cuadro | Media | L1 falla / `feeders` incoherentes | `sortOrder` materializado (P-3) + test L1 exacto |
| R-05 | Índice UNIQUE parcial no emitido por `drizzle-kit` | Media | EC-11 solo en app | verificar `\d`; SQL custom + re-`db:generate`; test API de doble POST |
| R-06 | Migración "exitosa" sin ejecutar SQL (patrón conocido) | Media | F2 roto | `SELECT column_name FROM information_schema.columns WHERE table_name='tournament_runs'` post-migrate (AC-01) |
| R-07 | `highs` npm: licencia/size/API real distinta a la documentada | Baja | Retrabajo | F1a valida la superficie real (30 min) antes de escribir `model.ts` completo |
| R-08 | Cobertura: UI densa sin tests de lógica | Media | Gate `--coverage` | semáforo/indicadores viven en `diagnostics.ts` puro + clamp en `limits.ts` puro + 1 E2E |
| R-09 | Explosión de variables en instancias grandes | Baja | OOM | R6 del loader (`partidos ≤ 600`, `partidos×bloques ≤ 120k`) ⇒ 422 antes de gastar CPU |
| R-10 | `synthetic.ts` se importa desde producción y arrastra código muerto | Baja | Bundle | `purity.test.ts` + no se exporta en `index.ts` |

---

## 14. Documentación a actualizar

| Archivo | Cambio | Responsable |
|---|---|---|
| `ARCHITECTURE.md` | nueva sección «Padel Evaluativo — Torneos (v0.12)»: módulo puro, worker, lifecycle, env vars, índice parcial | @architect |
| `AGENTS.md` | **no cambia** (sin nuevos roles ni gates) | @architect |
| `FEATURES.md` | entrada con metadata (`status`, `release v0.12`, `module: torneos`, `tags`) | @qa-release |
| `lib/api-docs/spec.ts` + `paths/torneos.ts` + `schemas/torneo.ts` | 7 endpoints + 2 tags | @app-engineer |
| `lib/auth/protected-routes.ts` | 7 entradas (6 guardAdmin + 1 worker con `x-worker-secret`) | @auth-security |
| `.env.example` | 3 variables (§7) | @app-engineer |
| `motor_torneo/README.md` | puntero a `lib/motor-torneo/` y a `scripts/torneo-export-fixtures.py` (queda congelado) | @architect |
