# App Notes — Motor de torneos (TS)

> change_id: `2026-11-04-motor-torneo-ts`
> module: `torneos`
> release: `v0.12`

## F1a — `types.ts` + `calendar.ts` + fixtures golden

**Estado**: completado · fecha 2026-11-04 · archivos: 4 (+1 fix de contrato en F0c)

### Qué se hizo

| Archivo | Contenido |
|---|---|
| `scripts/torneo-export-fixtures.py` | One-shot. Importa `motor_torneo/{instancia,modelo}.py` (sin resolver) y escribe `tests/fixtures/torneo/{instance,structure,model-stats}.json` (seed 7, 8 canchas). Flags: ninguna; corre con `motor_torneo/.venv/bin/python`. |
| `lib/motor-torneo/types.ts` | Puerto de las dataclasses (`Bloque`, `CalendarioTramo`, `Categoria`, `Grupo`, `Pareja`, `Persona`, `Partido`, `Instancia`) + `TournamentParams`, `MilpModel`(+`Stats`), `EngineStatus`, `SolveResult`, `CourtAssignment`, `VerificationError`/`Code`, `Semaforo`, `Diagnosis`, `EngineResult`. **Sin clases**: las utilidades de `Instancia` son funciones puras (`bloquesFase`, `partidosFase`, `personasDoble`, `partidosPotenciales`) — §11 del technical-design. Cero imports (puro). |
| `lib/motor-torneo/calendar.ts` | `BLOQUE_MIN=75`, `CALENDARIO` (6 tramos), `buildBlocks(tramos, courts, capacityOverrides)`, `assertNoOverlap` (EC-09), `parseHHmm`/`formatHHmm` (aritmética entera, sin `Date`). |
| `tests/unit/motor-torneo/calendar.test.ts` | 18 casos: 38 bloques (22+16), 3 de extensión, horas exactas por tramo, cap por defecto/override, solape, aritmética `HH:mm`. |

### Fixtures generadas (seed 7, 8 canchas)

- `instance.json` — instancia completa (bloques, categorías, grupos, parejas con `bloqueados`, personas, 247 partidos, conteos).
- `structure.json` — golden **L1**: bloques + partidos (`id/phase/ronda/grupo/parejas/gruposOrigen/alimentadores`) + emparejamientos por grupo.
- `model-stats.json` — golden **L3**: `nVars=5020`, `nConstraints=6604`, `nNonZeros=56683`, familias `{R1:247, R2:38, R3:2812, R3b:400, R5:1618, DIA:846, MX:155, MN:155, SEG:325, FIN:8}`.

Conteos: 38 bloques (22 previa / 16 final / 3 extensión, capacidad total 304), 8 categorías, 50 grupos, 155 parejas, 285 personas (25 en doble categoría), **155 previa + 92 final = 247 partidos** (4tos 32, 8vos 36, semi 16, final 8).

### Desviaciones / decisiones

1. **Sin `reference/`**: el change-map §9 ubicaba las fixtures en `tests/fixtures/torneo/reference/`; se colapsaron a `tests/fixtures/torneo/` (una sola copia) para no duplicar ~150 KB de JSON. Los consumidores (F1b `model.test.ts`, F2a `bracket.test.ts`) leen las rutas planas.
2. **`model-stats.json` ≠ `python-run.json`**: aquí solo se construye el modelo (no se resuelve), así que no hay `status`/`objective`/`agenda`. `python-run.json` (L2, 300 s) queda para F1b.
3. **`Partido.phase` (no `fase`)**: se normalizó al nombre de la columna DB y al de `Bloque.phase`. Requirió un **fix de contrato type-only** en `lib/db/queries/torneos/instance.ts` (F0c): el objeto usaba `fase: string` y `ronda: string` inline, incompatible con el contrato; ahora `Record<string, Partido>` con `phase`/`ronda` tipados. Sin cambio de comportamiento. El `TS2307` que reportaba F0c desapareció.
4. `Instancia.seed` es **opcional**: `buildInstance` (DB) no lo tiene.

### Verificación

- `npx jest tests/unit/motor-torneo/calendar.test.ts` → **18/18 verde**.
- `npx tsc --noEmit` → **0 errores** (TS2307 de F0c resuelto).
- `npx eslint` sobre los 4 archivos → sin hallazgos.
- `motor_torneo/.venv/bin/python scripts/torneo-export-fixtures.py` → 3 JSON, 233 KB.
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop).

### Pendiente para F1b

`model.ts` debe consumir `model-stats.json` como assert L3 (`nVars`/`nConstraints` exactos, `KNOWN_DELTAS` vacío) y agregar `python-run.json` con la corrida de 300 s.

## F1b — `model.ts` + `objective.ts` + `solver.ts` + `scripts/torneo-smoke.ts`

**Estado**: completado · fecha 2026-11-04 · 4 archivos + `highs@1.15.4` (dep aprobada §8)

### Qué se hizo

| Archivo | Contenido |
|---|---|
| `lib/motor-torneo/model.ts` | Puerto de `Modelo._construir`: `createBuilder()` (objeto plano, sin clases, §11), variables `x[m,b]` (solo permitidas por fase/`fronteraSabado` y no bloqueadas con `disponibilidadDura`), R1 exactly-one, R2 capacidad por bloque, R3 por pareja en previa + R3 de doble categoría sobre camino potencial (duro en previa/`dobleDuraEn`, blando con var `choque`), R5 en **formulación acumulada** con `sep = 1 + descansoFinal` y el `break` de redundancia (P-1), y `toCSC()`. Coeficientes `0` se conservan como entradas (Python cuenta `len(rows)`). `buildModel(inst, params)` devuelve `BuiltModel` (`MilpModel` + `xVars`). |
| `lib/motor-torneo/objective.ts` | `DEFAULT_PARAMS` (espejo de `PARAMS`) + `addObjectiveTerms(builder, inst, params)`: `d[pj,dia]` (días de previa), `mx`/`mn` (compacidad por grupo), `e` (seguidos, solo dobles), `f` (final temprana). Nombres de fila `DIA/MX/MN/SEG/FIN` para verificar familia por familia. |
| `lib/motor-torneo/solver.ts` | Único archivo que importa `highs`. `clampTimeLimitMs` a `[30_000, 240_000]`, `highs.createModel` con matriz CSC + integralidad, options `time_limit` (ms→s), `mip_rel_gap`, `presolve:"on"`, `run()`, `dispose()` en `finally`. Mapea `modelStatus → EngineStatus` (`optimal/feasible_time_limit/infeasible/unbounded/error`), exige `primal_solution_status === 2` para leer solución, extrae `assignment` desde `model.xVars`. `-Infinity/+Infinity` se traducen a `±highs.infinity`. |
| `scripts/torneo-smoke.ts` | `npx tsx scripts/torneo-smoke.ts [--time <s>] [--gap <g>]`. Parser mínimo inline → `Instancia`, compara params vs `DEFAULT_PARAMS`, assert **L3 exacto** con `model-stats.json` (sale 1 si difiere), resuelve, imprime status/objetivo/gap/tiempo/wall/RSS/partidos asignados. `courts.ts` queda pendiente (F1c) — no se importa para no romper `tsc`. |

### L3 — paridad de tamaño (criterio #1)

