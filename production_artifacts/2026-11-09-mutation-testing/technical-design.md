# Technical Design — Mutation testing con Stryker (v0.13)

> change_id: `2026-11-09-mutation-testing`
> status: `approved` (diseño) · release: `v0.13` · date: `2026-11-09`
> module: `infra` · tags: `[testing, tooling, quality]`
> feature-spec: `./feature-spec.md` · release-scope: `./release-scope.md`
> autor: @architect
> ⚠️ **v2 vigente**: `./technical-design-v2.md` corrige B1/M1/M3/N2/N3/N4 de `design-review.md` y enmienda AC-01/AC-06 en la spec. Antes de implementar, leer **§2 de v2** (bloque final de `stryker.conf.mjs`) y **§4** (mock de `dispatch.test.ts`).

---

## 0. Contraste spec ↔ realidad (3 correcciones, alcance intacto)

| # | Lo que dice la spec | Lo verificado (fuente) | Corrección de diseño |
|---|---|---|---|
| **C-1** | "Stryker v6+" (Q1, EC-03) | `registry.npmjs.org`: latest **10.1.1** (2026-10-23); engines `node>=22` (v10 dropeó Node 20). `@stryker-mutator/core` y `jest-runner` publican `10.1.1` | Se fija **10.1.1 exacto** en los 3 paquetes (mismo major, peer `core:10.1.1`). Ya no aplica "v6" |
| **C-2** | D5 incluye `@stryker-mutator/html-reporter` | Ese paquete está **en 3.1.0 desde 2020**; el reporter `html` vive en `core` desde v5 (`reporters` default = `["clear-text","progress","html"]`, `htmlReporter.fileName` en el schema de core) | Se **elimina** ese devDep. En su lugar entra `jest-environment-node@^30.4.1` (ver C-3). Siguen siendo **4 devDeps** |
| **C-3** | — | `jest-runner@10.1.1` hace `require.resolve("jest-environment-node", { paths: [resolveFromDirectory] })` (`dist/src/jest-plugins/import-jest-environment.cjs`). Este repo usa **pnpm 9** sin hoisting: `ls node_modules/jest-environment-node` → **no existe** ⇒ `MODULE_NOT_FOUND` en el dry run (issue stryker-js **#5464**, cerrado 2025-11-07 con esa misma causa) | `jest-environment-node@^30.4.1` como devDep explícito (coherente con `jest@30.3.0` / `jest-environment-jsdom@30.4.1` ya presentes) |
| **C-4** | AC-06: los `equivalent`/`excluded` llevan `// EQUIVALENT:` en `stryker.conf.mjs` | Stryker solo soporta disable **por línea** con comentario *inline en el archivo mutado*, lo que tocaría `lib/**` y **violaría AC-08** (0 líneas en producción) | Los `equivalent` se documentan **solo** en `mutation-triage.md` (fila + prueba). En `stryker.conf.mjs` solo van comentarios a nivel **archivo** (`// EXCLUDED:`). No se usa `Stryker disable` en `lib/` |

C-1..C-4 no cambian alcance, ACs ni presupuesto de dependencias. **No se reabre ninguna decisión cerrada D1–D9.**

---

## 1. Decisión de compatibilidad Stryker ↔ Jest 30 (Q1)

**Decisión: `@stryker-mutator/{core,jest-runner,typescript-checker}@10.1.1` — compatible con Jest 30. Sin fallback `command`.**

Evidencia:

| Evidencia | Valor |
|---|---|
| `packages/jest-runner/package.json` (master, v10.1.1) devDeps | `@jest/environment`, `@jest/test-result`, `@jest/types` **todos en 30.4.1** → el plugin se desarrolla y testea contra Jest 30 |
| Peer deps de `jest-runner@10.1.1` | **solo** `@stryker-mutator/core: 10.1.1` → no hay rango de Jest que bloquee la instalación (no hay peer `jest`) |
| Issue stryker-js **#5464** ("Add support for Jest 30") | **cerrado** 2025-11-07; causa raíz = resolución de `jest-environment-node` en layouts no aplanados (pnpm), no incompatibilidad de API |
| `engines` de los 3 paquetes | `node>=22` ✔ (repo declara `node>=22.0.0`) |

**Plan B (documentado, NO implementado):** `testRunner: "command"` con `commandRunner: { command: "npx jest -c jest.config.mutation.js --runTestsByPath" }` + `coverageAnalysis: "off"`. Se activa **solo** si el dry run falla por API de Jest. Se pierde `perTest` (3-5× más lento) y no requiere downgrade de Jest. **No se downgradea Jest** en ningún escenario.

---

## 2. `stryker.conf.mjs` (archivo exacto)

Nombre válido: `DEFAULT_CONFIG_FILE_NAMES` de core incluye `stryker.config.mjs` y `SUPPORTED_CONFIG_FILE_NAMES` incluye el patrón `.conf` (`packages/core/src/config/config-file-formats.ts`) ⇒ **`stryker.conf.mjs` se autodescubre sin `--configFile`**.

```js
// @ts-check
/**
 * Mutation testing (opt-in) — v0.13.
 * Scope: lógica pura de torneos. NO entra al harness `--all` (AC-10).
 * Nunca correr con RUN_SLOW_PARITY=1 (el caso lento de solver-parity son ~240 s por mutante).
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "jest",
  jest: {
    projectType: "custom",
    configFile: "jest.config.mutation.js",
    enableFindRelatedTests: true,
  },

  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  coverageAnalysis: "perTest",
  ignoreStatic: true, // default real es false; los static mutants solo se cubren al importar

  /**
   * Scope D4/AC-03. `types.ts` se incluye a propósito (casi solo tipos ⇒ ~0 mutantes,
   * pero `partidosFase`/`personasDoble` sí tienen ramas).
   * `synthetic.ts` (fixtures de test) e `index.ts` (barrel) EXCLUIDOS: no son producto.
   */
  mutate: [
    "lib/motor-torneo/{bracket,calendar,courts,diagnostics,engine,loader,model,objective,solver,verify,types}.ts",
    "lib/torneos/{limits,dispatch}.ts",
    "lib/validations/torneos.ts",
  ],

  concurrency: 1, // HiGHS es WASM: 1 worker evita OOM (EC-12). Subir a 2 solo si la RAM lo permite
  timeoutMS: 60_000, // mutante que rompe el clamp corre el suelo de 30 s ⇒ se marca Timeout, no cuelga
  timeoutFactor: 3,

  reporters: ["html", "clear-text", "progress", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },

  /**
   * PLACEHOLDER — AC-05 obliga a reemplazarlo tras el baseline:
   *   break = low = (score medido − 5), high = score medido
   * `break: 0` deja pasar la primera corrida sin romper.
   */
  thresholds: { high: 100, low: 0, break: 0 },

  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
  ignorePatterns: [], // defaults de Stryker (node_modules, tests) son correctos aquí
};
```

Fase B (despacho a `engine/courts/solver`, D8) no necesita otro config: se sobrescribe `mutate` por CLI (§4).

---

## 3. `jest.config.mutation.js` (archivo exacto)

**Justificación de por qué no se reutiliza `jest.config.js`** (y no es dogma — verificable):

1. `jest-runner` ya fuerza `collectCoverage: false` y `verbose: false` (`dist/src/jest-override-options.js`), así que el motivo *original* de la spec se cumple solo. Lo que **sí** aporta el archivo dedicado:
2. **`testMatch` acotado** = el dry run de Stryker descubre 10 suites (no las 948 del repo). Con `enableFindRelatedTests`, Jest resuelve contra `roots`; acotar evita que un fallo de resolución degrade a "corre todo el repo" por mutante (~×40 de tiempo).
3. **Aislamiento de futuro**: cambios en `jest.config.js` (nuevos `roots`, `setupFiles`, `testEnvironment`) no alteran silenciosamente el scope de mutación (AC-02/AC-03).
4. **`testTimeout` explícito** (60 s) para el re-solve del solver-parity bajo mutante, independiente del 20 s de la suite normal.
5. **Se excluye `purity.test.ts`**: es un linter estático del módulo (lee fuentes con `fs`), no ejerce el código mutado (0 mutantes related) y ocuparía el cupo ≤10 suites de AC-02.

```js
/** @type {import('jest').Config} */
// Derivada a mano de jest.config.js. NO se modifica jest.config.js (AC-02).
module.exports = {
  testEnvironment: "node",
  testTimeout: 60_000,
  roots: ["<rootDir>/tests/unit"],
  testMatch: [
    "<rootDir>/tests/unit/motor-torneo/*.test.ts",
    "<rootDir>/tests/unit/torneos/*.test.ts",
    "<rootDir>/tests/unit/validations/torneo.test.ts",
  ],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: false, tsconfig: "tsconfig.json", jsx: "react-jsx" }],
  },
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  setupFilesAfterEnv: ["<rootDir>/tests/unit/setup.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  // purity.test.ts = linter estático (fs), no cubre el código mutado
  testPathIgnorePatterns: ["/node_modules/", "/tests/unit/motor-torneo/purity.test.ts"],
  collectCoverage: false,
  verbose: false,
};
```

**Conteo de suites esperado por `--listTests` (AC-02): 10 exactas**
`bracket`, `calendar`, `diagnostics`, `loader`, `model`, `solver-parity`, `verify` (7) + `torneos/limits` (1) + `torneos/dispatch` (nuevo, EC-04) (1) + `validations/torneo` (1).

---

## 4. `package.json` — scripts y devDeps

```jsonc
"scripts": {
  "test:mutation": "stryker run",
  // Phase B (D8): re-solve WASM. Solo si la fase A ya dio score útil.
  "test:mutation:phase-b": "stryker run --mutate \"lib/motor-torneo/{engine,courts,solver}.ts\""
}
```

- **2 scripts, no más.** Se descarta `test:mutation:report` de D7: `reporters` ya incluye `html`+`json` por defecto ⇒ sería un alias sin valor (lo valida @ponytail-reviewer).
- devDeps (mismas versiones exactas, 3 de Stryker + 1 pin de entorno):

```jsonc
"@stryker-mutator/core": "10.1.1",
"@stryker-mutator/jest-runner": "10.1.1",
"@stryker-mutator/typescript-checker": "10.1.1",
"jest-environment-node": "^30.4.1"
```

- **`scripts/validate-harness.js`, husky y `.github/` NO se tocan** (AC-10). `validate-harness.js` no menciona jest/stryker hoy; no se le agrega nada.

---

## 5. `.gitignore`

`.stryker-tmp/` **ya está** ignorado (línea ~46). Falta solo el reporte:

```gitignore
# mutation testing reports
reports/mutation/
```

---

## 6. Impacto por capa

| Capa | Impacto |
|---|---|
| **auth** | **NINGUNO** — no toca `auth.ts`, `lib/auth/*`, `app/api/auth/*`, guards ni `protected-routes.ts` |
| **DB** | **NINGUNO** — 0 migraciones, 0 cambios en `lib/db/**`, `drizzle/**` |
| **UI / app / components / hooks** | **NINGUNO** — 0 líneas (AC-08) |
| **API / contratos** | **NINGUNO** — 0 route handlers nuevos o modificados ⇒ `lib/api-docs/spec.ts` **no se toca** |
| **Env vars** | **NINGUNA** nueva ⇒ `.env.example` **no se toca** |
| **Tests** | Los 8 suites de `tests/unit/motor-torneo/` + `limits` + `validations/torneo` se **fortalecen**; se agrega `tests/unit/torneos/dispatch.test.ts` |
| **Docs** | `ARCHITECTURE.md` (+ sección "Mutation testing"), `FEATURES.md` (entrada v0.13). `AGENTS.md` **no cambia** (no hay rol/workflow/gate nuevo) |
| **CI** | Ninguno (out-of-scope explícito) |

---

## 7. Sobrevivientes esperados (forecast para el triaje)

Estimación de mutantes ≈ LOC/4–5 (total ≈ 600–650 en scope):

| Archivo | LOC | Mutantes est. | Sobrevivientes esperados | Por qué |
|---|---|---|---|---|
| `objective.ts` | 156 | ~35 | **Alto (10–15)** | `DEFAULT_PARAMS.W_*` se muta pero los tests comparan contra `DEFAULT_PARAMS.W_*` ⇒ el test se "auto-muta" (`model.test.ts:245-255`). Es el caso EC-08 |
| `diagnostics.ts` | 446 | ~95 | Medio (10–20) | Umbrales numéricos de semáforo/indicadores ejercidos en 2–3 puntos; boundaries intermedios sin cubrir |
| `courts.ts` | 80 | ~20 | Medio (5–10) | Asignación voraz con tie-break; solo cobertura indirecta vía `engine` |
| `engine.ts` | 136 | ~30 | Medio (5–10) | Ramas `infeasible`/`invalid` y defaults de params poco ejercidas |
| `solver.ts` | 185 | ~40 | Medio (5–10) | Mapeo de status HiGHS y clamp; la paridad rápida no toca el caso infeasible |
| `dispatch.ts` | 129 | ~30 | **100% NoCoverage si no se testea** | Sin unit test hoy (EC-04) → se resuelve creando el test |
| `model.ts` | 371 | ~85 | Bajo (5) | `model-stats.json` golden (nVars/nConstraints/nNonZeros) mata casi todo |
| `loader.ts` | 438 | ~95 | Bajo (5) | `loader.test.ts` assertea códigos + mensajes exactos |
| `verify.ts` | 192 | ~45 | Bajo (3) | Asserts por `code`/`message`/`blockIdx` |
| `bracket.ts` | 248 | ~55 | Bajo–medio | Fixtures de cuadro; pases libres pueden tener huecos |
| `calendar.ts` | 125 | ~30 | Bajo | No-solape bien cubierto |
| `limits.ts` | 64 | ~22 | Muy bajo | Todos los límites asserteados con literales |
| `validations/torneos.ts` | 39 | ~12 | Bajo | Zod con mensajes probados |
| `types.ts` | 334 | ~5–15 | Bajo | Casi solo tipos; `ignoreStatic: true` evita la mayoría |

**Hipótesis #1 del triaje** (mayor ROI): `objective.ts` — assert de los 14 literales de `DEFAULT_PARAMS` + valor numérico exacto del objetivo en instancia mini (EC-08).

---

## 8. Agentes y orden (chunks ≤5 archivos)

| # | Agente | Entrega | Archivos |
|---|---|---|---|
| 1 | **@app-engineer** | Config + scripts + `.gitignore` + test de `dispatch` | 5 (`stryker.conf.mjs`, `jest.config.mutation.js`, `package.json`, `.gitignore`, `tests/unit/torneos/dispatch.test.ts`) |
| 2 | **orquestador** (no implementador) | Instala deps, `--listTests`, `--dryRun`, **baseline** (2 corridas) y escribe `mutation-baseline.md` | 1 artifact |
| 3 | **@app-engineer** | Triaje en sub-chunks ≤5 test files (model+diagnostics / bracket+calendar / loader+verify / solver-parity / validations+limits+dispatch) | ≤5 por sub-chunk |
| 4 | **orquestador** | Re-corridas tras cada sub-chunk + `thresholds` definitivos + `mutation-triage.md` | 1–2 artifacts |
| 5 | **@ponytail-reviewer** | Revisa diff de tests/config (borrar helpers innecesarios, asserts duplicados) | — |
| 6 | **@architect** | `ARCHITECTURE.md` §"Mutation testing (Stryker)" **con los números reales** | 1 |
| 7 | **@qa-release** | Gates `--typecheck --lint --tests --build` + AC-08/09/10 + `release-report.md` + `evidence-manifest.json` | 2 artifacts |

**@auth-security: NO interviene. @db-engineer: NO interviene.** Justificación: 0 cambios en `lib/auth/**`, `app/api/**`, `lib/db/**`, `drizzle/**`; no hay sesión, RBAC, auditoría ni esquema en el diff. Invocarlos violaría el principio de mínimo viable.

**Anti-loop:** la corrida de Stryker (40–60 min) **nunca** se ejecuta dentro de un task de implementador (límite 15 min/task) → la corre el orquestador en background y solo pasa al triaje cuando el JSON existe.

---

## 9. Corrida baseline (comando y métricas)

```bash
# 0) una vez
pnpm install
npx stryker --version                       # AC-01: 10.1.1

# 1) verificación de scope sin mutar (AC-02/AC-03)
npx jest -c jest.config.mutation.js --listTests        # ⇒ exactamente 10 suites
npx stryker run --dryRun                               # ⇒ solo archivos del scope, 0 compile errors

# 2) baseline phase A (motor puro + limits/dispatch/validations)
npx stryker run                                        # escribe reports/mutation/mutation.json

# 3) determinismo (EC-09)
npx stryker run                                        # comparar score; exigir |Δ| ≤ 0.5

# 4) phase B (solo si hace falta decidir D8)
pnpm test:mutation:phase-b
```

**Qué se persiste en `mutation-baseline.md`:**

| Campo | Fuente |
|---|---|
| Comando exacto, fecha, node/pnpm/Stryker versions, duración total y por fase | consola de Stryker |
| Score global + `mutationScoreBasedOnCoverage` | `mutation.json` (`thresholds`/`files`) |
| Por archivo: mutantes, `Killed`, `Survived`, `NoCoverage`, `Timeout`, `CompileError`, `RuntimeError`, score | `mutation.json`, agregado con `jq` sobre `files[*].mutants[*].status` |
| Nº de mutantes generados | `Object.keys(files[*].mutants).length` |
| Coste por mutante (ms) y decisión D8 sobre `engine/courts/solver` | consola (`Mutant ... ms`) |
| Tabla de umbrales aplicados (`break/low/high` = score−5 / score−5 / score) | `stryker.conf.mjs` final |

> `reports/mutation/**` está gitignored: el artifact **pega** las cifras y el bloque `thresholds` del JSON; el JSON completo queda local y se referencia, no se commitea.

**Estimación de tiempo** (concurrency 1, sandbox + link de `node_modules`): warm-up ~1 min · phase A ~550 mutantes × ~2.5 s ≈ **25–35 min** · phase B ~90 mutantes × 8–15 s ≈ **12–25 min** · total primera corrida **40–60 min**. Re-corridas durante triaje: ~10–20 min si se limitan a los archivos tocados (`--mutate "lib/motor-torneo/objective.ts"`).

---

## 10. Proceso de triaje (`mutation-triage.md`)

1. **Extraer** sobrevivientes de `mutation.json`:
   ```bash
   jq -r '.files | to_entries[] | .key as $f | .value.mutants | to_entries[]
          | select(.value.status=="Survived" or .value.status=="NoCoverage")
          | "\($f):\(.value.location.start.line)\t\(.value.mutatorName)\t\(.value.status)\t\(.value.replacement // "")"' \
      reports/mutation/mutation.json
   ```
2. **Clasificar** cada fila (3 decisiones, ninguna vacía):
   - `killed` → se escribe/fortalece assert **solo en `tests/unit/**`** (prohibido tocar `lib/**`, AC-08). Re-correr `--mutate <archivo>` y verificar que desaparece.
   - `equivalent` → prueba de una línea (por qué la mutación no es observable) **en `mutation-triage.md`**. Sin `Stryker disable` inline en `lib/` (C-4). Si los equivalentes >10% del total → se documenta como señal de diseño (EC-01) y se evalúa exclusión a nivel archivo.
   - `excluded` → coste prohibitivo (WASM/timeout sistemático) ⇒ se saca de `mutate` con `// EXCLUDED: <razón>` en `stryker.conf.mjs` y **se publican ambos scores** (AC-12).
3. **Reglas duras**: nada de asserts sobre soluciones exactas del solver (EC-10); matar `verify.ts` con `toHaveLength(0)` es aceptable (EC-11); un `RuntimeError`/`Timeout` cuenta como detectado, pero se registra.
4. **Cierre**: 0 filas sin decisión (AC-06). El artifact es la única fuente de verdad del triaje; no se duplica en `release-report.md` (solo el resumen).

---

## 11. Riesgos técnicos y mitigación

| # | Riesgo | Señal | Mitigación |
|---|---|---|---|
| T1 | `MODULE_NOT_FOUND: jest-environment-node` (pnpm no aplanado) | falla el dry run | `jest-environment-node@^30.4.1` como devDep (C-3) |
| T2 | `jest-runner` incompatible con la API de Jest 30.3 | dry run con error de internals de Jest | Plan B `command` runner (§1). **Nunca** downgrade de Jest |
| T3 | Re-solve WASM por mutante (engine/courts/solver) explota el tiempo | >60 min la fase B | `perTest` + `enableFindRelatedTests` + `concurrency` + `timeoutMS`; si suena el reloj → D8 (excluir con `// EXCLUDED:`) y publicar ambos scores |
| T4 | Mutante rompe el clamp y el solver corre 30 s | `Timeout` masivos (>5%) | `timeoutMS: 60_000` + `timeoutFactor: 3`; los timeout se contabilizan como detección, no como fallo del runner |
| T5 | OOM (WASM + jest) | worker killed | `concurrency: 1` (EC-12). Escape hatch: `--concurrency 1` explícito en el comando |
| T6 | `.stryker-tmp` no encuentra el `.wasm` de `highs` | error de carga del módulo | `symlinkNodeModules` (default true) lo resuelve; plan B `inPlace: true` documentado (riesgo: deja archivos mutados si se interrumpe) |
| T7 | `RUN_SLOW_PARITY=1` exportado ⇒ 240 s por mutante de `solver-parity` | mutantes en `Timeout` masivo | Regla escrita en el header de la config + `testTimeout: 60_000` acota el daño; **no** se corre mutación con esa var |
| T8 | Mutantes `NoCoverage` en `dispatch.ts` hunden el score sin información | score global bajo y `dispatching` sin filas | `tests/unit/torneos/dispatch.test.ts` con `jest.mock("@/lib/db")` en el chunk 1 (EC-04) |
| T9 | Los asserts nuevos rompen la suite normal o son flaky | `pnpm test:unit` rojo | Cada sub-chunk cierra con `pnpm test:unit` (lo corre @qa-release/orquestador); prohibido assertear soluciones exactas |
| T10 | Falsa sensación de seguridad (score alto ≠ SQL/UI correctos) | — | `ARCHITECTURE.md` declara el límite: cubre **solo** lógica pura; out-of-scope del spec lo repite |

---

## 12. Explícitamente fuera de este diseño

- `lib/api-docs/spec.ts` → sin cambios (0 endpoints).
- `.env.example` → sin cambios (0 env vars nuevas).
- `AGENTS.md` → sin cambios (0 roles/workflows/gates nuevos).
- `scripts/validate-harness.js`, husky, `.github/` → sin cambios (AC-10).
- `jest.config.js` y `.validation/coverage-baseline.json` → sin cambios (AC-02/desviación de cobertura no aplica).
- Cualquier archivo de `lib/`, `app/`, `components/`, `hooks/` → 0 líneas (AC-08).

## 13. Rollback

Borrar `stryker.conf.mjs`, `jest.config.mutation.js`, 2 scripts, 4 devDeps y `reports/mutation/` + `.stryker-tmp/`; revertir los tests reforzados si se desea. Cero impacto en runtime, DB, auth o UX. No hay migración ni datos que revertir.

---

## 14. Versioning de artifacts

- Ambos documentos viven en `production_artifacts/2026-11-09-mutation-testing/` (creado por @pm). **Nunca** en la raíz de `production_artifacts/`.
- `technical-design.md` y `change-map.md` se **sobrescriben solo dentro de este `change_id`** (revisión del mismo archivo, con la corrección C-1..C-4 anotada arriba). Una nueva iteración del cambio ⇒ directorio `2026-11-09-mutation-testing-v2/`, sin tocar estos.
- `mutation-baseline.md` / `mutation-triage.md`: si se repite el baseline (p. ej. tras excluir `solver`), se **agrega** una sección "Corrida N" al mismo archivo (histórico dentro del artifact), no se borra la anterior.
