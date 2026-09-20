/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Status — I/O para status.json, baseline.json y test count extraction.
 * Extraído de validate-harness.js para reutilización.
 * CJS para compatibilidad con Jest (CJS) y harness (ESM via import interop).
 */
"use strict";

const fs = require("fs");
const path = require("path");

/**
 * @param {string} validationDir
 * @returns {string}
 */
function statusPath(validationDir) {
  return path.join(validationDir, "status.json");
}

/**
 * @param {string} validationDir
 * @returns {string}
 */
function baselinePath(validationDir) {
  return path.join(validationDir, "baseline.json");
}

/**
 * @param {string} validationDir
 * @returns {object}
 */
function readStatus(validationDir) {
  const file = statusPath(validationDir);
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return { status: "none", last_validated: null, gates_passed: 0, gates_failed: 0, failed_gates: [], message: "Status file not found" };
  }
}

/**
 * @param {string} validationDir
 * @param {object} status
 */
function writeStatus(validationDir, status) {
  fs.mkdirSync(path.dirname(statusPath(validationDir)), { recursive: true });
  fs.writeFileSync(statusPath(validationDir), JSON.stringify(status, null, 2) + "\n");
}

/**
 * @param {string} validationDir
 * @returns {object}
 */
function readBaseline(validationDir) {
  try {
    return JSON.parse(fs.readFileSync(baselinePath(validationDir), "utf-8"));
  } catch {
    return {};
  }
}

/**
 * @param {string} validationDir
 * @param {object} baseline
 */
function writeBaseline(validationDir, baseline) {
  fs.mkdirSync(validationDir, { recursive: true });
  fs.writeFileSync(baselinePath(validationDir), JSON.stringify(baseline, null, 2) + "\n");
}

/**
 * Extrae el conteo de tests del output de Jest/Playwright.
 * @param {string} output
 * @returns {number|null}
 */
function extractTestCount(output) {
  const match = output.match(/Tests:\s+(\d+)\s+passed/);
  return match ? parseInt(match[1], 10) : null;
}

module.exports = {
  statusPath,
  baselinePath,
  readStatus,
  writeStatus,
  readBaseline,
  writeBaseline,
  extractTestCount,
};