`nVars=5020/5020`, `nConstraints=6604/6604`, `nNonZeros=56683/56683` → **MATCH exacto**. Familias idénticas:
`R1 247 · R2 38 · R3 2812 · R3b 400 · R5 1618 · DIA 846 · MX 155 · MN 155 · SEG 325 · FIN 8`.
Detalle que hizo cuadrar `nNonZeros`: Python usa dicts y cuenta cada entrada aunque el coeficiente sea `0` (bloque `0` en `MX/MN`: 70 ceros explícitos). El builder usa `Map` con la misma semántica.

### Corridas (máquina local con carga alta: load avg ~5.8, VM al 131 %)

| timeLimit | status | objective | gap | solver | wall | RSS | asignados |
|---|---|---|---|---|---|---|---|
| 60 s | `feasible_time_limit` | 14673 | 0.334 | 60.1 s | 60.1 s | 470 MB | 247/247 |
| 60 s (re-run) | `feasible_time_limit` | 96595 | 0.905 | 338 s | 338 s | 229 MB | 247/247 |
| 240 s | `feasible_time_limit` | 96595 | 0.903 | 314.7 s | 314.8 s | 200 MB | 247/247 |
| 30 s (validación final) | `feasible_time_limit` | 96595 | 0.901 | 30.5 s | 30.5 s | 316 MB | 247/247 |

- `time_limit` se respeta (5 s y 30 s medidos: 5.0 s / 30.5 s). Los overshoots de 314/338 s coinciden con picos de carga del host (VM + `sleep 40` tardando >60 s): HiGHS chequea el reloj entre unidades de trabajo y una LP puede tardar minutos con el CPU saturado. **No es un bug del clamp.**
- Objetivo validado de forma independiente: `Σ cost[j]·colValue[j]` sobre las 5020 columnas == `getObjectiveValue()`.
- **GATE F1 (≤270 s wall, ≤1024 MB, cold start) no es concluyente local**: el technical-design §12.1 exige medirlo dentro de una invocación real de Vercel. RSS local ≤ 470 MB (holgado bajo 1024 MB).
- Sin `python-run.json` todavía: la comparación L2 (verify + 247 slots) es de F1c.

### Verificación

- `npx tsx scripts/torneo-smoke.ts --time 60` y `--time 240` → L3 MATCH (arriba).
- `npx tsc --noEmit` → **0 errores**; `npx eslint` sobre los 4 archivos → sin hallazgos.
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop). `courts.ts`/`verify.ts` (F1c) no existen aún.

### Pendiente para F1c

`courts.ts` (cablear en la rama ya preparada del smoke), `verify.ts`, `engine.ts` y `purity.test.ts`; `model.test.ts` debe fijar `KNOWN_DELTAS = {}`; `solver-parity.test.ts` (L2) necesita `python-run.json`.

---

## F1c — verify + courts + engine + purity (AC-05, AC-06)

### Archivos

| Archivo | Puerto | Notas de fidelidad |
|---|---|---|
| `lib/motor-torneo/verify.ts` | `verificar.py` (84 líneas, COMPLETO) | 6 reglas en el mismo orden; la regla 1 corta el resto (`missing`). Regla 3 reproduce el filtro por fase: no-doble ⇒ solo previa; doble ⇒ previa + rondas de `dobleDuraEn` (camino potencial). Regla 5: `b[m] ≥ b[alimentador] + 1 + descansoFinal`, con el fallback a "todos los partidos de previa del grupo" cuando el grupo no está cubierto por ningún alimentador. Regla 6 distingue `fronteraSabado` (todas las fases) vs sin frontera (solo previa acotada). **Cero imports de `model.ts`/`objective.ts`** (test lo verifica). Mensajes idénticos al Python; `VerificationError.code` mapea a los 8 códigos de `types.ts`. |
| `lib/motor-torneo/courts.ts` | `modelo.asignar_canchas` | Voraz por bloque ascendente; previa busca `(grupo, b-1)`; final hereda la cancha del primer alimentador libre; sobrantes toman `libres.shift()`. Partidos ordenados por `id` (P-3). Si no quedan canchas no lanza: deja sin asignar y lo reporta `verify` (`capacity`/`missing`). |
| `lib/motor-torneo/engine.ts` | `correr.py:main` (sin CSV/HTML) | `buildModel → solveMilp → assignCourts → verify`. `timeLimitMs` default `params.tiempoMax·1000` y se clampa en `solver.ts` (se reporta el efectivo). `optimal`/`feasible_time_limit` ⇒ agenda + verificación; `infeasible`/`unbounded`/`error` ⇒ `ok:false`, `verificationSkipped:true` (verificar un mapa vacío solo daría 247 `missing` y escondería la causa). Errores ⇒ `flagged:true` (run `invalid`, EC-04). Sin `Date` (`performance.now`). |
| `tests/unit/motor-torneo/purity.test.ts` | technical-design §9.1 | Escaneo estático de `lib/motor-torneo/**`: prohibido `lib/db`, `next/*`, `server-only`, `react`, `@/auth`, `node:*`; `highs` solo `solver.ts`; `zod` solo `loader.ts`; cero `new Date(`/`Date.now(`; `synthetic` no importado desde `app/`; `verify.ts` no importa `model`/`objective`. |

### Smoke cableado

`scripts/torneo-smoke.ts` usa `assignCourts` + `verify` (se elimina el placeholder de F1b). Salida sobre la instancia de referencia:

```
partidos asignados: 247/247
canchas asignadas: 247/247
verify errores: 0
```

`status=feasible_time_limit`, `objective=14673`, `gap=0.334` (60 s) — **0 errores de verificación** sobre las 247 casillas, con `L3 MATCH` intacto.

### AC-06 — qué falta todavía

- **Ya cumplido con la fixture**: `verify()===[]` y 247 slots (247 canchas), extensión **no** evaluada aún (indicador de `diagnostics.ts`).
- `engine.ts` está listo para consumirse; falta el **glue de F2+**:
  1. `diagnostics.ts` (F2b) — `computeSemaforo` + `computeDiagnosis` con los 6 indicadores; `engine.ts` hoy devuelve `diagnostico` mínimo (status/objetivo/gap/tiempo/mensaje) y `meta` con stats del modelo.
  2. `loader.ts` (F2a) — construir `Instancia` real desde el JSON de import (hoy el único constructor es el del smoke/`instance.ts` de F0c).
  3. `lib/db/queries/torneos/instance.ts` (F0c) — `buildInstance(tournamentId)`.
  4. `solver-parity.test.ts` (L2) — requiere `python-run.json` (fixture Python pendiente) para tolerancias de indicadores.
  5. Worker (F3b): mapear `meta.engineStatus` a `tournament_runs.status` (`infeasible` → 0 slots; `flagged` → `invalid` con slots; `error` → `failed`).

---

## F2a — `bracket.ts` + `loader.ts` + test L1 (AC-02, AC-03)

### Archivos

