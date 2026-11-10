# Technical Design v2 — Triage del Cross-Agent Review (Mutation testing, v0.13)

> change_id: `2026-11-09-mutation-testing` · module: `infra` · date: `2026-11-09`
> versión: **v2** (revisión del mismo `change_id`; NO crea directorio nuevo). Base: `technical-design.md` + `design-review.md`.
> Alcance de este documento: **solo** correcciones aplicadas al diseño y plan de fases confirmado. Todo lo no listado aquí sigue vigente en `technical-design.md` (§1 compatibilidad, §11 riesgos, §12 out-of-scope, §13 rollback).
> autor: @architect · **no re-abre D1–D9**.

---

## 1. Correcciones aplicadas (triage de las 9 observaciones)

| # | Sev. | Observación | Decisión | Archivo donde aterriza |
|---|---|---|---|---|
| **B1** | bloqueante | `ignorePatterns: []` copia `.next` (4.7 GB) + `motor_torneo/.venv` (153 MB) + `coverage` (11 MB) al sandbox | **FIX — lista explícita** (§2.1) | `stryker.conf.mjs` |
| **M1** | mayor | `pnpm-lock.yaml` sin dueño ni entrada en change-map | **FIX — dueño: @app-engineer chunk 1** (`pnpm install` tras editar `package.json` y commit del lockfile) | change-map chunk 1 + §6 |
| **M2** | mayor | AC-01 ("4 devDeps de Stryker") y AC-06 ("`// EQUIVALENT` en `stryker.conf.mjs`") contradicen C-1/C-2/C-4 | **FIX — AC enmendados en `feature-spec.md`** (§5) | `feature-spec.md` |
| **M3** | mayor | `.stryker-tmp` residual rompe el gate `--lint` (ignores de ESLint no lo cubren) | **FIX — `cleanTempDir: "always"`** + `.gitignore` `.stryker-tmp-*/` (§2.2, §2.3) + contingencia ESLint (§2.4) | `stryker.conf.mjs`, `.gitignore` |
| **N1** | menor | duplicación de config Jest | **ACEPTAR con justificación** (§3) — coste de cambio > beneficio; ya justificado en `technical-design.md` §3 | — |
| **N2** | menor | refs fantasma `synthetic.ts` / `index.ts` | **FIX** — comentario de `mutate` reescrito (§2.1) + `feature-spec.md` §3.1 marcado "no existen" | `stryker.conf.mjs`, spec |
| **N3** | menor | `// @ts-check` + `@type import('@stryker-mutator/api/core')` no resuelve con pnpm | **FIX** — se elimina `// @ts-check` y el `@type`, queda JSDoc descriptivo (§2.1) | `stryker.conf.mjs` |
| **N4** | menor | `jest.mock("@/lib/db")` automock ejecuta el módulo real (`new Pool`) | **FIX — instrucción concreta** del mock factory para `dispatch.test.ts` (§4) | change-map chunk 1 (fila 5) |
| **N5** | menor | inventario de artifacts incompleto | **FIX** — change-map §6 ampliado (§6) | `change-map.md` |

**Rechazadas:** ninguna. Las 9 se resuelven; N1 se acepta sin cambio de código (justificación en §3).

---

## 2. `stryker.conf.mjs` — deltas exactos sobre `technical-design.md` §2

### 2.1 Bloque final del archivo (reemplaza desde el header JSDoc hasta `ignorePatterns`)

