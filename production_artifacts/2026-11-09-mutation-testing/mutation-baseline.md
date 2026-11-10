# Mutation Baseline — Stryker v0.13 (`2026-11-09-mutation-testing`)

> Ejecutado por el orquestador (Chunk 2). Reportes completos en `reports/mutation/` (gitignored):
> `mutation.json` (= run2), `mutation-run1.json`, `mutation-run2.json`, HTML en `reports/mutation/`.

## Entorno

| Campo | Valor |
|---|---|
| Fecha | 2026-11-09 |
| Comando | `npx stryker run` (×2, consecutivas, sin reinstalar) |
| Stryker | **10.1.1** (AC-01 ✅) |
| Node | v22.23.2 · pnpm (lock regenerado en Chunk 1) |
| Suites | 10 (`jest.config.mutation.js`) · 119 tests · dry run inicial 4 s |
| Scope | 14 archivos · `concurrency: 1` · `coverageAnalysis: perTest` |
| Run 1 | 18:26:48 → 20:05:36 (**~99 min**) · exit 0 |
| Run 2 | 20:05:36 → 20:51:17 (**~46 min**, warm) · exit 0 |

## Determinismo (EC-09)

**PASS** — ambas corridas produjeron exactamente los mismos conteos por archivo y estado
(`|Δ score| = 0.00`, ≤0.5 exigido). Score oficial (consola Stryker, `MutationTestReportHelper`):
**54.93 en ambas corridas**.

## Score global

| Métrica | Valor |
|---|---|
| **Mutation score (oficial Stryker v10)** | **54.93%** |
| Mutantes totales generados | **1863** |
| Killed | 644 |
| Survived | **434** ← carga de triaje |
| NoCoverage | **105** ← carga de triaje |
| Timeout (cuenta como detectado) | 13 |
| RuntimeError (detectado, excluido del denominator v10) | 75 |
| CompileError (checker de tipos rechaza el mutante — excluido del denominator) | 570 (30.6%) |
| Ignored (por config) | 22 |
| Coste | 4.01 tests/mutante · run 1 ≈ 99 min (frío), run 2 ≈ 46 min (caliente) |

> **Nota fórmula v10**: el score oficial usa `detected = Killed + Timeout` sobre
> `Killed + Survived + NoCoverage + Timeout` (= 657/1196 = 54.93%). `CompileError`,
> `RuntimeError` e `Ignored` quedan fuera del cálculo. El número a reportar es **54.93**.

## Desglose por archivo (ordenado por nº de mutantes)

| Archivo | Tot | Kil | Sur | NoCov | Tim | Run | Compile | Ign | Score archivo* |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| lib/motor-torneo/loader.ts | 319 | 109 | 108 | 9 | 0 | 0 | 93 | 0 | 34.2% |
| lib/motor-torneo/diagnostics.ts | 304 | 42 | 122 | 22 | 1 | 0 | 113 | 4 | 14.3% |
| lib/motor-torneo/model.ts | 258 | 147 | 33 | 5 | 2 | 0 | 70 | 1 | 58.0% |
| lib/motor-torneo/bracket.ts | 200 | 52 | 9 | 14 | 6 | 45 | 74 | 0 | 51.5% |
| lib/motor-torneo/verify.ts | 191 | 85 | 46 | 13 | 0 | 0 | 46 | 1 | 44.7% |
| lib/motor-torneo/calendar.ts | 121 | 45 | 21 | 0 | 1 | 30 | 24 | 0 | 62.8% |
| lib/motor-torneo/solver.ts | 117 | 17 | 18 | 36 | 1 | 0 | 45 | 0 | 15.4% |
| lib/motor-torneo/objective.ts | 116 | 72 | 12 | 1 | 1 | 0 | 25 | 5 | 65.8% |
| lib/motor-torneo/courts.ts | 64 | 12 | 32 | 2 | 0 | 0 | 18 | 0 | 18.8% |
| lib/torneos/dispatch.ts | 57 | 20 | 5 | 0 | 0 | 0 | 31 | 1 | 35.7% |
| lib/motor-torneo/types.ts | 55 | 28 | 15 | 2 | 0 | 0 | 10 | 0 | 50.9% |
| lib/torneos/limits.ts | 30 | 15 | 0 | 0 | 0 | 0 | 14 | 1 | 51.7% |
| lib/motor-torneo/engine.ts | 25 | 0 | 13 | 1 | 1 | 0 | 7 | 3 | 4.5% |
| lib/validations/torneos.ts | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | — (6/6 Ignored) |
| **TOTAL** | **1863** | **644** | **434** | **105** | **13** | **75** | **570** | **22** | **54.93%** |

\* Score por archivo = `(Killed+Timeout) / (Killed+Survived+NoCoverage+Timeout)`, misma fórmula v10.

## Observaciones para el triaje (Chunk 3)

1. **Carga total de decisión: 539** (434 Survived + 105 NoCoverage) — se agrupan por archivo+mutator.
2. **Focos bajos**: `engine.ts` (0 Killed de 25), `diagnostics.ts` (14.3%, 122 sobrevivientes),
   `courts.ts` (18.8%, 32 de 64), `solver.ts` (15.4%, 36 NoCoverage).
3. **570 CompileError (30.6%)**: el `typescript-checker` rechaza mutantes que no tipan (literales
   de tipo, aritmética sobre uniones). No afectan el score v10 pero explican por qué archivos con
   muchos literales (diagnostics, loader) tienen "muertos" aparentes. **No requieren decisión**.
4. **`validations/torneos.ts`: 6/6 Ignored** — verificar en Chunk 3e por qué (¿ignorePatterns?);
   si es un vacío de config, corregir config; si es intencional, documentar.
5. **D8 (exclusión de `engine`/`courts`/`solver`)**: NO se ejerce aún — el coste por mutante fue
   manejable (4.01 tests/mutante) y la corrida completa terminó; se decide tras el triaje si el
   re-solve WASM hace inviable re-corridas.
6. `thresholds` sigue en placeholder `{high:100, low:0, break:0}` — se fija en Chunk 4 tras el
   triaje: `break = low = score_final − 5`, `high = score_final`.

## Decisión D8 (deferred)

**Mantener `engine.ts`, `courts.ts`, `solver.ts` en el scope por ahora.** El coste total fue
aceptable (46–99 min/corrida con warm cache); la re-corrida acotada por archivo
(`--mutate "lib/motor-torneo/<archivo>"`) es de minutos. Se re-evalúa solo si el triaje muestra
que sus sobrevivientes son sistemáticamente equivalentes (EC-01: >10% equivalentes ⇒ señal de
diseño).