| Archivo | Puerto | Notas de fidelidad |
|---|---|---|
| `lib/motor-torneo/bracket.ts` | `instancia.py::_partidos_grupo` (:128) + `_construir_cuadro` (:138) | Port línea a línea: `S` = potencia de 2 ≥ 2g, `byes = S − 2g`, entrantes (1ros luego 2dos), pases libres a los primeros `byes`, re-emparejamiento `1ro Gi vs 2do G((i+g//2)%g)` cuando `byes === 0`, swap anti-mismo-grupo cuando `byes > 0`, nombres de ronda por nº de nodos (16vos/8vos/4tos/semi/final) y códigos que **cuentan los nodos resueltos por bye** (`2da-8vos-5` con 4 byes). `gruposOrigen` acumulado y ordenado, `alimentadores` en orden de lados. `groupPairings(3)` = todos contra todos; `(4)` = ciclo A-B,B-C,C-D,D-A. |
| `lib/motor-torneo/loader.ts` | reemplaza a `instancia.py` (D6) | **Único archivo del módulo que importa `zod`**. `tournamentExchangeSchema` = JSON de OPERACION.md §6 (meta, calendario, capacidad_especial, categorías, parejas). `parseTournamentInput(raw)` deriva bloques con `calendar.ts` y partidos con `bracket.ts` y devuelve `{ok:true,data} \| {ok:false,errors:[{code,path,message}]}`. `data` es **estructuralmente idéntica** a `TournamentImportInput` (F0b) sin importarlo: `lib/motor-torneo` no puede tocar `lib/db` (AC-05). |
| `tests/unit/motor-torneo/bracket.test.ts` | technical-design §9.1 | L1 exacta + casos borde. |

### Reglas del cargador (implementation)

| # | Regla | Código | Comprobado a mano |
|---|---|---|---|
| R1 | pareja en 1 grupo de 1 categoría (3 errores) | `duplicate_team` / `orphan_team` / `team_in_two_categories` | ✅ |
| R2 | persona en >1 pareja solo si son de categorías distintas | `person_two_teams_same_category` | ✅ |
| R3 | `no_disponible` ⊆ bloques de previa existentes | `availability_invalid_block` | ✅ |
| R4 | ≤ 8 bloques bloqueados por pareja | `availability_too_many` | ✅ |
| R5 | grupo de 3 o 4 | `group_invalid_size` | ✅ |
| R0 | partido de previa con ≥ 1 bloque compatible para ambas parejas (422) | `match_without_allowed_block` | ✅ |
| R6 | `partidos ≤ 600` y `partidos × bloques ≤ 120_000` (422) | `instance_too_large` | ✅ |
| — | JSON inválido (zod) / calendario con solape o capacidad fuera de rango / código > varchar | `invalid_schema` / `calendar_invalid` | ✅ |

Todos los errores se **acumulan** (no corta en el primero) ⇒ la UI lista los 5 campos culpables de una vez. Los `path` de dominio usan la sintaxis del design (`parejas[p101].no_disponible[2]`); los de zod usan `a.b.0` (error de forma, no de negocio).

### Desviaciones documentadas (3)

1. **`deriveStructure(categorias, grupos)`** — el design (§3) mencionaba un 3er parámetro `parejas`; no se usa: `Grupo.parejas` ya trae los códigos en `sortOrder` (P-3) y el mapa de parejas no aporta nada a la estructura.
2. **`meta.blockMinutes` distinto de 75 ⇒ `invalid_schema`**. `calendar.ts` fija `BLOQUE_MIN = 75`; aceptar 60 sería guardar una agenda con etiqueta mentirosa. Cuando el motor generalice el tamaño de bloque se elimina el check (1 línea).
3. **`dia` es `string(1..3)`, no enum `Jue|Vie|Sab|Dom`**. `tournament_blocks.dayLabel` es `varchar(3)` en DB; el enum del design solo describía el caso de referencia y bloquearía torneos con otros días de la semana.
4. Máximo **16 grupos** por categoría (`buildBracket` lanza error explícito a partir de 17): el enum `tournament_match_round` llega hasta `16vos` (DV-2), y el error es accionable en import en vez de un 500.

### Tests

- `tests/unit/motor-torneo/bracket.test.ts` (15 tests, verde): L1 **exacta** contra `structure.json` (247 = 155 previa + 92 cuadro; id/categoría/fase/ronda/grupo/parejas/gruposOrigen/alimentadores; `8vos 36 / 4tos 32 / semi 16 / final 8`), 50 grupos con 3/4 partidos y cada pareja 2×, alimentadores acíclicos, `groupPairings` 3 y 4, casos de byes (`S = 2g` exacto y `byes > 0`: total `2g−1`, códigos de 1ª ronda arrancan en `byes+1`), invariante "sin cruce del mismo grupo en 1ª ronda" para g 2..12, guard de 17 grupos, códigos únicos.
- Suite `npx jest tests/unit/motor-torneo/` → **3 suites / 40 tests verde** (purity, calendar, bracket).
- `npx tsc --noEmit` → 0 errores. `eslint` sobre los 3 archivos → 0 errores.
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop). `loader.test.ts` completo (EC-05..EC-09 con `path` exacto) queda para F5: aquí las reglas se validaron con un smoke manual (`tsx`) además del test estático.

### Pendiente para F2b

`diagnostics.ts`, `synthetic.ts` y los route handlers `app/api/torneos/{route,[id]/route,[id]/instancia/route}.ts`; el glue debe llamar `parseTournamentInput(body)` → `importTournament(ownerId, result.data)` y mapear `code ∈ {match_without_allowed_block, instance_too_large}` a **422** (el resto a 400).

## F2b — `diagnostics.ts` + `synthetic.ts` + 3 route handlers (AC-04, AC-07)

**Estado**: completado · fecha 2026-11-04 · 5 archivos

### Qué se hizo

| Archivo | Contenido |
|---|---|
| `lib/motor-torneo/diagnostics.ts` | Puerto de `correr.py::semaforo` + `resumen_calidad`. `computeSemaforo(inst)` (ρ por fase sin extensión; `>1` rojo, `>0.85` amarillo; fase con partidos y **0 casillas** ⇒ rojo con `occupancy: Infinity`, EC-16) y `computeDiagnosis(inst, {status, objective, mipGap, timeMs, bloqueDe, canchaDe, params, verificationErrors})` → `DiagnosisReport` (`Diagnosis` de `types.ts` + `semaforo`, `scheduledMatches`, `finals[]`, `bracketFirstMatch[]`, `availabilityViolations[]`). Deriva: ocupación por tramo, partidos en extensión, grupos como unidad/mismo día/misma cancha, días por pareja (1/2), horario laboral (Jue/Vie < 19:00), máx bloques seguidos (semántica Python: mínimo 1), finales con cancha, primer partido de cuadro por categoría, choques de doble categoría (= suma exacta de `choque[p,b]` de R3b recuperada de la agenda: extras por bloque en rondas blandas) y violaciones de disponibilidad. |
| `lib/motor-torneo/synthetic.ts` | `@test-only` (R-10). `generateSynthetic({ seed, courts, structure, calendario, pctDouble, availabilityProfile, maxBlocked, startDate, endDate })` → `ExchangeJson` con PRNG `mulberry32`. Port de `instancia.py::generar`: `DEFAULT_STRUCTURE` (8 categorías), `MINI_STRUCTURE` (1 cat / 2 grupos de 3) + `MINI_CALENDAR` (3 bloques previa/2 final), doble categoría por vecindad de nivel, disponibilidad por perfil (0/1/2 tardes/día completo) con tope. Deriva bloques con `buildBlocks`; **no** genera cuadros (los deriva el loader). Importa solo `./calendar` y `type` de `./loader` (cero `zod`). |
| `app/api/torneos/route.ts` | `GET` (guardAdmin, `paginationQuerySchema` G15 → `listTournaments` → `{items,nextCursor}`) y `POST` (guardAdmin → `parseTournamentInput` → `importTournament` atómico → `auditCreate('tournament', id, counts)` → 201). Errores del cargador: `instance_too_large`/`match_without_allowed_block` → **422**; resto → **400** con `{code, details[path]}`. JSON malformado → 400 `invalid_json`. |
| `app/api/torneos/[id]/route.ts` | `GET` detalle: `getTournamentDetail(id, ownerId)` → 404 anti-IDOR; `reapStaleRuns(id)` perezoso; `{ tournament, counts, blocks, activeRun, currentRun }` (tournament sin `ownerId`, blocks normalizados a 6 campos). |
| `app/api/torneos/[id]/instancia/route.ts` | `GET` espejo canónico AC-04: `buildInstance(id, ownerId)` (filtra owner ⇒ 404) → `{ instancia }`. |

