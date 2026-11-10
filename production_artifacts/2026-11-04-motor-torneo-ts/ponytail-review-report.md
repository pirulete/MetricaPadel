# Ponytail Review — Módulo Torneos (M1)

> change_id: `2026-11-04-motor-torneo-ts` · release `v0.12` · date: 2026-11-04
> revisor: @ponytail-reviewer · alcance: diff completo del módulo torneos (pre-review, working tree)
> verificación final: `npx tsc --noEmit` = **0 errores** · `npx jest tests/unit/` = **81 suites / 1092 tests OK** · `npx eslint` (dirs tocados) = **0 errores** (29 warnings preexistentes)

## 0. Resumen

| Métrica | Valor |
|---|---|
| Archivos revisados | 34 (todo el diff de torneos) |
| Archivos modificados/eliminados | 12 |
| Líneas eliminadas | **344** |
| Líneas agregadas | 0 netas (1 import sustituye una constante local) |
| **Net** | **−344 líneas** |
| Simplificaciones | 9 sustantivas + 2 limpiezas de comentarios obsoleto |
| Dependencias añadidas | 0 |
| Cambios de lógica de negocio / AC | 0 (motor `model/objective/solver/verify` intacto) |

## 1. Archivos revisados

**Motor puro (`lib/motor-torneo/`)**: `types.ts` (343), `calendar.ts` (125), `bracket.ts` (248), `loader.ts` (438), `synthetic.ts` (259), `model.ts` (371), `objective.ts` (156), `solver.ts` (185), `courts.ts` (80), `verify.ts` (192), `diagnostics.ts` (446), `engine.ts` (136).
**Glue server**: `lib/torneos/{limits,dispatch}.ts`, `lib/db/queries/torneos/{index,tournaments,import,instance,runs}.ts`.
**API**: `app/api/torneos/route.ts`, `[id]/route.ts`, `[id]/agenda`, `[id]/archive`, `[id]/instancia`, `[id]/runs/[runId]`, `app/api/internal/tournament-worker/route.ts`.
**UI**: `app/(app)/torneos/page.tsx`, `[id]/page.tsx`, `components/torneos/{tournament-list,tournament-import-modal,diagnostics-panel,agenda-grid}.tsx`, `hooks/use-tournament-run.ts`.
**Soporte**: `lib/validations/torneos.ts`, `scripts/torneo-smoke.ts`.
**Tests**: `tests/unit/{motor-torneo/*,torneos/limits,db/tournament-queries,validations/torneo}.test.ts`.

## 2. Simplificaciones aplicadas

