# Change Map — Módulo Torneos, motor TS (M1)

> change_id: `2026-11-04-motor-torneo-ts`
> date: `2026-11-04`
> module: `torneos`
> technical-design: `./technical-design.md`
> migración: `0014_*`

**Leyenda**: ✨ nuevo · ✏️ modificado · ⚙️ generado · `split` = el agente excede 5 archivos o 400 líneas ⇒ ejecutar en sub-chunks indicados.

**Excepciones al límite de 500 líneas** (permitidas por `AGENTS.md`): `lib/db/schema.ts` (definición de schema), `drizzle/*.sql` (generado), `lib/api-docs/spec.ts` (registro), `scripts/torneo-export-fixtures.py` (script one-shot).

---

## 1. DB + migración — @db-engineer `split` (8 archivos → 3 chunks)

| # | Archivo | Tipo | Líneas est. | Chunk | Propósito |
|---|---|---|---|---|---|
| 1 | `lib/db/schema.ts` | ✏️ | +200 (938→~1140) | **F0a** | 4 enums (`tournament_status`, `tournament_phase`, `tournament_run_status`, `tournament_match_round`) + 11 tablas + índices (incl. **UNIQUE parcial** `tournament_runs_active_uq ... WHERE status IN ('queued','running')`) + `relations` + 22 tipos `$inferSelect/$inferInsert`. Excepción de tamaño permitida |
| 2 | `drizzle/0014_*.sql` | ⚙️ | ~180 | **F0a** | Generado por `pnpm run db:generate`. Si el índice parcial sale sin `WHERE`, agregar SQL custom y re-ejecutar `db:generate`. **Verificar con `\d tournament_runs`** |
| 3 | `lib/db/queries/torneos/index.ts` | ✨ | 20 | **F0b** | Barrel de queries |
| 4 | `lib/db/queries/torneos/tournaments.ts` | ✨ | 200 | **F0b** | `createTournament`, `listTournaments` (cursor G15 sobre `updatedAt`), `getTournamentById(id, ownerId)` (anti-IDOR → `null` = 404), `getTournamentDetail` (counts + bloques), `archiveTournament`, `assertNoRuns` |
| 5 | `lib/db/queries/torneos/import.ts` | ✨ | 300 | **F0b** | `importTournament(ownerId, json)`: 1 transacción `db.transaction` que inserta bloques/categorías/grupos/personas/parejas/miembros/disponibilidad/partidos + marca `draft`. **Rollback total ante cualquier fallo** (AC-02). Batch inserts + `sortOrder` determinista |
| 6 | `lib/db/queries/torneos/instance.ts` | ✨ | 180 | **F0c** | `buildInstance(tournamentId, ownerId): Instancia` — lee DB y arma el objeto puro (AC-04 round-trip). **Ubicación obligatoria aquí, no en `lib/motor-torneo/`** (AC-05) |
| 7 | `lib/db/queries/torneos/runs.ts` | ✨ | 260 | **F0c** | `createRun` (captura 23505 → `run_active`), `claimRun` (UPDATE…WHERE status='queued' RETURNING), `finishRun` (1 tx: update terminal + batch slots + `tournaments.status='agenda_draft'`), `getRun`, `listRecentRuns`, `reapStaleRuns` (perezoso, idempotente) |
| 8 | `tests/unit/db/tournament-queries.test.ts` | ✨ | 200 | **F0c** | Mappers/DTO, clamp de límites, máquina de estados de `run`, reaper, `createRun` duplicado ⇒ `run_active` |

---

## 2. Config / scripts — @app-engineer + @architect