### Decisiones / desviaciones

1. **Sin `lib/validations/torneos.ts`**: F2a lo dejó pendiente y no lo necesité. Los query params usan `paginationQuerySchema` de `lib/validations/padel.ts` (patrón ya compartido por `courseListQuerySchema`); el body lo valida el cargador con Zod. Crear un archivo solo para re-exportar sería boilerplate (regla Ponytail).
2. **Sin `index.ts` barrel**: no estaba en el alcance de 5 archivos. Los handlers importan `@/lib/motor-torneo/loader` directo. Queda pendiente para F3b/F5 (el change-map lo marca F2b).
3. **409 `runs_exist` no aplica**: `POST /api/torneos` siempre crea un torneo nuevo (no hay re-import por id en M1), así que el único 409 posible (`assertNoRuns`) no tiene camino. Se documenta en vez de inventar un flujo.
4. **`instancia` sin 422**: `buildInstance` solo puede fallar por torneo ajeno/inexistente (404); no hay parseo de input que devuelva 422. Un fallo de DB es 500.
5. **Re-despacho del reaper**: el detalle ejecuta `reapStaleRuns` pero ignora `redispatched`; el dispatch HTTP es F3a (`lib/torneos/dispatch.ts`).

### Verificación

- `npx tsc --noEmit` → **0 errores**.
- `npx eslint` sobre los 5 archivos → **0 errores, 0 warnings**.
- `npx jest tests/unit/motor-torneo/` → **3 suites / 40 tests verde** (incluye `purity.test.ts`: `synthetic` puro, sin `zod`/`Date`).
- Smoke `tsx`: mini (1 cat/2 grupos) → 5 bloques, 9 partidos, loader OK; sintético completo → 247 partidos (mismo conteo que la fixture); `computeSemaforo` mini ρ previa=1 ⇒ amarillo, final 0.75 ⇒ verde; `computeDiagnosis` sin NaN con agenda sintética.
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop).

### Pendiente

Tests de F2b (`diagnostics.test.ts`) y API (`tests/api/torneos/import-happy.spec.ts`, guard) según §9.1/§9.2; barrel `index.ts`; `lib/validations/torneos.ts` si F3a lo requiere para agenda/run body.

## F2c — Tests unit L3 parcial (model/verify/loader/diagnostics) + fix O-m5

**Estado**: completado · fecha 2026-11-04 · 5 archivos (4 tests ✨ + 1 route ✏️)

### Qué se hizo

| Archivo | Contenido |
|---|---|
| `tests/unit/motor-torneo/model.test.ts` | **L3 exacta** contra `model-stats.json`: `nVars=5020`, `nConstraints=6604`, `nNonZeros=56683` y las 10 familias (`DIA 846 · FIN 8 · MN 155 · MX 155 · R1 247 · R2 38 · R3 2812 · R3b 400 · R5 1618 · SEG 325`) con `KNOWN_DELTAS` vacío. Sobre instancia mini: `x` solo en bloques de la fase (frontera on), final en cualquier bloque (off); disponibilidad dura elimina la variable y relajada le asigna `W_DISPONIBILIDAD=500`; R5 acumulada con coeficientes exactos en `t=4` (`x[m,4] - x[f,0] - x[f,1] - x[f,2] ≤ 0`) y corte por redundancia en `t=5` (`sep=2`); costos `W_DIAS/W_COMPACTO/-W_COMPACTO/W_FINAL_TEMPRANA/W_SEGUIDOS` y `e[P1,Jue,0]` solo con doble categoría y `> maxSeguidos`. |
| `tests/unit/motor-torneo/verify.test.ts` | Agenda válida ⇒ `[]` y una mutación por regla: `missing` (sin bloque / sin cancha), `capacity`, `court_collision`, `court_range`, `person_overlap`, `availability`, `precedence` y `phase`. No importa `model`/`objective`. |
| `tests/unit/motor-torneo/loader.test.ts` | `path` exacto por código: `invalid_schema` (`meta`, `meta.blockMinutes≠75`), `calendar_invalid` (solape), `group_invalid_size` (`categorias[1ra].grupos[G1]`), `duplicate_team`, `orphan_team` (grupo y `parejas[...]`), `team_in_two_categories`, `person_two_teams_same_category` (`parejas[1ra-G1-D].personas[0]`), `availability_invalid_block` (`parejas[...].no_disponible[0]`), `availability_too_many`, `match_without_allowed_block` (`partidos[1ra-G1-P1]`), `instance_too_large` (`torneo`) + acumulación (≥2 errores). Happy-path: el JSON de intercambio reconstruido desde `instance.json` deriva **247 partidos (155 previa + 92 final) y 38 bloques**. |
| `tests/unit/motor-torneo/diagnostics.test.ts` | Semáforo `rojo` (ρ=1.5), `amarillo` (ρ=0.9), `verde` (ρ=0.5), EC-16 (partidos con capacidad 0 ⇒ `Infinity`, nunca `NaN`) y extensión excluida de la capacidad base. `computeDiagnosis` sobre agenda conocida: 4 partidos agendados, 1 en extensión, 1 en horario laboral, grupos/parejas (un día 1/3, dos días 2), `maxBloquesSeguidos=2`, finales + primer partido de cuadro, sin NaN y `availabilityViolations` al bloquear el bloque usado. |
| `app/api/torneos/route.ts` | **O-m5**: el `code` de un fallo del loader ahora es el **primer error 422** cuando hay alguno; sin 422 responde `code:'invalid_instance'` + `details[]` (status 422/400 sin cambios). |

### Verificación

- `npx jest tests/unit/motor-torneo/` → **7 suites / 85 tests verde** (40 previos + 45 nuevos).
- `npx tsc --noEmit` → **0 errores**. `npx eslint` sobre los 5 archivos → **0 errores**.
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop).

### Pendiente

API happy/guard de `POST /api/torneos` con SQL real, E2E y la suite de paridad del solver (`F5b2`).

## F3a1 — Validaciones + límites + dispatch + `POST .../agenda`

