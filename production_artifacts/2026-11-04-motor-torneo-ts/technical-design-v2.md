# Technical Design v2 — Módulo Torneos (M1) · ajuste post design-review

> change_id: `2026-11-04-motor-torneo-ts` · release `v0.12` · module `torneos` · date `2026-11-04`
> autor: @architect · **iteración 2** (no sobrescribe `technical-design.md`, que queda como v1)
> insumo: `design-review.md` (O-B1, O-M1, O-M2, O-m1..O-m11) + `gate-f1-report.md` + estado real del árbol (F0a–F2b implementadas, F2-review cerrado)
> Este documento contiene **solo** lo que cambia: (c) resolución del bloqueante, (a) desviaciones aceptadas, (b) plan ajustado F3–F5. Todo lo no mencionado sigue vigente en `technical-design.md` §0–§14.

---

## c. Resolución del "bloqueante" O-B1 (GATE F1)

| Aspecto | v1 (§12.1) | Estado real | Decisión v2 |
|---|---|---|---|
| Ejecución del spike | "invocación real de Vercel, no negociable" | `gate-f1-report.md`: **local approximado** por decisión explícita del usuario (sin vercel CLI/token/proyecto vinculado) | **Gate dado por PASA** en modalidad local approximada. O-B1 **deja de ser bloqueante de fase** |
| Métricas locales | wall ≤270 s, RSS ≤1024 MB, cold start ≤10 s, bundle ≤10 MB | 241.54 s · 378 MB · ≈1.4 s · 3.7 MB (paquete) | ✅ dentro de umbral con holgura (wall 90 %, RSS 37 %) |
| Validación de producción | obligatoria antes de F2 | **no ejecutada** (wall/cold-start/chunk reales + `next build`) | **Reclasificada: pendiente de deploy, bloqueante de *release v0.12*, no de F3–F5** |

**Resolución**: O-B1 se re-clasifica de `[bloqueante]` a **`[bloqueante de release / deuda de infraestructura]`**. Consecuencias operativas:

1. **F3a/F3b/F4/F5 quedan desbloqueadas.** El worker aún no existe, así que el riesgo de lambda no se materializa hasta el deploy.
2. **Pre-condición de cierre v0.12 (nueva, obligatoria)**: `release-report.md` debe registrar la re-validación post-deploy de wall / cold-start / chunk server real. Si cualquiera incumple ⇒ no se publica v0.12 y se activa plan B (contenedor vía `TOURNAMENT_WORKER_URL`, ya cableado, sin cambios de código).
3. **`npx next build` sigue dentro del gate `--build` del harness** (Step 5) y es la verificación real de que el `.wasm` no rompe el bundle. `serverExternalPackages: ['highs']` se evalúa en F3b, no antes: hoy `highs` solo lo importa `solver.ts`, que todavía no entra en ningún route handler (`design-review` §c.3).
4. **R-01 no se elimina**: pasa de "riesgo bloqueante mitigado por gate local" a "riesgo abierto hasta deploy". Queda en `security-checklist.md`/`release-report.md` como ítem verificable.

> No se requiere `escalation-report.md`: el usuario aprobó la modalidad y el gate local arrojó holgura suficiente.

---

## a. Desviaciones aceptadas (con justificación técnica)

Cada fila indica **qué se acepta**, **por qué es correcto aceptarlo** y **dónde queda documentado** para que F5 no publique un contrato mentiroso. Regla: ninguna desviación cambia comportamiento existente ni rompe consumidores (no hay consumidores: son endpoints nuevos de esta iniciativa).

### a.1 O-m2 — `409 runs_exist` en `POST /api/torneos` no tiene camino

- **Hecho**: `POST /api/torneos` **siempre** crea un torneo nuevo (`createTournament` + `importTournament`); no existe re-import por id en M1. `assertNoRuns` queda exportada sin consumidor.
- **Decisión**: **se retira el `409` del contrato** de `POST /api/torneos`. `assertNoRuns` **se conserva** (es el gate de M2, cuando exista re-import por id) y se documenta como *reservada*.
- **Por qué no se "arregla"**: implementar un re-import por id para honrar el código de estado sería funcionalidad nueva fuera del scope de M1 (feature-spec no la pide) y obligaría a decidir política de runs históricos/huérfanos. Coste alto, valor nulo en M1.
- **Dónde queda**: `technical-design-v2` §b.3 (contrato corregido) + `lib/api-docs/paths/torneos.ts` en F5a **no** documenta ese 409. El 409 de `agenda` (`run_active`) y de `archive` (ya archivado) **sí** se documentan: esos sí tienen camino.

