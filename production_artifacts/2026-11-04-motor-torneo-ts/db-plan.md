# DB Plan — Módulo Torneos, motor TS (M1)

> change_id: `2026-11-04-motor-torneo-ts`
> status: `in-progress` · release: `v0.12` · module: `torneos`
> chunk: **F0a** (@db-engineer) · fecha: `2026-11-04`
> fuente del contrato: `technical-design.md` §4

---

## 1. Qué se creó (aditivo puro)

| Objeto | Cantidad | Detalle |
|---|---|---|
| Enums postgres | **4** | `tournament_status` (draft/agenda_draft/archived), `tournament_phase` (previa/final), `tournament_run_status` (queued/running/succeeded/infeasible/failed/invalid), `tournament_match_round` (grupo/16vos/8vos/4tos/semi/final) |
| Tablas | **11** | `tournaments`, `tournament_blocks`, `tournament_categories`, `tournament_groups`, `tournament_persons`, `tournament_teams`, `tournament_team_members`, `tournament_team_availability`, `tournament_matches`, `tournament_runs`, `tournament_agenda_slots` |
| Índices UNIQUE | **10** | incluye el **UNIQUE parcial** `tournament_runs_active_uq` |
| Índices no únicos | **10** | cursor G15, ownership, lookups por fase/status |
| FK entrantes a `users` | **2** | `tournaments.owner_id`, `tournament_runs.requested_by` — ambas `no action` |
| FK a `courses`/`academies` | **0** | D2: módulo de DB independiente |
| Tipos TS | **22** | `$inferSelect` / `$inferInsert` por tabla + 4 `enumValues` unions |
| Cambios a tablas existentes | **0** | AC-13 satisfecho (ningún `ALTER`/`DROP` en `0014`) |

Archivo modificado: `lib/db/schema.ts` (+~330 líneas al final, sección
`Padel Evaluativo — Torneos`). Única edición fuera de esa sección:
`usersRelations` gana `tournaments` y `tournamentRuns` (`relationName:
"requestedRuns"`), sin tocar ninguna tabla existente.

---

## 2. Decisiones de esquema (y por qué)

| # | Decisión | Justificación |
|---|---|---|
| S-1 | `engine_status` es **varchar(32)**, no enum | desacopla la DB de la nomenclatura del solver (`optimal \| feasible_time_limit \| infeasible \| unbounded \| error`). Cambiar el solver no exige migración de enum. |
| S-2 | UNIQUE parcial `tournament_runs_active_uq (tournament_id) WHERE status IN ('queued','running')` | es la **garantía en DB** de "1 run activo por torneo" ⇒ doble `POST .../agenda` produce `23505` ⇒ la app lo mapea a `409 {code:'run_active'}` (EC-11). Sin él, la exclusividad dependería solo de lógica de aplicación (race condition real). |
| S-3 | `tournament_categories.sort_order` y `tournament_groups.sort_order` materializados | P-3: el cuadro se construye iterando orden determinista. Sin columna persistida el orden dependería de `Object.keys`/inserción y los `code` (`3ra-8vos-3`) divergirían del prototipo (rompe el test L1). |
| S-4 | `source_groups` / `feeders` guardan **códigos** (`["3ra-G1"]`), no UUIDs | legibles en SQL y en logs; sobreviven a re-import. |
| S-5 | `tournament_matches.group_id / team_a_id / team_b_id` nullable con `on delete set null` | un partido de fase final no tiene grupo, y un slots de cuadro puede existir con equipos aún no resueltos (byes/feeders). `set null` evita borrar el partido si se limpia la pareja. |
| S-6 | `tournament_runs.slots_count` `not null default 0` | el contrato §4.2 no fija default; se elige `0` porque un run `queued` siempre tiene 0 slots y `GET .../runs/[runId]` lo devuelve siempre (evita `null` en la API). Documentado como desviación menor. |
| S-7 | `tournament_blocks` sin `created_at`: solo `unique(tournament_id, idx)` | la tabla es materializada por el import dentro de una transacción; no hay ciclo de vida propio. |
| S-8 | `tournament_persons.sex` / `display_name` nullable, `document_id` not null | el documento es la clave de identidad (UNIQUE por torneo); sexo y nombre vienen del JSON y son opcionales en el cargador. |
| S-9 | índice extra `tournament_runs_tournament_status_idx` | §4.4 define el reaper perezoso como "consulta runs activos del torneo". §4.2 solo listaba `(tournament_id, created_at)`; se agrega este para servirlo sin seq scan. Coste: 1 índice pequeño. |
| S-10 | `block_minutes` default 75 y `courts` default 8 en `tournaments` | valores del prototipo (`construir_bloques`: 75 min/bloque, 8 canchas). El import siempre los pasa explícitos; los defaults son solo red de seguridad. |

---

## 3. Índices (inventario completo)

