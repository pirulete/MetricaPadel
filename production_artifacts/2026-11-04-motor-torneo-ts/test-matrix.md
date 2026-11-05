# Test Matrix — Módulo Torneos, motor TS (M1)

> change_id: `2026-11-04-motor-torneo-ts`
> module: `torneos` · release: `v0.12`
> date: `2026-11-04` · responsable: @qa-release
> technical-design: `./technical-design.md` · desviaciones: `./technical-design-v2.md`

Matriz de validación del release. Cada sección la agrega el chunk de @qa-release que la produce (`F5a` docs, `F5b` API tests, `F5b2` paridad, `F5c` E2E + FEATURES).

---

## F5a — Cobertura de API docs (`lib/api-docs/`)

**Objetivo**: que `lib/api-docs/spec.ts` publique los 7 route handlers de M1 con los códigos y schemas **reales** (no el contrato original), y que typecheck/lint queden limpios.

### Archivos

| Archivo | Tipo | Contenido |
|---|---|---|
| `lib/api-docs/schemas/torneo.ts` | ✨ nuevo | Schemas OpenAPI: `TorneoImportRequest` (+ meta/tramo/categoría/pareja/counts), `TorneoSummary`, `TorneoDetailResponse`, `TorneoInstanciaResponse`, `TorneoAgendaRequest`/`Accepted`, `TorneoRunSummary`/`Detail`/`Slot`, `TorneoDiagnosis` + semáforo + 6 indicadores + `TorneoVerificationError`, `TorneoLoaderError`, `TorneoWorkerRequest`/`Response`/`Error`, errores 409/422 (`run_active`, `archived`, `already_archived`, `infeasible_occupancy`) |
| `lib/api-docs/paths/torneos.ts` | ✨ nuevo | 7 endpoints, tags `Torneos` y `Torneos Worker`, guards 401/403 documentados, anti-IDOR 404 |
| `lib/api-docs/spec.ts` | ✏️ edit puntual | Solo agrega 2 imports + `torneosTags`/`torneosWorkerTags` en `tags`, `torneosPaths` en `paths`, `torneoSchemas` en `components.schemas`. Nada reordenado ni retirado |

### Endpoints documentados — 8 endpoints sobre 7 route handlers (código real)

| # | Endpoint | Guards | Códigos documentados |
|---|---|---|---|
| 1 | `GET /api/torneos` | `guardAdmin` (ADMIN\|SUPER_ADMIN + ACTIVE) | 200 · 400 · 401 · 403 · 500 |
| 2 | `POST /api/torneos` | `guardAdmin` + rate limit IP | 201 · 400 · 401 · 403 · **413** · **422** · 429 · 500 |
| 3 | `GET /api/torneos/{id}` | `guardAdmin` + ownership | 200 · 400 · 401 · 403 · **404** · 500 |
| 4 | `GET /api/torneos/{id}/instancia` | `guardAdmin` + ownership | 200 · 400 · 401 · 403 · **404** · 500 |
| 5 | `POST /api/torneos/{id}/agenda` | `guardAdmin` + rate limit IP | **202** · 400 · 401 · 403 · 404 · **409** (`archived`\|`run_active`) · **422** (`infeasible_occupancy`) · 429 · 500 |
| 6 | `GET /api/torneos/{id}/runs/{runId}` | `guardAdmin` + ownership torneo+run | 200 · 400 · 401 · 403 · 404 · 500 |
| 7 | `POST /api/torneos/{id}/archive` | `guardAdmin` + ownership | 200 · 400 · 401 · 403 · 404 · **409** (`already_archived`) · 500 |
| 8 | `POST /api/internal/tournament-worker` | `x-worker-secret` (`security: []`, sin cookie) | 200 · 400 · **401** · **409** (`not_claimed`) · 500 · **503** (fail-closed) |

### Desviaciones reflejadas (vs `technical-design.md` §6)

