/**
 * Mutation testing (opt-in) — v0.13.
 * Scope: lógica pura de torneos. NO entra al harness `--all` (AC-10).
 * Nunca correr con RUN_SLOW_PARITY=1 (el caso lento de solver-parity son ~240 s por mutante).
 */

export default {
  /**
   * pnpm no aplana `node_modules`: el glob default `@stryker-mutator/*` se resuelve
   * desde el virtual store de core y no ve los plugins. Lista explícita (bare import
   * resuelve por el walk-up de Node hasta el node_modules raíz).
   */
  plugins: [
    "@stryker-mutator/jest-runner",
    "@stryker-mutator/typescript-checker",
  ],

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
   * Fijado tras el baseline + triaje (AC-05), score definitivo 86.90%:
   *   break = low = 86.90 − 5 = 81.90 · high = 86.90
   */
  thresholds: { high: 86.9, low: 81.9, break: 81.9 },

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
