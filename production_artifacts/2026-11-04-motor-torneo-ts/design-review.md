# Design Review — Cross-Agent Review (post-F2b)

> change_id: `2026-11-04-motor-torneo-ts`
> revisor: @app-engineer (modo revisión de viabilidad, solo lectura)
> fecha: `2026-11-04`
> alcance revisado: F0a–F2b (DB, motor puro, import/list/detail/instancia)
> fuentes: `technical-design.md` §5 y §6 completos, `change-map.md`, `app-notes.md`, `gate-f1-report.md`, `migration-notes.md`, árbol de trabajo actual
> verdicto: **VIABLE — sin riesgo de regresión sobre features existentes**; 1 bloqueante de release (proceso), 2 mayores (tests), 11 menores.

---

## 0. Método

1. Contraste endpoint por endpoint contra §6 (métodos, guards, códigos, forma de respuesta).
2. Chequeo de no-regresión: `git status --short` / `git diff --stat` / `git diff` de `lib/db/schema.ts`, `drizzle/0014_*.sql`, `lib/auth/protected-routes.ts`, `lib/api-docs/spec.ts`, imports de `lib/motor-torneo/**`.
3. Coherencia interna: tipos route ↔ queries (`npx tsc --noEmit` sobre todo el repo), invocación del reaper, mapeo de códigos del loader (§5) a 400/422.
4. Este artifact es el único archivo escrito; **no se modificó código**.

---

## (a) Verificación por endpoint

### Implementados (F2b)