**Estado**: completado · fecha 2026-11-04 · 4 archivos ✨ (change-map §12 filas #71–74)

### Qué se hizo

| Archivo | Contenido |
|---|---|
| `lib/validations/torneos.ts` | **Solo** los schemas que no pertenecen al cargador (O-m8 / `technical-design-v2` §a.6): `generateAgendaSchema` (`timeLimitMs` number finito opcional **sin rango** — el clamp es server-side, `mipRelGap` 0..1, `force` boolean) y `runQuerySchema` (`include: 'slots'` opcional). El body del import **no** se duplica (sigue en `loader.ts`). `listQuerySchema` **no** se crea: F2b consume `paginationQuerySchema` de `lib/validations/padel.ts` y un alias sin consumidor es indirección pura. |
| `lib/torneos/limits.ts` | Puro (sin DB/Next): `MIN_TIME_LIMIT_MS=30_000`, `DEFAULT_MAX_TIME_LIMIT_MS=240_000`, `MAX_MATCHES=600`, `MAX_CELLS=120_000`, `REAPER_{CLAIM_TIMEOUT=90s, ABANDON=300s, MAX_DISPATCH_ATTEMPTS=2, WORKER_MAX_DURATION=300s, WORKER_CRASH_GRACE=60s, WORKER_CRASH_TIMEOUT=360s}`. `resolveMaxTimeLimitMs(raw = process.env.TOURNAMENT_MAX_TIME_LIMIT_MS)` inyectable (env ausente/`NaN`/≤0 ⇒ default; se recorta a `[30s, 240s]`) y `clampTimeLimit(requested?, maxMs?)` → ausente/`NaN` = techo completo, fuera de rango = recortado. Los `REAPER_*` duplican por valor las constantes ya existentes en `runs.ts` (F0c): **F3a2 (#77) debe consolidarlas importando desde aquí**. |
| `lib/torneos/dispatch.ts` | `dispatchRun(runId, { baseUrl?, secret?, timeoutMs?, workerUrl? })`: `UPDATE … SET dispatchAttempts+1, lastDispatchAt WHERE id AND status='queued'` (un claim previo del worker no cobra intento) → `POST { workerUrl ?? TOURNAMENT_WORKER_URL ?? ${NEXT_PUBLIC_BASE_URL|baseUrl}/api/internal/tournament-worker }` con `x-worker-secret` + `AbortSignal.timeout(5000)`, sin consumir body. **Nunca lanza**: `{ok:false, reason:'not_queued'|'no_worker_url'|'dispatch_error'}` y el reaper cierra el run (R-02). `resolveWorkerUrl()` exportada para tests. |
| `app/api/torneos/[id]/agenda/route.ts` | `runtime='nodejs'`, `dynamic='force-dynamic'`. `guardAdmin` → `padelIdParamsSchema` → `getTournamentById` (**404** ajeno, **409 `archived`**) → body (`{}` si vacío) `generateAgendaSchema` → `buildInstance` → `computeSemaforo` pre-check (**422 `infeasible_occupancy` + `semaforo`, sin crear run**, salvo `force===true`) → `clampTimeLimit` → `createRun` con snapshot `{...tournament.params, timeLimitMs, mipRelGap?}` (**409 `run_active` + `activeRunId`** por 23505 del índice parcial) → `auditCreate('tournament_run', runId, {tournamentId, timeLimitMs, mipRelGap}, ctx)` → `void dispatchRun(runId, {baseUrl: request.nextUrl.origin})` → **202 `{ runId, status:'queued' }`**. |

### Decisiones de alcance

- **Rate limit no aplicado** en este chunk: `lib/rate-limit.ts` expone `checkPublicRateLimit(ip, opts)` con un `Map` compartido por IP con los endpoints públicos (colisión de keys) y un limitador propio exigiría un 5º archivo. La superficie DoS ya está acotada (solo ADMIN + 1 run activo por torneo + R6 del loader). Queda para @auth-security si lo exige `security-checklist.md`.
- El 409 `run_active` resuelve `activeRunId` con `listRecentRuns(id, 5)` **solo en el camino de error** (1 query extra, contrato §6.4 completo); `getCurrentRun` llega en F3a2 (#77).

### Verificación

- `npx tsc --noEmit` → **0 errores**. `npx eslint` sobre los 4 archivos → **0 errores**.
- `npx jest tests/unit/motor-torneo/ tests/unit/validations` → **9 suites / 162 tests verde**.
- ⚠️ **Rojo pre-existente ajeno a F3a1**: `tests/unit/db/tournament-queries.test.ts:192` espera `{ fase: 'previa' }` pero `Partido` usa `phase` (drift F0c↔F1a). Fix de 1 palabra (`fase` → `phase`) en el test; no se tocó por estar fuera de los 4 archivos de este chunk.

### Pendiente

`tests/unit/validations/torneo.test.ts` (#79, F3a2) debe cubrir `generateAgendaSchema` + `clampTimeLimit`; el fix del test F0c; reaper/generate con SQL real (F5b).

## F3a2 — Polling del run + archive + DTO congelado + tests de schemas

**Estado**: completado · fecha 2026-11-04 · 5 archivos (2 ✨ nuevos, 2 ✏️, 1 ✨ test) — change-map §12 filas #75–79

### Qué se hizo

| Archivo | Contenido |
|---|---|
| `app/api/torneos/[id]/runs/[runId]/route.ts` | ✨ `GET`, `runtime='nodejs'`, `dynamic='force-dynamic'`. `guardAdmin` → params (`padelIdParamsSchema.extend({runId: uuid})`) → `<id>?include=slots` (`runQuerySchema`) → `getTournamentById(id, ownerId)` **404 anti-IDOR** → `reapStaleRuns(id)` (reaper perezoso §4.4, **antes** de leer) + `void dispatchRun()` por cada `redispatched` → `getRun(runId,{tournamentId:id,includeSlots})` **404** si el run no es de ese torneo → `200 { run }`. Run no terminal con `?include=slots` ⇒ `slots: []` y `slotsCount: 0`; `error` de Zod ⇒ 400. |
| `app/api/torneos/[id]/archive/route.ts` | ✨ `POST`, `runtime='nodejs'`, `dynamic='force-dynamic'`. `guardAdmin` → `getTournamentById` **404** → `archiveTournament` **409 `already_archived`** (EC-13) → `auditUpdate('tournament', id, {status: old}, {status:'archived'}, ctx)` → **200 `{ archived: true }`**. Nunca DELETE: slots históricos consultables. |
| `lib/db/queries/torneos/runs.ts` | ✏️ **O-m6**: `getCurrentRun(tournamentId)` = último `succeeded\|invalid` (`inArray` + `orderBy createdAt desc` + `limit 1`), sin depender de `listRecentRuns(20)`; `getActiveRun(tournamentId)` = `queued\|running` (a lo sumo 1 por el índice parcial) para el `activeRun` de §6.3. **O-m11-ii**: `RunSummary` **congelado** a §6.6 (`runId,status,engineStatus,objective,mipGap,timeMs,slotsCount,startedAt,finishedAt,error,diagnostics: Diagnosis \| null`) — fuera `tournamentId`/`createdAt`/`dispatchAttempts`. `RunSlot` añade `dayLabel`/`startTime` (join `tournament_blocks` por `(tournamentId, idx)`, sin roundtrip extra: la grilla pinta día/hora, no el idx). Constantes del reaper **consolidadas** en `lib/torneos/limits.ts` (+ alias `RUN_*` re-exportados: cero cambio de superficie). `createRun`/`claimRun`/`finishRun`/`reapStaleRuns` intactos. |
| `app/api/torneos/[id]/route.ts` | ✏️ consume `getCurrentRun`+`getActiveRun` (en paralelo) en vez de `listRecentRuns()`; declara `dynamic='force-dynamic'` (O-m11-i); `counts` sigue **sin `courts`** (vive en `tournament.courts`, `technical-design-v2` §a.3). |
| `tests/unit/validations/torneo.test.ts` | ✨ 18 casos: `generateAgendaSchema` (happy, body vacío, `mipRelGap` 0/1, rechazo fuera de rango y de tipos, `timeLimitMs` **sin** rango — el recorte es server-side), `runQuerySchema` (happy `slots`, vacío, rechazo de otros valores) y `clampTimeLimit`/`resolveMaxTimeLimitMs` (ausente = 240 s, suelo 30 s, techo 240 s, valor en rango, env `60000` baja el techo, env `abc`/`0`/`-1`/`""`/`null` ⇒ 240 s, env >240 s ⇒ 240 s, env <30 s ⇒ 30 s). |

### Decisiones de alcance

- **`meta` no se añade al DTO**: §6.6 no lo define y la fila #77 pide explícitamente "sin campos extra"; el snapshot del run ya vive en `tournament_runs.params`. Lo que pedía el panel (mensaje de re-despacho) se resuelve con `getActiveRun`, no con un campo del DTO.
- **Ownership antes del reaper**: el reaper **escribe**; se valida `getTournamentById(id, ownerId)` primero para no mutar runs de un torneo ajeno.
- **`getActiveRun`** (~8 líneas) en lugar de reutilizar `listRecentRuns(id,5)`: una ventana arbitraria podía omitir el run activo; query directa sobre `idx (tournamentId, status)`.
- `lib/auth/protected-routes.ts` y `lib/api-docs/spec.ts` **no** se tocan aquí (F5a documenta `runs/[runId]` + `archive` junto con el resto de torneos).

### Verificación

- `npx tsc --noEmit` → **0 errores**.
- `npx eslint` sobre los 4 archivos de código + el test → **0 errores / 0 warnings**.
- `npx jest tests/unit/` **completo** → **80 suites / 1081 tests verde** (1063 previos intactos + 18 nuevos).
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop).

### Pendiente

API guard/happy de `GET .../runs/[runId]` y `POST .../archive` con SQL real (F5b), docs OpenAPI + `protected-routes` (F5a).

## F3b — Worker `POST /api/internal/tournament-worker` + hallazgos H1–H7 del security-checklist

**Estado**: completado (parte 2) · fecha 2026-11-04 · 5 archivos (2 ✨ nuevos, 3 ✏️) — change-map §12 fila #34 + security-checklist §10

### Qué se hizo

| Archivo | Contenido |
|---|---|
| `app/api/internal/tournament-worker/route.ts` | ✨ `POST`, `runtime='nodejs'`, `dynamic='force-dynamic'`, **`maxDuration=300`**. Orden estricto §4.1: (1) secreto ausente en env ⇒ **503 `worker_not_configured`** (fail-closed, nunca "sin auth"); (2) header `x-worker-secret` vs `TOURNAMENT_WORKER_SECRET` con `timingSafeEqual(sha256(provided), sha256(expected))` ⇒ **401** sin eco del secreto; (3) Zod `{runId: uuid}` antes del claim ⇒ **400 `invalid_body`**; (4) `claimRun` atómico ⇒ `null` ⇒ **409 `not_claimed`** (idempotente, sin solver); (5) `buildInstance(tournamentId, requestedBy)` + `runEngine` con `clampTimeLimit(params.timeLimitMs)`; (6) `finishRun` en 1 tx según resultado — `succeeded` **con slots**, `invalid` (verify ≠ []) **con slots**, `infeasible` **sin slots**, `failed(solver_error)` si el solver devuelve `error`/`unbounded`; (7) `auditUpdate('tournament_run', …)` actor `run.requestedBy`, try/catch (**H4**); (8) **200 `{ runId, status, timeMs, slotsCount, verifyErrors }`** — cero datos del torneo. Excepción inesperada ⇒ `finishRun('failed', engine_unavailable)` + 500 genérico. Mapa `código de partido → uuid` con 1 SELECT a `tournament_matches` (el motor indexa por `code`; los slots guardan la FK). |
| `app/api/torneos/route.ts` | ✏️ **H2** rate limit `torneos-import:{ip}` (`checkPublicRateLimit` + `ACADEMY_INVITE_MAX/WINDOW_MS` + `rateLimitedResponse`) tras el guard; **H6** pre-check `content-length` > 2 MB ⇒ **413 `payload_too_large`** antes de `request.json()`; **H7** `dynamic='force-dynamic'`. |
| `app/api/torneos/[id]/agenda/route.ts` | ✏️ **H1** rate limit `torneos-agenda:{ip}` tras el guard; **H5** JSON malformado ⇒ **400 `invalid_json`** (antes `.catch(() => ({}))` generaba el run con body vacío). `dynamic` ya estaba. |
| `app/api/torneos/[id]/instancia/route.ts` | ✏️ **H7** `dynamic='force-dynamic'`. |
| `tests/unit/torneos/limits.test.ts` | ✨ 11 casos: `resolveMaxTimeLimitMs` (ausente/`null`/`""`/no numérica/0/negativa/∞ ⇒ 240 s; valor en rango; >240 s ⇒ 240 s; <30 s ⇒ 30 s; lectura de env) + `clampTimeLimit` (sin pedido ⇒ techo, suelo/techo exactos, fuera de rango recortado, NaN/∞ ⇒ techo, redondeo, techo custom) + constantes R6/reaper. |

### Hallazgos del security-checklist

| # | Severidad | Estado | Detalle |
|---|---|---|---|
| H1 | Media | ✅ aplicado | Rate limit `torneos-agenda:{ip}` (10/min) tras el guard en `agenda/route.ts`. |
| H2 | Media | ✅ aplicado | Rate limit `torneos-import:{ip}` (10/min) tras el guard en `torneos/route.ts`. |
| H3 | Media | ✅ aplicado | Secreto: 503 fail-closed, sha256 + `timingSafeEqual`, secreto **antes** del claim, Zod `{runId: uuid}` antes del claim, logs sin secreto. |
| H4 | Media | ✅ aplicado | `auditUpdate('tournament_run', runId, {status:'running'}, {status, slotsCount, timeMs, error}, {userId: run.requestedBy})` tras `finishRun`, en try/catch. |
| H5 | Baja | ✅ aplicado | JSON roto en `POST …/agenda` ⇒ 400 `invalid_json` (ya no se traga como `{}`). |
| H6 | Baja | ✅ aplicado | `content-length` > 2 MB ⇒ 413 `payload_too_large` (umbral del checklist; el cuerpo nunca se parsea). |
| H7 | Baja | ✅ aplicado | `force-dynamic` en `torneos/route.ts` e `instancia/route.ts` (las otras 4 rutas ya lo declaraban, verificadas). |
| H8 | Baja | ⏭️ aceptado | Auditoría no atómica (`auditCreate/Update` fuera de la tx del dominio): patrón heredado y consistente con `courses`/`transitions`. **No se modifica** por decisión del orquestador. |

### Decisiones de alcance

- **Sin `auth()` en el worker** (§4.1): la cookie no es alternativa al secreto; no hay `guardAdmin` ni lectura de `role`.
- **`run.requestedBy` como owner** de `buildInstance` y como actor de auditoría: es la fila reclamada, no se inventa actor. Si la instancia no se puede reconstruir ⇒ `failed(instance_build_failed)`, nunca `404` (el worker no es un endpoint de lectura).
- **Slots**: el motor indexa por `code` de partido y `finishRun` exige la FK `matchId`; el worker resuelve el mapa con 1 SELECT acotado al torneo (no se toca `runs.ts` ni se agrega archivo a `lib/db/queries`).
- **`diagnostics`** se arma con `computeDiagnosis` (contrato `Diagnosis | null` de §6.6) — el run guarda el diagnóstico completo, no solo las métricas del solver.
- **No** se acepta URL/`callbackUrl` desde el body (A10): la URL del worker solo sale de env.

### Verificación

- `npx tsc --noEmit` → **0 errores**.
- `npx eslint` sobre los 5 archivos → **0 errores / 0 warnings**.
- `npx jest tests/unit/` **completo** → **81 suites / 1092 tests verde** (1081 previos intactos + 11 nuevos).
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop).

### Pendiente

`tests/api/torneos/worker-guard.spec.ts` (401 sin header / 401 secreto inválido / 409 `not_claimed` / 503 sin env) y `agenda-happy.spec.ts` (202 → worker con secreto → `succeeded` → slots) — F5b (@qa-release); docs OpenAPI del worker (`Torneos Worker`) en F5a.

---

## F4a — UI de torneos (lista + import)

| Archivo | Contenido |
|---|---|
| `app/(app)/torneos/page.tsx` | ✨ Server component con `await validateAdmin()` (mismo patrón que `app/(app)/rubricas/page.tsx`). Header `h1` + subtítulo y `TournamentImportModal`; renderiza `TournamentList` con `emptyAction` (segunda instancia del modal reutilizada como CTA del estado vacío). Sin lógica de auth client-side. |
| `components/torneos/tournament-list.tsx` | ✨ Client component. `GET /api/torneos?limit=20&cursor=` (G15): `items` + `nextCursor`, "Cargar más", estados loading/error/empty. Cards reutilizando `Card`/`Badge`/`Button` de `components/ui` + `EmptyState` de `components/padel/empty-state.tsx`. Badge de estado: `draft` → Borrador (outline), `agenda_draft` → Agenda generada (default), `archived` → Archivado (secondary). Muestra fechas, counts (`categories`/`teams`/`matches`, `courts`), `updatedAt` y link a `/torneos/[id]`. Escucha `torneos:updated` para recargar tras un import (sin remontar la página). |
| `components/torneos/tournament-import-modal.tsx` | ✨ `Dialog` shadcn/Radix (Escape + foco + overlay gratis). Textarea mono + input `type=file` `.json` (≤2 MB, valida sintaxis con `JSON.parse` antes de aceptar). `POST /api/torneos` con el JSON parseado; 201 → toast Sonner + `router.refresh()` + evento `torneos:updated`; 400/422/413 → `details[]` normalizados (`path` + `message`, soporta `LoaderError` y issues Zod) en `role="alert"` con borde `destructive` (patrón `agenda-week-list.tsx`). Loading con `Loader2Icon`, `aria-describedby` al bloque de errores, `Label` asociados. |
| `components/torneos/tournament-list.tsx` (export) | `TOURNAMENTS_UPDATED_EVENT` compartido con el modal. |

### Componentes/patrones reutilizados
- `validateAdmin` (`lib/auth/admin-guard`) y layout `Section` + `max-w-5xl` de `rubricas/page.tsx`.
- `EmptyState` (`components/padel/empty-state.tsx`), `Card*`/`Badge`/`Button` (`components/ui`), `Dialog*`/`Input`/`Label`/`Textarea` (`components/ui`), toasts Sonner.
- Paginación por cursor y "Cargar más" de `rubric-library.tsx`; modal con `DialogTrigger`/`DialogFooter` y toasts de `create-course-modal.tsx`.
- Colores solo vía CSS variables (`text-muted-foreground`, `border-destructive/40`, `bg-destructive/10`); responsive móvil primero (`sm:grid-cols-2 lg:grid-cols-3`).

### Desviaciones del contrato
- El `TournamentSummary` de `GET /api/torneos` (§6.2, `listTournaments`) expone `counts.categories/teams/matches` y **no** `groups` ni último run. Para no inventar campos ni provocar N+1 con `GET /api/torneos/[id]` por card, la card muestra los counts disponibles, el estado del torneo y `updatedAt` ("Actualizado el …"). El último run se verá en el detalle (`/torneos/[id]`, otro chunk).
- No se tocó `bottom-nav` (fuera de los 3 archivos del chunk); añadir el link a `/torneos` queda para el chunk que edite la navegación.

### Verificación
- `npx tsc --noEmit` → **0 errores**.
- `npx eslint` sobre los 3 archivos → **0 errores / 0 warnings**.
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop).

---

## F4b — Detalle del torneo: instancia + agenda + diagnóstico

| Archivo | Contenido |
|---|---|
| `app/(app)/torneos/[id]/page.tsx` | ✨ Server component. `validateAdmin()` (reutiliza la sesión que devuelve), `getTournamentDetail(id, ownerId)` → `notFound()` si ajeno/inexistente. Carga `getActiveRun` + `getCurrentRun` en paralelo y, si hay run, `getRun(..., includeSlots)` como **estado inicial** del island. Sección *Instancia*: counts (`categories`/`groups`/`teams`/`blocks`/`matches`/`previa`/`cuadro`) + resumen de tramos (día·fase consecutivos, rango horario y casillas). Renderiza `DiagnosticsPanel` como island client; cero lógica de auth en cliente. |
| `components/torneos/agenda-grid.tsx` | ✨ Grilla canchas × bloques (port de `correr.py::escribir_html`): cabecera de 2 filas con `colspan` por día·fase, color por categoría con la paleta `COLORES` del prototipo como constantes, tooltip `title` con el `code` del partido, texto `G1` (previa) / `ronda` (cuadro), fila `Ocup. n/cap`, leyenda de categorías y celdas vacías `·`. `overflow-x-auto` + `sticky left-0` en la columna de cancha, tipografía `text-[11px] sm:text-xs` (legible a 375 px). Contraste: `readableText()` elige texto claro/oscuro (`#edc948` no admite blanco). `caption` sr-only y `scope` en todas las cabeceras. Estado vacío propio. |
| `components/torneos/diagnostics-panel.tsx` | ✨ Client. Botón *Generar/Regenerar agenda* (`aria-busy`, deshabilitado si `archived`), *Actualizar*, banner por estado (cola/progreso, `succeeded` con tiempo y partidos, `invalid` con nº de errores, `infeasible` con causa y sugerencias, `failed` con `error.code/message`, error API con CTA *Generar de todos modos* si 422) y panel: `engineStatus` + `timeLimitReached` derivado de `feasible_time_limit`, objetivo/gap/partidos en extensión, los 6 indicadores (grupos como unidad, mismo día, misma cancha, días por pareja, horario laboral, máx. seguidos), semáforo por fase, errores del verificador (máx. 20 + resto), violaciones de disponibilidad y ocupación por tramo. Estados loading / sin run / run fallido cubiertos. |
| `hooks/use-tournament-run.ts` | ✨ `POST .../agenda` → 202 `{runId}`; polling `GET .../runs/[runId]?include=slots` con backoff 1 s → ×1,5 → techo 5 s, se detiene en estado terminal. Expone `{ run, phase, error, needsForce, generating, generate, refresh }`. Mapea 409 `run_active` (sigue el `activeRunId`) / `archived`, 422 `infeasible_occupancy` (+ `needsForce`) y 503 `worker_not_configured`. Sin cache espejo: cada tick reemplaza el run con la respuesta del servidor. Errores de red no abortan el polling (se relaja a 5 s). Limpieza de timers al desmontar. |

### Decisiones
- El botón "Generar agenda" y el banner viven en `diagnostics-panel.tsx` (único island client del chunk): el `page.tsx` es server y no puede declarar islands sin un quinto archivo.
- Datos iniciales vienen del RSC (`getRun` con `Date`), el polling trae ISO ⇒ el DTO acepta `Date | string | null`.
- Colores de estado con la convención ya usada en el repo (`emerald`/`amber`/`destructive`); paleta de categorías solo del prototipo.
- No se tocó `bottom-nav` ni se agregaron dependencias.

### Verificación
- `npx tsc --noEmit` → **0 errores**.
- `npx eslint` sobre los 4 archivos → **0 errores / 0 warnings**.
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop). Tests E2E/API del detalle quedan para F5 (@qa-release).