| Punto | Contrato original | Documentado (real) | Fuente |
|---|---|---|---|
| `POST /api/torneos` | `201/400/409/422` con `409 runs_exist` | **`201/400/413/422/429`**, sin 409 | `technical-design-v2` §a.1 |
| `meta.blockMinutes` | `int 30..120` | **`enum: [75]`** (literal) | §a.2 |
| `calendario[].dia` | `'Jue'\|'Vie'\|'Sab'\|'Dom'` | **`string(1..3)`** | §a.4 |
| `counts` del detalle | `{ …, courts, … }` | **sin `courts`** (canchas en `tournament.courts`) | §a.3 |
| `diagnostics` del run | `Diagnosis \| null` (impl. `unknown`) | **`TorneoDiagnosis \| null`** | §a.9 |
| `422` del import | `{ code:'instance_too_large' }` | `code` = primer error 422 o `invalid_instance` + `details[]` (todo el acumulado) | O-m5 |
| 413 | no previsto | **documentado** (techo 2 MiB, `payload_too_large`) | código real |
| 429 | solo en agenda | **también en `POST /api/torneos`** | código real |

### Gates ejecutados en F5a

| Gate | Comando | Resultado |
|---|---|---|
| typecheck | `npx tsc --noEmit` | ✅ 0 errores |
| lint | `pnpm run lint` | ✅ 0 errores (0 warnings nuevos en los 3 archivos) |

> No se ejecutó build, Playwright ni servers en este chunk (regla anti-loop de `AGENTS.md`).

### Cobertura de API docs por endpoint (gate `api-docs`)

| Route handler | Entry en `spec.ts` | Request schema | Response schema | Errores con schema |
|---|---|---|---|---|
| `app/api/torneos/route.ts` | ✅ `POST` + `GET` | `TorneoImportRequest` | `TorneoImportResponse` / lista de `TorneoSummary` | `TorneoImportError` + 413 inline |
| `app/api/torneos/[id]/route.ts` | ✅ | — | `TorneoDetailResponse` | 404 inline |
| `app/api/torneos/[id]/instancia/route.ts` | ✅ | — | `TorneoInstanciaResponse` | 404 inline |
| `app/api/torneos/[id]/agenda/route.ts` | ✅ | `TorneoAgendaRequest` | `TorneoAgendaAccepted` | `TorneoArchivedError` / `TorneoRunActiveError` / `TorneoInfeasibleOccupancyError` |
| `app/api/torneos/[id]/runs/[runId]/route.ts` | ✅ | query `include=slots` | `TorneoRunResponse` | 404 inline |
| `app/api/torneos/[id]/archive/route.ts` | ✅ | — | `{ archived: true }` | `TorneoAlreadyArchivedError` |
| `app/api/internal/tournament-worker/route.ts` | ✅ | `TorneoWorkerRequest` | `TorneoWorkerResponse` | `TorneoWorkerError` (400/409/503) |

**Estado F5a**: completo — 7/7 route handlers documentados (8 endpoints), 35 schemas `Torneo*` publicados, 0 `$ref` colgantes.

---

## F5b — API tests de torneos (SQL real) + fixture `mini.json`

**Objetivo**: cubrir con SQL real contra NeonDB el happy-path de import (AC-02/AC-04) y del ciclo asíncrono de agenda (AC-06/AC-08), más los guards y errores de contrato (AC-10) y la autenticación del worker.

### Archivos

