/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Checks — index re-exports.
 * CJS para compatibilidad con Jest y harness.
 */
"use strict";

module.exports = {
  ...require("./features.js"),
  ...require("./migrations.js"),
  ...require("./artifacts.js"),
};
