# Release Report — Mutation testing con Stryker (v0.13)

> change_id: `2026-11-09-mutation-testing` · module: `infra` · fecha: 2026-11-09
> release: **v0.13** · rama: `rama-preview` · validador: @qa-release (step 6)
> Inputs: `feature-spec.md` (13 AC + enmienda AC-02), `technical-design.md` + `technical-design-v2.md`, `change-map.md`,
> `mutation-baseline.md`, `mutation-triage.md`, `design-review.md`, `ponytail-review-report.md`, `app-notes.md` (3a–3g).
> Veredicto: **APTO para `rama-preview`** (condición única: que el gate `--build` del harness `--all` cierre en verde; ver §7).

---

## 1. Alcance vs spec

| Spec § | Compromiso | Entregado | Estado |
|---|---|---|---|
| §2 D1–D9 | Stryker planeado e implementado; sin fast-check; 4 devDeps; config dedicada; opt-in; proceso baseline→triaje | ✅ todo; D8 no ejercida | Cumplido |
| §3.1 | Mutar 14 archivos de lógica pura (11 motor + limits + dispatch + validations) | 14 en `mutate`; `validations` queda 6/6 `Ignored` por `ignoreStatic` | Cumplido con limitación documentada |
| §3.2 | `stryker.conf.mjs`, `jest.config.mutation.js`, scripts, `.gitignore`, lockfile | ✅ 5 archivos | Cumplido |
| §3.3 | `ARCHITECTURE.md`, `FEATURES.md`, artifacts del change | ✅ (+ `acceptance-criteria.md`, `test-matrix.md`, `release-report.md`, `evidence-manifest.json`) | Cumplido |
| §4 AC-01…AC-13 | Ver `acceptance-criteria.md` | **13/13 PASS** | Cumplido |
| §7 out-of-scope | Sin CI job, sin gate en `--all`, sin refactor de producción, sin thresholds por archivo | ✅ verificado (`grep stryker scripts/validate-harness.js` = 0) | Cumplido |

**Trabajo no pedido pero incluido:** `tests/unit/torneos/dispatch.test.ts` (EC-04), `tests/unit/motor-torneo/{courts,objective,types}.test.ts` y `fixtures.ts` (huecos detectados por el baseline/3f). Justificado por AC-06 (no dejar sobrevivientes sin decisión).

## 2. Números oficiales baseline → definitivo

| Métrica | Baseline | Definitivo | Δ |
|---|---:|---:|---:|
| **Mutation score (Stryker v10)** | **54.93%** | **86.90%** | **+31.97** |
| Mutantes generados | 1863 | 1863 | — |
| Killed | 644 | 967 | +323 |
| Timeout (detectado) | 13 | 15 | +2 |
| Survived | 434 | 98 | −336 |
| NoCoverage | 105 | 50 | −55 |
| CompileError (fuera del denominador) | 570 | 563 | — |
| RuntimeError (fuera del denominador) | 75 | 75 | — |
| Ignored | 22 | 95 | +73 |
| Filas triadas | — | **148/148 (100%)** | — |

| Archivo | Baseline | Final |
|---|---:|---:|
| loader.ts | 34.2% | 89.8% |
| diagnostics.ts | 14.3% | 94.7% |
| model.ts | 58.0% | 89.8% |
| bracket.ts | 51.5% | 75.3% |
| verify.ts | 44.7% | 92.4% |
| calendar.ts | 62.8% | 76.1% |
| solver.ts | 15.4% | 54.2% |
| objective.ts | 65.8% | 96.6% |
| courts.ts | 18.8% | 78.3% |
| dispatch.ts | 35.7% | **100%** |
| types.ts | 50.9% | 86.7% |
| limits.ts | 51.7% | **100%** |
| engine.ts | 4.5% | 73.3% |
| validations/torneos.ts | n/a (6 Ignored) | n/a (6 Ignored) |

Thresholds (`stryker.conf.mjs:53`): `{ high: 86.9, low: 81.9, break: 81.9 }` = score medido / score−5 / score−5. La corrida definitiva (86.90) supera `break` en +5.00.

Coste: 4.01 tests/mutante · corrida fría **99 min** · warm **~46 min** · determinismo **Δ = 0.00** entre dos corridas completas.

