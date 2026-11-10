# Design Review — Mutation testing con Stryker (v0.13)

> change_id: `2026-11-09-mutation-testing` · module: `infra` · date: `2026-11-09`
> revisor: @app-engineer (Cross-Agent Review **PRE-implementación**)
> alcance: **solo lectura** sobre el repo + este artifact. No se instaló nada, no se modificó código.
> insumos: `feature-spec.md`, `technical-design.md`, `change-map.md` + inspección del repo
> (jest.config.js, jest.coverage.config.js, package.json, .gitignore, eslint.config.mjs, tsconfig.json,
> `lib/modules/harness/*`, npm registry de los 4 paquetes, docs de Stryker v10, `node --version`, `pnpm --version`).

---

## 0. Hechos verificados en el entorno

| Dato | Valor medido |
|---|---|
| Node / pnpm | `v22.23.2` / `9.15.0` (repo declara `node>=22`, `pnpm>=9`) |
| Jest instalado | `30.4.2` (`^30.3.0`) · `jest-environment-jsdom@30.4.1` |
| TypeScript | `5.9.3` |
| `node_modules/jest-environment-node` | **NO existe** (pnpm sin hoisting) → confirma C-3 |
| `jest.config.js` | `collectCoverage: true`, `verbose: true`, `coverageThreshold.global` → el motivo de la config dedicada es real |
| Gate `unit_tests` | `lib/modules/harness/gates.js:16` → `pnpm run test:unit` (jest base). Cero referencias a stryker/mutation en `lib/modules/harness/**` |
| Gate `coverage` | `lib/modules/harness/checks/coverage.js` → `jest.coverage.config.js` (extiende la base; sin threshold) |
| Suite del scope hoy | **10 suites / 116 tests (115 pass, 1 skipped `RUN_SLOW_PARITY`) en 3.4 s** (ejecutado con `--coverage=false`) |
| Tamaño de árboles que Stryker copiaría al sandbox | `.next` **4.7 GB**, `motor_torneo/` 154 MB (`.venv` 153 MB), `coverage/` 11 MB |
| `lib/motor-torneo/synthetic.ts` / `index.ts` | **no existen** |

---

## 1. Conflictos con el repo

### 1.1 `jest.config.js` ↔ `jest.config.mutation.js` — ✅ (con matiz)

- La config derivada es correcta: `testEnvironment: "node"`, `setupFilesAfterEnv`
  (`tests/unit/setup.ts` es solo `@testing-library/jest-dom`, válido en entorno node), `transform` ts-jest
  idéntico y `moduleNameMapper` idéntico. Verificado contra `jest.config.js`.
- `.js` es CJS porque `package.json` **no** tiene `"type": "module"` → `module.exports` es correcto.
- `testMatch` acotado a `motor-torneo/*.test.ts` + `torneos/*.test.ts` + `validations/torneo.test.ts`;
  `purity.test.ts` cae en el primer glob y se excluye con `testPathIgnorePatterns` ✅.
- **Conteo 10 suites** (post chunk 1): 8 en `motor-torneo/` − `purity` = 7, + `limits` + `dispatch` = 2,
  + `validations/torneo` = 1 → **10 exactas** ✅.
- No se hereda `collectCoverage: true`, `verbose: true` ni `coverageThreshold` (la config no los declara) ✅.
- **Matiz [menor]**: se duplica transform/mapper/setup a mano → riesgo de drift si alguien toca la base.
  `require('./jest.config.js')` + spread + override de 4 claves da lo mismo sin duplicar (y sigue sin
  "tocar" `jest.config.js`).

### 1.2 `package.json` — ✅

- Nombres `test:mutation` y `test:mutation:phase-b` **libres**: los scripts actuales son
  `test`, `test:unit`, `test:e2e`, `perf:*`, `security:*`, `db:*`, `code-review*` (sin colisión, sin patrón `test:*` que los capture en `--all`).
- `test:unit` = `jest` sin argumentos → los configs nuevos no alteran la suite normal ✅.
- DevDeps: las 3 de Stryker + `jest-environment-node@^30.4.1` encajan con lo instalado (`jest 30.4.2`,
  `jest-environment-jsdom 30.4.1`) ✅.

### 1.3 `.gitignore` — ✅

