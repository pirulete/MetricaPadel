/**
 * Harness Types — tipos compartidos para el validation harness.
 * JSDoc types para compatibilidad con Node.js ESM y Jest CJS.
 */

/**
 * @typedef {"LOW"|"MEDIUM"|"HIGH"} RiskLevel
 */

/**
 * @typedef {Object} GateDef
 * @property {string} id
 * @property {string} label
 * @property {string} cmd
 * @property {"error"|"warning"} severity
 * @property {boolean} [optional]
 * @property {number} [timeout]
 */

/**
 * @typedef {Object} GateResult
 * @property {boolean} passed
 * @property {string} output
 * @property {string} command
 * @property {number|null} exitCode
 * @property {number} durationMs
 * @property {number|null} testCount
 * @property {number|null} testDelta
 * @property {boolean} [killed]
 */

/**
 * @typedef {Object} CheckResult
 * @property {boolean} passed
 * @property {string} output
 * @property {string[]} [errors]
 * @property {string[]} [warnings]
 */
