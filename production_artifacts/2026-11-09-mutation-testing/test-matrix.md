# Test Matrix — Mutation testing (Stryker) v0.13

> change_id: `2026-11-09-mutation-testing` · release: `v0.13` · module: `infra` · date: `2026-11-09`
> Regresión fresca ejecutada por @qa-release el 2026-11-09 (23:20–23:35). **No** se ejecutó Stryker completo
> (45–99 min, opt-in): se usó `--dryRunOnly` + auditoría de `reports/mutation/mutation.json` de la corrida definitiva.

## 1. Gates ejecutados en esta validación

| Gate | Comando | Resultado exacto | Estado |
|---|---|---|---|
| typecheck | `npx tsc --noEmit` | 0 errores (0 líneas de salida), exit 0 | ✅ PASS |
| lint | `pnpm run lint` | **0 errores**, 288 warnings preexistentes, exit 0 | ✅ PASS |
| unit (suite completa) | `npx jest tests/unit/` | **86/86 suites · 1236 passed · 1 skipped (1237)** · 7.371 s | ✅ PASS |
| unit (motor torneos) | `npx jest tests/unit/motor-torneo/` | **11/11 suites · 218 passed · 1 skipped (219)** | ✅ PASS |
| mutation config | `npx jest -c jest.config.mutation.js --listTests` | **13 archivos**, todos `tests/unit/**`, 0 fuera del scope | ✅ PASS |
| mutation dry run | `npx stryker run --dryRunOnly` | exit 0 · **"Ran 252 tests in 5 seconds"** | ✅ PASS |
| coverage | `node scripts/validate-harness.js --coverage` | PASS · lib **92.6% lines** / 84.1% branches / 88% functions (baseline 88.6 / 76.6 / 71.1 → sube) | ✅ PASS |
| secrets | `pnpm run security:secrets` | gitleaks: 73.98 MB escaneados, **no leaks found**, exit 0 | ✅ PASS |
| sast | `pnpm run security:sast` | 210 reglas · 323 archivos · 58 findings, exit 0 (sin hallazgos bloqueantes nuevos) | ✅ PASS |
| audit deps | `pnpm audit --audit-level=high` | 72 vulns preexistentes (7 low/31 mod/25 high/9 critical) · **0 en `@stryker-mutator/*` ni `jest-environment-node`** | ✅ PASS (sin regresión) |
| build | `npx next build` | **NO ejecutado** (delegado al harness `--all`, instrucción de alcance). Última corrida completa del harness (2026-11-04) con build PASS; el change no toca `app/`, `lib/`, config de Next ni runtime deps | ⏸️ delegado |
| AC-08 diff | `git diff --stat HEAD -- lib/ app/ components/ hooks/` | **vacío** (0 archivos, 0 líneas) | ✅ PASS |
| harness opt-in | `grep stryker scripts/validate-harness.js` | 0 coincidencias | ✅ PASS |

## 2. Suites unitarias (86 suites / 1236 tests)

| Área | Suites | Cobertura del change |
|---|---|---|
| `tests/unit/motor-torneo/` | **11** | 9 preexistentes ampliadas + `courts.test.ts`, `objective.test.ts`, `types.test.ts` nuevas; `fixtures.ts` compartido (sin archivos de test) |
| `tests/unit/torneos/` | **2** | `limits.test.ts` preexistente + `dispatch.test.ts` nueva (EC-04) |
| `tests/unit/validations/torneo.test.ts` | 1 | Ampliada (asserts exactos de mensajes Zod) |
| Resto del repo | 72 | Sin cambios; corren igual (regresión 0) |

> `purity.test.ts` (linter estático del módulo puro) sigue en la suite normal pero **no** en la de mutación (no cubre el código mutado).

## 3. Suites de mutación (`jest.config.mutation.js` → 13 archivos / 252 tests)