- `.stryker-tmp/` ya existe (línea 43) ✅; `reports/mutation/` **no** existe y el patrón es estrecho ✅.
- No hay un `reports/` previo en el repo → sin efectos colaterales ✅.

### 1.4 ESLint — ⚠️ **falla latente con `.stryker-tmp` residual**

- `eslint.config.mjs` aplica a `**/*.{js,jsx,ts,tsx,mjs}` y sus `ignores` son
  `.next, node_modules, drizzle, production_artifacts, .unlighthouse, coverage, .engram, test-results, playwright-report, playwright/.cache`.
  **No incluye `.stryker-tmp/`.**
- Verificado empíricamente: ESLint 10 **sí lintéa dot-directories** (prueba en dir temporal: `.hidden/x.js`
  reportado, exit 1). Con `cleanTempDir: true` el temp dir **sobrevive a una corrida fallida/interrumpida**
  (solo se borra en corrida exitosa) → `--lint` (gate bloqueante) escanearía copias mutadas de `lib/` y `tests/`.
- **Los dos configs nuevos en sí lintean limpio**: `max-lines` y las reglas `security/*` son `warn`; `stryker.conf.mjs`
  (~55 L) y `jest.config.mutation.js` (~25 L) no disparan errores.

### 1.5 `tsconfig.json` — ✅

- `include` es solo `**/*.ts`/`**/*.tsx` (+ `.next/types` explícito) ⇒ `stryker.conf.mjs` y
  `jest.config.mutation.js` **no** entran al `--typecheck` ni a `next build` ✅.
- `.stryker-tmp` no se typechequea: el glob `**/*.ts` de TS no expande dot-directories (prueba de ello:
  `.next/types` hubo que incluirlo explícitamente).
- Matiz [menor]: `// @ts-check` + JSDoc `import('@stryker-mutator/api/core')` — el subpath **existe**
  (`@stryker-mutator/api` exporta `./core`), pero con pnpm no está hoisteado en la raíz ⇒ el editor marcará
  "Cannot find module". Solo DX, ningún gate.

### 1.6 `scripts/validate-harness.js` — ✅ (AC-10 se sostiene)

- El entrypoint (53 L) delega en `lib/modules/harness/validate.js`; `gates.js` no conoce Stryker.
  `stryker` no aparece en `lib/modules/harness/**` ⇒ añadir la herramienta **no** cambia `--all`.
- Ojo (no bloqueante): `file_size` (MAX_LINES 500) es `warning`, no fail; `artifact_completeness` exige
  `90-metrics.json`, `91-gate-results.json`, `evidence-manifest.json` en el directorio más reciente de
  `production_artifacts/` (hoy es este mismo) y devuelve `passed: true` aunque falten.

### 1.7 pnpm — ✅ instalación / ⚠️ lockfile

- Package único, sin `pnpm-workspace.yaml` ni `.npmrc` ⇒ sin restricciones de hoisting adicionales.
- `JestWrapper` de `jest-runner` hace `requireFrom('jest', cwd)` y `jest` es dep directa ⇒ resoluble ✅.
- `jest-environment-node` es exactamente lo que falta; al ser devDep directa, pnpm la expone en
  `node_modules/` raíz y `loadJestEnvironment` (`require.resolve(name, { paths: [cwd] })`) la encuentra ✅.
  `plugins` default (`@stryker-mutator/*`) también resuelve al ser deps directas ✅.
- Peer deps: `jest-runner@10.1.1` declara **solo** `@stryker-mutator/core: 10.1.1`; `typescript-checker`
  declara `typescript >=3.6` + core ⇒ sin conflicto con TS 5.9.3 ✅.
- **Pendiente [mayor]**: `pnpm-lock.yaml` no figura en `change-map.md §6` ni tiene dueño explícito.
  CI ejecuta `pnpm install` (auto-frozen con `CI=true`) ⇒ sin lockfile commiteado, el pipeline rompe.

---

## 2. Hechos de versión (verificados contra registry y docs)

