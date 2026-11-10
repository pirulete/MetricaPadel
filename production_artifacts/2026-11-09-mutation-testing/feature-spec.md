# Feature Spec — Mutation testing con Stryker (módulo torneos + lógica pura adyacente)

> change_id: `2026-11-09-mutation-testing`
> status: `proposed`
> release: `v0.13`
> date: `2026-11-09`
> module: `infra`
> tags: `[testing, tooling, quality]`
> autor: @pm · fuente de decisiones: usuario (cerradas, no se re-abren) + lectura de `FEATURES.md` v0.12, `jest.config.js`, `package.json`, `tests/unit/motor-torneo/*`, `lib/motor-torneo/*`, `lib/torneos/*`, `lib/validations/torneos.ts`

---

## 0. Contraste con FEATURES.md (verificado 2026-11-09)

- `FEATURES.md` §"Módulo Torneos — motor de agenda en TypeScript" (`change_id: 2026-11-04-motor-torneo-ts`, release **v0.12**, module `torneos`) documenta el módulo **implementado y liberado**: motor puro en `lib/motor-torneo/` (11 módulos), glue en `lib/torneos/`, validaciones en `lib/validations/torneos.ts`, 8 suites de unit tests (86 tests).
- `grep -ri "stryker|mutation|mutmut"` sobre repo, `package.json` y `jest.config.js`: **0 coincidencias**. No existe ninguna herramienta de mutación, ni config, ni script, ni deuda parcial.
- **Conclusión:** esta feature es **tooling nuevo (DEBUT)** sobre un módulo ya existente. **NO modifica lógica de negocio, contratos API, DB, UI ni auth.** El único código de producción que puede cambiar son **tests** (asserts más fuertes) y los archivos de configuración del runner.

---

## 1. Problema

El módulo torneos es el de mayor riesgo del repo: un MILP con reglas duras (una persona en dos canchas, precedencias de cuadro, disponibilidad declarada, cero extensión del domingo) cuya única validación hoy es:

1. **Cobertura de líneas** (`lib` 88.6% lines, `lib/motor-torneo` 95.94%) — métrica que **no distingue** un assert real de uno trivial (`expect(x).toBeDefined()`).
2. **Paridad Python↔TS** (`solver-parity.test.ts`) — valida el resultado contra fixtures, no la lógica interna.

Ninguna de las dos detecta el caso clásico: un `>=` cambiado por `>`, un `&&` por `||`, un `W_*` de objetivo alterado, o un clamp de timeout invertido. Un mutante que **sobrevive** es la prueba directa de un assert ausente. Con el motor ya en producción (v0.12), una regresión silenciosa en `verify.ts` o `model.ts` produce agendas inválidas **sin fallar ningún test**.

Adicionalmente, `jest.config.js` tiene `collectCoverage: true` y `verbose: true` **siempre**, lo que hace inviable correr la suite por mutante (cada mutante pagaría cobertura completa).

---

## 2. Objetivo

Introducir **mutation testing opt-in** con StrykerJS sobre la **lógica pura** del módulo torneos, y usarlo para **endurecer los asserts** de los tests existentes hasta que el score sea significativo y reproducible.

**Objetivo medible (v0.13):**

| Métrica | Target |
|---|---|
| Mutantes generados en scope | ~600–900 (estimado por tamaño de archivo) |
| Mutation score global (scope acordado) | **baseline medido**, threshold fijado a **baseline − 5 puntos** |
| Mutation score del motor puro (`lib/motor-torneo/**`, sin `solver`/`engine` si se excluyen) | **≥ 80%** (target mediano acordado) |
| Sobrevivientes sin triar al cierre | **0** (cada uno: `killed` \| `equivalent` documentado \| `excluded` con razón) |
| Regresión en gates existentes | **0** (typecheck, lint, unit, API, E2E, build, harness `--all`) |
| Cambios en código de producción (`lib/`, `app/`, `components/`, `hooks/`) | **0 líneas** |

**Decisiones cerradas (no se re-abren — acordadas con el usuario):**