| # | Archivo | Tipo | Líneas est. | Agente | Propósito |
|---|---|---|---|---|---|
| 9 | `package.json` | ✏️ | +1 | @app-engineer | `"highs": "^x.y.z"` (única dependencia nueva) |
| 10 | `next.config.mjs` | ✏️ | +3 | @architect (solo si F1 lo exige) | `serverExternalPackages: ['highs']` para que el `.wasm` no pase por el bundler |
| 11 | `scripts/torneo-export-fixtures.py` | ✨ | ~120 | @architect (ejecuta) | One-shot: exporta `tests/fixtures/torneo/{reference/instance.json, structure.json, python-run.json, instance-seed3.json, python-run-seed3.json, mini.json}` desde el prototipo congelado. **No corre en CI** |
| 12 | `scripts/torneo-smoke.ts` | ✨ | ~90 | @app-engineer | Harness del **GATE F1**: `npx tsx scripts/torneo-smoke.ts --fixture … --time-limit 240000` → imprime `nVars/nConstraints`, tiempo, RSS pico, errores del verificador. Reutilizable como diagnóstico local |
| 13 | `scripts/torneo-verify-with-python.py` | ✨ | ~60 | @architect | Cross-check **opcional/manual**: pasa la agenda TS por `verificar.py` original (@qa-release lo corre si cambia el módulo puro) |
| 14 | `.env.example` | ✏️ | +12 | @app-engineer | `TOURNAMENT_WORKER_SECRET`, `TOURNAMENT_MAX_TIME_LIMIT_MS`, `TOURNAMENT_WORKER_URL` con comentarios. **Nunca tocar `.env.local`** |

---

## 3. Motor puro `lib/motor-torneo/` — @app-engineer `split` (13 archivos → 4 chunks)

Puro: sin `lib/db`, `next/*`, `server-only`, `react`, `node:fs`. Test estático lo garantiza.

| # | Archivo | Tipo | Líneas est. | Chunk | Puerto desde | Propósito |
|---|---|---|---|---|---|---|
| 15 | `lib/motor-torneo/types.ts` | ✨ | 190 | **F1a** | `instancia.py` dataclasses | `Bloque`, `Categoria`, `Grupo`, `Pareja`, `Persona`, `Partido`, `CalendarioTramo`, `Instancia`, `TournamentParams`, `MilpModel`, `SolveResult`, `EngineStatus`, `VerificationError`, `Diagnosis`. Sin lógica |
| 16 | `lib/motor-torneo/calendar.ts` | ✨ | 100 | **F1a** | `construir_bloques` (`instancia.py:37`) | `buildBlocks()` + `assertNoOverlap()` (EC-09) |
| 17 | `lib/motor-torneo/model.ts` | ✨ | 320 | **F1b** | `Modelo._construir` (`modelo.py:72`) | Variables `x[m,b]`, R1, R2, R3 (por pareja), R3b (dobles con holgura), R5 acumulada con `break`. `buildModel().stats` = base del test L3 |
| 18 | `lib/motor-torneo/objective.ts` | ✨ | 190 | **F1b** | `modelo.py:212-279` | Días por pareja, compacidad `mx/mn`, bloques seguidos `e`, finales tempranas `f`, `W_TEMPRANO` |
| 19 | `lib/motor-torneo/solver.ts` | ✨ | 120 | **F1b** | `Modelo.resolver` (`modelo.py:285`) | **Único archivo que importa `highs`.** `toCSC()`, `time_limit`, `mip_rel_gap`, clamp `[30s, 240s]`, mapeo de status |
| 20 | `lib/motor-torneo/verify.ts` | ✨ | 150 | **F1c** | `verificar.py` (84 líneas) | Verificador independiente, 8 códigos tipados. **No importa `model.ts`/`objective.ts`** |
| 21 | `lib/motor-torneo/courts.ts` | ✨ | 95 | **F1c** | `asignar_canchas` (`modelo.py:315`) | Asignación voraz post-motor |
| 22 | `lib/motor-torneo/engine.ts` | ✨ | 130 | **F1c** | `correr.py:main` | Orquestador `runEngine(inst, opts)` → `EngineResult` |
| 23 | `lib/motor-torneo/bracket.ts` | ✨ | 210 | **F2a** | `_partidos_grupo` (`:128`) + `_construir_cuadro` (`:138`) | `groupPairings`, `buildBracket`, `deriveStructure`. Determinista por `sortOrder` (P-3) |
| 24 | `lib/motor-torneo/loader.ts` | ✨ | 270 | **F2a** | reemplaza `instancia.py` (D6) | `parseExchangeJson` (Zod) + `loadInstancia` con 4 reglas + R0/R5/R6 y `path` por campo (EC-05..EC-09) |
| 25 | `lib/motor-torneo/diagnostics.ts` | ✨ | 240 | **F2b** | `semaforo` (`correr.py:23`) + `resumen_calidad` (`correr.py:99`) | Semáforo (incl. ρ>1 y **0 casillas**, EC-16) + 6 indicadores estructurados |
| 26 | `lib/motor-torneo/synthetic.ts` | ✨ | 210 | **F2b** | `generar` (`instancia.py:218`) — **solo tests** | `generateSynthetic()` con PRNG `mulberry32`. No reproduce Python. No se exporta en el barrel; no se importa desde `app/` |
| 27 | `lib/motor-torneo/index.ts` | ✨ | 25 | **F2b** | — | Barrel público (sin `synthetic`) |