---

## F4c — Corrección de las 4 observaciones mayores del design-review-f4

| Archivo | Contenido |
|---|---|
| `next.config.mjs` | ✨ `serverExternalPackages: ["highs"]` como **key raíz** de `nextConfig` (Next 16; la forma anterior `experimental.serverComponentsExternalPackages` quedó obsoleta en 15). `highs` resuelve su `.wasm` por filesystem vía emscripten (`locateFile`/`readFileSync`), así que debe quedar fuera del bundle del server en el worker (`runtime = 'nodejs'`). O-M1. |
| `hooks/use-tournament-run.ts` | ✨ **O-M2**: nueva clase `RunReadError` con `status` HTTP en `readRun`. `pollUntilTerminal` distingue **error HTTP** (401/403/404/5xx) → `setPhase("error")` + `setError(message)` + **return** (detiene el polling, ya no reintenta ∞ cada 5 s) de **fallo de red** (fetch rechazado) → reintenta con backoff hasta `MAX_NETWORK_FAILURES = 6`, luego `phase: "error"` y salida. `refresh()` también pasa a `phase: "error"` ante fallo HTTP. Eliminada la entrada muerta `MESSAGES.worker_not_configured` (O-m4: el 503 es del worker interno, nunca llega a `/agenda`). |
| `lib/constants/navigation.ts` | ✨ **O-M4**: entrada `{ href: "/torneos", label: "Torneos", icon: TrophyIcon }` en `ADMIN_NAV_ITEMS`, tras *Academias* (grupo de trabajo del coach). Único punto de edición: `bottom-nav.tsx` y `app-sidebar.tsx` ya consumen `getNavItems`/`ADMIN_NAV_ITEMS`, así que el link aparece en móvil y desktop sin tocar componentes. `USER_NAV_ITEMS` intacto. |
| `.gitignore` | ✨ **O-M5**: `motor_torneo/.venv/`, `__pycache__/` y `.DS_Store` (evita commitear los 153 MB del venv de referencia en `/supercommitpre`). |