| # | Decisión |
|---|---|
| D1 | Se **planea e implementa Stryker**, no se deja como deuda. |
| D2 | **fast-check / property-based testing descartado** (opción C). No se mezcla con este change. |
| D3 | La dependencia nueva está **aprobada explícitamente** por el usuario (derogación puntual de la regla "sin dependencias nuevas" para tooling de calidad). |
| D4 | Scope de mutación: `lib/motor-torneo/**` (lógica pura) + `lib/torneos/**` + `lib/validations/torneos.ts`. **Excluye** tests, scripts, DB, rutas y UI. |
| D5 | **4 devDeps del mismo major de Stryker**: `@stryker-mutator/core`, `@stryker-mutator/jest-runner`, `@stryker-mutator/typescript-checker`, `@stryker-mutator/html-reporter`. ⚠️ **Enmendada por C-2/C-3** (ver §2.1): el set real es 3 paquetes `@stryker-mutator/*` mono-versión + `jest-environment-node` como pin de entorno. Siguen siendo **4 devDeps totales**; la decisión de fondo (una sola dependencia aprobada, 4 paquetes dev) no cambia. |
| D6 | Config **dedicada** `jest.config.mutation.js` (sin `collectCoverage`, sin `verbose`) + `stryker.conf.mjs`. |
| D7 | Scripts `test:mutation` (y opcional `test:mutation:report`). **NO** entra al harness `--all`: es **opt-in**, mismo patrón que `RUN_SLOW_PARITY`. |
| D8 | `solver.ts` y `engine.ts` **entran en la primera corrida**. Si el costo por mutante (re-solve WASM) los hace inviables, se excluyen y se documenta que son adaptadores delgados de WASM cuya lógica vive en `model.ts`/`objective.ts`. |
| D9 | Proceso obligatorio: **baseline → threshold = score − 5 → triaje de cada sobreviviente**. Nunca fijar un threshold a ciegas antes de medir. |

---

## 2.1 Enmiendas del diseño técnico (C-1…C-4, aplicadas 2026-11-09)

> Registradas aquí para que la validación de AC no dependa de leer el design. Detalle en `technical-design.md` §0 y `technical-design-v2.md`.

| # | Enmienda | Efecto sobre esta spec |
|---|---|---|
| C-1 | Stryker se fija en **10.1.1 exacto** (no "v6+") | AC-01 usa la versión literal |
| C-2 | `@stryker-mutator/html-reporter` **eliminado** (el reporter `html` vive en `core` desde v5) | D5 enmendada; AC-01 reescrito |
| C-3 | `jest-environment-node@^30.4.1` como devDep explícito (pnpm no hoistea; el runner lo resuelve por `require.resolve`) | AC-01 lo lista como pin de entorno |
| C-4 | Sin `Stryker disable` ni `// EQUIVALENT:` inline en `lib/**` (violaría AC-08); los `equivalent` se documentan solo en `mutation-triage.md` | AC-06 reescrito |

---

## 3. Alcance

### 3.1 Archivos bajo mutación (`mutate`)

| Archivo | Líneas | Rol | ¿Test unitario que lo ejerce? |
|---|---|---|---|
| `lib/motor-torneo/types.ts` | 334 | Tipos/contratos puros | indirecto (todos) — esperado ~0 mutantes |
| `lib/motor-torneo/calendar.ts` | 125 | `buildBlocks` + no-solape | `calendar.test.ts` (162 L) |
| `lib/motor-torneo/bracket.ts` | 248 | Cuadros + pases libres | `bracket.test.ts` (221 L) |
| `lib/motor-torneo/loader.ts` | 438 | Cargador JSON §6, 4 reglas | `loader.test.ts` (350 L) |
| `lib/motor-torneo/model.ts` | 371 | Variables `x[m,b]`, R1–R5 | `model.test.ts` (258 L) |
| `lib/motor-torneo/objective.ts` | 156 | Pesos `W_*`, 4 componentes | `model.test.ts` + `DEFAULT_PARAMS` |
| `lib/motor-torneo/solver.ts` | 185 | Wrapper HiGHS WASM, clamp | `solver-parity.test.ts` (d8) |
| `lib/motor-torneo/courts.ts` | 80 | Asignación voraz | indirecto vía `engine` |
| `lib/motor-torneo/verify.ts` | 192 | Verificador independiente, 8 códigos | `verify.test.ts` (163 L) |
| `lib/motor-torneo/diagnostics.ts` | 446 | Semáforo + 6 indicadores | `diagnostics.test.ts` (243 L) |
| `lib/motor-torneo/engine.ts` | 136 | Orquestador | `solver-parity.test.ts` |
| `lib/torneos/limits.ts` | 64 | Clamps de `timeLimitMs` | `tests/unit/torneos/limits.test.ts` |
| `lib/torneos/dispatch.ts` | 129 | Despacho fire-and-forget (DB) | **NO** — ver EC-04 |
| `lib/validations/torneos.ts` | 39 | Schemas Zod | `tests/unit/validations/torneo.test.ts` |