| Archivo | Tipo | Contenido |
|---|---|---|
| `tests/fixtures/torneo/mini.json` | ✨ nuevo | Fixture commiteada: 1 categoría (`1ra`), 2 grupos de 3 parejas (6 parejas / 12 personas), calendario de **6 tramos / 18 bloques** (8 previa + 10 final), 2 canchas. Deriva **9 partidos** (6 de previa + 2 semis + 1 final). Escrita a mano sobre el payload de `miniExchange()` (`tests/unit/motor-torneo/loader.test.ts`). Validada end-to-end contra el motor puro: `optimal`, 9/9 slots, 0 errores del verificador, 433 ms |
| `tests/api/torneos/import-happy.spec.ts` | ✨ nuevo | `POST /api/torneos` → 201 + `counts` → verificación SQL de las 8 tablas → auditoría `CREATE tournament` → `GET /api/torneos/[id]` (counts, bloques, `activeRun`/`currentRun` null) → lista → `GET .../instancia` (round-trip AC-04: bloques, `nCanchas`, grupos, parejas, personas, previa con `parejas`, cuadro con `alimentadores`/`gruposOrigen`) |
| `tests/api/torneos/agenda-happy.spec.ts` | ✨ nuevo | `POST .../agenda {timeLimitMs:30000}` → 202 `{runId, status:'queued'}` < 5 s + `params.timeLimitMs` persistido → `POST /api/internal/tournament-worker` con `x-worker-secret` (200 `succeeded` o 409 `not_claimed` por idempotencia del dispatch) → polling a terminal → `succeeded`, `engineStatus:'optimal'`, `slotsCount === counts.matches` (9), `diagnostics.verificationErrors === []` → SQL: 1 slot por partido, `tournaments.status='agenda_draft'` → `?include=slots` (una cancha por partido y por bloque, ≤ 2 canchas) → detalle con `currentRun` (O-m6) |
| `tests/api/torneos/torneos-guard.spec.ts` | ✨ nuevo | 401 sin sesión en las 7 rutas (sin DB) · 403 `USER` · 404 anti-IDOR con 2 coaches (detalle/instancia/agenda/archive + lista filtrada) · 409 archivado (doble `POST archive` → `already_archived`, agenda → `archived`) · 422 `infeasible_occupancy` con previa `capacity:0` (ρ=∞) y **0 runs creados** (EC-01) · 400 `duplicate_team` del cargador (`code:'invalid_instance'` + `details[].path`) sin dejar filas (AC-02 rollback) |
| `tests/api/torneos/worker-guard.spec.ts` | ✨ nuevo | 503 `worker_not_configured` (fail-closed) · 401 sin header y con secreto inválido + el secreto no se refleja en la respuesta · 400 `invalid_body` (runId no uuid) · 409 `not_claimed` (runId inexistente/ya reclamado) |

### Cobertura por AC

| AC | Qué se prueba | Spec |
|---|---|---|
| AC-02 | Import persiste exactamente lo declarado (bloques/categorías/grupos/parejas/personas/partidos previa+final) + rollback total ante violación de regla del cargador | `import-happy`, `torneos-guard` (400) |
| AC-04 | `buildInstance` devuelve el espejo canónico del JSON de entrada (round-trip sin pérdida) | `import-happy` |
| AC-06 | Agenda completa con 0 errores del verificador, `slotsCount === partidos`, capacidad por bloque respetada | `agenda-happy` |
| AC-08 | `202` con `runId` sin esperar al solver, transición `queued → running → succeeded`, `slotsCount` real, `currentRun` en el detalle | `agenda-happy` |
| AC-09 | `timeLimitMs` clampeado server-side y persistido en `tournament_runs.params` | `agenda-happy` |
| AC-10 | `guardAdmin` en las 7 rutas (401/403/404), worker por secreto (401/503), `409 not_claimed`, anti-IDOR 404 | `torneos-guard`, `worker-guard` |

### Casos no cubiertos (y por qué)

| Caso | Motivo | Cobertura alternativa |
|---|---|---|
| `409 run_active` (doble `POST /agenda`) | Carrera real: el `dispatchRun` fire-and-forget puede cerrar el run en <1 s y el 2º POST crearía otro run (flake) | Unit `tests/unit/db/tournament-queries.test.ts` (`createRun` 23505 → `run_active`) + índice parcial en DB |
| `503` del worker cuando el servidor **sí** tiene secreto | El test no puede desconfigurar el entorno del servidor ya arrancado | Se ejecuta solo si falta la env; en su lugar se valida el 401 (fail-closed equivalente) |
| Evento `POST /agenda` 422 `force=true` | Fuera del contrato mínimo (EC-01 cubre el rechazo) | — |
| `429` de rate limit | 10/min por IP compartida entre specs ⇒ flake | Código real verificado en `lib/rate-limit.ts` + docs F5a |

### Observación para el orquestador (riesgo de producto, no del test)

`FIN` (`objective.ts`: `bloqueFinalObjetivo = 33`, fila dura `sum(b·x) + f >= 33`) asume el calendario de referencia. Con un calendario pequeño el modelo es **infeasible** salvo que `nBloques` permita `idx_final + nBloques >= 33`: el primer `mini.json` (7 bloques) devolvió `engineStatus: infeasible`. La fixture final usa 18 bloques (final agendable en idx ≥ 15). Si M1 debe soportar torneos chicos (1 grupo / pocas canchas), hay que escalar `bloqueFinalObjetivo` al tamaño del calendario — **fuera del alcance de F5b (solo tests)**.