| # | Suite | Qué cubre | Módulo mutado | Score final |
|---:|---|---|---|---:|
| 1 | `motor-torneo/bracket.test.ts` | cuadros, pases libres, `resto` | `bracket.ts` | 75.3% |
| 2 | `motor-torneo/calendar.test.ts` | `buildBlocks`, no-solape, límites de bloque | `calendar.ts` | 76.1% |
| 3 | `motor-torneo/courts.test.ts` | asignación voraz de canchas | `courts.ts` | 78.3% |
| 4 | `motor-torneo/diagnostics.test.ts` | semáforo + 6 indicadores | `diagnostics.ts` | 94.7% |
| 5 | `motor-torneo/loader.test.ts` | cargador §6, 4 reglas, mensajes exactos | `loader.ts` | 89.8% |
| 6 | `motor-torneo/model.test.ts` | variables `x[m,b]`, R1–R5, OOB typed arrays | `model.ts` | 89.8% |
| 7 | `motor-torneo/objective.test.ts` | pesos `W_*`, valor numérico exacto (EC-08) | `objective.ts` | 96.6% |
| 8 | `motor-torneo/solver-parity.test.ts` | wrapper HiGHS, clamp, paridad (opt-in slow) | `solver.ts`, `engine.ts` | 54.2% / 73.3% |
| 9 | `motor-torneo/types.test.ts` | ramas de `partidosFase`/`personasDoble` | `types.ts` | 86.7% |
| 10 | `motor-torneo/verify.test.ts` | verificador independiente, 8 códigos | `verify.ts` | 92.4% |
| 11 | `torneos/dispatch.test.ts` | despacho fire-and-forget (mock `@/lib/db`) | `dispatch.ts` | 100% |
| 12 | `torneos/limits.test.ts` | clamps de `timeLimitMs` | `limits.ts` | 100% |
| 13 | `validations/torneo.test.ts` | schemas Zod | `validations/torneos.ts` | n/a — 6/6 `Ignored` (`ignoreStatic`) |

### Score global de mutación

| Métrica | Baseline | Definitivo | Δ |
|---|---:|---:|---:|
| Mutation score (fórmula Stryker v10) | 54.93% | **86.90%** | **+31.97** |
| Killed | 644 | 967 | +323 |
| Timeout (detectado) | 13 | 15 | +2 |
| Survived | 434 | 98 | −336 |
| NoCoverage | 105 | 50 | −55 |
| CompileError (fuera del denominador) | 570 | 563 | −7 |
| Filas con decisión | — | **148/148** | 100% |

> Thresholds: `high: 86.9` = score medido · `low = break: 81.9` = score − 5. Verificado leyendo `stryker.conf.mjs:53`.

## 4. API tests — **N/A justificado**

- `git diff HEAD -- app/api` = **0** → no se crea ni modifica ningún route handler.
- `git diff HEAD -- lib/db` = 0 → ninguna query nueva; no hay SQL que ejercer contra NeonDB.
- No hay endpoint nuevo ⇒ no aplica "1 happy-path con SQL real" ni entry en `lib/api-docs/spec.ts`
  (`git diff HEAD -- lib/api-docs` = 0, verificado).
- Evidencia de calidad equivalente: corrida de mutación + `mutation-triage.md` (148/148).

## 5. E2E / mobile / desktop — **N/A justificado**

- `git diff HEAD -- app/ components/ hooks/` = **0** → cero cambios de UI, rutas o componentes.
- No hay flujo navegable nuevo que validar; smoke de regresión visual no aporta señal sobre este change.
- Los E2E existentes no se ven afectados (no se tocó ningún módulo de UI ni `playwright.config.ts`).

## 6. Riesgos de cobertura (no bloqueantes)

| Riesgo | Detalle | Mitigación |
|---|---|---|
| `validations/torneos.ts` fuera de mutación | `ignoreStatic: true` ⇒ 6/6 mutantes `Ignored` | Limitación documentada; cubierto por asserts Zod en suite normal |
| 22 `excluded (coste)` en `solver.ts` | ramas de límite HiGHS exigen ≥30 s de re-solve o mock del WASM | Score las cuenta como sobrevivientes (no se maquilla) |
| `bracket.ts` 75.3% / `calendar.ts` 76.1% | Por debajo del global, sobre el `break` global | Candidato a M2 (no out-of-scope de v0.13) |
| Coste 45–99 min | Opt-in real, fuera de `--all`/husky | Duración publicada + `test:mutation:phase-b` |