**Excluidos del `mutate` con justificación:**
- `lib/motor-torneo/synthetic.ts` e `lib/motor-torneo/index.ts` — **no existen en el repo** (verificado 2026-11-09; `purity.test.ts` los menciona condicionalmente). Si se crean, quedan fuera de `mutate`: no son lógica de producto.
- `lib/torneos/dispatch.ts` — se incluye **condicionado** a la creación de `tests/unit/torneos/dispatch.test.ts` (EC-04). Sin unit test, todos sus mutantes serían `NoCoverage` y ensuciarían el score.

### 3.2 Configuración a crear

| Archivo | Contenido mínimo |
|---|---|
| `stryker.conf.mjs` | `testRunner: "jest"`, `jest.configFile: "jest.config.mutation.js"`, `checkers: ["typescript"]`, `coverageAnalysis: "perTest"`, `timeoutMS: 60000`, `timeoutFactor: 3`, `concurrency: 1`, `reporters: ["clear-text","progress","html","json"]`, `thresholds: { high, low, break }` post-baseline, `mutate` (globs §3.1), `ignoreStatic: true`, `cleanTempDir: "always"`, `ignorePatterns` explícitos, comentario `// EXCLUDED:` a nivel archivo |
| `jest.config.mutation.js` | Derivada de `jest.config.js`: `collectCoverage: false`, `verbose: false`, `testTimeout: 60000`, `roots: ['<rootDir>/tests/unit']`, `testMatch` **acotado** a las suites del scope (`motor-torneo/*.test.ts`, `torneos/limits.test.ts`, `validations/torneo.test.ts`, `torneos/dispatch.test.ts` si existe), mismo `transform` ts-jest y `moduleNameMapper` `^@/(.*)$` |
| `package.json` | `"test:mutation": "stryker run"`, `"test:mutation:phase-b": "stryker run --mutate \"lib/motor-torneo/{engine,courts,solver}.ts\""` + devDeps `@stryker-mutator/{core,jest-runner,typescript-checker}@10.1.1` + `jest-environment-node@^30.4.1` (el script `test:mutation:report` de D7 se descarta: sería un alias sin valor) |
| `.gitignore` | `.stryker-tmp/` (ya existe), `.stryker-tmp-*/`, `reports/mutation/` |

### 3.3 Documentación a actualizar

- `ARCHITECTURE.md` — nueva sección "Mutation testing (Stryker)": comando, scope, thresholds, política de triaje, por qué es opt-in.
- `FEATURES.md` — entrada de este change (metadata 2026-11-09 · v0.13 · infra).
- `production_artifacts/2026-11-09-mutation-testing/` — `mutation-baseline.md`, `mutation-triage.md`, `release-report.md`, `ponytail-review-report.md`.

---

## 4. Acceptance Criteria

> Regla del repo: todo cambio incluye tests. **AC-13 explicita la excepción justificada** (tooling sin endpoint ni UI).