### Gates ejecutados en F5b

| Gate | Comando | Resultado |
|---|---|---|
| typecheck | `npx tsc --noEmit` | ✅ 0 errores |
| lint | `pnpm run lint` | ✅ 0 errores (0 warnings nuevos en los 5 archivos) |
| fixture vs motor puro | `parseTournamentInput` + `runEngine(mini, 30 s)` (script temporal, borrado) | ✅ `optimal`, 9/9 slots, 0 errores del verificador, 433 ms |

> No se ejecutó Playwright, `next build` ni servers en este chunk (regla anti-loop de `AGENTS.md`): los 4 specs los corre el orquestador.

---

## F5b2 — L2 · `solver-parity.test.ts` (paridad de validez con Python)

Contrato L2 (technical-design §10.2): **validez/indicadores con tolerancia, NUNCA igualdad de agenda ni de `objective`** (HiGHS WASM no es determinista entre versiones: tie-breaks → óptimos alternativos).

| Nivel | Activación | Instancia | `timeLimitMs` / gap | Timeout | Asserts |
|---|---|---|---|---|---|
| Rápido | siempre (suite normal) | truncada a 1 categoría (`6ta`, 19 partidos, 3 grupos, 6 parejas) reconstruida desde `instance.json` | `30_000` (clamp mínimo de `solver.ts`) / `mipRelGap=0.5` | 45 s (`~0.2 s` real) | `status ∈ {optimal, feasible_time_limit}`, `verify()===[]`, 19/19 asignados + 19 canchas, `scheduledMatches=19`, `extensionMatches=0`, totales de indicadores = grupos/parejas de la instancia, `maxBloquesSeguidos` finito, **L3 exacto** (`nVars`/`nConstraints`/`nNonZeros` del modelo completo vs `model-stats.json`, sin solve) |
| Referencia completa | `RUN_SLOW_PARITY=1` **y** fixture presente; si falta `reference/python-run.json` ⇒ `skip` con motivo | completa (247 partidos, 8 canchas, 8 categorías) | `240_000` / `DEFAULT_PARAMS` (gap 0.01) | 300 s | L3 exacto vs `modelStats` (3 campos), Python no-infeasible, TS solved, **ambos** `verificador`/`errores` vacíos, 247/247 asignados == `agenda.length`, indicadores con tolerancia, `partidosExtension` exacto y 0, `objective` solo se comprueba `number`/no-null |

### Tolerancias L2 elegidas (`INDICATOR_TOLERANCE`)

| Indicador | Regla | Justificación |
|---|---|---|
| `gruposUnidadTotal` | exacto | conteo estructural (no depende de la agenda) |
| `gruposUnidad` | ±2 grupos | §10.2: es el indicador más sensible al tie-break del solver |
| `gruposMismoDia`, `gruposMismaCancha` | ±max(5, 10%) | dependen de la agenda; ±5 cubre torneos chicos, ±10% los grandes |
| `parejasUnDia` | **≥ Python** | §10.2: más parejas en un solo día nunca es peor (`W_DIAS`) |
| `parejasDosDias` | ±max(5, 10%) | dependiente de la agenda |
| `partidosHorarioLaboral` | ±max(5, 10%) | dependiente de la agenda |
| `maxBloquesSeguidos` | ≤ Python + 1 | restricción blanda `R5`/`W_SEGUIDOS` |
| `partidosExtension` | exacto (ideal 0) | penalización dura de calidad `W_EXTENSION=1000` |

### Gates F5b2

| Gate | Comando | Resultado |
|---|---|---|
| unit motor | `npx jest tests/unit/motor-torneo/` | ✅ 8 suites, 86 passed + 1 skipped (paridad lenta), 2.3 s |
| unit paridad | `npx jest tests/unit/motor-torneo/solver-parity.test.ts` | ✅ rápido 1.4 s · lento `skip` (fixture aún en generación) |
| typecheck | `npx tsc --noEmit` | ✅ 0 errores |
| lint | `pnpm run lint` | ✅ 0 errores (warnings preexistentes) |

> El solve completo (~240 s) **no** se ejecutó en este chunk: `RUN_SLOW_PARITY=1` lo corre el orquestador cuando `reference/python-run.json` esté disponible. Habilitación documentada en el JSDoc del spec.