### a.2 O-m3 — `meta.blockMinutes` acepta 30..120 en el contrato, el loader exige 75

- **Hecho**: `calendar.ts` tiene `BLOQUE_MIN = 75` fijo (fidelidad al prototipo); el loader rechaza cualquier otro valor con `invalid_schema`.
- **Decisión**: **estrechar el contrato a `blockMinutes?: 75`** (literal), no relajar el motor.
- **Por qué**: aceptar 60/90 produciría una agenda con etiquetas de hora falsas (`inicio + 75·k`), es decir, datos incorrectos persistidos. El motor generalizado es M3; el schema Zod de `loader.ts` ya lo impide (fail-closed) y ese es el comportamiento correcto.
- **Dónde queda**: §b.3 + OpenAPI `literal 75` en F5a. Riesgo de confusión para el coach: el modal de import (F4a) muestra el valor efectivo, no un selector.

### a.3 O-m1 — `counts.courts` ausente en `GET /api/torneos/[id]`

- **Hecho**: §6.3 listaba `counts.courts`, pero el cancha-count ya viaja en `tournament.courts`.
- **Decisión**: **corregir el contrato, no el código**. `counts` queda con `{ blocks, categories, groups, teams, matches, matchesPrevia, matchesFinal }`.
- **Por qué**: duplicar el mismo escalar en dos ramas de la misma respuesta invita a divergencia (una se actualiza, la otra no) y no aporta al consumidor. Es un caso de "el contrato estaba mal, no la implementación".
- **Dónde queda**: §b.3 + OpenAPI F5a. `TournamentDetail` no cambia de forma.

### a.4 O-m4 — `calendario[].dia` es `string(1..3)` y no el enum `Jue|Vie|Sab|Dom`

- **Hecho**: `tournament_blocks.dayLabel` es `varchar(3)`; el enum del diseño describía solo el dataset de referencia.
- **Decisión**: **aceptar `string(1..3)`** como contrato real y borrar el enum del diseño.
- **Por qué**: el enum bloquearía torneos reales que empiecen otro día (p. ej. `Lun`, `Mar`) — un falso negativo en el import, con 400 incomprensible para el coach. La columna ya es varchar(3): no hay migración ni cambio de motor.
- **Dónde queda**: §b.3 + OpenAPI `string minLength 1 maxLength 3` + nota en `FEATURES.md` (F5c).

### a.5 O-m7 — no existe `lib/motor-torneo/index.ts` (barrel)