- **AC-01 — Tooling instalado, coherente y aislado.** *(enmendado por C-1/C-2/C-3)*
  Las **3 devDeps de Stryker** (`@stryker-mutator/core`, `@stryker-mutator/jest-runner`, `@stryker-mutator/typescript-checker`) están en `devDependencies` con la **versión exacta `10.1.1`** (misma versión en los 3; `pnpm ls @stryker-mutator/*` sin mezcla), más **`jest-environment-node@^30.4.1`** como pin de entorno requerido por el runner bajo pnpm. `npx stryker --version` responde `10.1.1`. `pnpm install` es reproducible desde el **lockfile commiteado** (`pnpm-lock.yaml` incluido en el diff). Ninguna dependencia de producción cambia (`pnpm audit --audit-level=high` sin vulnerabilidades nuevas altas).

- **AC-02 — Configuración de Jest dedicada y acotada.**
  `npx jest -c jest.config.mutation.js --listTests` lista **exactamente** las suites del scope (**13 hoy**: las 10 del diseño + `objective`, `types` y `courts` creadas durante el triaje 3f/3c — todas de `tests/unit/` del alcance) y **ninguna** de `tests/api/`, `tests/e2e/`, `tests/fixtures/`, `tests/helpers/`. La config **no** activa `collectCoverage` ni `verbose`. La suite normal (`pnpm test:unit`) permanece idéntica en comportamiento. *(Enmienda 2026-11-09: el diseño decía ≤10 antes de que el triaje exigiera tests nuevos; la restricción de pertenencia al scope es la que se mantiene.)*

- **AC-03 — Scope de mutación verificado.**
  `npx stryker run --dryRun` (o el reporte de la primera corrida) enumera **solo** archivos de `lib/motor-torneo/**`, `lib/torneos/{limits,dispatch}.ts` y `lib/validations/torneos.ts`. Cero mutantes en `app/`, `components/`, `hooks/`, `lib/db/`, `scripts/` ni en archivos de test.

- **AC-04 — Baseline medido, no supuesto.**
  Existe `mutation-baseline.md` con: comando exacto ejecutado, fecha, duración total, `mutationScore` global, score **por archivo**, conteo de `killed / survived / no-coverage / timeout / compile error`, y la fecha de la corrida. El reporte HTML y el JSON quedan generados en `reports/mutation/`.

- **AC-05 — Threshold fijado con la regla acordada.**
  En `stryker.conf.mjs`, `thresholds.break` y `thresholds.low` = **score medido − 5 puntos** (valor numérico explícito, no un placeholder), `high` ≥ `low`. Una segunda corrida completa sale **≥ break** (no rompe el threshold que la propia corrida fijó).

- **AC-06 — 100% de sobrevivientes triados (criterio duro).** *(enmendado por C-4)*
  `mutation-triage.md` tiene **una fila por mutante sobreviviente o `no-coverage`** con: archivo, línea, mutador, decisión (`killed` \| `equivalent` \| `excluded`), evidencia (test agregado o razón de equivalencia). **Cero filas sin decisión.** Los **`excluded`** llevan comentario `// EXCLUDED: <razón>` a nivel **archivo** en `stryker.conf.mjs`. Los **`equivalent`** se documentan **únicamente** en `mutation-triage.md` (prueba de una línea); **prohibido** `// EQUIVALENT:` en `stryker.conf.mjs` fuera de comentarios de archivo y prohibido `Stryker disable` inline en `lib/**` (violaría AC-08).

- **AC-07 — Los `killed` se logran reforzando tests, no cambiando producción.**
  Cada mutante que se decide matar se mata con asserts nuevos/fortalecidos en `tests/unit/**` (ej.: valor numérico exacto del objetivo, longitud exacta de violaciones, código de error específico en vez de "hay error"). Los tests nuevos pasan en la suite normal (`pnpm test:unit`).

- **AC-08 — Cero cambios de lógica de negocio.**
  `git diff --stat` sobre `lib/motor-torneo/`, `lib/torneos/`, `lib/validations/`, `app/`, `components/`, `hooks/` = **0 líneas**. Cambios permitidos únicamente en `tests/unit/**`, `stryker.conf.mjs`, `jest.config.mutation.js`, `package.json`, `pnpm-lock.yaml`, `.gitignore`, `FEATURES.md`, `ARCHITECTURE.md`, `production_artifacts/**`.