```
tournaments                     tournaments_owner_updated_idx      (owner_id, updated_at)      ← cursor G15
                                tournaments_owner_status_idx       (owner_id, status)
tournament_blocks               tournament_blocks_tournament_idx_uq (tournament_id, idx) UNIQUE
tournament_categories           tournament_categories_tournament_code_uq (tournament_id, code) UNIQUE
                                tournament_categories_tournament_sort_idx (tournament_id, sort_order)
tournament_groups               tournament_groups_category_code_uq (category_id, code) UNIQUE
                                tournament_groups_tournament_idx   (tournament_id)
tournament_persons              tournament_persons_tournament_document_uq UNIQUE
tournament_teams                tournament_teams_tournament_code_uq UNIQUE
                                tournament_teams_group_idx         (group_id)
                                tournament_teams_tournament_idx    (tournament_id)
tournament_team_members         tournament_team_members_team_person_uq UNIQUE
                                tournament_team_members_person_idx (person_id)   ← lookup doble categoría
tournament_team_availability    tournament_team_availability_team_block_uq UNIQUE
tournament_matches              tournament_matches_tournament_code_uq UNIQUE
                                tournament_matches_tournament_phase_idx (tournament_id, phase)
                                tournament_matches_category_idx    (category_id)
tournament_runs                 tournament_runs_active_uq          (tournament_id) WHERE status IN ('queued','running') UNIQUE
                                tournament_runs_tournament_created_idx (tournament_id, created_at)
                                tournament_runs_tournament_status_idx  (tournament_id, status)
tournament_agenda_slots         tournament_agenda_slots_run_match_uq UNIQUE
                                tournament_agenda_slots_run_block_court_uq UNIQUE
                                tournament_agenda_slots_run_block_idx (run_id, block_idx)
```

---

## 4. Lifecycles modelados (validados en app, no en triggers)

- **Torneo**: `draft → agenda_draft → archived` (archive es soft; no hay DELETE en M1).
- **Run**: `queued → running → succeeded | infeasible | failed | invalid`, más
  `queued → queued` (re-dispatch ≤2) y `queued|running → failed` (reaper perezoso con
  `error.code = dispatch_failed | worker_crash`).
- El índice parcial `tournament_runs_active_uq` es el único guardrail en DB; el resto de
  transiciones se validan en `queries/torneos/runs.ts` (chunk F0c).

---

## 5. Fuera de alcance de F0a

`lib/db/queries/torneos/*` y `tests/unit/db/tournament-queries.test.ts` → chunks **F0b/F0c**.
`FEATURES.md` y `ARCHITECTURE.md` son responsabilidad de @qa-release / @architect según
`change-map.md` §14 (no se tocaron aquí para respetar el límite de 2 archivos del chunk).

---

## 6. F0b — queries (`lib/db/queries/torneos/{index,tournaments,import}.ts`)

> chunk **F0b** (@db-engineer) · 3 archivos nuevos · 722 líneas · `tsc`=0, `eslint`=0

### 6.1 `tournaments.ts` — CRUD + ownership

| Función | Contrato | Anti-IDOR |
|---|---|---|
| `createTournament(data, executor = db)` | insert en `draft`; `executor` permite reusarla dentro de la tx de import | `ownerId` obligatorio en el insert |
| `listTournaments(ownerId, {limit, cursor})` | cursor **G15** sobre `updatedAt` (`lt`, `limit+1`, `nextCursor` ISO) + counts `{categories, teams, matches}` en 3 queries agrupadas | filtra por `ownerId` |
| `getTournamentById(id, ownerId)` | fila completa; `null` ⇒ 404 | `id AND ownerId` |
| `getTournamentDetail(id, ownerId)` | `{tournament, counts(7), blocks[]}` en 2 queries (agregados por subquery escalar, sin producto cartesiano) | delega en `getTournamentById` |
| `archiveTournament(id, ownerId)` | `{ok:true}` \| `{ok:false, reason:'not_found'\|'already_archived'}` ⇒ 404/409 (EC-13) | `UPDATE … WHERE id AND ownerId AND status <> 'archived'` |
| `assertNoRuns(tournamentId)` | `true` = sin runs ⇒ seguro re-importar (EC-10) | el caller valida ownership antes |

Reutiliza `PaginationParams`/`PaginatedResult`/`resolveLimit` de `lib/db/queries/padel/pagination.ts` (**no** se duplica el tipo G15).

### 6.2 `import.ts` — persistencia transaccional (AC-02)

`importTournament(ownerId, input): {ok:true, tournamentId, counts} | {ok:false, errors[]}`

- **Entrada**: `{ meta, blocks[], categories[].groups[].teams[].persons[]/unavailable[], matches[] }` — el JSON canónico **ya normalizado** por la capa pura (F1a `calendar.ts` + F2a `bracket.ts`/`loader.ts`). Esta capa **no deriva** bloques ni cuadro: la queries-layer solo valida invariantes de persistencia y escribe (evita duplicar el port en SQL y mantiene `lib/motor-torneo/**` puro, AC-05).
- **Validación previa (fuera de la tx ⇒ 0 filas escritas)**: `duplicate_team`, `team_in_two_categories`, `person_two_teams_same_category`, `availability_invalid_block` (solo bloque de `previa` y existente), `availability_too_many` (> `MAX_UNAVAILABLE_BLOCKS` = 8), `match_reference_invalid` (categoría/grupo/pareja referenciada inexistente: convierte un 23503 en 400 con `path`). Acumula **todos** los errores; `path` con formato `parejas[p101].no_disponible[2]`.
- **Transacción única** `db.transaction`: torneo → bloques → categorías → grupos → personas (dedup por `documentId`, 1 fila por persona) → parejas → `team_members` → `team_availability` (dedup de `blockIdx`) → partidos. Cualquier throw ⇒ rollback total (0 filas).
- **Determinismo (P-3)**: `sortOrder` = índice del array de entrada (categorías y grupos por su posición, parejas por su posición dentro de la categoría) ⇒ mismo orden que el `dict` de Python; nunca `Object.keys`.
- `counts` devueltos se calculan de las filas realmente insertadas (`returning().length`), no de la entrada.

### 6.3 Pendiente (F0c, no en este chunk)

`instance.ts` (`buildInstance` round-trip AC-04) y `runs.ts` (`createRun` 23505→`run_active`, `claimRun`, `finishRun` 1 tx, `reapStaleRuns`), más `tests/unit/db/tournament-queries.test.ts`.