| # | Endpoint | Contrato §6 | Guard / IDOR | Códigos | Forma de respuesta | Resultado |
|---|---|---|---|---|---|---|
| 1 | `POST /api/torneos` | §6.1 | `guardAdmin` ✅ · scoped a `session.user.id` ✅ | 201 ✅ · 400 ✅ (`invalid_json`, Zod/`invalid_schema`, R1–R5 con `path`) · **422 ✅** (`instance_too_large`, `match_without_allowed_block`) · **409 ❌ sin camino** | `{ tournamentId, counts{blocks,categories,groups,teams,persons,matchesPrevia,matchesFinal,matches}` }` ✅ exacto | **✅ con 1 desviación de contrato** (O-m2) |
| 2 | `GET /api/torneos` | §6.2 | `guardAdmin` ✅ · filtra `ownerId` ✅ | 200 ✅ · 400 query inválida ✅ | `{ items, nextCursor }` con cursor G15 sobre `updatedAt` ✅ | **✅** |
| 3 | `GET /api/torneos/[id]` | §6.3 | `guardAdmin` ✅ · `getTournamentDetail(id, ownerId)` ⇒ ajeno = 404 ✅ (nunca 403) | 200 ✅ · 404 ✅ (+400 uuid malformado, extra inocuo) | `{ tournament, counts, blocks[6 campos], activeRun, currentRun }` — **falta `counts.courts`** (§6.3 lo lista) | **✅ con 1 desviación** (O-m1) |
| 4 | `GET /api/torneos/[id]/instancia` | §6.3 / AC-04 | `guardAdmin` ✅ · `buildInstance(id, ownerId)` ⇒ 404 ✅ | 200 ✅ · 404 ✅ | `{ instancia }` (bloques con `capacity`, parejas con `bloqueados`, personas con parejas, partidos con `gruposOrigen`/`alimentadores`) ✅ AC-04 | **✅** (el comentario del handler promete "re-importable" y `Instancia` no lo es; ver O-m11) |

Detalles verificados que sí cumplen:

- **Atomicidad AC-02**: `importTournament` envuelve torneo + 8 tablas en una sola `db.transaction`; `validateImport` corre antes (0 filas si falla).
- **Auditoría**: `auditCreate('tournament', id, counts)` tras el commit, con `extractRequestContext` ✅ (§6.1).
- **Anti-IDOR**: todas las lecturas reciben `ownerId`; recurso ajeno ⇒ `null` ⇒ 404.
- **Reaper perezoso §6.3/§4.4**: `reapStaleRuns(id)` se invoca en el detalle **antes** de `listRecentRuns` ✅, idempotente (cada `UPDATE` re-filtra por `status`), barato (1 SELECT sobre `(tournamentId,status)`), y **no** rompe el GET si no hay nada vencido. `redispatched` se ignora a propósito (dispatch = F3a, documentado en el handler y en `app-notes.md` §F2b-5).
- **Mapeo de errores del loader (§5)**: `UNPROCESSABLE_CODES = {instance_too_large, match_without_allowed_block}` ⇒ 422; todo lo demás ⇒ 400 con `details[].path` (`parejas[p101].no_disponible[2]`) ✅. Única arista: O-m5.
- **Motor fuera del bundle**: ninguna route importa `solver.ts`/`highs` todavía (solo `loader.ts`, que importa `zod` + `calendar` + `bracket`) ⇒ hoy no hay riesgo de que el `.wasm` entre al build. Ver O-m12.

### Diseñados y NO implementados (deuda aceptada por fase)

| Endpoint | Fase | Verificable hoy |
|---|---|---|
| `POST /api/torneos/[id]/agenda` (202/404/409/422, clamp, dispatch) | F3a | ❌ no existe |
| `GET /api/torneos/[id]/runs/[runId]` (200/404, `?include=slots`, reaper) | F3a | ❌ no existe (la query `getRun` sí está lista y testeada) |
| `POST /api/torneos/[id]/archive` (200/404/409) | F3a | ❌ no existe (la query `archiveTournament` sí está) |
| `POST /api/internal/tournament-worker` (200/401/409/503, `maxDuration=300`) | F3b | ❌ no existe (claim/finish listos y testeados) |
| `lib/torneos/{dispatch,limits}.ts` | F3a | ❌ no existen |

⇒ **§6.4, §6.5, §6.6 y §6.7 no son evaluables en esta revisión**; el 422 de agenda (`infeasible_occupancy`) y el 409 `run_active`/`archived` quedan pendientes por diseño, no por incumplimiento.

---

## (b) Observaciones clasificadas

### 🔴 [bloqueante] 1

**O-B1 · GATE F1 se ejecutó en local, no en una invocación real de Vercel.**
`technical-design.md` §12.1 exige medir wall time, RSS, cold start WASM y tamaño del chunk server **dentro de Vercel** y lo declara "bloqueante, no negociable"; `gate-f1-report.md` documenta "local approximada" (decisión explícita del usuario) y deja pendiente wall/bundle/cold-start reales, y `next build` con `highs` tampoco se ejecutó. Los valores locales son holgados (241 s wall, 378 MB, ~1.4 s cold start, 3.7 MB paquete), pero **no prueban el runtime de producción** (240 s de solver + overshoot medido de 1.5 s en el host; una lambda con menos CPU puede exceder `maxDuration=300`). No bloquea F3a/F3b (el worker no existe aún) — **bloquea el release v0.12** y el paso a F4 si el deploy no valida.

### 🟠 [mayor] 2

**O-M1 · Falta la red de tests de la lógica pura exigida por §9.1 (y por el gate "no merge sin tests de lógica de negocio").**
Existen `purity.test.ts`, `calendar.test.ts`, `bracket.test.ts` (45 tests) + `tournament-queries.test.ts` (33). **No existen**: `model.test.ts` (L3), `verify.test.ts` (6 reglas con agendas corruptas), `loader.test.ts` (R0–R6 con `path` exacto, EC-05..EC-09), `diagnostics.test.ts` (semáforo/ρ>1/0 casillas), `validations/torneo.test.ts`. El `loader.ts` ya está **expuesto en producción** por `POST /api/torneos` y su validación de negocio (1.232 líneas de módulo) solo se verificó con un smoke manual (`tsx`) según `app-notes.md` §F2a. `app-notes.md` lo reconoce como pendiente, pero el change-map lo asigna a F1b/F1c/F2a, ya declaradas completadas ⇒ **deuda no aceptada, es un gap real**.

**O-M2 · Paridad L2/L3 sin red automática.**
`tests/fixtures/torneo/model-stats.json` (nVars 5020 / nRest 6604 / nNonZeros 56683) **solo lo consume `scripts/torneo-smoke.ts`** (manual). No existe `python-run.json` ni `tests/unit/motor-torneo/solver-parity.test.ts`, así que AC-06 y §10.2 (L2: `verify()===[]`, 247 slots, extensión 0, tolerancias de indicadores) no se verifican en CI. Riesgo concreto: una regresión en R5 acumulada o en `objective.ts` (P-1) pasaría verde en la suite.

### 🟡 [menor] 11

| # | Observación | Evidencia |
|---|---|---|
| O-m1 | `GET /api/torneos/[id]` no devuelve `counts.courts` que §6.3 declara en `counts` (sí está `tournament.courts`, así que es solo forma del contrato). | `app/api/torneos/[id]/route.ts:60`; `lib/db/queries/torneos/tournaments.ts:53-61` |
| O-m2 | §6.1 anuncia `409 {code:'runs_exist'}` (y §4.3 "re-import sobre torneo con runs → 409"), pero `POST /api/torneos` **siempre crea un torneo nuevo** ⇒ el 409 no tiene camino; `assertNoRuns` queda exportada sin consumidor (código muerto hasta M2). Inconsistencia de diseño, no de código. | `technical-design.md` §6.1/§4.3 vs `tournaments.ts:292` |
| O-m3 | §6.1 acepta `meta.blockMinutes` 30..120, pero el loader **rechaza cualquier valor ≠ 75** con `invalid_schema`. El contrato debe estrecharse a `75` (o documentar la limitación en el schema OpenAPI). | `lib/motor-torneo/loader.ts:144,203-209` |
| O-m4 | §6.1 declara `dia: 'Jue'\|'Vie'\|'Sab'\|'Dom'`; la implementación acepta `string(1..3)` (decisión razonable, documentada en `app-notes.md`, pero el contrato §6.1 no se actualizó ⇒ F5 documentará mal el enum). | `lib/motor-torneo/loader.ts:138-143` |
| O-m5 | Si el loader acumula errores de ambas clases, el handler responde **422** y copia `code = errors[0].code`, que puede ser un código 400 (`duplicate_team`) ⇒ status y `code` incoherentes. Fix: elegir el primer error 422 o devolver `code: 'invalid_instance'` + `details`. | `app/api/torneos/route.ts:86-98` |
| O-m6 | `currentRun` se busca entre los **20 runs más recientes** (`listRecentRuns` default). Con ≥20 runs posteriores al último `succeeded\|invalid`, `currentRun = null` aunque exista agenda (`status = agenda_draft`). Fix: query directa del último `succeeded\|invalid`. | `app/api/torneos/[id]/route.ts:37-43`; `runs.ts:387-398` |
| O-m7 | Falta `lib/motor-torneo/index.ts` (barrel, change-map #27, F2b). Sin impacto funcional (los handlers importan `loader` directo), pero el change-map lo marca como entregable de esta fase. | `ls lib/motor-torneo` |
| O-m8 | Falta `lib/validations/torneos.ts` (#35, F2a); el body lo valida `loader.ts` (decisión documentada, Ponytail). Consecuencia: `tests/unit/validations/torneo.test.ts` no tiene módulo objetivo y F3a sí necesitará el archivo para `generateAgendaSchema`/`runQuerySchema`. | `app-notes.md` §F2b-1 |
| O-m9 | `.env.example` todavía **no** documenta `TOURNAMENT_WORKER_SECRET`, `TOURNAMENT_MAX_TIME_LIMIT_MS`, `TOURNAMENT_WORKER_URL` (§7 / #14). Asignado a F5c, pero F3b no será configurable sin ellas. | `git diff .env.example` (solo la línea de `APP_TIMEZONE` de v0.11) |
| O-m10 | Fixtures divergen del change-map §9: no hay `tests/fixtures/torneo/reference/` (colapsado, documentado), ni `python-run.json`, ni `instance-seed3.json`/`python-run-seed3.json`, ni **`mini.json`** — este último es dependencia dura de F5b (API happy-path <1 s) y F5c (E2E). | `ls tests/fixtures/torneo` |
| O-m11 | Nits de conformidad: (i) `dynamic = 'force-dynamic'` de change-map §4 no se declara en los 3 handlers (inerte: `auth()` los hace dinámicos); (ii) `RunSummary.diagnostics` es `unknown` y el DTO expone campos extra (`tournamentId`, `createdAt`, `dispatchAttempts`) vs `Diagnosis \| null` de §6.6 — aditivo, pero conviene fijar el DTO en F3a; (iii) el comentario de `instancia/route.ts` promete "exportar-corregir-reimportar" aunque `Instancia` no es el JSON canónico de §6.1. | `route.ts:10,20,35`; `runs.ts:93-108`; `instancia/route.ts:10-18` |

---

## (c) Archivos tocados fuera del change-map

### c.1 · De esta iniciativa (revisar intención)

| Archivo | Situación | Veredicto |
|---|---|---|
| `motor_torneo/` (untracked, prototipo Python ~1.372 líneas + `.venv`) | Referencia congelada (§14 la menciona para el README) pero **no figura como archivo del change-map** | Confirmar que se commitea como referencia (tamaño/licencia); si no, excluirla. `.DS_Store` untracked suelto |
| `tests/fixtures/torneo/*` | Change-map §9 los ubica en `reference/` + `mini.json` | Ver O-m10 (documentado) |
| `ARCHITECTURE.md` / `FEATURES.md` | §14 (F5) — ya escritos con sección v0.12 | ✅ pero la entrada de `FEATURES.md` sigue en `status: proposed`, dice "10 tablas" y nombres de archivo irreales (`modelo.ts`, `canchas.ts`, `verificar.ts`) ⇒ F5c debe reescribirla |
| `drizzle/meta/0014_snapshot.json`, `drizzle/meta/_journal.json` | Generados por `db:generate` (#2) | ✅ `idx 14`, `when` > `0013` |
| `.validation/*` (baseline, evidence, loop-metrics, status) | Bookkeeping del harness | ✅ esperado |

### c.2 · De otra iniciativa en el mismo árbol (NO son de este change)

`class-agenda` v0.11 (sin commit) contamina el `git status`: `.env.example`, `components/padel/{course-detail,student-course-detail,student-dashboard}.tsx`, `lib/db/queries/padel/{courses,index}.ts`, `tests/unit/db/courses.test.ts`, `drizzle/0013_*`, `hooks/use-class-agenda.ts`, `lib/validations/class-agenda.ts`, `app/api/{courses/[id]/agenda,student/agenda}`, `lib/api-docs/{paths,schemas}/{class-agenda,student-agenda}.ts`, `lib/notifications/agenda.ts`, etc.
**Verificado**: el diff de `lib/api-docs/spec.ts` y de `lib/auth/protected-routes.ts` corresponde **íntegramente** a esas rutas de agenda — **no hay ninguna entrada `torneo`** en ellos ⇒ F3b/F5 siguen intactos como exige el plan. ✅

### c.3 · Verificación de no-regresión (todo ✅)

- `lib/db/schema.ts`: **solo aditivo**. Único cambio en una línea existente: el import de `drizzle-orm/pg-core` (+`date`, requerido por v0.11). Se añaden 4 enums + 11 tablas `tournament_*` + relations + tipos al final del archivo. **Cero columnas/tablas existentes modificadas** (`git diff | grep '^-'` devuelve solo esa línea de import).
- `drizzle/0014_spooky_puppet_master.sql`: 59 statements, **0 DDL sobre tablas ajenas**; índice `tournament_runs_active_uq` emitido **parcial** (`WHERE status in ('queued','running')`) y verificado por catálogo en `migration-notes.md` §3.
- **Sin imports rotos**: `lib/motor-torneo/**` solo es importado por código nuevo (`app/api/torneos/route.ts`, `lib/db/queries/torneos/instance.ts` — type-only, y `scripts/torneo-smoke.ts`). Ningún módulo preexistente lo referencia.
- **`highs` no entra en ningún route handler todavía** ⇒ hoy no hay riesgo de bundling del WASM; al crear el worker (F3b) hay que decidir `serverExternalPackages: ['highs']` (change-map #10).
- **`npx tsc --noEmit` sobre el repo completo: 0 errores** ⇒ los tipos de los 3 endpoints casan con los de `lib/db/queries/torneos/*` (incluida la compatibilidad estructural `parseTournamentInput(...).data` → `TournamentImportInput`).

---

## (d) Deuda aceptada por fase (no es incumplimiento)

| Fase | Deuda reconocida | Fuente |
|---|---|---|
| F1b/F1c | `python-run.json` y `solver-parity.test.ts` (L2); GATE F1 en Vercel | `app-notes.md` F1b "Pendiente"/F1c, `gate-f1-report.md` |
| F2a | `loader.test.ts` completo (EC-05..EC-09) → movido a F5 | `app-notes.md` F2a §Tests |
| F2b | `lib/validations/torneos.ts`, barrel `index.ts`, dispatch del reaper, tests `diagnostics.test.ts` y API | `app-notes.md` F2b "Pendiente" |
| F3a | `agenda`/`runs/[runId]`/`archive` + `lib/torneos/{dispatch,limits}.ts` + rate limit de agenda | change-map §4 (#31-33, 36-37) |
| F3b | Worker + `protected-routes.ts` (7 entradas) + `serverExternalPackages` + `auth-impact.md`/`security-checklist.md` | change-map §4-§5 |
| F4 | UI `/torneos`, grilla, diagnóstico, hook de polling | change-map §6 |
| F5 | `lib/api-docs/{paths,schemas}/torneo*` + `spec.ts`, `.env.example`, `mini.json`, `tests/api/torneos/*`, E2E, `FEATURES.md` final | change-map §7 |

---

## Veredicto

**Viable.** El contrato §6 está implementado con fidelidad en los 3 endpoints de F2b: guards, anti-IDOR 404, atomicidad, auditoría, mapeo 400/422 del loader y reaper perezoso se comportan como el diseño. No hay regresión sobre features existentes (`schema.ts` solo aditivo, migración aislada, registries de auth/API-docs intactos, `tsc` 0 errores, `highs` todavía fuera del bundle).

**Puede continuar F3a.** Antes de cerrar v0.12: cerrar **O-B1** (GATE F1 en Vercel), **O-M1/O-M2** (tests de `model`/`verify`/`loader`/`diagnostics` + L2 en Jest) y corregir O-m1/O-m2/O-m3/O-m4 en el `technical-design.md` para que F5 documente el contrato real.