| Punto | Verificación | Resultado |
|---|---|---|
| `@stryker-mutator/core@10.1.1` | `registry.npmjs.org` | **existe**; `engines.node >=22.0.0`; `exports` solo raíz |
| `jest-runner@10.1.1` | registry | **existe**; `engines node>=22`; **peer: solo `core: 10.1.1`** (sin peer de Jest); devDeps `jest 30.4.2`, `@jest/* 30.4.1` ⇒ desarrollado contra Jest 30 ✅ |
| `typescript-checker@10.1.1` | registry | **existe**; peer `typescript >=3.6` + `core 10.1.1` ✅ |
| `jest-environment-node` obligatorio | `import-jest-environment.cjs` de 10.1.1: `require.resolve(name, { paths: [state.resolveFromDirectory] })`; `determineResolveFromDirectory` = `process.cwd()` con `projectType: "custom"`; `ls node_modules/jest-environment-node` **falla** | **C-3 confirmado**, el pin es necesario (y suficiente) |
| `jest-runner` resuelve `jest` | `jest-wrapper.js`: `requireFrom('jest', resolveFromDirectory)` | `jest` es dep directa ⇒ OK |
| Reporter HTML | docs de Stryker v10 → `reporters` default `[clear-text, progress, html]`; opción `htmlReporter.fileName` en core | **El paquete `html-reporter` no hace falta** → C-2 correcto ✅ |
| `jest.projectType/configFile/enableFindRelatedTests` | docs Jest Runner v10 | claves válidas ✅ |
| `thresholds` | docs: `high/low/break`, `break: null` = nunca falla; `break: 0` es válido como placeholder ✅ |
| `ignorePatterns` | docs: default `[]`; **siempre** ignorados `node_modules`, `.git`, `*.tsbuildinfo`, `stryker.log`, tempDir y outputs de reporters | `[]` es el default, pero **no** ignora `.next`/venv (ver B1) |
| `ignoreStatic` | docs: requiere `coverageAnalysis: perTest` | el design lo cumple ✅ |
| `mutate` con llaves | glosario docs: node-glob | `{a,b}.ts` soportado ✅ |

---

## 3. Coherencia spec ↔ design ↔ change-map

### 3.1 Ruta de verificación de los 13 AC

| AC | Dónde se verifica en el design | Estado |
|---|---|---|
| AC-01 tooling instalado | §1, §4, §9 pasos 0–1 | ⚠️ texto "4 devDeps de Stryker, mismo major" ya no es literal (3 Stryker + `jest-environment-node`) |
| AC-02 listTests ≤10, sin coverage/verbose | §3 (+ criterio de salida en change-map §1) | ✅ |
| AC-03 scope dry-run | §2 (`mutate`) + §9 paso 1 | ✅ |
| AC-04 baseline medido | §9 tabla de campos persistidos | ✅ |
| AC-05 threshold score−5 | §2 placeholder + §9 paso 3 + chunk 4 | ✅ |
| AC-06 100 % sobrevivientes triados | §10 (3 decisiones) | ⚠️ AC exige `// EQUIVALENT:` en `stryker.conf.mjs`; **C-4 lo contradice** (solo en triage doc) |
| AC-07 killed vía tests | §10 paso 2 + §11 T9 | ✅ |
| AC-08 0 líneas producción | §12 + change-map §6 | ✅ |
| AC-09 gates sin regresión | §8 agente 7 | ✅ |
| AC-10 harness `--all` intocado | §4 + §12 | ✅ (verificado en código) |
| AC-11 docs/artifacts | §6 + change-map §4 | ✅ |
| AC-12 solver/engine explícito | §2 fase B + §10 `excluded` + chunk 4 | ✅ |
| AC-13 unit sí / API-E2E N/A | §6 tests + spec §4 | ✅ |

### 3.2 Archivos del change-map

- Chunk 1: los 5 existen o son creables (`stryker.conf.mjs`, `jest.config.mutation.js`, `package.json`,
  `.gitignore`, `tests/unit/torneos/dispatch.test.ts`) ✅. `tests/unit/torneos/` ya existe con `limits.test.ts`.
- **Fantasmas (solo doc)**: `lib/motor-torneo/synthetic.ts` e `index.ts` **no existen**
  (`purity.test.ts` incluso dice "si existe"). Aparecen en spec §3.1 y en el comentario de `mutate` del design §2.
- **Ausentes**: `pnpm-lock.yaml` (instalación) y este `design-review.md`. Ninguno cambia alcance.
- Docs asignados a @architect (`ARCHITECTURE.md`, `FEATURES.md`) — coherente con Documentation Rules; `FEATURES.md` ya está modificado por @pm.