```js
/**
 * Mutation testing (opt-in) — v0.13.
 * Scope: lógica pura de torneos. NO entra al harness `--all` (AC-10).
 * Nunca correr con RUN_SLOW_PARITY=1 (el caso lento de solver-parity son ~240 s por mutante).
 */

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
  ignoreStatic: true,

  /**
   * Scope D4/AC-03. `types.ts` se incluye a propósito (casi solo tipos ⇒ ~0 mutantes,
   * pero `partidosFase`/`personasDoble` sí tienen ramas).
   * No hay `synthetic.ts` ni `index.ts` en `lib/motor-torneo/` (verificado): nada que excluir.
   */
  mutate: [
    "lib/motor-torneo/{bracket,calendar,courts,diagnostics,engine,loader,model,objective,solver,verify,types}.ts",
    "lib/torneos/{limits,dispatch}.ts",
    "lib/validations/torneos.ts",
  ],

  concurrency: 1,
  timeoutMS: 60_000,
  timeoutFactor: 3,

  reporters: ["html", "clear-text", "progress", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },

  /**
   * PLACEHOLDER — AC-05 obliga a reemplazarlo tras el baseline:
   *   break = low = (score medido − 5), high = score medido
   */
  thresholds: { high: 100, low: 0, break: 0 },

  tempDirName: ".stryker-tmp",
  cleanTempDir: "always", // B1/M3: borra el sandbox incluso si la corrida falla o se interrumpe

  /**
   * B1 (bloqueante resuelto): Stryker solo ignora por default node_modules, .git,
   * *.tsbuildinfo y stryker.log. `.next` (4.7 GB), `motor_torneo/` (.venv 153 MB) y
   * `coverage/` (11 MB) se copiarían al sandbox por worker. Nada de esto lo necesita
   * la suite (solver-parity lee `tests/fixtures/torneo/**`, 264 KB; no lanza Python).
   */
  ignorePatterns: [
    "node_modules",
    ".git",
    ".next",
    "coverage",
    "reports",
    "test-results",
    "playwright-report",
    ".unlighthouse",
    ".validation",
    ".engram",
    "production_artifacts",
    "motor_torneo",
    "drizzle",
    ".stryker-tmp",
    "*.tsbuildinfo",
  ],
};
```

**Notas de la lista (lista cerrada, no "etc."):**

| Patrón | Motivo | Tamaño evitado |
|---|---|---|
| `node_modules`, `.git`, `*.tsbuildinfo`, `.stryker-tmp` | ya ignorados por Stryker; explícitos = autodocumentados e idempotentes | — |
| `.next` | build output | **4.7 GB** |
| `motor_torneo` | referencia Python congelada: `.venv` 153 MB, `__pycache__`, `data/` | 154 MB |
| `coverage` | reporte de coverage del gate | 11 MB |
| `reports`, `test-results`, `playwright-report`, `.unlighthouse`, `.validation` | outputs de otros gates; lint/typecheck tampoco los ven | < 50 MB |
| `production_artifacts`, `drizzle`, `.engram` | docs, migraciones y memoria; ruido puro para el mutador | < 10 MB |

`highs`/WASM **no** se ignoran: `symlinkNodeModules` (default `true`) provee `node_modules` desde el sandbox; `motor_torneo` es solo la referencia Python.

### 2.2 `cleanTempDir`

`cleanTempDir: true` → `"always"`. El sandbox (copias **mutadas** de `lib/` y `tests/`) se borra incluso en fallo/interrupción. Coste: se pierde el sandbox para inspección post-mortem; se compensa porque `reports/mutation/mutation.json` (gitignored, fuera del tempDir) ya contiene `location`, `mutatorName` y `replacement` de cada mutante.

### 2.3 `.gitignore` (chunk 1, fila 4)

```gitignore
# mutation testing reports
reports/mutation/
.stryker-tmp-*/
```

`.stryker-tmp/` ya existe (línea 43). Se agrega el glob con guion porque `tempDirName` admite sufijos y el `.gitignore` actual no los cubre → **+3 líneas** (no +2). Los sandboxes viven **dentro** de `.stryker-tmp/`, ya cubierto; el glob extra es defensa contra cambios de `tempDirName`.

### 2.4 Contingencia ESLint (M3, riesgo residual) — verificado en el repo

- `eslint.config.mjs` aplica a `**/*.{js,jsx,ts,tsx,mjs}` y sus `ignores` son
  `.next`, `node_modules`, `drizzle`, `production_artifacts`, `.unlighthouse`, `coverage`, `.engram`, `test-results`, `playwright-report`, `playwright/.cache` → **`.stryker-tmp` NO está** (riesgo confirmado, no hipotético).
- Con `cleanTempDir: "always"` el residuo solo puede aparecer por `SIGKILL`/corte de energía. Mitigación de 1 línea si ocurre: agregar `".stryker-tmp/**"` al array `ignores` de `eslint.config.mjs`.
- **Dueño de esa contingencia: @architect** (no entra al chunk 1 para no romper el budget de 5 archivos). Se aplica solo si `--lint` reporta rutas bajo `.stryker-tmp`; queda registrado en `release-report.md` si se usa.
- `tsconfig.json` no lo typechequea (glob `**/*.ts` de TS no expande dot-directories; verificado porque `.next/types` hubo que incluirlo explícitamente) ⇒ `--typecheck`/`build` sin riesgo.

---

## 3. N1 — Duplicación de config Jest: **ACEPTADA** (sin cambio)

| Argumento | Evidencia |
|---|---|
| Un `require('./jest.config.js')` + spread heredaría `collectCoverage: true`, `verbose: true` y `coverageThreshold`, obligando a 3 overrides con `undefined`/`false` → más superficie de error que 15 líneas explícitas | `jest.config.js` medido en el review §1.1 |
| `jest-runner` ya fuerza `collectCoverage:false` y `verbose:false` (`dist/src/jest-override-options.js`) | technical-design §3.1 |
| El drift real está acotado a 3 claves estables (`transform`, `moduleNameMapper`, `setupFilesAfterEnv`) y lo detecta el criterio de salida del chunk 1 (`--listTests` = 10 suites + `--dryRun` con 0 `CompileError`) | change-map §1 |
| Un archivo CJS de 25 L no supera el gate `max-lines` (warn a 500 L) | `eslint.config.mjs` |

Si en el futuro `jest.config.js` cambia `testEnvironment`/`transform`, el criterio de salida del chunk 1 es el detector. **@ponytail-reviewer** puede revisitarlo en chunk 4; no bloquea.

---

## 4. N4 — `tests/unit/torneos/dispatch.test.ts`: instrucción exacta

```ts
// Prohibido el automock: jest carga lib/db/index.ts para derivar su forma y
// `new Pool(...)` deja un handle abierto (N4).
jest.mock("@/lib/db", () => ({
  db: { update: jest.fn(), insert: jest.fn(), select: jest.fn(), execute: jest.fn() },
}));
```

- Solo se declaran las claves que `dispatch.ts` consume; el resto del módulo (`pool`, helpers) no se importa en el test.
- Cobertura mínima (EC-04): `resolveWorkerUrl` (4 ramas) + `dispatchRun` (`not_queued` / `no_worker_url` / `dispatch_error` / ok).
- Sin SQL real, sin red (`fetch` mockeado), sin `TOURNAMENT_WORKER_SECRET` real.

---

## 5. M2 — AC alineados (aplicado en `feature-spec.md`)

| AC | Texto anterior (contradicción) | Texto vigente |
|---|---|---|
| **AC-01** | "las **4** devDeps de Stryker … mismo major" | **3 devDeps de Stryker `@10.1.1` exacto** (`core`, `jest-runner`, `typescript-checker`) **+ `jest-environment-node@^30.4.1`** como pin de entorno (C-3). `pnpm ls @stryker-mutator/*` sin mezcla de versions; `pnpm audit --audit-level=high` sin vulnerabilidades altas nuevas |
| **AC-06** | "los `equivalent`/`excluded` llevan `// EQUIVALENT:` en `stryker.conf.mjs`" | Los **`excluded`** llevan `// EXCLUDED: <razón>` a nivel **archivo** en `stryker.conf.mjs`. Los **`equivalent`** se documentan **solo en `mutation-triage.md`** (prueba de una línea). Cero `Stryker disable` inline en `lib/**` (violaría AC-08) |

- `D5` de la spec queda marcada como **enmendada por C-2** (sigue siendo 4 devDeps totales: 3 Stryker + 1 entorno), sin re-abrir la decisión de fondo.
- `feature-spec.md` §3.1: los bullets de `synthetic.ts` / `index.ts` pasan a "**no existen en el repo** (verificado); si se crean, quedan fuera de `mutate`".
- **No** se tocan AC-02..AC-05, AC-07..AC-13.

---

## 6. Change-map tras el ajuste (resumen; filas agregadas al final del archivo)

| Chunk | Cambio respecto a v1 |
|---|---|
| 1 | **+`pnpm-lock.yaml`** (generado, dueño @app-engineer, `pnpm install` en la misma sub-task). Budget: **5 archivos escritos a mano + 1 generado (0 LOC authored)** — excepción documentada, no viola el límite de 5 archivos asignados. `.gitignore` pasa de `+2` a `+3`. `stryker.conf.mjs` ~75 LOC (era ~55: +la lista de 15 patrones y sus comentarios). |
| 2 | Sin re-instalación: solo verifica `npx stryker --version` (= `10.1.1`) y corre baseline ×2. |
| 3 | Sin cambios (3a…3e, ≤5 test files cada uno). |
| 4 | Sin cambios + `manifest` de artifacts lo completa @qa-release (§7). |

---

## 7. Plan de fases confirmado

```
[F1] @app-engineer (1 task, 6 archivos: 5 editados/creados + lockfile generado)
     stryker.conf.mjs · jest.config.mutation.js · package.json · .gitignore ·
     tests/unit/torneos/dispatch.test.ts · pnpm install → pnpm-lock.yaml
     GATE: `npx jest -c jest.config.mutation.js --listTests` = 10 suites exactas
           `npx stryker run --dryRun` = solo scope, 0 CompileError, sandbox < 100 MB
           `pnpm test:unit` verde (116 tests: 115 pass + 1 skip)
[F2] orquestador (background, 40–60 min)
     baseline ×2 (|Δ| ≤ 0.5) → mutation-baseline.md
     GATE: score global + por archivo + conteos + coste/mutante
[F3] @app-engineer 3a…3e (≤5 test files c/u) — asserts nuevos, `lib/**` intocable
     GATE por sub-chunk: `pnpm test:unit` verde + `--mutate <archivo>` re-corrido
[F4] orquestador: thresholds = score−5 / score−5 / score · `// EXCLUDED:` si D8 · mutation-triage.md
     GATE AC-06: 0 sobrevivientes sin decisión
[F5] @ponytail-reviewer: diff de tests/config
     GATE: sin helpers ni asserts duplicados; net LOC negativo en config
[F6] @architect: ARCHITECTURE.md §"Mutation testing (Stryker)" + FEATURES.md v0.13
[F7] @qa-release: --typecheck --lint --tests --build · AC-08/09/10 · release-report.md ·
     evidence-manifest.json · 90-metrics.json · 91-gate-results.json
     Si `--lint` reporta algo bajo `.stryker-tmp` → @architect aplica §2.4 y se anota en release-report.md
```

**No intervienen:** @auth-security, @db-engineer, @admin-engineer, @ui-designer, @pm (spec enmendada aquí; sin nueva preguntas abiertas).

**Riesgo residual:** bajo. B1 elimina el coste de sandbox (~5 GB → <100 MB); M3 elimina la única vía conocida de romper un gate bloqueante; M1/M2 eliminan fallos de pipeline y de validación de AC.