| # | Archivo | Cambio | Líneas | Motivo (escalera) |
|---|---|---|---|---|
| 1 | `lib/motor-torneo/synthetic.ts` | **Eliminado completo** (259 líneas) | −259 | **YAGNI.** `generateSynthetic` y `MINI_STRUCTURE` no tienen un solo consumidor (0 imports en `app/`, `tests/`, `scripts/`). El design §410 lo autorizaba explícitamente («si `mini.json` manual basta, se elimina») y `tests/unit/motor-torneo/loader.test.ts:42` ya tiene el mismo payload mini inline (`miniExchange()`), así que los futuros API tests no lo necesitan. |
| 2 | `lib/db/queries/torneos/runs.ts` | Bloque `export { REAPER_* as RUN_* }` (6 alias) | −9 | **YAGNI.** Ningún consumidor importaba `RUN_CLAIM_TIMEOUT_MS`, `MAX_DISPATCH_ATTEMPTS`, `WORKER_*`… Los alias duplicaban los nombres ya canónicos de `lib/torneos/limits.ts`. |
| 3 | `lib/db/queries/torneos/runs.ts` | `ReapResult.actions` eliminado (duplicaba `redispatched` + `failed`) | −4 | **Regla de la línea única.** Era una tercera proyección redundante del mismo dato; ningún caller la usaba (`grep` en `app/`). Tests ajustados en `tournament-queries.test.ts`. |
| 4 | `lib/db/queries/torneos/runs.ts` | Comentarios de fase («F3a», «F0c») y doc del reaper | −4 | **Obsoleto**: describían el reparto por chunks, ya cerrado. |
| 5 | `lib/db/queries/torneos/index.ts` | Barrel recortado a la API realmente consumida (6 funciones) | −24 | **YAGNI.** Se re-exportaban 22 símbolos; los route handlers solo importan 6. Además el barrel re-exportaba 3 símbolos ya muertos. |
| 6 | `lib/db/queries/torneos/tournaments.ts` | `assertNoRuns()` eliminado | −14 | **Código muerto.** EC-10 habla de guard de re-import, pero M1 no tiene ruta de re-import (design Q1: importar de nuevo = torneo nuevo). Función inalcanzable; se reimplementará cuando exista la ruta. Import `tournamentRuns` también fuera. |
| 7 | `lib/torneos/limits.ts` (+ `limits.test.ts`) | `MAX_MATCHES` / `MAX_CELLS` eliminados y sus asserts | −6 / −4 | **Duplicación.** R6 ya vive en `loader.ts` (`MAX_MATCHES`, `MAX_MATCH_BLOCK_PAIRS`) y es allí donde se aplica. Estas copias solo las tocaba un test tautológico (`expect(MAX_MATCHES).toBe(600)`), también eliminado. |
| 8 | `lib/db/queries/torneos/import.ts` | `MAX_UNAVAILABLE_BLOCKS = 8` local → `import` desde `loader.ts` | −2 | **Duplicación con deriva potencial** (misma regla R4/EC-05 en dos archivos). Ahora hay una sola fuente (el módulo puro). |
| 9 | `lib/motor-torneo/types.ts` | `EngineResult` eliminado | −9 | **YAGNI.** Tipo sin un solo uso; `engine.ts` define su propio `EngineRunResult` (el que sí devuelve `runEngine`). |
| 10 | `components/torneos/tournament-import-modal.tsx` | `useRouter()` + `router.refresh()` eliminados | −3 | **Plataforma nativa.** La lista `/torneos` se hidrata en cliente vía `TOURNAMENTS_UPDATED_EVENT`; `router.refresh()` no revalida nada de RSC (la página es un header estático + islas client). Era una segunda ruta de refresco redundante. |
| 11 | `lib/validations/torneos.ts` | `GenerateAgendaInput` / `RunQuery` (infer sin consumidor) | −4 | **YAGNI**, coherente con el propio docstring del archivo («no añadir indirección sin consumidor»). |
| 12 | `lib/motor-torneo/instance.ts` | Docstring que decía «el tipo se importa del path previsto: `tsc` reporta ese import pendiente» | −2 | **Obsoleto**: describía el estado intermedio de ejecución por chunks, ya falso. |

Σ filas = **−344** (coincide con `wc -l` antes/después por archivo; `tournament-queries.test.ts` queda en 0 neto).

## 3. Excepciones: duplicaciones evaluadas y **mantenidas** (justificación)