### 3.3 Forecast de sobrevivientes (§7)

- LOC reales **coinciden** con la tabla (`wc -l`: 2 943 totales en scope).
- `mutantes ≈ LOC/4–5` ⇒ suma de la tabla ≈ 604, dentro del rango 600–900 de la spec ✅ razonable.
- **EC-08 verificado**: `model.test.ts:247-255` compara `costOf(...)` contra `DEFAULT_PARAMS.W_*`;
  mutar el literal en `objective.ts` mueve ambos lados ⇒ sobrevivientes esperados. Confirmado.
  (Detalle: `DEFAULT_PARAMS` tiene 16 claves y 8 `W_*`; "14 literales" del design es impreciso pero inmaterial.)
- `dispatch.ts` 100 % `NoCoverage` sin test ✅ (no existe `tests/unit/torneos/dispatch.test.ts`).
- `types.ts` sí tiene funciones con ramas (`partidosFase`, `personasDoble`, `partidosPotenciales`) ✅.
- Fase B (12–25 min) es optimista si cada mutante re-resuelve WASM, pero el design ya tiene el escape D8/`// EXCLUDED`.
- La suite del scope corre en **3.4 s** ⇒ el coste dominante será el arranque por mutante, no la ejecución; el orden de magnitud del design es correcto.

---

## 4. Riesgo de regresión sobre gates existentes

| Gate | Riesgo | Sustento |
|---|---|---|
| `coverage` | ✅ nulo | `jest.coverage.config.js` no se toca; `dispatch.test.ts` **sube** cobertura; sin cambios de threshold |
| `unit_tests` (`pnpm test:unit`) | ✅ bajo | `jest.config.js` intacto; ningún test existente se modifica en chunk 1; el nuevo test corre en la config base (mismo entorno node) |
| `lint` | ⚠️ | los configs nuevos pasan, pero `.stryker-tmp` residual rompe el gate (ver M3) |
| `typecheck` / `build` | ✅ nulo | 0 líneas en `lib/app/components/hooks`; `.mjs/.js` fuera de `tsconfig.include` |
| `api` / `e2e` | ✅ nulo | 0 route handlers, 0 UI |
| `audit_deps` / `secrets` / `sast` | ✅ bajo | 4 devDeps oficiales, sin `.wasm` nuevo, sin secretos |
| `docs` / `features` | ⚠️ | depende de que @architect cree la entrada `module: infra` + sección en ARCHITECTURE (ya previsto) |

---

## 5. Observaciones clasificadas

### 🔴 [bloqueante] B1 — `ignorePatterns: []` copia **4.7 GB** de `.next` al sandbox