- **Hecho**: el change-map #27 lo listaba como entregable de F2b; los handlers importan `@/lib/motor-torneo/loader` directo.
- **Decisión**: **retirar el entregable** (fila #27 marcada *retirada* en `change-map.md` §12.3).
- **Por qué (Ponytail)**: un barrel de 25 líneas con 7 re-exports que **nadie importa** es indirección pura; además es el mecanismo clásico por el que `synthetic.ts` o `solver.ts` acaban arrastrados a un bundle de cliente. `purity.test.ts` ya verifica las fronteras reales. Si en F4 un hook necesita importar varios símbolos, se importan los módulos concretos.
- **Dónde queda**: `change-map.md` §12.3. Sin impacto en `technical-design.md` §3 (el "contrato público" es por archivo, no por barrel).

### a.6 O-m8 (parcial) — el body de import se valida en `loader.ts`, no en `lib/validations/torneos.ts`

- **Hecho**: F2a/F2b omitieron `lib/validations/torneos.ts`; el Zod del JSON canónico vive en `loader.ts`.
- **Decisión**: **se mantiene** el body de import en `loader.ts` (una sola fuente de verdad: forma + reglas de negocio acumuladas con `path`). `lib/validations/torneos.ts` **sí se crea en F3a1** (#71) pero **solo** con los schemas que no pertenecen al cargador: `generateAgendaSchema`, `runQuerySchema` (`?include=slots`), `listQuerySchema` si se centraliza.
- **Por qué**: duplicar el schema del JSON canónico en `lib/validations` crearía dos verdades que se desincronizan (justo el bug que O-m3/O-m4 documentan). Lo que faltaba de verdad era el schema de los *query params* y del *body de agenda*, y eso entra en F3a1.
- **Dónde queda**: `change-map.md` #71 + `tests/unit/validations/torneo.test.ts` (#79).

### a.7 O-m10 (parcial) — fixtures sin `reference/`, sin seed 3

- **Hecho**: las fixtures viven planas (`tests/fixtures/torneo/{instance,structure,model-stats}.json`), no en `reference/`; no existen `instance-seed3.json` ni `python-run-seed3.json`.
- **Decisión**: **aceptar la estructura plana** (sin `reference/`) y **aceptar la ausencia de la muestra seed 3** en M1. **Sí se corrigen** `python-run.json` (O-M2, F5b2) y `mini.json` (F5b).
- **Por qué**: mover 3 fixtures ya consumidas por 3 tests verdes y por `scripts/torneo-smoke.ts` es churn sin valor (paths en tests + script + docs). Seed 3 era "robustez del port" adicional; la cobertura real ya la dan L1 exacta (247 partidos, códigos, feeders) + L3 (`nVars`/`nConstraints` exactos) + L2 en F5b2. Si aparece una divergencia en un caso borde, se añade seed 3 *entonces*, con el caso concreto.
- **Dónde queda**: `change-map.md` §9 (tabla de fixtures) — F5b/F5b2 actualizan la tabla al commitear `mini.json` y `python-run.json`. Nota explícita en `release-scope.md`/`FEATURES.md`.

### a.8 O-m11 (i) — `dynamic = 'force-dynamic'` no declarado en los 3 handlers existentes

- **Hecho**: la convención §4 pedía declararlo; los 3 handlers llaman `auth()`, que ya fuerza render dinámico ⇒ la omisión es **inerte** en runtime.
- **Decisión**: **aceptar en los handlers de F2b** (no se tocan solo por esto) y **exigirlo en los handlers nuevos de F3a1/F3a2** (agenda, runs, archive) por consistencia con el resto del repo. El de `[id]/route.ts` se declara al tocarlo en F3a2 (#78).
- **Por qué**: evitar un chunk de 3 archivos con cero cambio de comportamiento. `auth()` es el gate real, no el segment config.

### a.9 O-m11 (ii) — DTO `RunSummary` con `diagnostics: unknown` y campos extra

- **Hecho**: `RunSummary.diagnostics: unknown`; el DTO expone `tournamentId`, `createdAt`, `dispatchAttempts` además de §6.6.
- **Decisión**: **no es desviación aceptada: se corrige en F3a2** (#77) al congelar el DTO. `diagnostics: Diagnosis | null`; los 3 campos extra se mantienen **solo** si el panel de F4b los usa (`dispatchAttempts` para el mensaje de re-despacho) — decisión de @app-engineer en ese chunk, tipados como aditivos opcionales.
- **Por qué**: es contrato de API y F5a va a documentarlo; dejarlo `unknown` obliga a castear en el cliente.

### a.10 Riesgos que estas desviaciones **no** cubren

| Riesgo | Estado tras v2 | Dueño / fase |
|---|---|---|
| R-01 WASM en lambda real | **abierto** hasta deploy | @qa-release, release-report pre-cierre v0.12 |
| R-05 índice UNIQUE parcial | cerrado (verificado por catálogo en `migration-notes.md` §3) | — |
| R-08 cobertura de UI densa | mitigado: `limits.ts` + `diagnostics.ts` puros + 1 E2E (F5c) | @qa-release |
| Port sin red de tests (O-M1) | **cerrado con F2c** (4 suites) | @app-engineer |

---

## b. Plan ajustado de fases F3–F5

### b.1 Tabla de chunks (todos ≤5 archivos, ≤400 líneas)

| Fase | Agente(s) | Archivos (n) | Gate de salida |
|---|---|---|---|
| **F2c** *(nuevo, antes de F3a)* | @app-engineer | #66 `route.ts` ✏️ · #67–70 tests ✨ → **5** | 4 suites nuevas verdes + `route.ts` mapea 422 a un `code` 422-class (O-m5) + `tsc`/`eslint` 0 |
| **F3a1** | @app-engineer | #71 validations ✨ · #72 limits ✨ · #73 dispatch ✨ · #74 agenda route ✨ → **4** | 202 <2 s · 409 `run_active` · 409 `archived` · 422 `infeasible_occupancy` sin crear run · clamp aplicado server-side · audit CREATE |
| **F3a2** | @app-engineer | #75 runs route ✨ · #76 archive route ✨ · #77 `runs.ts` ✏️ · #78 `[id]/route.ts` ✏️ · #79 test validations ✨ → **5** | `?include=slots` coherente · reaper en ambos GET · `currentRun` correcto con ≥20 runs posteriores (O-m6) · DTO congelado (O-m11-ii) |
| **F3b** | @app-engineer + @auth-security | #34 worker route ✨ · #38 `protected-routes.ts` ✏️ · #80 `.env.example` ✏️ → **3** + revisión | secreto fail-closed (503) · `timingSafeEqual` · claim atómico (409 `not_claimed`) · `maxDuration=300` · `serverExternalPackages` evaluado · `auth-impact.md` + `security-checklist.md` |
| **@ponytail-reviewer** | — | diff F2c–F3b | `ponytail-review-report.md` |
| **F4a** | @app-engineer | #40–42 → **3** | lista + import con `path` de errores, estados empty/loading/error |
| **F4b** | @app-engineer | #43–46 → **4** | AC-11 · 375 px sin scroll horizontal · polling se detiene en terminal · `design-review.md` #2 |
| **@ponytail-reviewer** | — | diff F4 | reporte |
| **F5a** | @qa-release | #47–49 + #81 → **3 archivos** (paths + schemas + spec.ts) | contrato §b.3 reflejado · `spec.ts` solo agrega · gate `--api-docs` |
| **F5b** | @qa-release | #50–53 + #82 → **5** | happy-path con SQL real (import/agenda/worker) · guard 401/403/404/409/422 · mini <2 s |
| **F5b2** *(nuevo)* | @architect (genera) + @qa-release (test) | #83 py ✏️ · #84 fixture ⚙️ · #85 parity ✨ → **3** | L2: `verify()===[]`, 247 slots, extensión 0, tolerancias de indicadores |
| **F5c** | @qa-release | #54 E2E ✨ · #55 `FEATURES.md` ✏️ · #56 `.env.example` (verify) · nit O-m11-iii (comentario `instancia/route.ts`) → **4** | E2E navegable 375 px · `FEATURES.md` `status: released`, **11 tablas**, nombres reales (`model.ts`, `court`→`courts.ts`, `verify.ts`) · gate `--env` |

Orden: `F2c ─▶ F3a1 ─▶ F3a2 ─▶ F3b ─▶ review ─▶ F4a ─▶ F4b ─▶ review ─▶ F5a ─▶ F5b ─▶ F5b2 ─▶ F5c ─▶ cierre`.

### b.2 Por qué F2c va **antes** de F3a (y no en F5)

1. `loader.ts` **ya está expuesto en producción** por `POST /api/torneos` y su validación de negocio (1.232 líneas de módulo) solo se verificó con un smoke `tsx` manual. Es el único caso del review que califica como *gap real* (no deuda de fase).
2. `model.ts`/`verify.ts`/`diagnostics.ts` son el núcleo del port: sin `model.test.ts` (L3) una regresión en R5 acumulada pasa verde **hasta** que F5b2 ejecute el solver completo (240 s por corrida) — detectarla ahí cuesta un ciclo entero.
3. Coste: 4 tests + 1 fix de 6 líneas, contra fixtures **ya commiteadas** (`instance.json`, `structure.json`, `model-stats.json`). Cero dependencias nuevas, cero cambios de comportamiento.
4. No bloquea F3a funcionalmente, pero sí es precondición del gate "no se acepta merge sin tests de lógica de negocio".

### b.3 Contrato API corregido (solo los campos que cambian)

| Endpoint | v1 decía | v2 (contrato real) |
|---|---|---|
| `POST /api/torneos` | `201/400/409/422`; `meta.blockMinutes?: int 30..120`; `calendario[].dia: 'Jue'\|'Vie'\|'Sab'\|'Dom'` | **`201/400/422`** (409 `runs_exist` **retirado**, §a.1). `meta.blockMinutes?: literal 75` (§a.2). `calendario[].dia: string(1..3)` (§a.4). `code` en 422 siempre 422-class: `instance_too_large` \| `match_without_allowed_block` \| `invalid_instance` (O-m5) |
| `GET /api/torneos/[id]` | `counts: { blocks, courts, … }` | `counts` **sin `courts`**; canchas en `tournament.courts` (§a.3). `currentRun` = último `succeeded\|invalid` por query directa (O-m6) |
| `GET /api/torneos/[id]/runs/[runId]` | `diagnostics: Diagnosis \| null` (implementación: `unknown`) | `diagnostics: Diagnosis \| null` **congelado** en F3a2; extras opcionales solo si la UI los usa (§a.9) |
| `lib/validations/torneos.ts` | `torneoImportSchema` + … | **solo** `generateAgendaSchema`, `runQuerySchema`, `listQuerySchema` (§a.6) |

**Retrocompatibilidad**: nula superficie previa afectada (los 3 endpoints existentes son de esta iniciativa; `GET /api/torneos/[id]` se corrige **antes** de que exista UI, F4a/F4b). 0 cambios en `courses`, `evaluations`, `agendas` de v0.11, `rubrics`, academias. `lib/api-docs/spec.ts` sigue **solo agregando**.

### b.4 Guards y seguridad (sin cambios respecto de v1)

`guardAdmin` (ADMIN/SUPER_ADMIN + ACTIVE) en las 6 rutas de coach; anti-IDOR **404** (nunca 403); worker con `x-worker-secret` (`timingSafeEqual` sobre `sha256`, 503 fail-closed si el secreto no está configurado). F3b no crea guards nuevos. `protected-routes.ts` **solo agrega** 7 entradas.

### b.5 Tests requeridos (mapeo completo, obligatorio para el cierre)

| Tipo | Archivos | Fase | Nota |
|---|---|---|---|
| Unit puro | `model`, `verify`, `loader`, `diagnostics` | **F2c** | cierran O-M1 |
| Unit puro | `solver-parity` (mini rápido + referencia `--testTimeout=300000`) | **F5b2** | cierra O-M2; el harness debe ejecutarlo con timeout extendido (§b.6) |
| Unit validaciones | `tests/unit/validations/torneo.test.ts` | **F3a2** | O-m8 |
| Unit DB/limites | `tournament-queries.test.ts` (existente) + `limits.ts` cubierto vía agenda | F3a1 | clamp AC-09 |
| API (SQL real) | `import-happy`, `agenda-happy`, `torneos-guard`, `worker-guard` | **F5b** | ≥1 happy-path por endpoint nuevo; guard 401/403 |
| E2E | `tests/e2e/torneo-agenda.spec.ts` | **F5c** | AC-11, 375 px |
| API docs | `lib/api-docs/{paths,schemas}/torneo*.ts` + `spec.ts` | **F5a** | gate `--api-docs` |
| Env | `.env.example` (3 vars) | **F3b** | gate `--env`; `.env.local` intocado |

**Cobertura**: `lib/motor-torneo/**` (13 archivos, ~2.3k líneas) queda con 8 suites → objetivo ≥80 %. Gate `--coverage` no puede bajar >3 % de `.validation/coverage-baseline.json`; el riesgo residual es UI (F4a/F4b), cubierto por 1 E2E + lógica pura en `limits`/`diagnostics`.

### b.6 Ajuste operativo del harness (para @qa-release)

- `solver-parity.test.ts` (caso referencia) **excede el timeout por defecto de Jest**. Ejecución obligatoria con `--testTimeout=300000` (o tercer argumento por test). Sin esto, el gate `--tests` lo reporta como fallo por timeout, no por paridad.
- El caso mini de ese mismo archivo corre en la suite rápida (<2 s) ⇒ un fallo de paridad estructural se detecta sin esperar 4 min.
- `F5b2` requiere Python + scipy **una sola vez, local, manual** (§10.1 v1). **No entra en CI**: la fixture `python-run.json` se commitea como contrato congelado.

### b.7 Documentación (responsables y fase)

| Archivo | Fase | Contenido |
|---|---|---|
| `ARCHITECTURE.md` sección «Torneos (v0.12)» | cierre (F5c) | módulo puro, worker/claim atómico/reaper, env vars, índice parcial; **sin** barrel, `counts` sin `courts`, `blockMinutes` fijo 75 |
| `AGENTS.md` | **no cambia** | sin nuevos roles ni gates (confirmado) |
| `FEATURES.md` | F5c | `status: released`, `release: v0.12`, `module: torneos`, **11 tablas**, nombres reales de archivo, env vars, tests |
| `lib/api-docs/spec.ts` | F5a | solo agregar paths/schemas/tags `Torneos` / `Torneos Worker` |
| `.env.example` | **F3b** | 3 vars (§7 v1) |
| `motor_torneo/README.md` | cierre | puntero a `lib/motor-torneo/` + `scripts/torneo-export-fixtures.py` |

---

## Veredicto v2

**F3a procede.** Los dos hallazgos mayores se cierran con **F2c** (4 suites + 1 fix) y **F5b2** (L2 automatizada con fixture Python); el bloqueante O-B1 queda **resuelto por decisión del usuario** y re-clasificado a precondición de *release* (re-validación post-deploy). Las 11 menores: **se corrigen 5** (O-m5 → F2c; O-m6 y O-m11-ii → F3a2; O-m8 → F3a1; O-m9 → F3b) **más O-m11-iii → F5c**, y **se aceptan documentadas 5** (O-m1, O-m2, O-m3, O-m4, O-m7) **más 2 parciales** (O-m10 sin `reference/`+seed3; O-m11-i `dynamic` solo en handlers nuevos). `change-map.md` §12 registra 20 filas nuevas sin borrar ninguna; ningún chunk supera 5 archivos. **No se modificó código.**
