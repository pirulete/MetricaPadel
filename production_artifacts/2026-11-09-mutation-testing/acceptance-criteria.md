# Acceptance Criteria — Mutation testing (Stryker) v0.13

> change_id: `2026-11-09-mutation-testing` · release: `v0.13` · module: `infra`
> date: `2026-11-09` · fuente: `feature-spec.md` §4 (13 AC + enmienda AC-02) y §5 (EC-01…EC-12)
> Validado por @qa-release con regresión fresca el **2026-11-09 23:20–23:35** (no se repitieron los números de los artifacts: se re-ejecutaron los gates).

## 1. Resumen

| # | AC | Resultado | Evidencia (comando / artifact) |
|---|---|---|---|
| AC-01 | Tooling instalado, coherente y aislado | **PASS** | `pnpm ls … --depth 0` → 3× `@stryker-mutator/* 10.1.1` + `jest-environment-node 30.4.1`; `npx stryker --version` → `10.1.1`; `pnpm-lock.yaml` en el diff; 0 advisories en paquetes Stryker |
| AC-02 | Config Jest dedicada y acotada (enmendado: 13 suites) | **PASS** | `npx jest -c jest.config.mutation.js --listTests` → **13/13** de `tests/unit/**`, 0 de `api/`, `e2e/`, `fixtures/`, `helpers/`; `collectCoverage:false`, `verbose:false` |
| AC-03 | Scope de mutación verificado | **PASS** | `npx stryker run --dryRunOnly` → exit 0, "Ran 252 tests in 5 seconds"; `mutate` inspeccionado: solo `lib/motor-torneo/*` (11), `lib/torneos/{limits,dispatch}.ts`, `lib/validations/torneos.ts` |
| AC-04 | Baseline medido, no supuesto | **PASS** | `mutation-baseline.md`: comando, fecha, 99 min/46 min, score 54.93, desglose por archivo, killed/survived/noCov/timeout/compile; `reports/mutation/{mutation.json,mutation.html,mutation-run1.json,mutation-run2.json}` presentes |
| AC-05 | Threshold = score − 5, explícito | **PASS** | `stryker.conf.mjs:53` → `{ high: 86.9, low: 81.9, break: 81.9 }`; corrida definitiva 86.90 ≥ break |
| AC-06 | 100% de sobrevivientes triados (enmendado C-4) | **PASS** | `mutation-triage.md`: **148/148** con decisión, 0 sin decisión; equivalentes solo en triage; 0 `Stryker disable` en `lib/**`; 0 `// EQUIVALENT:` en config |
| AC-07 | `killed` por asserts, no por producción | **PASS** | `git diff HEAD -- lib/ app/ components/ hooks/` = **0 líneas**; cambios solo en `tests/unit/**` |
| AC-08 | Cero cambios de lógica de negocio | **PASS** | `git diff --stat HEAD -- lib/ app/ components/ hooks/` vacío (también `lib/api-docs`, `scripts/validate-harness.js`, `jest.config.js`, `.env.example`) |
| AC-09 | Gates existentes sin regresión | **PASS (build delegado)** | tsc 0 · lint 0 errores/288 warnings · unit 86 suites/1236 pass+1 skip · motor-torneo 218 pass+1 skip · coverage gate `--coverage` PASS (lib 92.6% lines) · gitleaks 0 leaks · semgrep exit 0 · audit sin nuevos high en Stryker |
| AC-10 | Harness `--all` intocado (opt-in real) | **PASS** | `grep stryker scripts/validate-harness.js` → 0 coincidencias; scripts solo `test:mutation` / `test:mutation:phase-b` |
| AC-11 | Documentación y artifacts completos | **PASS** | `ARCHITECTURE.md:210` sección "Mutation testing (Stryker) — v0.13"; `FEATURES.md:2604` entry released/v0.13/infra; baseline + triage + ponytail + release-report presentes |
| AC-12 | Decisión `solver`/`engine` explícita | **PASS** | D8 **no ejercida**: permanecen en `mutate`; baseline publica score por archivo (solver 15.4%, engine 4.5%, courts 18.8%) y coste 4.01 tests/mutante; definitivo solver 54.2% / engine 73.3% / courts 78.3% |
| AC-13 | Tests unit obligatorios; API/E2E N/A justificado | **PASS** | 4 suites nuevas + `fixtures.ts` + 8 ampliadas; `git diff app/api` = 0 y `git diff app/ components/` = 0 → N/A justificado en spec §4.AC-13 |

**Veredicto AC: 13/13 PASS** (AC-09 con la única salvedad de `next build`, delegado por alcance al harness `--all`; ver release-report §7).

## 2. Enmienda AC-02 (validada)

