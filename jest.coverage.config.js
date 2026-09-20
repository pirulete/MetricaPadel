/**
 * Config de coverage ampliada para el gate `--coverage` (AOSE P3).
 *
 * Diferencia vs jest.config.js:
 * - collectCoverageFrom incluye app/api/ (route handlers), components/ y hooks/
 *   — la capa HTTP y UI que hoy está fuera del radar del coverage unit.
 * - Sin coverageThreshold: los % se comparan contra .validation/coverage-baseline.json
 *   en el gate `--coverage` (detecta regresiones >3% por módulo), en vez de metas duras.
 * - Emite coverage-summary.json para el parser del gate.
 *
 * El gate unit_tests usa jest.config.js (thresholds globales sobre lib/).
 */
/** @type {import('jest').Config} */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest configs son CJS (module.exports), require es la forma estándar de reusar la base
const base = require('./jest.config.js')

module.exports = {
  ...base,
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/api/**/*.ts',
    'components/**/*.tsx',
    'hooks/*.ts',
    '!lib/db/migrations/**',
    '!**/node_modules/**',
  ],
  coverageThreshold: {},
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageDirectory: 'coverage',
}