- **AC-09 — Gates existentes sin regresión.**
  `node scripts/validate-harness.js --typecheck --lint --tests --build` en verde; unit tests ≥ 86 en `motor-torneo` y ≥ 948 totales; cobertura `lib` no cae más de 3% vs `.validation/coverage-baseline.json` (88.6% lines); `gitleaks` y `semgrep` sin nuevos hallazgos por los 4 paquetes dev.

- **AC-10 — Harness `--all` intocado (opt-in real).**
  `scripts/validate-harness.js` **no** invoca `stryker` en ningún gate; la duración de `--all` no cambia de orden de magnitud. Verificado por inspección del script y por el tiempo de ejecución reportado en `release-report.md`.

- **AC-11 — Documentación y artifacts completos.**
  Sección "Mutation testing (Stryker)" en `ARCHITECTURE.md` (comando, scope, threshold, política de triaje, por qué opt-in); entrada en `FEATURES.md` con la metadata exigida; `mutation-baseline.md`, `mutation-triage.md`, `ponytail-review-report.md` y `release-report.md` presentes en `production_artifacts/2026-11-09-mutation-testing/`.

- **AC-12 — Decisión `solver.ts` / `engine.ts` explícita y justificada.**
  Si permanecen: el baseline muestra su score y el costo por mutante. Si se excluyen: `stryker.conf.mjs` los comenta con `// EXCLUDED: adaptador WASM delgado, lógica en model.ts/objective.ts` y `release-report.md` publica el score **recalculado sin ellos** junto al score con ellos (no se maquilla el número).

- **AC-13 — Tests: unit obligatorios, API/E2E N/A justificado.**
  Unit: los asserts nuevos de AC-07 + (si aplica EC-04) `tests/unit/torneos/dispatch.test.ts`. **API tests**: N/A — esta feature no crea ni modifica ningún route handler (verificado: `git diff app/api` = 0). **E2E**: N/A — no modifica UI (verificado: `git diff app/ components/` = 0). La evidencia de calidad equivalente es la corrida de mutación + `mutation-triage.md`. Esta excepción queda escrita aquí para el gate de @qa-release.

---

## 5. Edge cases