---

## 4. API — @app-engineer `split` (7 route handlers → 3 chunks)

Todos: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `auth()` + `guardAdmin`, Zod, anti-IDOR 404.

| # | Archivo | Tipo | Líneas est. | Chunk | Propósito |
|---|---|---|---|---|---|
| 28 | `app/api/torneos/route.ts` | ✨ | 150 | **F2b** | `POST` import (201/400/409/422, audit CREATE) · `GET` lista con cursor (200) |
| 29 | `app/api/torneos/[id]/route.ts` | ✨ | 130 | **F2b** | `GET` detalle + `activeRun`/`currentRun` + dispara reaper perezoso |
| 30 | `app/api/torneos/[id]/instancia/route.ts` | ✨ | 60 | **F2b** | `GET` espejo canónico desde DB (AC-04) |
| 31 | `app/api/torneos/[id]/agenda/route.ts` | ✨ | 180 | **F3a** | `POST` 202 · pre-check semáforo (422) · índice parcial → 409 · archived → 409 · clamp + dispatch |
| 32 | `app/api/torneos/[id]/runs/[runId]/route.ts` | ✨ | 90 | **F3a** | `GET` estado + diagnóstico (+`?include=slots`), polling, reaper |
| 33 | `app/api/torneos/[id]/archive/route.ts` | ✨ | 70 | **F3a** | `POST` soft archive + audit UPDATE |
| 34 | `app/api/internal/tournament-worker/route.ts` | ✨ | 200 | **F3b** | **`maxDuration = 300`**. Secreto (`timingSafeEqual`, 401/503) → claim atómico (409) → `buildInstance` → `runEngine` → `finishRun` en 1 tx. Auditoría. **No** usa `guardAdmin` |
| 35 | `lib/validations/torneos.ts` | ✨ | 170 | **F2a** | `torneoImportSchema` (§6 JSON), `generateAgendaSchema`, `runQuerySchema`, `listQuerySchema` (G15) |
| 36 | `lib/torneos/dispatch.ts` | ✨ | 70 | **F3a** | `dispatchRun()` fire-and-forget + `dispatchAttempts` + `workerUrl` override |
| 37 | `lib/torneos/limits.ts` | ✨ | 60 | **F3a** | `clampTimeLimit`, `MAX_MATCHES`, `MAX_CELLS`, `REAPER_*`. Puro ⇒ cubierto por Jest |

---

## 5. Auth / registry — @auth-security `split` (2 archivos, 1 chunk)