| Duplicación | Por qué se mantiene |
|---|---|
| `clampTimeLimit` (`lib/torneos/limits.ts`) vs `clampTimeLimitMs` (`solver.ts`) | **No es duplicación evitable**: el módulo puro (AC-05) no puede leer `process.env`. `limits` aplica el techo por entorno antes de encolar; `solver` aplica el techo duro para llamadas directas (`scripts/torneo-smoke.ts`). Cada clamp responde a un contrato distinto y está documentado. |
| `MIN/MAX_TIME_LIMIT_MS` (solver) vs `MIN_TIME_LIMIT_MS/DEFAULT_MAX_TIME_LIMIT_MS` (limits) | Mismo motivo de pureza. Fusionarlos obligaría a `lib/motor-torneo/**` a importar código de `lib/torneos/**`, con riesgo de arrastrar `process.env` al módulo puro. |
| `isTerminalRunStatus` / `TERMINAL_RUN_STATUSES` en `hooks/use-tournament-run.ts` y en `runs.ts` | Frontera **cliente/servidor**: importar el valor desde `runs.ts` (que importa `lib/db`) metería Drizzle en el bundle del cliente. La duplicación es de 6 líneas y sella esa frontera. |
| `STATUS_META` + `formatDate` en `tournament-list.tsx` y `torneos/[id]/page.tsx` | 2 usos, ~8 líneas. Extraerlas a un módulo nuevo sustituiría duplicación barata por un archivo + un import en cada consumidor (más superficie, no menos). Bajo el umbral de la escalera. |
| `MAX_IMPORT_BYTES` (route + modal) | Una constante de 1 línea en cada lado del boundary cliente/servidor; importarla cruzando el boundary no aporta. |
| `validateImport` como defensa en profundidad del loader | **No es sobreingeniería**: el loader valida forma + reglas con `path`; `validateImport` protege la integridad transaccional si alguien llama la query sin pasar por el loader (documentado en el design). Se mantiene, solo dejó de exportarse (sin consumidores externos). |

## 4. Archivos >500 líneas (excluyendo blank/comentarios)

Ninguno. El mayor es `lib/db/queries/torneos/runs.ts`: 614 líneas crudas → **~448 efectivas** (antes 465; bajo el umbral de 500). No requiere split.
Siguientes: `diagnostics.ts` 372, `loader.ts` 342, `import.ts` ~318, `model.ts` 294, `diagnostics-panel.tsx` 306.

## 5. Código muerto / TODOs

- Código muerto eliminado: `synthetic.ts` completo, `EngineResult`, `assertNoRuns`, `MAX_MATCHES`/`MAX_CELLS`, 6 alias `RUN_*`, `ReapResult.actions`, `GenerateAgendaInput`, `RunQuery`, `router.refresh()`.
- Sin `TODO`/`FIXME`/`XXX`/commented-out en el módulo. Los únicos `console.log` están en `scripts/torneo-smoke.ts` (script de desarrollo, excepción válida del repo para `scripts/*`).

## 6. Observaciones fuera de alcance Ponytail (para el orquestador)

1. **Faltan tests de API y E2E del feature**: no existe `tests/api/torneos/` ni `tests/e2e/torneo-agenda.spec.ts`, exigidos por AC-10/AC-11/AC-12. No es sobreingeniería; es deuda de gates.
2. **`change-map.md` desactualizado por este review**: las filas 26 (`lib/motor-torneo/synthetic.ts`) y 150/230 (`tests/fixtures/torneo/mini.json` «derivada de `synthetic MINI_STRUCTURE`») ya no aplican. La fixture mini pendiente (F5b) debe escribirse a mano (~40 líneas, como ya estaba previsto) o reutilizar el `miniExchange()` inline de `tests/unit/motor-torneo/loader.test.ts:42`, que produce el mismo payload 1 categoría / 1 grupo / 3 parejas. No se creó `mini.json` en este review porque hoy no tendría consumidor (misma regla YAGNI).
3. El design §3 describe un barrel `lib/motor-torneo/index.ts` que no existe: los consumidores importan por path directo. **Es preferible así** (menos indirección); conviene corregir design/change-map, no crear el barrel.
4. `lib/torneos/limits.ts` y `runs.ts` ya comparten constantes (el comentario que decía «puede consolidarlas» era obsoleto y se corrigió).

## 7. Verificación

```
npx tsc --noEmit            → sin salida (0 errores)
npx jest tests/unit/        → 81 suites passed, 1092 tests passed
npx eslint <dirs tocados>   → 0 errores (29 warnings preexistentes)
```

Cobertura de `lib/torneos/limits.ts` y `lib/validations/torneos.ts` sigue al 100 % tras las eliminaciones.
