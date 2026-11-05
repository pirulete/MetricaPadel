# Feature Spec — Módulo Torneos: motor de agenda en TypeScript (Milestone 1: cargador real + agenda borrador)

> change_id: `2026-11-04-motor-torneo-ts`
> status: `proposed`
> release: `v0.12`
> date: `2026-11-04`
> module: `torneos`
> tags: `[db, api, ui, migration, optimizer]`
> autor: @pm · fuente de decisiones: usuario (cerradas, Engram #1711) + lectura completa de `motor_torneo/` (README, OPERACION, instancia.py, modelo.py, verificar.py, correr.py)

---

## 0. Contraste con FEATURES.md (verificado 2026-11-04)

`grep -ri "torneo|tournament|highs|milp"` sobre el repo: **0 coincidencias fuera de `motor_torneo/`**. La única mención es en `production_artifacts/2026-11-04-class-agenda/release-report.md:61`, que declara `motor_torneo/` como directorio ajeno al change set.

**Conclusión: el módulo Torneos NO existe (ni DB, ni API, ni UI, ni lib).** No hay solapamiento ni deuda parcial que reutilizar. `motor_torneo/` es un prototipo Python de referencia (1372 líneas, 4 `.py` + 2 `.md`) que se queda en el repo como golden reference de comportamiento, no como código de producción.

## 1. Problema

El club arma a mano la agenda de un torneo de 8 categorías / 50 grupos / 155 parejas / 247 partidos sobre 38 bloques de 75 min y 8 canchas. La asignación manual no garantiza: nadie en dos canchas a la vez, precedencias del cuadro (un 4to no puede ir antes que el cierre de sus grupos), disponibilidad declarada por pareja, parejas que vienen la menor cantidad de días, y uso cero de la extensión del domingo.

El prototipo Python demuestra que el problema se resuelve bien como MILP (HiGHS) y que la agenda resultante es verificable, pero **no es producto**:

- `instancia.py` **inventa** los datos (`ESTRUCTURA` hardcodeada, `random.Random(seed)`): no hay cargador real.
- No hay persistencia: escribe `agenda.csv`/`resumen.txt`/`grilla.html` en disco y muere.
- No hay API, no hay UI, no hay estado, no hay roles, no hay auditoría.
- Corre 1–5 minutos ocupando toda la CPU ⇒ no puede vivir dentro del request del servidor web.

## 2. Objetivo

Portar el motor a TypeScript como **módulo independiente** (`lib/motor-torneo/`) sobre HiGHS WASM (`npm highs`), y entregar el **Milestone 1** del producto: un coach importa un torneo real, el sistema arma la instancia desde DB, corre el motor en background y persiste una **agenda borrador** con su diagnóstico, visible en una UI mínima.

**Objetivo medible (M1):** con el caso de referencia (8 categorías, 50 grupos, 155 parejas, 247 partidos, 38 bloques, 8 canchas) el coach obtiene en ≤ 4 min una agenda borrador que pasa el verificador independiente con **0 errores de reglas duras**, persistida en DB, visible en grilla canchas × bloques junto al diagnóstico (semáforo, estado del motor, extensión usada, indicadores).

**Decisiones cerradas (no se re-abren — Engram #1711):**

| # | Decisión |
|---|---|
| D1 | Port TS a `lib/motor-torneo/` con el paquete npm `highs` (WASM; MILP, `time_limit`, `mip_rel_gap`, CSR/CSC, tipado, `getIis()`). |
| D2 | Módulo de DB **independiente**: tablas propias del torneo, **sin FK a `courses` ni a `academies`**. |
| D3 | M1 = cargador real + agenda borrador (schema, API que arma el JSON de entrada, worker, persistencia de borrador + diagnóstico, UI mínima de lectura). |
| D4 | Ejecución en Vercel background functions: `time_limit` ≤ **240 s**, `maxDuration` **300 s**; plan B documentado (contenedor aparte). |
| D5 | El JSON de intercambio de entrada es el de `OPERACION.md` §6 (calendario, canchas, capacidad_especial, categorías, parejas con `no_disponible`). |
| D6 | `instancia.py` es sólo referencia estructural; el cargador real (`loader.ts`) lo reemplaza. |
| D7 | Caso de referencia obligatorio en tests: 8/50/155/247/38. |

**Decisiones abiertas que @pm deja explícitas para @architect (no bloquean la spec, sí la implementación):**

| # | Pregunta | Propuesta @pm |
|---|---|---|
| Q1 | ¿Cómo entran los datos en M1: CRUD completo o import del JSON de §6? | **Import** (`POST` con el JSON canónico) + persistencia normalizada. El CRUD fino de 155 parejas es M2. |
| Q2 | ¿Quién construye los cuadros (brackets)? §6 no los incluye. | Portar `_construir_cuadro` del prototipo como `bracket.ts` determinista y **materializar** `tournament_matches` al importar (auditable y editable en M2). |
| Q3 | Nombre exacto de rutas y tablas. | Los de §5 son propuesta; ningún AC depende del nombre literal. |

## 3. Modelo de dominio (propuesta a validar por @architect/@db-engineer)

Módulo independiente (D2). 10 tablas, todas con prefijo `tournament_`, sin FK salientes al dominio de cursos/academias (sólo `ownerId → users`).

| Tabla | Rol | Campos núcleo |
|---|---|---|
| `tournaments` | Raíz | `ownerId` FK users (no cascade), `name`, `startDate`/`endDate` (date), `status` draft/agenda_draft/archived, `blockMinutes` (default 75), `courts`, `params` jsonb (`fronteraSabado`, `descansoFinal`, `maxSeguidos`, `bloqueFinalObjetivo`, `dobleDuraEn`, pesos `W_*`), timestamps |
| `tournament_blocks` | Calendario materializado (D5) | `tournamentId` FK cascade, `idx` (0..N-1, UNIQUE con tournamentId), `dayLabel` (`Jue|Vie|Sab|Dom`), `startTime` `varchar(5)`, `phase` previa/final, `isExtension`, `capacity` (= canchas o `capacidad_especial`) |
| `tournament_categories` | Categorías | `tournamentId`, `code` (`2da`…`C`), `sex` H/M, `level` int; UNIQUE (tournamentId, code) |
| `tournament_groups` | Grupos del sorteo | `tournamentId`, `categoryId` FK, `code`, `size` (3 \| 4); UNIQUE (categoryId, code) |
| `tournament_persons` | Identidad de persona (clave para doble categoría) | `tournamentId`, `documentId`; UNIQUE (tournamentId, documentId) |
| `tournament_teams` | Parejas | `tournamentId`, `categoryId`, `groupId` FK, `code`; UNIQUE (tournamentId, code) |
| `tournament_team_members` | Personas por pareja (2) | `teamId` FK cascade, `personId` FK; UNIQUE (teamId, personId) |
| `tournament_team_availability` | Bloques no disponibles | `teamId` FK cascade, `blockIdx`; UNIQUE (teamId, blockIdx); sólo bloques de previa |
| `tournament_matches` | Partidos materializados (previa + cuadro) | `tournamentId`, `categoryId`, `phase`, `round` (`grupo|8vos|4tos|semi|final`), `groupId` nullable, `teamAId`/`teamBId` nullable (null en cuadro), `sourceGroups` jsonb, `feeders` jsonb, `code`; UNIQUE (tournamentId, code) |
| `tournament_runs` | Corrida del motor (inmutable) | `tournamentId`, `requestedBy`, `status` queued/running/succeeded/infeasible/failed/invalid, `params` jsonb, `engineStatus`, `objective`, `mipGap`, `timeMs`, `diagnostics` jsonb, `error` jsonb, `startedAt`/`finishedAt` |
| `tournament_agenda_slots` | **Borrador** de una corrida | `runId` FK cascade, `matchId` FK, `blockIdx`, `court`; UNIQUE (runId, matchId) y UNIQUE (runId, blockIdx, court) |

Reglas de integridad:
- Una agenda es **inmutable por corrida** (§`tournament_runs`); "borrador actual" = última corrida `succeeded`/`invalid` del torneo. Regenerar crea otra corrida, no muta la anterior.
- Anti-IDOR: todo acceso filtra por `tournaments.ownerId`; recurso ajeno → **404** (patrón vigente del repo, no 403).
- Auditoría en mutaciones (import, generate, archive) vía `lib/audit/helpers.ts`.
- Migración: **`0014_*`** (la `0013_*` está tomada por la agenda de clases).

## 4. Alcance

### In-scope (M1 / v0.12)

1. **Schema DB independiente** (§3) + migración `0014_*` + verificación post-migración de columnas.
2. **Cargador real** (`lib/motor-torneo/loader.ts`): valida y normaliza el JSON de `OPERACION.md` §6 a entidades persistidas, aplicando las 4 reglas del cargador:
   - cada pareja en exactamente 1 grupo de su categoría;
   - una persona en >1 pareja sólo si son de categorías distintas;
   - `no_disponible` sólo contiene bloques de previa;
   - tope de bloques bloqueados por pareja = 8 de 22.
3. **Derivación de estructura deportiva** (`bracket.ts` + round-robin): partidos de grupo (3 = todos contra todos; 4 = ciclo A-B, B-C, C-D, D-A) y cuadro por categoría (S = potencia de 2 ≥ 2·g, pases libres, sin cruce de mismo grupo en 1ª ronda), materializados en `tournament_matches`. Caso referencia = 155 partidos de previa + 92 de final = **247**.
4. **Instancia canónica** (`lib/motor-torneo/instancia.ts`): `buildInstance(tournamentId)` lee DB y produce el objeto `Instancia` (bloques con capacidad, parejas, personas, partidos, `partidos_potenciales`). Se expone como JSON espejo del input para auditoría/debug del coach.
5. **Port del motor** (puro, sin imports de DB ni de Next):
   - `modelo.ts` — variables `x[m,b]`, R1 (una casilla por partido), R2 (capacidad por bloque), R3 (persona en ≤1 partido por bloque, previa exacta + camino potencial en final con `dobleDuraEn` duro y resto blando), R4 (disponibilidad), R5 (precedencias acumuladas con `sep = 1 + descansoFinal`), objetivo completo con todos los pesos `W_*`, `PARAMS` tipados y sobreescribibles.
   - `canchas.ts` — asignación voraz post-motor (grupo repite cancha del bloque anterior; cuadro hereda cancha de un alimentador).
   - `verificar.ts` — verificador **independiente** (no reutiliza el modelo), 6 reglas duras.
   - `diagnostico.ts` — semáforo de admisión (verde <0.85 / amarillo 0.85–1.0 / rojo >1.0 por fase, excluyendo extensión), indicadores de calidad del `resumen.txt` (grupos como unidad, grupos en un día, grupos en una cancha, parejas 1 día, partidos en horario laboral, máximo de bloques seguidos, finales y primer partido de cuadro por categoría, choques posibles de doble categoría).
6. **API (guard `guardAdmin`)** — contratos propuestos (Q3):
   - `POST /api/torneos` — import del JSON §6 → torneo + estructura persistida (transaccional, todo o nada).
   - `GET /api/torneos` — listado con cursor (patrón G15) del dueño.
   - `GET /api/torneos/[id]` — detalle + último run + metadata de bloques/canchas.
   - `GET /api/torneos/[id]/instancia` — JSON canónico reconstruido desde DB (espejo de entrada).
   - `POST /api/torneos/[id]/agenda` — pre-check de semáforo + crea `run` `queued` y dispara el worker; responde **202** con `runId` (nunca bloquea el request).
   - `GET /api/torneos/[id]/runs/[runId]` — estado + diagnóstico (+ `slots` si terminó).
   - `POST /api/torneos/[id]/archive` — soft archive.
   - (Worker) invocación server-to-server con secreto interno; el route handler del worker no se expone a `guardAdmin` sino a un header `x-worker-secret` (`TOURNAMENT_WORKER_SECRET`).
7. **Worker**: corre el motor con `time_limit ≤ 240 s`, `mip_rel_gap` configurable, actualiza `running` → `succeeded`/`infeasible`/`failed`/`invalid`, persiste slots + diagnóstico en **una transacción** (nunca agenda parcial). Reaper de runs colgados (`running` > `maxDuration + margen` → `failed`).
8. **UI mínima (coach)**: `/torneos` (lista + import), `/torneos/[id]` (botón "Generar agenda", estado del run con polling, grilla canchas × bloques coloreada por categoría, panel de diagnóstico y semáforo, banner rojo si el verificador reportó errores). Estados: loading, empty, error, corriendo, infeasible, invalid. Responsive 375 px sin scroll horizontal.
9. **Docs + tests**: `lib/api-docs/spec.ts` (+ `paths/torneos.ts`, `schemas/torneo.ts`), `lib/auth/protected-routes.ts`, `FEATURES.md`, unit + API (happy-path con SQL real) + E2E.

### Out-of-scope (M1) — explícito

- **Re-planificación día-T** (partidos jugados/inminentes fijados + penalización por mover lo publicado).
- **Modo relajado BR-04 avanzado** (publicar violando disponibilidades, listar violaciones, `getIis()`, núcleo mínimo de restricciones en conflicto). M1 sólo reporta `infeasible` + semáforo + causa probable.
- **Publicación con edición manual de slots** (mover un partido a mano, publicar, congelar).
- **Inscripción self-service de alumnos** (el alumno no crea parejas ni marca disponibilidad; el coach importa todo).
- **Re-planificación durante el torneo** (tras cada ronda, WO, retiro) y cualquier captura de resultados.
- Vista de agenda para `USER` (`guardUser`) — no hay publicación en M1, por lo tanto no hay ruta de alumno.
- Affinity con `courses`/`academies`, cuotas, categorías de precio, ranking, puntos, premiación.
- Sustituir HiGHS por CP-SAT/OR-Tools; `getIis()`; solver tuning adaptativo.
- Export `agenda.csv` / `grilla.html` / PDF (la grilla es UI, no archivo descargable).
- Notificaciones push/inbox, cron, recordatorios de partido.
- Edición de la estructura deportiva (mover pareja de grupo, re-sembrar el cuadro) — M2.
- Multi-tenant por academia y permisos por academia.

## 5. Acceptance Criteria (13, verificables)

- **AC-01 · Schema independiente**: migración `0014_*` crea las tablas de §3 con enums (`tournament_status`, `tournament_phase`, `tournament_run_status`, `tournament_match_round`), UNIQUE e índices (`tournamentId`+`status`, `runId`+`blockIdx`, `teamId`+`blockIdx`); **cero FK a `courses`/`academies`**; verificación de columnas con `information_schema` post-`db:migrate`. Unit tests de schema/queries.
- **AC-02 · Cargador valida (no inventa)**: importar el JSON de §6 del caso de referencia persiste 8 categorías, 50 grupos, 155 parejas, 155 personas-documento únicas, 247 partidos y 38 bloques. Cada violación de las 4 reglas del cargador (§4.2) → **400** con `path` del campo culpable y **rollback total** (0 filas escritas). Cubierto por unit (Zod + reglas) y API (SQL real).
- **AC-03 · Estructura derivada correcta**: grupos de 3 → 3 partidos; grupos de 4 → 4 partidos con cada pareja exactamente 2 veces; cuadro = potencia de 2 ≥ 2·g con pases libres, sin cruce de mismo grupo en 1ª ronda, `feeders` acíclicos y `sourceGroups` coherentes. Tests unitarios con casos 6/7/8 grupos (2da, 5ta, 8 categorías completas) + snapshot de conteo por categoría (total 92).
- **AC-04 · Instancia espejo**: `buildInstance()` sobre el torneo importado devuelve un objeto estructuralmente equivalente al JSON de entrada normalizado (bloques con `capacity`, `no_disponible` sólo previa, personas con sus parejas) ⇒ round-trip import→build sin pérdida. Unit test de round-trip + test API del endpoint de instancia.
- **AC-05 · Port fiel del modelo**: `lib/motor-torneo/**` no importa `lib/db`, `next/*` ni `server-only` (test estático de imports). Cada regla dura tiene test unitario que **detecta su violación** (una casilla por partido, capacidad por bloque, persona en dos partidos, disponibilidad, precedencia, fase). El verificador es independiente: sus tests no importan `modelo.ts`.
- **AC-06 · Agenda borrador verificada**: correr el motor sobre el caso de referencia produce agenda con todas las casillas llenas, `verificar()` con **0 errores**, ocupación por bloque ≤ `capacity`, canchas únicas por bloque, y `slots` = 247 filas. Si `engineStatus = time_limit`, la agenda se acepta igual y se marca `timeLimitReached: true`. Persistencia en una transacción (0 slots si falla).
- **AC-07 · Diagnóstico persistido y completo**: el run guarda semáforo por fase (verde/amarillo/rojo con ρ), `engineStatus`, objetivo, `mipGap`, `timeMs`, errores del verificador, partidos en extensión y los 6 indicadores de calidad. Unit tests de `diagnostico.ts` con instancias sintéticas (incluye caso ρ > 1 → rojo).
- **AC-08 · Lifecycle asíncrono + concurrencia**: `POST .../agenda` responde **202** con `runId` en < 2 s; un segundo POST con run activo → **409**; estados `queued→running→succeeded|infeasible|failed|invalid` sin saltos inválidos; run `running` colgado > `maxDuration + 60 s` se marca `failed` por el reaper; `infeasible` no escribe slots. API test con SQL real del happy-path y del 409.
- **AC-09 · Límites de tiempo y memoria**: `timeLimitMs` se clampa server-side a `[30_000, 240_000]` (§D4) y `maxDuration = 300` en la config de la función; si el proceso muere, el run termina `failed` con `error.code` y la UI muestra reintento, nunca "running" eterno. Unit test del clamp; test de que un `timeLimitMs` inválido en el body no lo bypassa.
- **AC-10 · Guards y anti-IDOR**: `guardAdmin` (ADMIN/SUPER_ADMIN + ACTIVE) en todas las rutas de torneos; `USER`/`TEMPORARY` → **403**; sin sesión → **401**; torneo de otro coach → **404**; `LOCKED` nunca pasa. El worker exige secreto y rechaza invocación sin él (401). Tests de guard por ruta en `tests/api/torneos/` (401/403/404).
- **AC-11 · UI mínima usable**: `/torneos` y `/torneos/[id]` renderizan grilla canchas × bloques con color por categoría, tooltip con código de partido, semáforo, panel de diagnóstico y banner `invalid`; estados empty/loading/error/corriendo con polling que se detiene al terminar; a 375 px sin scroll horizontal. **1 E2E navegable** (`tests/e2e/torneo-agenda.spec.ts`) cubre import → generar (motor stubbeado o fixture) → ver grilla.
- **AC-12 · Gates del repo**: unit (Jest, `tests/unit/motor-torneo/*.test.ts` + `tests/unit/db/tournament-*.test.ts`), **≥1 API happy-path con SQL real por endpoint** en `tests/api/torneos/*-happy.spec.ts`, guards en `*-guard.spec.ts`, E2E; `lib/api-docs/spec.ts` con todos los endpoints; `tsc`=0; `lint`=0 errores; `build` OK; cobertura del módulo sin regresión > 3 %; entrada en `FEATURES.md` con metadata completa.
- **AC-13 · Aislamiento del dominio existente**: ningún cambio de comportamiento en `courses`, `class_blocks`, `evaluations`, `rubrics`, academias ni notificaciones (sus suites siguen verdes); no se crea ruta para `USER`; `motor_torneo/` (Python) queda intacto como referencia y **no** se importa desde producción.

## 6. Edge Cases

| # | Caso | Comportamiento esperado |
|---|---|---|
| EC-01 | Ocupación roja (ρ > 1, no cabe) | Pre-check antes de gastar CPU: **422** con semáforo por fase, sin crear run. `force: true` (opcional, decisión @architect) permitiría correr y terminar `infeasible` |
| EC-02 | Infeasible real (disponibilidades incompatibles) | Run → `infeasible` con diagnóstico y causa probable (ocupación / disponibilidad / camino crítico); **0 slots** persistidos; UI muestra "no hay agenda que cumpla las reglas" y sugerencias, no un error genérico |
| EC-03 | Distribución de tiempos: `time_limit` alcanzado | Agenda válida persistida + `timeLimitReached`; el diagnóstico aclara "mejor encontrada en N s", nunca se presenta como óptima |
| EC-04 | Verificador independiente reporta errores | Run → `invalid`; slots **sí** se guardan para depurar pero la UI los marca en rojo y bloquea cualquier uso futuro (no publicable). Es un bug del port, no del dato |
| EC-05 | Pareja con > 8 bloques bloqueados | **400** en import con la lista de parejas infractoras (regla del formulario, §6 OPERACION) |
| EC-06 | `no_disponible` con bloque de fase final o índice inexistente | **400** con `path` exacto (`parejas[p101].no_disponible[2]`), rollback total |
| EC-07 | Persona en 2 parejas de la **misma** categoría | **400** (sólo doble categoría entre categorías distintas); persona repetida en la misma pareja también 400 |
| EC-08 | Grupo de tamaño ≠ 3/4, grupo vacío, pareja sin grupo | **400**; nunca se deriva estructura con datos incompletos |
| EC-09 | Calendario solapado (dos tramos mismo día con horas que se pisan) o `capacity` > canchas | **400**; `capacidad_especial` fuera de rango o con bloque inexistente → **400** |
| EC-10 | Re-import sobre un torneo con runs | **409** (la agenda es inmutable); el coach crea un torneo nuevo. Nunca se borra historial |
| EC-11 | Doble click en "Generar agenda" | UNIQUE de run activo + check transaccional ⇒ **409**, 1 solo run |
| EC-12 | Worker cae / timeout de función / OOM WASM | Run → `failed` con `error.code` (`timeout`, `worker_crash`, `solver_error`); reaper cubre el caso de proceso muerto sin cleanup; botón reintentar disponible |
| EC-13 | Torneo archivado | Sólo lectura; `POST .../agenda` → **409**; instancia y agenda histórica siguen consultables |
| EC-14 | Instancia más grande que la de referencia (p. ej. 300 parejas / 400 partidos) | Límite duro de tamaño (partidos y casillas) validado en import/run → **422** con mensaje de capacidad, en vez de morir por memoria en la función |
| EC-15 | Motor WASM no carga (bundle/cold start) | `failed` con `error.code = engine_unavailable` y log claro; la UI no queda en `running` |
| EC-16 | Calendario sin bloques de una fase pero con partidos de esa fase | Semáforo infinito → se reporta **rojo** explícito ("0 casillas"), no división por cero |
| EC-17 | Zona horaria / cambio de hora | Los bloques son hora local del club (`dayLabel` + `startTime` strings): el motor **no** hace aritmética de fechas ni usa `Date`; sin dependencia de `APP_TIMEZONE` en M1 |
| EC-18 | Torneo con 1 sola categoría / 1 grupo / 1 pareja | Debe degradar sin crash: cuadro con pases libres, agenda válida o `infeasible` explicado |

## 7. Dependencias

- **Nueva dependencia npm**: `highs` (WASM) — decisión cerrada D1. Requiere revisión de @architect en `audit_deps` (licencia, tamaño de bundle, runtime `nodejs` — **no edge**).
- **@db-engineer**: migración `0014_*`, 10 tablas + 4 enums + índices, `lib/db/queries/torneos/*`, verificación de columnas post-migración.
- **@architect**: cerrar Q1/Q2/Q3, contrato del worker (invocación, secreto, reaper), política de tamaño máximo, config `maxDuration`/`memory` de la función, plan B contenedor.
- **@auth-security**: `guardAdmin` en 7 rutas, secreto de worker, anti-IDOR 404, auditoría de import/generate/archive, revisión de superficie (nuevo endpoint con WASM = riesgo de DoS por CPU ⇒ sólo ADMIN).
- **@app-engineer**: API + worker + hooks + UI mínima + tests.
- **`lib/audit/helpers.ts`**: eventos de torneo (import / generate / archive).
- **`lib/api-docs/spec.ts`** y `lib/auth/protected-routes.ts`.
- **Variables de entorno nuevas**: `TOURNAMENT_WORKER_SECRET` (worker), `TOURNAMENT_MAX_TIME_LIMIT_MS` (default 240000). Documentar en `.env.example`. Sin tocar `.env.local` de forma destructiva.
- **Referencia**: `motor_torneo/*.py` sólo como golden reference; `highs` API verificada previamente (`time_limit`, `mip_rel_gap`, CSR/CSC, `getIis()`).

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| WASM HiGHS en Vercel: tamaño de bundle / cold start / memoria | Alto (bloquea D4) | Spike temprano (F1) que corre el caso de referencia dentro de la función; si no cabe → plan B contenedor ya documentado |
| `maxDuration = 300` vs `time_limit = 240` + overhead de persistencia | Alto (agendas truncadas) | Margen 60 s; persistencia transaccional corta; medir tiempo total del run, no sólo del solver |
| Fidelidad del port (restricciones R5 acumuladas son sutiles) | Alto (agenda inválida) | Verificador independiente + tests por regla + comparación de indicadores contra el prototipo en el caso de referencia |
| No determinismo entre versiones de HiGHS | Medio (tests frágiles) | Los AC validan **validez + indicadores con tolerancia**, nunca igualdad exacta de agenda |
| Estructura deportiva derivada ≠ reglamento real del club (seeding/bye) | Medio (cuadro "raro") | Q2 explícito; materializar partidos permite corregir en M2 sin re-correr el motor |
| Explosión de variables `x[m,b]` (247 × 38 ≈ 9.4k, pero R5 acumuladas crecen) | Medio (memoria/tiempo) | Límite de tamaño (EC-14), `time_limit` acotado, medir en F1 |
| Scope creep hacia re-planificación/publicación | Alto | Out-of-scope explícito §4 |
| Change set > 5 archivos por fase | Loops de implementación | Fases F0–F6 con chunks ≤ 5 archivos + cross-agent review |
| Cobertura: el port es lógica pura (bien cubierta) pero la UI viene sin tests de lógica | Medio (gate `--coverage`) | Extraer semáforo/indicadores a `diagnostico.ts` (puro, Jest); E2E para la grilla |
| `motor_torneo/` Python permanece en el repo y se importa por error | Bajo | AC-13 + nota en README; no se agrega al bundle |

## 9. Fases sugeridas (para @architect)

| Fase | Contenido | Agente |
|---|---|---|
| F0 | Schema + migración `0014_*` + queries base | @db-engineer |
| F1 | **Spike WASM** (caso de referencia corriendo en función) + `types.ts`/`modelo.ts`/`verificar.ts` puros | @architect + @app-engineer |
| F2 | `loader.ts` + `bracket.ts` + `instancia.ts` + `diagnostico.ts` + import API | @app-engineer + @db-engineer |
| F3 | Run API + worker + reaper + auditoría + guards | @app-engineer + @auth-security |
| F4 | UI mínima (lista, detalle, generar, grilla, diagnóstico) | @app-engineer |
| F5 | Tests (unit/API happy+guard/E2E) + `lib/api-docs` + FEATURES.md | @qa-release |

**Bloqueo duro**: F1 no se cierra si el caso de referencia no corre dentro de la función con `time_limit` 240 s. Si falla → no se implementa M1 en Vercel; se activa plan B (contenedor) y se re-spec.
