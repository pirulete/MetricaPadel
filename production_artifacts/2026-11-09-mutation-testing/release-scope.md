# Release Scope — Mutation testing con Stryker (v0.13)

> change_id: `2026-11-09-mutation-testing`
> status: `proposed`
> release objetivo: `v0.13` (a confirmar por @architect/@qa-release al cierre)
> date: `2026-11-09`
> module: `infra`
> tags: `[testing, tooling, quality]`
> feature-spec: `./feature-spec.md`
> tipo de cambio: **tooling / DEBUT** — no modifica lógica de negocio, API, DB, UI ni auth

---

## 1. Qué entra

| # | Item | Valor | Evidencia de aceptación |
|---|---|---|---|
| 1 | 4 devDeps de Stryker (core, jest-runner, typescript-checker, html-reporter) en un solo major | Mutation testing disponible en el repo, aprobado explícitamente por el usuario | AC-01 (mismo major, `stryker --version`, audit sin altas) |
| 2 | `jest.config.mutation.js` dedicada (sin `collectCoverage`, sin `verbose`, `testTimeout` 60 s, `testMatch` acotado) | Elimina el costo de cobertura por mutante que hoy hace inviable correr Stryker | AC-02 (`--listTests` acotado a ≤10 suites) |
| 3 | `stryker.conf.mjs` con scope `lib/motor-torneo/**` + `lib/torneos/{limits,dispatch}` + `lib/validations/torneos.ts` | Mide la lógica pura de mayor riesgo (MILP, verificador, objetivos) | AC-03 (`--dryRun` sin archivos fuera de scope) |
| 4 | Scripts `test:mutation` / `test:mutation:report` + `.gitignore` | Herramienta usable por cualquier dev con un comando | AC-01 + AC-10 (no entra al harness) |
| 5 | **Baseline medido** (`mutation-baseline.md`) con score global y por archivo | Deja de haber una opinión sobre la calidad de los tests; hay un número | AC-04 (comando, duración, desglose) |
| 6 | Threshold fijado a **score − 5 puntos** (break/low), `high` encima | Evita romper por ruido y detecta regresiones reales | AC-05 (segunda corrida ≥ break) |
| 7 | **Triaje 100%** de sobrevivientes (`mutation-triage.md`) | Ningún mutante queda sin decisión: o se mata o se justifica | AC-06 (0 filas sin decisión) |
| 8 | Tests reforzados (asserts numéricos/de códigos exactos) en `tests/unit/**` | El score sube por calidad real, no por config | AC-07 (pasan en `pnpm test:unit`) |
| 9 | `tests/unit/torneos/dispatch.test.ts` (condicional, EC-04) | `dispatch.ts` deja de ser un agujero `no-coverage` | AC-06/AC-07 |
| 10 | Sección "Mutation testing (Stryker)" en `ARCHITECTURE.md` + entrada FEATURES.md | Onboarding: cómo correrlo, qué mide y qué **no** mide | AC-11 |
| 11 | Decisión documentada sobre `solver.ts`/`engine.ts` (mantener o excluir con razón) | No se oculta el archivo más caro ni el más riesgoso | AC-12 (ambos scores publicados) |

---

## 2. Qué NO entra (explícito)

- **fast-check / property-based testing** — opción C descartada por decisión del usuario. No se instala.
- **Mutación de route handlers** (`app/api/**`) — requieren Next/DB runtime, fuera del runner de unit.
- **Mutación de queries SQL** (`lib/db/queries/torneos/**`) — dependen de NeonDB real.
- **Mutación de componentes React, hooks o UI** (`components/`, `hooks/`, `app/(app)/`).
- **Gate bloqueante en `scripts/validate-harness.js --all`** — la mutación es **opt-in**, nunca parte del gate estándar.
- **Workflow de CI** (GitHub Actions), cron, badge de mutation score, SonarQube.
- **`mutmut` sobre el prototipo Python** (`motor_torneo/`) — sigue siendo golden reference, no producción.
- **Refactor de producción** para facilitar mutación (partir `diagnostics.ts`, extraer helpers): si surge, es deuda separada.
- **Cambios en thresholds de cobertura** de `jest.config.js` ni en `.validation/coverage-baseline.json`.
- **Histórico/tendencias de score en DB**, dashboard, comparación entre corridas por base de datos.
- **Thresholds por archivo** (solo global + excepciones comentadas en config).
- **Mutación de `synthetic.ts`** (código de test) ni de `index.ts` (barrel sin lógica).
- **API tests / E2E** — N/A justificado: 0 endpoints nuevos, 0 cambios de UI (AC-13).

---

## 3. Métricas de aceptación del release

| Métrica | Baseline actual | Target v0.13 | Cómo se verifica |
|---|---|---|---|
| Mutation score global (scope) | **no existe** | medido; threshold = medido − 5 | `mutation-baseline.md` + `stryker.conf.mjs` |
| Mutation score motor puro (sin solver/engine si se excluyen) | **no existe** | **≥ 80%** | `mutation-baseline.md` por archivo |
| Sobrevivientes sin triar | — | **0** | `mutation-triage.md` |
| Unit tests `motor-torneo` | 86 | ≥ 86 (solo se agregan) | `pnpm test:unit` |
| Unit tests totales | ≥ 948 | ≥ 948 | `pnpm test:unit` |
| Cobertura `lib` lines | 88.6% | no bajar >3% (≥ 85.6%) | gate `--coverage` |
| Typecheck / lint / build | verde | verde | `validate-harness.js` |
| `--all` duration | actual | sin cambio de orden de magnitud | `release-report.md` |
| Cambios en código de producción | — | **0 líneas** | `git diff` de AC-08 |

---

## 4. Evidencia requerida al cierre

| Artifact | Contenido mínimo |
|---|---|
| `mutation-baseline.md` | comando, fecha, duración, score global, score por archivo, conteo por estado (killed/survived/no-coverage/timeout/compile error) |
| `mutation-triage.md` | 1 fila por sobreviviente: archivo, línea, mutador, decisión, evidencia |
| `ponytail-review-report.md` | qué se simplificó en tests/config; líneas netas; excepciones |
| `release-report.md` | AC cumplidos, gates verdes, decisión solver/engine con ambos scores, duración de `--all` |
| `evidence-manifest.json` | según plantilla `.agents/templates/evidence-manifest.template.json` |
| `reports/mutation/{index.html,mutation.json}` | reportes generados (no commiteados si `.gitignore` los excluye; se referencian en el manifest) |

---

## 5. Rollback

Cambio puramente aditivo y opt-in: revertir = eliminar `stryker.conf.mjs`, `jest.config.mutation.js`, los 2 scripts, las 4 devDeps y los tests reforzados (o dejarlos, no afectan producción). **Cero impacto en runtime, DB o UX.** No requiere migración ni plan de datos.

---

## 6. Riesgo de release

**Bajo.** No toca código de producción ni contratos. El único riesgo real es **calidad del proceso** (fijar threshold sin medir, o dejar sobrevivientes sin triar), mitigado por AC-04/AC-05/AC-06 como criterios duros y no negociables.