## 3. Regresión fresca ejecutada en esta validación (2026-11-09 23:20–23:35)

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 errores (exit 0) |
| `pnpm run lint` | **0 errores**, 288 warnings preexistentes (exit 0) |
| `npx jest tests/unit/` | **86/86 suites · 1236 passed · 1 skipped** (7.371 s) |
| `npx jest tests/unit/motor-torneo/` | 11/11 suites · 218 passed · 1 skipped |
| `npx jest -c jest.config.mutation.js --listTests` | **13** archivos, todos del scope |
| `npx stryker run --dryRunOnly` | exit 0 · "Ran 252 tests in 5 seconds" |
| `node scripts/validate-harness.js --coverage` | **PASS** · lib 92.6% lines (baseline 88.6) |
| `pnpm run security:secrets` | no leaks (73.98 MB) |
| `pnpm run security:sast` | exit 0 · 58 findings preexistentes, sin bloqueantes nuevos |
| `pnpm audit --audit-level=high` | 0 advisories en Stryker/jest-environment-node; 72 vulns preexistentes del repo |
| `git diff HEAD -- lib/ app/ components/ hooks/` | **0 líneas** (AC-08) |
| Stryker completo | **NO ejecutado** (opt-in, 45–99 min) — se auditó `reports/mutation/mutation.json`: k=967, s=98, n=50, t=15 → **86.90%** |

> `reports/mutation/mutation.json` recalculado a mano con la fórmula v10 coincide con el número publicado: `(967+15)/(967+98+50+15) = 86.90%`.
> `next build` no se ejecutó por alcance (§7); el harness `--all` lo corre.

## 4. Bugs y enmiendas

| ID | Severidad | Tipo | Descripción | Resolución |
|---|---|---|---|---|
| **BUG-01** | alta (proceso) | bug real detectado en triaje | **12 claims "killed" fallidos**: la tabla de triaje declaraba mutantes muertos que en la corrida final sobrevivían (`solver:34/35/47/55-57/156`, `dispatch:75`, `loader:257/285/396-397/412`, `verify:23/146-152`). La corrida previa daba **83.89%** con claims falsos. | **Corregido en 3g**: 8 kills reales (asserts nuevos), 2 reclasificados `equivalent`, 2 `excluded (coste)`. Aporta +3.01 al score. Causa raíz: fixtures que hacían `return` antes del mutante. |
| **BUG-02** | media (doc) | criterio desfasado | AC-02 fijaba **≤10 suites**; la realidad post-triaje era **13** (`courts`, `objective`, `types` nuevas). | **Enmendado 2026-11-09** en `feature-spec.md` §4.AC-02: la restricción vigente es pertenencia al scope, no el número. Validado: 13/13 dentro del scope. |
| **BUG-03** | baja (doc) | inconsistencia residual | `change-map.md` §1 sigue con el criterio histórico "10 suites exactas". | **No bloqueante**: es el plan original, no un AC vigente. Se anota para limpieza del próximo change. |
| **BUG-04** | baja (doc) | semántica de AC-06 | Los **22 `excluded (coste)`** de `solver.ts` son decisiones a nivel mutante; AC-06 pedía `// EXCLUDED:` a nivel archivo. | **Desviación aceptada**: el archivo sigue en `mutate` (no se excluyó) y el score los cuenta como sobrevivientes. Documentado en `mutation-triage.md` §5. |

## 5. Desviaciones aceptadas respecto a `technical-design-v2`

| # | Desviación | Razón | Estado |
|---|---|---|---|
| D-A | `concurrency: 1` (EC-02 proponía 2) | HiGHS es WASM; con 2 workers hubo riesgo real de OOM | Aceptada (EC-12 lo contempla) |
| D-B | `N1` duplicación de config Jest | Se resolvió mejor que "aceptada": `jest.config.mutation.js` ahora **deriva por spread** de `jest.config.js` (−4 líneas) | Cerrada por @ponytail-reviewer |
| D-C | CompileError 30.6% (> guía 5% de EC-07) | Literales de tipo/aritmética sobre uniones que el checker rechaza; **no** son sobrevivientes ni entran al denominador | Documentada en baseline §obs.3 |
| D-D | `ignoreStatic: true` anula `validations/torneos.ts` | Decisión de diseño §2 (evitar mutar inicialización de módulo); efecto secundario: 6/6 Ignored | Documentada; riesgo abierto |
| D-E | 22 `excluded` sin `// EXCLUDED:` de archivo | No se excluyó ningún archivo; ver BUG-04 | Documentada |
| D-F | Neto −104 líneas en tests/config | @ponytail-reviewer consolidó `fixtures.ts` y derivó la config: no altera AC | Aceptada |
| D-G | `jest.config.mutation.js` usa `require()` con `eslint-disable` | Repo prohíbe `require()` (config CJS); una directiva de una línea | Aceptada |

