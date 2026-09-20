/**
 * Harness Gates Registry — definición declarativa de todos los validation gates.
 * Portado desde StreetMove y adaptado a los gates del skeleton (12 gates, sin mutation).
 * CJS para compatibilidad con Jest y harness.
 */
"use strict";

/**
 * Gates de comando que se ejecutan via spawn.
 * Cada gate tiene: id, label, cmd, severity, optional?, timeout?
 * Timeouts espejo del monolito scripts/validate-harness.js (paridad de comportamiento).
 */
const COMMAND_GATES = [
  { id: "typecheck", label: "TypeScript", cmd: "npx tsc --noEmit", severity: "error" },
  { id: "lint", label: "Lint", cmd: "pnpm run lint", severity: "warning" },
  { id: "unit_tests", label: "Unit Tests", cmd: 'bash -c \'set -o pipefail; pnpm run test:unit 2>&1 | tail -40\'', severity: "error", timeout: 600_000 },
  { id: "api_tests", label: "API Tests", cmd: "npx playwright test tests/api/ --reporter=list 2>&1 | tail -30", severity: "warning", optional: true },
  { id: "e2e_tests", label: "E2E Tests", cmd: "npx playwright test tests/e2e/ --reporter=list 2>&1 | tail -30", severity: "warning" },
  { id: "build", label: "Build", cmd: "npx next build", severity: "error", timeout: 1_200_000 },
  { id: "secrets", label: "Secrets (gitleaks)", cmd: "pnpm run security:secrets 2>&1 | tail -20", severity: "error" },
  { id: "sast", label: "SAST (semgrep)", cmd: "pnpm run security:sast 2>&1 && echo '---JSON-REPORT---' && cat .validation/semgrep-report.json", severity: "warning" },
  { id: "api_integration", label: "API Integration Tests", cmd: "node scripts/check-api-integration.js", severity: "warning" },
  { id: "code_review", label: "Code Review (OCR)", cmd: "node scripts/ocr-review.js 2>&1", severity: "warning" },
  { id: "audit_deps", label: "Dependencies Audit", cmd: "pnpm run security:deps 2>&1 | tail -30", severity: "error" },
  { id: "env_vars", label: "Env Vars", cmd: "node scripts/check-env-vars.js 2>&1", severity: "warning" },
];

/**
 * Mapa de flags CLI → gate IDs.
 */
const FLAG_TO_GATE = {
  "--typecheck": "typecheck",
  "--lint": "lint",
  "--tests": "unit_tests",
  "--api": "api_tests",
  "--e2e": "e2e_tests",
  "--build": "build",
  "--secrets": "secrets",
  "--sast": "sast",
  "--api-integration": "api_integration",
  "--code-review": "code_review",
  "--audit-deps": "audit_deps",
  "--env-vars": "env_vars",
};

/**
 * Mapa de flags CLI → check names (extra checks, no command gates).
 */
const FLAG_TO_CHECK = {
  "--features": "features_check",
  "--migrations": "migrations_check",
  "--snapshot": "snapshot_check",
  "--docs": "docs_check",
  "--artifacts": "artifact_completeness",
  "--security": "security_check",
  "--evidence": "evidence_check",
  "--risk-policy": "risk_policy",
  "--coverage": "coverage_check",
  "--file-size": "file_size",
  "--loop-metrics": "loop_metrics",
};

module.exports = { COMMAND_GATES, FLAG_TO_GATE, FLAG_TO_CHECK };