| Punto | Spec original | Realidad validada | Estado |
|---|---|---|---|
| Nº de suites | `≤ 10` (diseño) | **13** (`bracket, calendar, courts, diagnostics, loader, model, objective, solver-parity, types, verify, torneos/dispatch, torneos/limits, validations/torneo`) | **Enmendado 2026-11-09** en `feature-spec.md` §4.AC-02; la restricción que se mantiene es *pertenencia al scope* |
| Motivo | — | El triaje 3f detectó hueco de reconciliación (`objective`, `types`) y 3c exigió `courts` | ✅ |
| `purity.test.ts` | fuera | Excluido por `testPathIgnorePatterns` (linter estático con `fs`, no cubre código mutado) | ✅ |
| Suite normal | idéntica | `npx jest tests/unit/` → 86 suites, 1236 pass + 1 skip (mismo resultado que antes del change) | ✅ |

> **Deuda documental menor (BUG-03):** `change-map.md` §1 sigue diciendo "10 suites exactas" como criterio de salida del chunk 1. Es un literal histórico del plan, no un AC; el criterio vigente es el de `feature-spec.md`. No bloquea.

## 3. Edge cases (EC-01…EC-12)

| # | Caso | Resultado | Evidencia / decisión |
|---|---|---|---|
| EC-01 | Mutantes equivalentes; señal si >10% | **PASS** | ≈134/1863 = **7.2% < 10%** → no se activa la señal de diseño; patrones documentados (OOB typed arrays, integridad referencial del loader, dominio M1 completo, coerción byId, ramas muertas, semántica equivalente, orden sin efecto) |
| EC-02 | Re-solve WASM lento | **PASS con desviación** | Medido 4.01 tests/mutante; run frío 99 min / warm 46 min; **`concurrency: 1`** (no 2 como proponía EC-02) para evitar OOM de WASM → desviación aceptada y documentada (EC-12) |
| EC-03 | Compat Stryker ↔ Jest 30 | **PASS** | `jest-runner` solo declara peer de `core`; dry run real sobre Jest 30 OK; no se usó el fallback `command`; no hubo downgrade de Jest |
| EC-04 | `dispatch.ts` sin unit test | **PASS** | `tests/unit/torneos/dispatch.test.ts` creado (218 L, `jest.mock("@/lib/db")` + `PgDialect` nativo) → dispatch.ts **100%** (25 killed, 0 survived, 0 noCov) |
| EC-05 | `synthetic.ts` / `index.ts` | **PASS (N/A)** | No existen en el repo; nada que excluir |
| EC-06 | Corrida > 5 min | **PASS** | Duración publicada (45–99 min); opt-in: fuera de `--all`, husky y pre-push |
| EC-07 | Mutante que no compila | **PASS con desviación** | `typescript-checker` descarta **570 (30.6%)** compile errors — supera la guía del 5%. Documentado en `mutation-baseline.md` obs. #3: son literales de tipo/aritmética sobre uniones; **no** cuentan como sobrevivientes ni entran al denominador v10 |
| EC-08 | Pesos `W_*` de `objective.ts` | **PASS** | Test de valor numérico exacto del objetivo → `objective.ts` **96.6%** (85 killed / 3 survived / 0 noCov) |
| EC-09 | No determinismo / `RUN_SLOW_PARITY` | **PASS** | Dos corridas completas consecutivas: `|Δ score| = 0.00` (≤ 0.5 exigido); mismo conteo por archivo/estado |
| EC-10 | Solución del solver no determinista | **PASS** | No se introdujeron asserts sobre soluciones exactas; `solver-parity` mantiene comparación por indiferencia |
| EC-11 | `verify.ts` matado por `toHaveLength(0)` | **PASS (aceptado)** | Se priorizó matar el mutante; varios mensajes exactos se añadieron igualmente (mejor diagnóstico) |
| EC-12 | Máquina lenta / poca RAM | **PASS** | `concurrency: 1` documentado en `ARCHITECTURE.md` y `stryker.conf.mjs` |

## 4. Observaciones no bloqueantes para el release

1. **`ignoreStatic: true` deja `lib/validations/torneos.ts` completo fuera de mutación** (6/6 `Ignored`, 0 evaluables). Es una limitación conocida del diseño, no un fallo de configuración; se documenta como riesgo abierto.
2. **22 filas `excluded (coste)` (todas `solver.ts`)** son decisiones a nivel mutante, no exclusión de archivo; AC-06 exige comentario `// EXCLUDED:` a nivel archivo y aquí no aplica porque el archivo sigue mutado. Desviación semántica menor, registrada.
3. **`bracket.ts` 75.3% y `calendar.ts` 76.1%** quedan por debajo del score global pese a estar sobre `break` (81.9 global). No incumple ningún AC (thresholds son globales, out-of-scope §7) pero es el siguiente foco si se itera.