| # | Caso | Política |
|---|---|---|
| **EC-01** | **Mutantes equivalentes** (semánticamente iguales: reordenar `||` no observables, `>=` vs `>` en límites inalcanzables, constantes de tipos). | No se fuerza refactor de producción. Se marcan `equivalent` en `mutation-triage.md` con la razón concreta. Si superan ~10% del total, se documenta como señal de diseño y se evalúa `// Stryker disable next-line` puntual en config, nunca un `disable` global. |
| **EC-02** | **Mutantes lentos por re-solve WASM** (`engine.ts`, `courts.ts`, `solver.ts`): cada mutante re-ejecuta `runEngine` → segundos por mutante. | Mitigación en cadena: `coverageAnalysis: "perTest"` + `enableFindRelatedTests` + `concurrency: 2` + `timeoutFactor: 3`. Si la fase motor supera ~60 min, se aplica D8 (excluir documentando). |
| **EC-03** | **Compatibilidad Stryker ↔ Jest 30.** El `jest-runner` puede no soportar oficialmente Jest 30. | @architect **verifica el peer range real** antes de instalar y fija la versión que lo soporte. Fallback aceptado: `testRunner: "command"` con `npx jest -c jest.config.mutation.js <testFile>` (pierde `perTest`, se vuelve más lento pero funciona) + `coverageAnalysis: "off"`. **No** se hace downgrade de Jest. |
| **EC-04** | **`dispatch.ts` sin unit test** → 100% de sus mutantes serían `no-coverage` y hundirían el score sin información útil. | Default: crear `tests/unit/torneos/dispatch.test.ts` con `jest.mock("@/lib/db")` (archivo de 129 L, mocks simples, sin SQL real). Si @architect lo considera fuera de presupuesto: se excluye de `mutate` con `// EXCLUDED: cubierto por tests/api/torneos/*` y el score se reporta sin ese archivo. |
| **EC-05** | `synthetic.ts` (generador de fixtures) e `index.ts` (barrel). | Fuera de `mutate`. Mutarlos mide código de test, no de producto. |
| **EC-06** | **Corrida > 5 min.** | No bloquea nada: es opt-in y no entra en `--all`, husky ni pre-push. La duración real se publica en `mutation-baseline.md` para que el equipo sepa el costo antes de correrlo. |
| **EC-07** | Mutante que **no compila** (rompe tipos). | `checkers: ["typescript"]` lo descarta como `compile error`; **no** cuenta como sobreviviente. Si aparecen >5% de compile errors, revisar `tsconfig` del mutation runner. |
| **EC-08** | **Mutación de pesos `W_*` en `objective.ts`**: los tests actuales comparan estructura, no el valor del objetivo → sobrevivientes esperados. | Se resuelve con un test de instancia pequeña que assertea el **valor numérico exacto** del objetivo (no "mayor que"). Es el caso que más valor aporta al score. |
| **EC-09** | `RUN_SLOW_PARITY` ausente ⇒ tests lentos se auto-skip; si un fixture cambia, el score se vuelve no determinista. | Se corre el baseline **dos veces** y se exige diferencia ≤ 0.5 puntos antes de fijar el threshold (AC-05). |
| **EC-10** | **No determinismo del solver** (HiGHS puede devolver soluciones distintas). | Ya tratado por `solver-parity.test.ts` con comparación por indiferencia. La mutación no debe introducir asserts sobre soluciones exactas nuevas. |
| **EC-11** | Mutantes de `verify.ts` matados por `expect(violations).toHaveLength(0)` sin mensaje. | Aceptado: matar el mutante es el objetivo; el mensaje solo mejora el diagnóstico. |
| **EC-12** | Máquina lenta / poca RAM (WASM). | `--concurrency 1` documentado como escape hatch en `ARCHITECTURE.md`. |

---

## 6. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Costo de tiempo hace que nadie corra la herramienta | Alta | Medio | Opt-in real (AC-10), fases separadas (motor puro primero), duración publicada, threshold con margen −5 |
| R2 | `@stryker-mutator/jest-runner` incompatible con Jest 30 | Media | Alto | EC-03: verificar peer range en @architect; fallback `command` runner |
| R3 | Los asserts nuevos rompen la suite normal o son flaky | Media | Medio | Cada test nuevo corre en `pnpm test:unit` antes de cerrar (AC-07/AC-09); nada de asserts sobre soluciones exactas nuevas (EC-10) |
| R4 | **Falsa sensación de seguridad**: score alto ≠ SQL/UI correctos | Alta | Medio | Out-of-scope explícito (§7); `ARCHITECTURE.md` dice que el score cubre solo lógica pura |
| R5 | Supply chain: 4 paquetes nuevos | Baja | Medio | Solo devDeps, mismo scope oficial, `pnpm audit --audit-level=high` en AC-09, lockfile commiteado |
| R6 | Excluir `solver`/`engine` deja el módulo más riesgoso sin medir | Media | Alto | AC-12 obliga a publicar ambos números y a justificar; `model.ts` + `objective.ts` + `verify.ts` siguen medidos |

---

## 7. Out-of-scope (EXPLÍCITO)

- **fast-check / property-based testing** — descartado en esta decisión (opción C). No se instala, no se mezcla.
- **Mutación de route handlers** (`app/api/torneos/**`) — requieren DB/Next runtime; fuera del alcance del runner de Jest unit.
- **Mutación de queries SQL** (`lib/db/queries/torneos/**`) — dependen de NeonDB real; la herramienta no puede aislarlos sin mocks que devalúen la señal.
- **Mutación de componentes React / hooks** — cubierto por E2E, no por mutación en v0.13.
- **Integración como gate bloqueante del harness `--all`** — descartado: costo prohibitivo por corrida y flakiness de WASM.
- **Mutación del prototipo Python con `mutmut`** — el prototipo es golden reference, no código de producción.
- **Workflow de CI (GitHub Actions job de mutación)** — no se crea job, ni cron, ni badge.
- **Cambios en thresholds de cobertura** de `jest.config.js` o del baseline `.validation/coverage-baseline.json`.
- **Refactor de producción** para "hacer mutables" archivos (ej.: partir `diagnostics.ts` de 446 L). Si aparece la tentación, se documenta como deuda separada.
- **Thresholds por archivo** en v0.13 — solo global + excepciones documentadas.
- **Mutation score persistido en DB / histórico de tendencias / SonarQube / dashboard**.
- **Mutación de `lib/motor-torneo/synthetic.ts`** (código de test) y de cualquier archivo fuera de `lib/`.

