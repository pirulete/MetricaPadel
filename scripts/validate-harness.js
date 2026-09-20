#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * validate-harness.js — Validation gate harness (thin entrypoint)
 *
 * All logic lives in lib/modules/harness/validate.js
 * This file only handles CLI entry + top-level error handling.
 *
 * Usage:
 *   node scripts/validate-harness.js --all          Run all gates
 *   node scripts/validate-harness.js --typecheck     Only typecheck
 *   node scripts/validate-harness.js --lint          Only lint
 *   node scripts/validate-harness.js --tests         Only unit tests
 *   node scripts/validate-harness.js --api           Only API tests (requires Playwright)
 *   node scripts/validate-harness.js --e2e           Only E2E tests (requires Playwright)
 *   node scripts/validate-harness.js --build         Only build
 *   node scripts/validate-harness.js --secrets       Only gitleaks secrets scan
 *   node scripts/validate-harness.js --sast          Only Semgrep SAST scan
 *   node scripts/validate-harness.js --code-review   Only OCR code review
 *   node scripts/validate-harness.js --audit-deps    Only dependencies audit
 *   node scripts/validate-harness.js --env-vars      Only env vars check
 *   node scripts/validate-harness.js --migrations    Only migration journal check
 *   node scripts/validate-harness.js --snapshot      Only snapshot consistency check
 *   node scripts/validate-harness.js --security      Only security headers check
 *   node scripts/validate-harness.js --file-size     Only file size check
 *   node scripts/validate-harness.js --coverage      Only coverage regression check
 *   node scripts/validate-harness.js --evidence       Only evidence manifest check
 *   node scripts/validate-harness.js --loop-metrics   Only loop engineering metrics check
 *   node scripts/validate-harness.js --status        Only read current status
 *   node scripts/validate-harness.js --fix           Run eslint --fix before gates
 *
 * Returns exit code 0 if all gates pass, 1 if any fail.
 */

const { runHarnessValidation, parseArgs } = require("../lib/modules/harness/validate.js");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runHarnessValidation(options);

  // --status: print the status object as JSON
  if (options.statusOnly && result.status) {
    console.log(JSON.stringify(result.status, null, 2));
  }

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal harness error:", err);
  process.exit(1);
});