---

## F5c — E2E navegable + FEATURES.md + `.env.example` (QA de release)

### Archivos

| # | Archivo | Acción |
|---|---|---|
| 54 | `tests/e2e/torneo-agenda.spec.ts` | ✨ Nuevo — 2 tests (flujo feliz + guard USER), viewport 375×812 |
| 55 | `FEATURES.md` | 🔧 Modificado — entrada `status: released`, `release: v0.12`, `change_id: 2026-11-04-motor-torneo-ts` |
| 56 | `.env.example` | ✅ Verificado — `TOURNAMENT_WORKER_SECRET` (:101), `TOURNAMENT_MAX_TIME_LIMIT_MS` (:103), `TOURNAMENT_WORKER_URL` comentada (:106, override opcional). Sin cambios |

### Cobertura por AC

| AC | Escenario E2E | Assert |
|---|---|---|
| AC-02 import atómico | modal → pegar `tests/fixtures/torneo/mini.json` (nombre único `Mini torneo E2E <ts>`) → Importar | diálogo se cierra + card `Borrador` visible en la lista |
| AC-08 202 + worker | "Generar agenda" en `/torneos/[id]` | `role=status` "Agenda generada en …" en ≤ 90 s (polling del hook) |
| AC-06 verificación | panel de diagnóstico | badge `succeeded` + "Semáforo de ocupación" + "Verificación independiente" |
| AC-11 mobile | viewport 375×812 | `clientWidth === 375`, grilla con `overflow-x: auto` + celdas `td[title]` > 0, fila "Ocup." y leyenda de categorías |
| SQL real | `afterAll`/assert final | `tournaments.status = agenda_draft` y `tournament_agenda_slots` > 0 para el torneo importado |
| Guard de página | USER → `/torneos` | redirect a `/dashboard` |
| Guard de API | USER → `fetch('/api/torneos')` | `403` |

Hermético: emails y nombre de torneo con `Date.now()`; `afterAll` borra torneos (cascade a las 11 tablas `tournament_*`), `audit_logs` y usuarios.

### Resultado de ejecución

| Gate | Comando | Resultado |
|---|---|---|
| E2E | `npx playwright test tests/e2e/torneo-agenda.spec.ts --reporter=list` | ✅ **2 passed** (3.6 s + 1.3 s, 1 worker) |
| typecheck | `npx tsc --noEmit` | ✅ 0 errores |
| lint | `pnpm run lint` | ✅ 0 errores |

### BUG-01 — Desborde horizontal de la grilla en móvil (severidad **media**, mobile) — ✅ **FIXED**

- **Síntoma**: con agenda generada, `/torneos/[id]` a 375 px tiene `document.documentElement.scrollWidth = 750` (2×). El candidato (`draft`) mide 375: el desborde aparece **solo** al renderizar la grilla.
- **Repro**: 1) importar `mini.json` como ADMIN · 2) `/torneos/[id]` → "Generar agenda" · 3) esperar `succeeded` · 4) medir `document.documentElement.scrollWidth` a viewport 375.
- **Diagnóstico**: `table.min-w-max` dentro de `div.max-w-full.overflow-x-auto` (`components/torneos/agenda-grid.tsx`). Medido en runtime: el wrapper mide 718 px (no ≤ 343) y su ancestro `div.mx-auto.max-w-6xl` también 718 ⇒ el contenedor **crece** en lugar de recortar; `contraer` el wrapper a `display:none` devuelve el documento a 375. Falta `min-w-0` en la cadena (`main` es flex item en `div.flex.flex-1.flex-col`) o `width:0; min-width:100%` en el wrapper.
- **Impacto**: scroll horizontal de página en móvil (AC-11); no afecta datos ni el flujo de generación.
- **Fix aplicado (commit pendiente del orquestador)**: `components/torneos/agenda-grid.tsx` — wrapper scrollable de `max-w-full overflow-x-auto` a **`w-0 min-w-full max-w-full overflow-x-auto`**. `w-0` anula el aporte al `max-content` (el flex item con `min-width:auto` ya puede encogerse al viewport) y `min-w-full` lo devuelve al 100% del ancho disponible; la tabla mantiene su ancho natural **dentro** del scroll (`sticky left-0` intacto). Fix auto-contenido: no toca layout, celdas ni paleta.
- **Verificación**: medición Playwright sobre el código corregido a 375×812 (flujo import → generar → grilla con `mini.json`): `scrollWidth` **750 → 375**, `body.scrollWidth` **375**, wrapper **718 → 343**, `wrapper.overflowX = auto` con `scrollWidth 716`, tabla 716 dentro del scroll. `tsc` 0, eslint 0 (2 archivos). El E2E en `:3000` requiere reconstruir el build (el `next start` vivo es previo al fix); `next build` no se ejecutó (anti-loop).
- **En el test**: la annotation `bug` se reemplazó por aserciones duras en `tests/e2e/torneo-agenda.spec.ts` — `doc.scrollWidth ≤ 375`, `overflowX === "auto"` y `tableWidth > wrapperWidth` (garantiza scroll real, no tabla aplastada). Detalle en `app-notes.md` §`F5c-fix`.