---

## 8. Dependencias

| Tipo | Item | Nota |
|---|---|---|
| npm dev | `@stryker-mutator/core` | `10.1.1` exacto (C-1) |
| npm dev | `@stryker-mutator/jest-runner` | `10.1.1`; sin peer de Jest, se desarrolla contra Jest 30 (EC-03) |
| npm dev | `@stryker-mutator/typescript-checker` | `10.1.1`; descarta mutantes que no compilan |
| npm dev | `jest-environment-node` | `^30.4.1` — pin de entorno, **no** es paquete de Stryker (C-2/C-3). El `html-reporter` **no** se instala |
| Runtime | Node ≥ 22, pnpm ≥ 9 | ya requeridos por `engines` |
| Test infra | Jest 30 + ts-jest 29 (`jest.config.js` actual) | se **deriva** una config, no se modifica la existente |
| Fixtures | `tests/fixtures/torneo/**` + `tests/unit/motor-torneo/solver-parity.test.ts` | ya existen desde v0.12 |
| Previo | Módulo torneos v0.12 liberado (motor + 86 tests) | sin esto no hay nada que mutar |
| Env | **Ninguna** variable nueva | no toca DB, no toca `.env.example` |

---

## 9. Fases del workflow (para @architect y orquestador)

| # | Agente | Entrega | Chunking |
|---|---|---|---|
| 1 | @pm | `feature-spec.md`, `release-scope.md`, entrada FEATURES.md | — |
| 2 | @architect | `technical-design.md` + `change-map.md`: versión exacta de Stryker (EC-03), política `dispatch.ts` (EC-04), estrategia de fases A/B | — |
| 3 | @app-engineer | `stryker.conf.mjs`, `jest.config.mutation.js`, scripts, `.gitignore`, devDeps, `tests/unit/torneos/dispatch.test.ts` si aplica | **1 chunk** (≤5 archivos) |
| 4 | @app-engineer | Corrida baseline + triaje: fortalece asserts por archivo | chunks ≤5 archivos de test; `mutation-baseline.md` + `mutation-triage.md` |
| 5 | @ponytail-reviewer | Revisión de los cambios de test/config (sin sobreingeniería, sin helpers innecesarios) | — |
| 6 | @qa-release | `release-report.md` + verificación de AC-08/AC-09/AC-10 | ejecuta los gates, no el implementador |

**Nota anti-loop:** @app-engineer **no** ejecuta `next build`, `playwright test`, `db:migrate` ni servers. La corrida de Stryker la ejecuta el chunk que la planifica y su duración se reporta; los gates los corre @qa-release.

---

## 10. Preguntas abiertas para @architect (no bloquean la spec)

| # | Pregunta | Propuesta @pm |
|---|---|---|
| Q1 | Versión exacta del set Stryker con soporte real de Jest 30 | Fijar major único y verificar peer range; fallback `command` runner documentado |
| Q2 | ¿`dispatch.ts` se testea o se excluye? | Testear con `jest.mock("@/lib/db")` (EC-04); es el archivo que más rápido se paga |
| Q3 | ¿`solver.ts`/`engine.ts` quedan en phase A o phase B? | Phase B separada para no bloquear el primer score útil del motor puro |
| Q4 | Valor concreto de `concurrency` en la máquina del equipo | Arrancar en 2, bajar a 1 si hay OOM de WASM (EC-12) |
