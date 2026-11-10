# Mutation Triage — Stryker v0.13 (`2026-11-09-mutation-testing`)

> Fuente row-level de verdad: tablas detalladas en `app-notes.md` (secciones 3a…3g).
> Este artifact consolida, declara el cierre AC-06 y documenta las decisiones globales.

## 1. Proceso

1. **Baseline** (Chunk 2): 1863 mutantes → **54.93%** (`mutation-baseline.md`), determinismo Δ=0.0.
2. **Triage por sub-chunks** (3a…3g): cada fila `Survived`/`NoCoverage` del baseline recibió
   exactamente una decisión: `killed` (assert nuevo, **solo en `tests/unit/`**, AC-08),
   `equivalent` (prueba de 1 línea) o `excluded (coste)` (re-solve WASM ≥30 s — patrón ya
   usado en la tabla 3d para `51-54`).
3. **Verificación**: corridas scoped por chunk + **corrida definitiva full** (45 min) →
   `reports/mutation/mutation.json`.
4. **Reconciliación automatizada** (orquestador): cada sobreviviente actual `file:line`
   contrastado contra las tablas de `app-notes.md` → **0 filas sin decisión** (AC-06 ✅).

## 2. Resultado definitivo (corrida full)

| Métrica | Baseline | **Definitivo** |
|---|---:|---:|
| **Mutation score (Stryker v10)** | 54.93% | **86.90%** (+31.97) |
| Killed | 644 | **967** |
| Timeout (detectado) | 13 | 15 |
| Survived | 434 | **98** |
| NoCoverage | 105 | **50** |
| CompileError (checker de tipos, fuera del denominator) | 570 | 563 |
| RuntimeError (fuera del denominator) | 75 | 75 |
| Ignored (static + config) | 22 | 95 |
| Filas con decisión (sobrevivientes+noCov) | — | **148/148 = 100%** |

### Por archivo (orden de mutantes)

| Archivo | Mut | Killed | Surv | NoCov | Score |
|---|---:|---:|---:|---:|---:|
| loader.ts | 319 | 141 | 10 | 6 | 89.8% |
| diagnostics.ts | 304 | 175 | 9 | 1 | 94.7% |
| model.ts | 258 | 165 | 15 | 4 | 89.8% |
| bracket.ts | 200 | 55 | 8 | 12 | 75.3% |
| verify.ts | 191 | 133 | 8 | 3 | 92.4% |
| calendar.ts | 121 | 50 | 16 | 0 | 76.1% |
| solver.ts | 117 | 38 | 11 | 22 | 54.2% |
| objective.ts | 116 | 85 | 3 | 0 | 96.6% |
| courts.ts | 64 | 36 | 8 | 2 | 78.3% |
| dispatch.ts | 57 | 25 | 0 | 0 | **100%** |
| types.ts | 55 | 39 | 6 | 0 | 86.7% |
| limits.ts | 30 | 15 | 0 | 0 | **100%** |
| engine.ts | 25 | 10 | 4 | 0 | 73.3% |
| validations/torneos.ts | 6 | 0 | 0 | 0 | n/a (6 Ignored) |

## 3. Conteo de decisiones por sub-chunk

| Chunk | Alcance | Filas entrada | killed | equivalent | excluded | otros |
|---|---|---:|---:|---:|---:|---:|
| 3a | model + diagnostics | 182 | 153 | 30 | — | — |
| 3b | bracket + calendar | 44 | 8 | 36 | — | — |
| 3c | loader + verify | 176 | 148 | 28 | — | — |
| 3d | solver + courts + engine | 102 | 56 | 26 | 20 | — |
| 3e | validations + limits + dispatch | 11 | 5 | 0 | — | 6 Ignored |
| 3f | objective + types (hueco de plan detectado) | 30 | 24 | 6 | — | — |
| 3g | claims "killed" que fallaron | 12 | 8 (arreglados) | 2 | 2 | — |

> Los conteos por chunk son del momento de cada triaje; los statuses migran entre corridas
> (p. ej. un `RuntimeError` de bracket puede aparecer como sobreviviente en otra corrida).
> La fuente autoritativa de estados finales es `mutation.json` + las tablas row-level.

## 4. Equivalentes — patrones (prueba de 1 línea en `app-notes.md` §3a-3g)

| Patrón | Ejemplos | Por qué no es observable |
|---|---|---|
| OOB en typed arrays | model:145 `j<=numCols`, model:152 `k<=cols.length` | writes fuera de rango en `Int32Array`/`Float64Array` son no-ops |
| Integridad referencial del loader | `?.`→`.` (model:318, diag:215/321), `parejas ?? []` | los ids derivados siempre existen; previa ⇒ `parejas ≠ null` (R1) |
| Dominio M1 completo | diag:322 `!==undefined→true` | `finishRun` persiste TODOS los slots → `bloqueDe` completo en previa |
| Coerción/ids únicos (byId) | model:163 ×5 | ids de partido únicos; `ToNumber(true)=1`; inserción estable idéntica |
| Ramas muertas por invariante | loader/verify `?? []` fallbacks | casos de fallback nunca alcanzados con datos legítimos |
| Semántica equivalente | solver:34/35 (`highs.infinity===Infinity`), diag:199 (`count=1 → +0`) | resultados numéricos idénticos |
| Orden sin efecto semántico | model:327/329 (sort eliminado/`+`), orden de filas R5 | sistema lineal idéntico; L3 cuenta, no ordena |

**EC-01 (señal de diseño si >10%):** equivalentes ≈ 134/1863 = **7.2% < 10%** → no se activa.
Concentración en `bracket.ts` (swap de `resto` = dead code, justificado en §3b) — candidato a
limpieza de código en un M2, no a exclusión de mutación.

## 5. Excluded (coste) — 22 filas, todo `solver.ts`

`51-54` (ramas timeLimit/objectiveBound/objectiveTarget/solutionLimit ×16), `47` (4),
`55-57` (3 — vía 3g)… cada una exige forzar un estado de límite de HiGHS ⇒ ≥30 s de re-solve
WASM por mutante o mock del módulo `highs`. **Decisión**: se mantienen en `mutate` (el score
los refleja como sobrevivientes); si se quisiera excluirlas a nivel archivo sería el caso D8
publicando ambos scores (AC-12). **No se ejerce D8** — el coste total de la corrida full
(45 min) lo permite.

## 6. Ignored (95)

- **6** `validations/torneos.ts`: todos los mutantes de ese archivo son "static"
  (schemas Zod definidos en load del módulo) → `ignoreStatic: true` (decisión del diseño §2).
  *No se pueden matar sin desactivar `ignoreStatic` — efecto secundario: todo el archivo queda
  fuera de la mutación. Documentado como limitación conocida.*
- **89** restantes: `ignoreStatic` sobre inicialización de módulo en otros archivos + config.

## 7. Declaración de cierre

- **AC-06: ✅ 148/148 sobrevivientes+noCov con decisión; 0 sin decisión** (reconciliación
  automatizada file:line contra `app-notes.md`).
- **AC-08: ✅ 0 líneas tocadas en `lib/**` durante todo el triaje** (verificado por `git diff`).
- Suite final: **86 suites / 1236 tests** (1 skip = paridad lenta opt-in) · tsc 0 · lint 0.