### Decisiones
- Cualquier respuesta HTTP no-2xx del polling se considera **no recuperable** (incluye 5xx): la instrucción es detener, no reintentar; el coach ve el error y usa *Actualizar*/*Generar* manualmente. Sólo el rechazo de `fetch` (red) es transitorio.
- `TrophyIcon` es del mismo set `lucide-react` ya importado en el archivo; no se agregó dependencia.
- No se tocó `diagnostics-panel.tsx`: con `phase: "error"` el panel ya renderiza su banner `role="alert"` (la rama de error precede a la de progreso), por lo que el fallo deja de quedar oculto sin editar el componente.

### Pendiente (fuera de F4c)
- O-M3 (`DiagnosisReport` en OpenAPI + DTO de `RunSummary`) → F5a.
- O-m8 (unit tests de `isTerminalRunStatus`/`useTournamentRun`) → sigue pendiente; el hook no tiene tests hoy.

### Verificación
- `npx tsc --noEmit` → **0 errores**.
- `pnpm run lint` → **0 errores** (solo warnings preexistentes en `tests/`).
- `npx jest tests/unit/` → **81 suites / 1092 tests verdes**.
- No se ejecutó build, Playwright, migraciones ni servidores (anti-loop).

## F5c-fix — BUG-01: desborde horizontal de `AgendaGrid` en móvil (✅ FIXED)

### Causa raíz
No era el `overflow-x-auto` del wrapper, sino la **cadena de flex items**:
`app-layout-client.tsx` → `div.flex.min-h-screen` (row) contiene
`div.flex.flex-1.flex-col`, cuyo `min-width` por defecto es `auto`. El
`max-content` de la tabla (`table.min-w-max`, ~716 px con 38 bloques) se propagaba
hacia arriba como *automatic minimum size*, así que el item flex **se negaba a
encogerse** por debajo de su contenido: `main` → `div.max-w-7xl` →
`div.max-w-6xl` medían 718 px y `document.documentElement.scrollWidth` quedaba en
750 px (2× viewport). `max-w-full` no acota nada cuando el ancestro ya creció.

### Fix (1 archivo de producción)
`components/torneos/agenda-grid.tsx` — el wrapper scrollable pasa de
`max-w-full overflow-x-auto` a **`w-0 min-w-full max-w-full overflow-x-auto`**:
- `w-0` ⇒ el wrapper aporta **0** al `max-content` de los ancestros, así que el
  item flex puede encogerse al viewport (fix auto-contenido: no requiere tocar
  `app-layout-client.tsx` ni ningún otro layout).
- `min-w-full` ⇒ ya en layout (containing block definido) vuelve a ocupar el 100%
  del ancho disponible (343 px a 375 px de viewport, tras `px-4`).
- La tabla **conserva su ancho natural dentro del scroll** (716 px) y la columna
  `Cancha`/`Ocup.` sigue fija (`sticky left-0`): `overflow-x-auto` crea el
  scroll container y el sticky se resuelve contra él. Sin cambios de diseño,
  celdas ni paleta.
- Header `<thead>` no sticky vertical ⇒ sin cambios.

### Verificación
- `tests/e2e/torneo-agenda.spec.ts`: la annotation `bug` se reemplaza por
  aserciones duras — `document.documentElement.scrollWidth ≤ 375`,
  `getComputedStyle(wrapper).overflowX === "auto"` y
  `tableWidth > wrapperWidth` (prueba de que el scroll sigue vivo, no un
  "recorte" que aplaste la tabla).
- Medición con Playwright sobre el código corregido (`next dev`, 375×812, flujo
  import → generar agenda → grilla, `mini.json`):

  | Métrica | Antes | Ahora |
  |---|---|---|
  | `documentElement.scrollWidth` | 750 | **375** ✅ |
  | `body.scrollWidth` | — | **375** ✅ |
  | ancho del wrapper | 718 | **343** |
  | `wrapper.scrollWidth` / `overflowX` | — | **716** / `auto` ✅ |
  | ancho de la tabla | 718 | 716 (dentro del scroll) ✅ |
- `npx tsc --noEmit` → **0 errores**; `npx eslint` en los 2 archivos tocados →
  **0 errores**.
- **Pendiente del orquestador/@qa-release**: el `next start` en `:3000` sirve el
  build anterior a este fix (`.next/BUILD_ID` de `16:27`), por lo que
  `npx playwright test tests/e2e/torneo-agenda.spec.ts` falla en la nueva
  aserción (750) hasta reconstruir. No se ejecutó `next build` (anti-loop).
  Archivos del fix: `components/torneos/agenda-grid.tsx`,
  `tests/e2e/torneo-agenda.spec.ts`.