`ignorePatterns` default ya es `[]`; los "siempre ignorados" son solo `node_modules`, `.git`, `*.tsbuildinfo`,
`stryker.log`, tempDir y outputs de reporters. **No** incluye `.next` (4.7 GB medidos), `motor_torneo/`
(154 MB, `.venv` 153 MB) ni `coverage/` (11 MB). El comentario del design ("defaults de Stryker
(node_modules, tests) son correctos aquí") es **falso para este repo**: el sandbox copiaría ~5 GB por worker.

Verificado que **nada de eso se necesita**: `solver-parity.test.ts` lee `tests/fixtures/torneo/**`
(264 KB) y **no** lanza Python (solo `readFileSync`); `purity.test.ts` está excluido.

**Fix (mismo archivo, 1 línea)**:
```js
ignorePatterns: [
  ".next", "coverage", "reports", "test-results", "playwright-report",
  ".unlighthouse", ".validation", "production_artifacts", "motor_torneo",
],
```

### 🟠 [mayor] M1 — `pnpm-lock.yaml` sin dueño ni entrada en el change-map

AC-01 exige instalación reproducible desde el lockfile, y CI usa `pnpm install` (auto-frozen con `CI=true`).
Ningún chunk declara "ejecutar `pnpm install` y commitear `pnpm-lock.yaml`" (el chunk 2 del orquestador solo
corre el baseline). Asignarlo explícitamente (chunk 1 u orquestador) y añadirlo a `change-map §6`.

### 🟠 [mayor] M2 — AC-01 y AC-06 quedan **literalmente incumplidos** por C-1/C-2/C-4

- AC-01: "las **4** devDeps de Stryker con el **mismo major**" → ahora son 3 Stryker + `jest-environment-node`.
- AC-06: "los `equivalent`/`excluded` llevan `// EQUIVALENT:` en `stryker.conf.mjs`" → C-4 lo prohíbe
  (solo `// EXCLUDED:` a nivel archivo; equivalentes únicamente en `mutation-triage.md`).

El design dice "no cambian los AC", pero @qa-release validará el texto del AC ⇒ falsa falla de gate.
**Fix**: enmendar AC-01/AC-06 en `feature-spec.md` (o registrar la enmienda C-1..C-4 de forma explícita en
`release-report.md` como desviación aprobada).

### 🟠 [mayor] M3 — `.stryker-tmp` residual rompe `--lint`

`eslint.config.mjs` no ignora `.stryker-tmp/` y ESLint 10 lintéa dot-directories (verificado).
`cleanTempDir: true` conserva el temp dir si la corrida **falla** (y el baseline de 40–60 min puede
interrumpirse) ⇒ copias mutadas de `lib/` y `tests/` entran al gate bloqueante `--lint`.
**Fix sin añadir archivos** (chunk budget intacto): `cleanTempDir: "always"` en `stryker.conf.mjs`.
Alternativa (sale del budget de 5 archivos): añadir `.stryker-tmp` a `ignores` de `eslint.config.mjs`.

### 🟡 [menor] N1 — Duplicación de config Jest

`require('./jest.config.js')` + override (`collectCoverage`, `verbose`, `testTimeout`, `testMatch`,
`testPathIgnorePatterns`) evita drift futuro y no modifica la base. Opcional para @ponytail-reviewer.

### 🟡 [menor] N2 — Referencias fantasma

`lib/motor-torneo/synthetic.ts` e `index.ts` no existen. Quitar o marcar como "si existiera" en spec §3.1
y en el comentario de `mutate` del design §2.

### 🟡 [menor] N3 — `// @ts-check` no resuelve `@stryker-mutator/api/core`

El subpath es válido, pero con pnpm no está hoisteado ⇒ error de editor (no de gate). Opciones: quitar
`// @ts-check` o dejar el JSDoc sin `import(...)`.

### 🟡 [menor] N4 — `jest.mock("@/lib/db")` ejecuta el módulo real

El automock de Jest carga el módulo para derivar la forma ⇒ `lib/db/index.ts` instancia `new Pool(...)`
(no lanza, pero crea un handle). En `dispatch.test.ts` preferir factory:
`jest.mock("@/lib/db", () => ({ db: { update: jest.fn() } }))`.

### 🟡 [menor] N5 — Inventario de artifacts incompleto

`change-map §6` no lista `pnpm-lock.yaml` (M1) ni `design-review.md`. `artifact_completeness` exige además
`90-metrics.json`, `91-gate-results.json`, `evidence-manifest.json` en el directorio más reciente (hoy, este).
No es bloqueante: el check devuelve `passed: true` con warning.

---

## 6. Veredicto

**APROBADO CON CAMBIOS** — la arquitectura de la feature es correcta y coherente con la spec: 0 líneas de
producción, 0 impacto en auth/DB/UI/API, opt-in real (AC-10 verificado en el harness), versión y compatibilidad
con Jest 30 confirmadas contra registry/docs, y el forecast de sobrevivientes es razonable (EC-08 verificado
en el código de test real).

Condiciones para arrancar el chunk 1 (todas de coste ≤1 línea / 1 artifact, **sin re-abrir D1–D9**):

1. **B1**: reemplazar `ignorePatterns: []` por la lista explícita (`.next`, `coverage`, `reports`, `motor_torneo`, …).
2. **M1**: asignar dueño a `pnpm install` + commit de `pnpm-lock.yaml` y listarlo en `change-map §6`.
3. **M2**: enmendar AC-01 y AC-06 (o registrar la enmienda C-1/C-2/C-4 en `release-report.md` antes del gate).
4. **M3**: `cleanTempDir: "always"` en `stryker.conf.mjs`.

Con B1–M3 aplicados, el riesgo residual es bajo y los gates existentes (coverage, unit, typecheck, build)
no presentan vía de regresión identificada.