| # | Archivo | Tipo | Líneas est. | Propósito |
|---|---|---|---|---|
| 38 | `lib/auth/protected-routes.ts` | ✏️ | +45 | 6 entradas `guardAdmin` (ACTIVE) + 1 entrada del worker con `auth: 'x-worker-secret'`. **Sin cambios en `guardAdmin` ni en `auth.ts`** |
| 39 | *(revisión, sin archivo nuevo)* | — | — | Checklist: secreto fail-closed (503 si falta), `timingSafeEqual`, anti-IDOR 404 en 6 rutas, auditoría de import/generate/archive, superficie DoS (solo ADMIN + 1 run activo + límite de tamaño). Genera `auth-impact.md` + `security-checklist.md` |

---

## 6. UI — @app-engineer `split` (7 archivos → 2 chunks)

| # | Archivo | Tipo | Líneas est. | Chunk | Propósito |
|---|---|---|---|---|---|
| 40 | `app/(app)/torneos/page.tsx` | ✨ | 90 | **F4a** | `validateAdmin`, lista server-driven + botón import. Estados empty/loading/error |
| 41 | `components/torneos/tournament-list.tsx` | ✨ | 140 | **F4a** | Cards con estado, counts y último run; "cargar más" (cursor) |
| 42 | `components/torneos/tournament-import-modal.tsx` | ✨ | 200 | **F4a** | Textarea/JSON file + errores del cargador con `path` + toasts (Sonner) |
| 43 | `app/(app)/torneos/[id]/page.tsx` | ✨ | 110 | **F4b** | `validateAdmin`, detalle + botón "Generar agenda" + polling + banner `invalid` |
| 44 | `components/torneos/agenda-grid.tsx` | ✨ | 240 | **F4b** | Grilla canchas × bloques, color por categoría (paleta fija del prototipo), tooltip con `code`, fila de ocupación, leyenda. `overflow-x` controlado, legible a 375 px |
| 45 | `components/torneos/diagnostics-panel.tsx` | ✨ | 190 | **F4b** | Semáforo por fase, `engineStatus`, `timeLimitReached`, extensión usada, 6 indicadores, errores del verificador, estado del run |
| 46 | `hooks/use-tournament-run.ts` | ✨ | 120 | **F4b** | Polling con backoff (1s→5s), se detiene en estado terminal, `generate()`, errores 409/422 mapeados a mensajes |

---

## 7. Docs + tests finales — @qa-release `split` (10 archivos → 3 chunks)