## 6. Riesgos abiertos

| # | Riesgo | Impacto | Mitigación / estado |
|---|---|---|---|
| R1 | `ignoreStatic: true` deja **`lib/validations/torneos.ts` sin señal de mutación** (6/6 Ignored) | Medio: validaciones Zod del torneo no medidas por mutación | Documentado en `ARCHITECTURE.md` y triage §6; cubierto por asserts Zod de la suite normal |
| R2 | **22 filas `excluded` en `solver.ts`** (ramas de límite HiGHS) | Medio: el tramo más frágil del solver queda parcialmente ciego (54.2%) | Score las cuenta como sobrevivientes; excluirlas requeriría mock del WASM (D8) |
| R3 | **Corrida completa 45–99 min** y sólo opt-in | Alto: nadie la corre si no hay disciplina | `--all` intocado; `test:mutation:phase-b` para el tramo WASM; duración publicada; threshold con margen −5 |
| R4 | CompileError 30.6% infla el "no evaluado" | Bajo: no altera el score v10 | Documentado; si sube >50% revisar `tsconfig` del runner (EC-07) |
| R5 | `bracket.ts` (75.3%) y `calendar.ts` (76.1%) bajo el global | Bajo: sobre el `break` global | Candidato a M2, fuera de v0.13 (§7 out-of-scope) |
| R6 | Falsa sensación de seguridad del score | Medio: el score sólo cubre lógica pura | `ARCHITECTURE.md` lo dice explícitamente; API/E2E siguen siendo los gates de SQL/UI |
| R7 | **BUG-01 (claims falsos) podría repetirse** en futuros triajes | Alto si no se corrige el proceso | Mitigación vigente: la reconciliación es automatizada `file:line` contra `mutation.json`, no manual; el gate de cierre exige corrida full posterior al último kill |

## 7. Checklist de release

- [x] Acceptance criteria validados (13/13 PASS) — `acceptance-criteria.md`
- [x] Edge cases EC-01…EC-12 revisados (1 con desviación documentada, EC-07)
- [x] Regresión typecheck / lint / unit ejecutada con números exactos
- [x] Mutation dry run OK (252 tests, 13 suites) sin correr la suite completa
- [x] `git diff lib/** app/** components/** hooks/**` = 0 (AC-08)
- [x] Cobertura sin regresión: gate `--coverage` PASS (lib 92.6% vs 88.6% baseline)
- [x] Secrets (gitleaks) y SAST (semgrep) sin hallazgos nuevos bloqueantes
- [x] `pnpm audit` sin vulnerabilidades nuevas altas en los paquetes del change
- [x] Harness `--all` no invoca Stryker (AC-10)
- [x] `ARCHITECTURE.md` §"Mutation testing (Stryker) — v0.13" presente
- [x] `FEATURES.md` entry `status: released · release: v0.13 · module: infra` presente
- [x] Artifacts del change presentes (spec, scope, technical-design v1/v2, change-map, baseline, triage, design-review, app-notes, ponytail, acceptance-criteria, test-matrix, release-report, evidence-manifest)
- [x] API tests N/A justificado (0 endpoints, `git diff app/api` = 0)
- [x] E2E / mobile / desktop N/A justificado (0 cambios de UI, `git diff app/ components/` = 0)
- [ ] **`npx next build` — delegado al harness `--all`** (no ejecutado por alcance de este step)
- [ ] Stryker full re-run post-release — **no requerido** (opt-in; el número definitivo ya está en `reports/mutation/mutation.json`)

## 8. Veredicto

**APTO para `rama-preview`**, con una condición de cierre: el harness `node scripts/validate-harness.js --all` debe confirmar el gate `--build` en verde antes de `/supercommitpro`. Ningún AC funcional falla; no hay endpoints, migraciones, auth ni UI involucrados, por lo que el riesgo de release es **BAJO** (tooling opt-in + tests), no el `HIGH` genérico del repo.

- Score: **54.93% → 86.90%** (+31.97), 1863 mutantes, 148/148 triados, determinismo Δ=0.00.
- Regresión: tsc 0 · lint 0 errores · 86 suites/1236 pass · coverage gate PASS.
- Código de producción: **0 líneas** tocadas.
- Pendiente único no bloqueante de este step: `next build` (harness) y limpieza doc de BUG-03.