## Step 6 — Regresión final de release (@qa-release)

Re-ejecución fresca del 2026-11-04 contra `:3000` (build con el fix de BUG-01). No aparecieron fallos nuevos: **no hay cambios de estado** respecto de F5a–F5c-fix, sólo confirmación de números.

| Gate | Comando | Resultado exacto |
|---|---|---|
| Unit (suite completa) | `npx jest tests/unit/` | **82 suites passed / 82 · 1093 passed + 1 skipped (paridad lenta) = 1094** · 16.2 s |
| API torneos (SQL real) | `npx playwright test tests/api/torneos/` | **12 passed + 1 skipped** (503 fail-closed) |
| E2E | `npx playwright test tests/e2e/torneo-agenda.spec.ts` | **2 passed** (4.4 s · 1.4 s) |
| Consolidado | `npx playwright test tests/api/torneos/ tests/e2e/torneo-agenda.spec.ts --reporter=list` | **13 passed + 1 skipped / 14** · 7.9 s · 5 workers |
| Typecheck | `npx tsc --noEmit` | **0 errores** |
| Cobertura módulo | `npx jest tests/unit/motor-torneo/ --coverage --collectCoverageFrom='lib/motor-torneo/**'` | **95.94 %** lines · 93.77 % stmts · 98.27 % funcs · 77.5 % branches (**+7.34 pts** vs baseline 88.6 %) |

**Lecturas relevantes del Step 6**

- El E2E pasa **con** las aserciones duras de BUG-01 (`doc.scrollWidth ≤ 375`, `overflowX === 'auto'`, `tableWidth > wrapperWidth`) ⇒ el build servido en `:3000` ya incluye el fix.
- Peor archivo del módulo: `solver.ts` 78.33 % lines (wrapper WASM). `lib/torneos/limits.ts` y `lib/validations/torneos.ts` al **100 %**.
- Sin tests nuevos ni modificados en este step: la matriz F5a–F5c-fix queda vigente. Detalle de AC/EC en `acceptance-criteria.md`; veredicto y riesgos en `release-report.md`.

## Pendiente (chunks posteriores)

- **F5b2**: ✅ `solver-parity.test.ts` (L2). ✅ `reference/python-run.json` generado. **⏳** corrida `RUN_SLOW_PARITY=1` lanzada 17:04 (`parity-slow3.log`) — al cierre de Step 6 aún sin `EXIT=`; cierre a cargo del orquestador (`release-report.md` §6).
- **F5c**: ✅ `tests/e2e/torneo-agenda.spec.ts` (375 px), `FEATURES.md`, verificación `.env.example` — ver `F5c` arriba.
- **F5c-fix**: ✅ **BUG-01 FIXED** (`w-0 min-w-full` en el wrapper de `AgendaGrid` + aserciones duras de `scrollWidth` en el E2E) — ver `F5c` arriba y `app-notes.md` §`F5c-fix`. ✅ Build de `:3000` reconstruido: el E2E de Step 6 valida el código corregido.
- **R-01**: ⛔ re-validación del GATE F1 en Vercel real (bloqueante de `main`, no de `rama-preview`).
- **O-m8 / QA-03**: ⏭️ unit tests de `hooks/use-tournament-run.ts` (deuda aceptada, cubierta por E2E).
