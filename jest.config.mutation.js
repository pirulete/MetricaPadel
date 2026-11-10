/** @type {import('jest').Config} */
// Derivada de jest.config.js (que NO se modifica, AC-02): hereda
// transform/moduleNameMapper/setup y sólo sobrescribe lo del sandbox.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- config CJS del repo
const base = require("./jest.config.js");

module.exports = {
  ...base,
  testTimeout: 60_000,
  testMatch: [
    "<rootDir>/tests/unit/motor-torneo/*.test.ts",
    "<rootDir>/tests/unit/torneos/*.test.ts",
    "<rootDir>/tests/unit/validations/torneo.test.ts",
  ],
  // purity.test.ts = linter estático (fs), no cubre el código mutado
  testPathIgnorePatterns: ["/node_modules/", "/tests/unit/motor-torneo/purity.test.ts"],
  collectCoverage: false,
  verbose: false,
};