| # | Archivo | Tipo | Líneas est. | Chunk | Propósito |
|---|---|---|---|---|---|
| 47 | `lib/api-docs/schemas/torneo.ts` | ✨ | 220 | **F5a** | Schemas OpenAPI (import request, tournament, run, diagnosis, slot, errores) |
| 48 | `lib/api-docs/paths/torneos.ts` | ✨ | 280 | **F5a** | 7 endpoints + tags `Torneos` / `Torneos Worker` |
| 49 | `lib/api-docs/spec.ts` | ✏️ | +12 | **F5a** | Registrar paths/schemas/tags (**solo agregar**) |
| 50 | `tests/api/torneos/import-happy.spec.ts` | ✨ | 140 | **F5b** | SQL real: import mini → detalle → instancia (round-trip) |
| 51 | `tests/api/torneos/agenda-happy.spec.ts` | ✨ | 160 | **F5b** | 202 <2 s → worker con secreto → run `succeeded` → `slotsCount` → `include=slots` |
| 52 | `tests/api/torneos/torneos-guard.spec.ts` | ✨ | 180 | **F5b** | 401/403/404/409 (doble POST, archived)/422 (`force=false`)/400 (regla de cargador) |
| 53 | `tests/api/torneos/worker-guard.spec.ts` | ✨ | 90 | **F5b** | 401 sin header, 401 secreto inválido, 409 `not_claimed` |
| 54 | `tests/e2e/torneo-agenda.spec.ts` | ✨ | 150 | **F5c** | Flujo navegable import → generar → grilla + semáforo + diagnóstico, 375 px |
| 55 | `FEATURES.md` | ✏️ | +60 | **F5c** | Entrada con metadata (`status: released`, `release: v0.12`, `module: torneos`, `change_id`, `tags`), problema, solución, archivos, tests, env vars |
| 56 | `.env.example` | ✏️ | (ver #14) | **F5c** | Verificación del gate `--env` (no duplicar la edición) |

---

## 8. Tests unitarios (Jest) — @app-engineer (los escribe él, no @qa-release) `split`

`AGENTS.md`: unit tests van con el implementador. Se reparten en los chunks del módulo.

| # | Archivo | Líneas est. | Chunk | Cubre |
|---|---|---|---|---|
| 57 | `tests/unit/motor-torneo/purity.test.ts` | 110 | **F1c** | Sin imports de DB/Next/server-only en el módulo; `highs` solo en `solver.ts`; `synthetic` no importado desde `app/`; sin `new Date(` (AC-05, EC-17) |
| 58 | `tests/unit/motor-torneo/calendar.test.ts` | 110 | **F1a** | idx/startTime/capacidad especial/solape (EC-09) |
| 59 | `tests/unit/motor-torneo/model.test.ts` | 170 | **F1b** | **L3** `nVars`/`nConstraints` vs `python-run.json`; cada regla dura detecta su violación |
| 60 | `tests/unit/motor-torneo/verify.test.ts` | 150 | **F1c** | 6 reglas con agendas corruptas; no importa `model/objective` |
| 61 | `tests/unit/motor-torneo/diagnostics.test.ts` | 140 | **F2b** | Semáforo V/A/R, ρ>1, 0 casillas, 6 indicadores |
| 62 | `tests/unit/motor-torneo/bracket.test.ts` | 180 | **F2a** | **L1** golden `structure.json` exacto; 155+92=247; 6/7/8 grupos |
| 63 | `tests/unit/motor-torneo/loader.test.ts` | 190 | **F2a** | 4 reglas + R0/R5/R6 con `path`, EC-05..EC-09 |
| 64 | `tests/unit/motor-torneo/solver-parity.test.ts` | 130 | **F5b** (@qa-release) | **L2** sobre `reference/instance.json`: 0 errores, 247 slots, extensión 0, tolerancias |
| 65 | `tests/unit/validations/torneo.test.ts` | 120 | **F2a** | Schemas Zod de request |

---

## 9. Fixtures (commiteadas, generadas una vez)

| Archivo | Origen | Uso |
|---|---|---|
| `tests/fixtures/torneo/reference/instance.json` | Python (seed 7) | L1 + L2 + L3 |
| `tests/fixtures/torneo/reference/structure.json` | Python (seed 7) | L1 exacta |
| `tests/fixtures/torneo/reference/python-run.json` | Python (seed 7, 300 s) | L3 + tolerancias de indicadores |
| `tests/fixtures/torneo/reference/instance-seed3.json` · `python-run-seed3.json` | Python (seed 3) | Robustez del port |
| `tests/fixtures/torneo/mini.json` | manual / `synthetic` | API happy-path + E2E (motor < 1 s) |

---

## 10. Resumen por agente

| Agente | Archivos | Chunks | `split` | Riesgo principal |
|---|---|---|---|---|
| @db-engineer | 8 | 3 (F0a/F0b/F0c) | **sí** (8 > 5) | índice UNIQUE parcial + verificación de columnas post-migrate |
| @app-engineer | 33 | 10 (F1a…F4b) | **sí** (33 ≫ 5, motor + API + UI) | fidelidad del port; cada chunk ≤5 archivos |
| @auth-security | 1 + revisión | 1 | no | secreto fail-closed, anti-IDOR 404, DoS por CPU |
| @architect | 4 (fixtures/scripts/config) | — | no | **GATE F1** (WASM en función) |
| @ponytail-reviewer | 0 (review) | 1 | no | sobre-port de 1372 líneas Python |
| @qa-release | 10 | 3 (F5a/F5b/F5c) | **sí** (10 > 5) | cobertura de UI, API docs completos |
| @admin-engineer | 0 | — | — | **no interviene** (el coach ADMIN opera en `app/(app)`) |
| @ui-designer | 0 (opcional) | — | — | mockup efímero de la grilla si el orquestador lo pide |

**Total**: 56 archivos (46 ✨ nuevos, 8 ✏️ modificados, 1 ⚙️ generado, 1 revisión) + 5 fixtures.

### Archivos con riesgo de exceder 400 líneas

| Archivo | Est. | Acción |
|---|---|---|
| `lib/db/queries/torneos/import.ts` | 300 | OK |
| `lib/motor-torneo/model.ts` | 320 | OK; si supera 400 durante F1b, mover el bloque de objetivo a `objective.ts` (ya separado) |
| `lib/motor-torneo/loader.ts` | 270 | OK; si crece, extraer `lib/motor-torneo/loader-rules.ts` |
| `lib/api-docs/paths/torneos.ts` | 280 | OK (límite 500) |
| `lib/db/schema.ts` | 1140 | **excepción permitida** (schema) |

---

## 11. Orden de ejecución y dependencias

```
F0a ─▶ F0b ─▶ F0c ─┐
                   ├─▶ F1a ─▶ F1b ─▶ ⛔ GATE F1 ─▶ F1c ─▶ F2a ─▶ F2b
                   │                                       │
              [@architect: fixtures]                      ├─▶ @ponytail-reviewer
                                                           ▼
                                                   F3a ─▶ F3b ─▶ F4a ─▶ F4b
                                                           │
                                                     @ponytail-reviewer
                                                           ▼
                                                   F5a ─▶ F5b ─▶ F5c ─▶ cierre
```

Bloqueos duros:
1. **F1b no termina sin GATE F1** (technical-design §12.1). Si falla ⇒ `escalation-report.md` + plan B contenedor, no se avanza a F2.
2. F0a no se cierra sin `\d tournament_runs` mostrando el índice **parcial**.
3. F1a requiere las fixtures ya commiteadas (`scripts/torneo-export-fixtures.py` lo corre @architect una vez).
4. F2b y F4b generan `design-review.md` (Cross-Agent Review obligatorio por cambio >5 archivos).

---

## 12. Ajuste post design-review (2026-11-04) — triage O-B1 / O-M1 / O-M2 / O-m1..O-m11

> Fuente: `design-review.md` (1 bloqueante, 2 mayores, 11 menores). Resolución y justificación en **`technical-design-v2.md`**. Las filas §1–§11 se conservan como histórico y siguen siendo válidas salvo las marcadas aquí como *retirada* o *re-ubicada*. Solo se **agregan** filas; nada se borra.
>
> Reglas respetadas: ≤5 archivos por invocación, ≤400 líneas por archivo, retrocompatibilidad de APIs (aquí no se renombra nada), `lib/api-docs/spec.ts` y `.env.example` con responsable y fase explícitos.

### 12.1 Chunks nuevos / re-cortados

| # | Archivo | Tipo | Líneas est. | Chunk | Agente | Propósito · observación que cierra |
|---|---|---|---|---|---|---|
| 66 | `app/api/torneos/route.ts` | ✏️ | +6 | **F2c** | @app-engineer | **O-m5**: si `errors[]` del loader mezcla clases, el `code` debe ser el del primer error **422** (nunca un 400-class); si no hay ninguno 422 ⇒ `code:'invalid_instance'` + `details[]`. El status (422) no cambia |
| 67 | `tests/unit/motor-torneo/model.test.ts` | ✨ | 170 | **F2c** | @app-engineer | **O-M1 / L3**: `nVars`/`nConstraints` vs `tests/fixtures/torneo/model-stats.json` (±`KNOWN_DELTAS`, hoy vacío) + cada regla dura (R1/R2/R3/R3b/R5 con `break`) detecta su violación |
| 68 | `tests/unit/motor-torneo/verify.test.ts` | ✨ | 150 | **F2c** | @app-engineer | **O-M1**: 6 reglas con agendas corruptas sintéticas; no importa `model`/`objective` |
| 69 | `tests/unit/motor-torneo/loader.test.ts` | ✨ | 190 | **F2c** | @app-engineer | **O-M1**: R0/R1–R6 con `path` exacto (`parejas[p101].no_disponible[2]`), EC-05..EC-09, acumulación de errores |
| 70 | `tests/unit/motor-torneo/diagnostics.test.ts` | ✨ | 140 | **F2c** | @app-engineer | **O-M1**: semáforo V/A/R, ρ>1, **0 casillas** (EC-16), 6 indicadores sin NaN |
| 71 | `lib/validations/torneos.ts` | ✨ | 120 | **F3a1** | @app-engineer | **O-m8**: `generateAgendaSchema` + `runQuerySchema` (+`listQuerySchema` si se centraliza). El body de import **sigue** validándose en `loader.ts` (DV de simplicidad, `technical-design-v2` §a.6) |
| 72 | `lib/torneos/limits.ts` | ✨ | 60 | **F3a1** | @app-engineer | `clampTimeLimit`, `MAX_MATCHES`, `MAX_CELLS`, `REAPER_*` (puro ⇒ Jest) |
| 73 | `lib/torneos/dispatch.ts` | ✨ | 70 | **F3a1** | @app-engineer | `dispatchRun()` fire-and-forget + `dispatchAttempts`/`lastDispatchAt` + `workerUrl` override |
| 74 | `app/api/torneos/[id]/agenda/route.ts` | ✨ | 180 | **F3a1** | @app-engineer | `POST` 202 · pre-check semáforo (422 `infeasible_occupancy`) · índice parcial (409 `run_active`) · `archived` (409) · clamp + dispatch · `dynamic='force-dynamic'` |
| 75 | `app/api/torneos/[id]/runs/[runId]/route.ts` | ✨ | 90 | **F3a2** | @app-engineer | `GET` estado + diagnóstico + `?include=slots`; reaper perezoso |
| 76 | `app/api/torneos/[id]/archive/route.ts` | ✨ | 70 | **F3a2** | @app-engineer | `POST` soft archive + `auditUpdate('tournament', ...)` |
| 77 | `lib/db/queries/torneos/runs.ts` | ✏️ | +25 | **F3a2** | @app-engineer | **O-m6**: `getCurrentRun(tournamentId)` = último `succeeded\|invalid` por query directa (deja de depender de `listRecentRuns(limit 20)`) · **O-m11-ii**: DTO `RunSummary` congelado (`diagnostics: Diagnosis \| null`, sin campos extra) |
| 78 | `app/api/torneos/[id]/route.ts` | ✏️ | +8 | **F3a2** | @app-engineer | Consume `getCurrentRun`; declara `dynamic='force-dynamic'`; mantiene `counts` **sin** `courts` (contrato corregido, `technical-design-v2` §a.3) |
| 79 | `tests/unit/validations/torneo.test.ts` | ✨ | 120 | **F3a2** | @app-engineer | Schemas de `#71` (happy + defaults + clamp + rechazos) |
| 80 | `.env.example` | ✏️ | +12 | **F3b** | @auth-security | **O-m9 (adelantado de F5c)**: `TOURNAMENT_WORKER_SECRET`, `TOURNAMENT_MAX_TIME_LIMIT_MS`, `TOURNAMENT_WORKER_URL` con comentarios. Solo `Edit` puntual; **nunca** `.env.local` |
| 81 | `lib/api-docs/schemas/torneo.ts` + `lib/api-docs/paths/torneos.ts` | ✏️ | — | **F5a** | @qa-release | Contrato corregido: sin `counts.courts`, sin `409 runs_exist` en `POST /api/torneos`, `blockMinutes: 75`, `dia: string(1..3)`, `diagnostics: Diagnosis \| null`. `spec.ts` **solo agrega** |
| 82 | `tests/fixtures/torneo/mini.json` | ✨ | ~40 | **F5b** | @qa-release | **O-m10**: fixture mini commiteada (derivada de `synthetic MINI_STRUCTURE` + `MINI_CALENDAR`, seed fijo). Dependencia dura de API happy <2 s y del E2E |
| 83 | `scripts/torneo-export-fixtures.py` | ✏️ | 120 | **F5b2** | @architect (ejecuta) | **O-M2**: exporta `reference/python-run.json`. **No corre en CI** |
| 84 | `tests/fixtures/torneo/reference/python-run.json` | ⚙️ | — | **F5b2** | @architect (ejecuta) | seed 7, `tiempo=240 s`: `modelStats`, `status`, `objective`, `mipGap`, `verificador: []`, 6 indicadores, `agenda` |
| 85 | `tests/unit/motor-torneo/solver-parity.test.ts` | ✨ | 130 | **F5b2** | @qa-release | **O-M2 / L2**: caso mini en suite rápida (`verify()===[]`, todos los partidos programados, extensión 0); caso **referencia completa** con timeout explícito (`--testTimeout=300000`) ejecutado por el harness. **Nunca** igualdad de agenda |

### 12.2 Re-corte de F3a (motivo: excedía 5 archivos)

`F3a` original listaba 5 archivos; el ajuste le sumaba `lib/validations/torneos.ts`, `runs.ts` y `[id]/route.ts` ⇒ 8. Se parte en `F3a1` (4 archivos, #71–74) y `F3a2` (5 archivos, #75–79). Orden: `F3a1 ─▶ F3a2 ─▶ F3b`.

### 12.3 Filas del plan original afectadas

| Fila original | Estado | Nota |
|---|---|---|
| #27 `lib/motor-torneo/index.ts` (barrel) | **retirada** | O-m7 rechazada: sin consumidor que la justifique (`technical-design-v2` §a.5) |
| #31–33 (agenda / runs / archive) | **re-cortadas** | Ahora #74, #75, #76 |
| #35 `lib/validations/torneos.ts` (F2a) | **re-ubicada** | #71 en `F3a1`, con alcance reducido |
| #36–37 (dispatch / limits) | **re-ubicadas** | #72–73 en `F3a1` |
| #14 `.env.example` (F2) | **adelantada** | #80 en `F3b` |
| #50–53 (API specs, F5b) | **+1 archivo** | `mini.json` (#82) entra en el mismo chunk (5 archivos) |
| #64 `solver-parity.test.ts` (F5b) | **movida** | `F5b2` (#85) junto con la fixture Python (#83–84) |
| #65 `validations/torneo.test.ts` (F2a) | **re-ubicada** | #79 en `F3a2` |
| #61 `diagnostics.test.ts` (F2b) | **re-ubicada** | #70 en `F2c` |

### 12.4 Orden de ejecución ajustado

```
F2c (5) ─▶ F3a1 (4) ─▶ F3a2 (5) ─▶ F3b (3) ─▶ @ponytail-reviewer
        ─▶ F4a (3) ─▶ F4b (4) ─▶ @ponytail-reviewer
        ─▶ F5a (2) ─▶ F5b (5) ─▶ F5b2 (3) ─▶ F5c (4) ─▶ cierre
```

### 12.5 Total ajustado

Fases `F2c`…`F5c` = **20 filas nuevas** sobre las 56 previas; ninguna fila histórica eliminada. Ningún chunk supera **5 archivos** y ningún archivo nuevo supera **300 líneas estimadas** (máx: `loader.test.ts` 190, `agenda/route.ts` 180).
