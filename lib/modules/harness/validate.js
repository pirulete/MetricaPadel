/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Validate — orquestador que reemplaza main() de validate-harness.js.
 * Portado desde StreetMove y adaptado al skeleton (header genérico, sin dominio StreetMove).
 * Ejecuta gates y checks de forma programática, retorna ValidationSummary.
 * CJS para compatibilidad con Jest y harness.
 */
"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { COMMAND_GATES, FLAG_TO_GATE, FLAG_TO_CHECK } = require("./gates.js");
const { runGateCommand, runGate } = require("./runner.js");
const { readStatus, writeStatus } = require("./status.js");
const { latestEvidenceEntry, latestArtifactEntry, resolveGateId, readEvidenceManifest, deriveCompletionClaimFromRun } = require("./evidence.js");
const { checkFeaturesFiles } = require("./checks/features.js");
const { checkMigrations, checkSnapshots } = require("./checks/migrations.js");
const { checkArtifacts } = require("./checks/artifacts.js");
const { runCoverageCheck } = require("./checks/coverage.js");
const riskRules = require("../../policy/risk-rules.js");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const VALIDATION_DIR = path.join(PROJECT_ROOT, ".validation");
const EVIDENCE_FILE = path.join(VALIDATION_DIR, "evidence.json");
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, "production_artifacts");

function getChangedFiles(baseRef) {
  const ref = baseRef || "origin/main";
  try {
    const merged = execSync(`git diff --name-only ${ref}...HEAD`, { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (merged) return merged.split("\n").filter(Boolean);
    const staged = execSync("git diff --name-only --cached", { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const unstaged = execSync("git diff --name-only", { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    return [...new Set([...staged.split("\n"), ...unstaged.split("\n")].filter(Boolean))];
  } catch { return []; }
}

/**
 * Parsea argumentsos CLI en RunOptions.
 * @param {string[]} args
 * @returns {RunOptions}
 */
function parseArgs(args) {
  const runAll = args.includes("--all") || args.length === 0;
  const fix = args.includes("--fix");

  const gates = [];
  const checks = [];

  if (runAll) {
    gates.push(...COMMAND_GATES.map(g => g.id));
    checks.push(...Object.values(FLAG_TO_CHECK));
  } else {
    for (const [flag, gateId] of Object.entries(FLAG_TO_GATE)) {
      if (args.includes(flag)) gates.push(gateId);
    }
    for (const [flag, checkId] of Object.entries(FLAG_TO_CHECK)) {
      if (args.includes(flag)) checks.push(checkId);
    }
  }

  // --status is special: just read and exit
  const statusOnly = args.includes("--status");

  // --risk-base-ref
  const riskIdx = args.indexOf("--risk-base-ref");
  const riskBaseRef = riskIdx >= 0 && args[riskIdx + 1] ? args[riskIdx + 1] : undefined;

  // --fix
  if (args.includes("--fix")) {
    // handled in runHarnessValidation
  }

  return { runAll, statusOnly, gates, checks, fix, riskBaseRef };
}

/**
 * @typedef {Object} RunOptions
 * @property {boolean} runAll
 * @property {boolean} statusOnly
 * @property {string[]} gates - Gate IDs a ejecutar
 * @property {string[]} checks - Check names a ejecutar
 * @property {boolean} fix - Ejecutar eslint --fix antes
 * @property {string} [riskBaseRef]
 */

/**
 * Ejecuta el harness completo y retorna el resultado.
 * @param {RunOptions} options
 * @returns {Promise<object>} ValidationSummary
 */
async function runHarnessValidation(options) {
  // --status: solo leer
  if (options.statusOnly) {
    const status = readStatus(VALIDATION_DIR);
    return { success: status.status === "pass", status, skipWrite: true };
  }

  // Auto-fix
  if (options.fix) {
    process.stdout.write("  🛠️  Running eslint --fix...\n");
    const fixRes = await runGateCommand("pnpm run lint --fix", 60_000);
    if (fixRes.exitCode === 0 && !fixRes.killed) {
      process.stdout.write("  ✅ eslint --fix completed\n");
    } else {
      const msg = (fixRes.stdout + fixRes.stderr).trim().split("\n").slice(-5).join("\n");
      process.stdout.write(`  ⚠️  eslint --fix had issues (non-blocking):\n      ${msg}\n`);
    }
  }

  // Header
  const gateObjs = COMMAND_GATES.filter(g => options.gates.includes(g.id));
  const checkLabels = options.checks.map(c => {
    const map = { features_check: "FEATURES.md", migrations_check: "Migration journal", snapshot_check: "Snapshot consistency", docs_check: "Documentation", artifact_completeness: "Artifact completeness", security_check: "Security headers", file_size: "File size", evidence_check: "Evidence manifest", risk_policy: "Risk policy", coverage_check: "Coverage regression", loop_metrics: "Loop metrics" };
    return map[c] || c;
  });
  process.stdout.write("\n🔍 Validation Harness\n");
  process.stdout.write(`  Gates to run: ${gateObjs.length + options.checks.length}\n`);
  process.stdout.write(`  Extra checks: ${checkLabels.length > 0 ? checkLabels.join(", ") : "none"}\n`);
  process.stdout.write("\n");

  // Execute command gates
  const results = {};
  const gateResultsMeta = {};
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  const failedGates = [];
  const warningGates = [];

  for (const gate of gateObjs) {
    const result = await runGate(gate, VALIDATION_DIR);
    results[gate.id] = result.passed ? "pass" : "fail";
    gateResultsMeta[gate.id] = { exitCode: result.exitCode ?? null, durationMs: result.durationMs ?? null, testCount: result.testCount ?? null, testDelta: result.testDelta ?? null };
    if (result.passed) {
      passed++;
    } else if (gate.severity === "warning") {
      warnings++;
      warningGates.push({ id: gate.id, label: gate.label, output: result.output });
    } else {
      failed++;
      failedGates.push({ id: gate.id, label: gate.label, output: result.output });
    }
  }

  // Execute extra checks
  if (options.checks.includes("features_check")) {
    const featResult = checkFeaturesFiles(PROJECT_ROOT);
    results["features_check"] = featResult.passed ? "pass" : "fail";
    if (featResult.passed) { passed++; } else { warnings++; warningGates.push({ id: "features_check", label: "FEATURES.md", output: featResult.output }); }
  }

  if (options.checks.includes("migrations_check")) {
    const migResult = checkMigrations(PROJECT_ROOT);
    results["migrations_check"] = migResult.passed ? "pass" : "fail";
    if (migResult.passed) { passed++; } else { failed++; failedGates.push({ id: "migrations_check", label: "Migration journal", output: migResult.output }); }
  }

  if (options.checks.includes("snapshot_check")) {
    const snapResult = checkSnapshots(PROJECT_ROOT);
    results["snapshot_check"] = snapResult.passed ? "pass" : "warning";
    if (snapResult.passed) { passed++; } else { warnings++; warningGates.push({ id: "snapshot_check", label: "Snapshot consistency", output: snapResult.output }); }
  }

  if (options.checks.includes("docs_check")) {
    const docsResult = checkDocs(PROJECT_ROOT);
    results["docs_check"] = docsResult.passed ? "pass" : (docsResult.errors?.length > 0 ? "fail" : "warning");
    if (docsResult.passed) {
      passed++;
      if (docsResult.warnings?.length > 0) { warnings += docsResult.warnings.length; warningGates.push({ id: "docs_check", label: "Documentation (warnings)", output: docsResult.output }); }
    } else {
      if (docsResult.errors?.length > 0) { failed++; failedGates.push({ id: "docs_check", label: "Documentation", output: docsResult.output }); }
      if (docsResult.warnings?.length > 0) { warnings++; warningGates.push({ id: "docs_check", label: "Documentation (warnings)", output: docsResult.output }); }
    }
  }

  if (options.checks.includes("artifact_completeness")) {
    const artResult = checkArtifacts(PROJECT_ROOT);
    results["artifact_completeness"] = artResult.passed ? "pass" : "fail";
    if (artResult.passed) { passed++; } else { warnings++; warningGates.push({ id: "artifact_completeness", label: "Artifact completeness", output: artResult.output }); }
  }

  if (options.checks.includes("security_check")) {
    const secResult = checkSecurityHeaders(PROJECT_ROOT);
    results["security_check"] = secResult.passed ? "pass" : "fail";
    if (secResult.passed) { passed++; } else { warnings++; warningGates.push({ id: "security_check", label: "Security headers", output: secResult.output }); }
  }

  if (options.checks.includes("evidence_check")) {
    const evResult = checkEvidenceManifest();
    results["evidence_check"] = evResult.passed ? "pass" : "fail";
    if (evResult.passed) { passed++; } else { failed++; failedGates.push({ id: "evidence_check", label: "Evidence manifest", output: evResult.output }); }
  }

  if (options.checks.includes("risk_policy")) {
    const rpResult = checkRiskPolicy(options.riskBaseRef);
    results["risk_policy"] = rpResult.passed ? "pass" : "fail";
    if (rpResult.passed) { passed++; } else { failed++; failedGates.push({ id: "risk_policy", label: "Risk policy", output: rpResult.output }); }

    // Auto-trigger mutation testing when HIGH-risk files are in the diff
    if (rpResult.passed && rpResult.output.startsWith("Risk: HIGH")) {
      const hasMutation = gateObjs.some(g => g.id === "mutation");
      if (!hasMutation) {
        const mutationGate = require("./gates.js").COMMAND_GATES.find(g => g.id === "mutation");
        if (mutationGate) {
          gateObjs.push(mutationGate);
          process.stdout.write("  ⚡ HIGH risk detected — auto-adding mutation testing gate\n");
        }
      }
    }
  }

  if (options.checks.includes("coverage_check")) {
    // Coverage requires async jest run — keep inline for now
    const covResult = await runCoverageCheck();
    results["coverage_check"] = covResult.passed ? "pass" : "fail";
    if (covResult.passed) { passed++; } else { failed++; failedGates.push({ id: "coverage_check", label: "Coverage regression", output: covResult.output }); }
  }

  if (options.checks.includes("loop_metrics")) {
    const lmResult = checkLoopMetrics();
    results["loop_metrics"] = lmResult.passed ? "pass" : "fail";
    if (lmResult.passed) { passed++; warningGates.push({ id: "loop_metrics", label: "Loop metrics", output: lmResult.output }); }
    else { failed++; failedGates.push({ id: "loop_metrics", label: "Loop metrics (rework rate)", output: lmResult.output }); }
  }

  if (options.checks.includes("file_size")) {
    const fsResult = checkFileSizes(PROJECT_ROOT);
    results["file_size"] = fsResult.passed ? "pass" : "warning";
    if (fsResult.passed) { passed++; } else { warnings++; warningGates.push({ id: "file_size", label: "File size", output: fsResult.output }); }
  }

  // Compute overall
  const overallStatus = failed === 0 ? "pass" : "fail";

  // Compute risk and evidence
  const sha = (() => { try { return execSync("git rev-parse HEAD", { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim(); } catch { return null; } })();
  const env = process.env.CI ? "ci" : "local";
  const changedFiles = getChangedFiles(options.riskBaseRef);
  const riskInfo = riskRules.getMaxRisk(changedFiles);

  const gatesRun = {};
  for (const gate of gateObjs) {
    const r = results[gate.id];
    gatesRun[gate.id] = { status: r === "pass" ? "pass" : r === "warning" ? "warning" : "fail", command: gate.cmd, exitCode: gateResultsMeta[gate.id]?.exitCode ?? null, durationMs: gateResultsMeta[gate.id]?.durationMs ?? null, testCount: gateResultsMeta[gate.id]?.testCount ?? null, testDelta: gateResultsMeta[gate.id]?.testDelta ?? null };
  }
  for (const id of ["features_check", "migrations_check", "snapshot_check", "docs_check", "artifact_completeness", "security_check", "file_size", "evidence_check", "risk_policy", "coverage_check", "loop_metrics"]) {
    if (results[id]) {
      gatesRun[id] = { status: results[id] === "warning" ? "warning" : results[id], command: null, exitCode: null, durationMs: null };
    }
  }

  const evidence = { timestamp: new Date().toISOString(), sha, env, riskLevel: riskInfo.risk, most_sensitive_file: riskInfo.most_sensitive_file, completionClaim: deriveCompletionClaimFromRun(gatesRun, riskInfo.risk, latestArtifactEntry(ARTIFACTS_DIR), ARTIFACTS_DIR), gatesRun };

  // Write status (only on complete runs)
  const isCompleteRun = options.runAll || process.env.CI;
  if (isCompleteRun) {
    fs.mkdirSync(VALIDATION_DIR, { recursive: true });
    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + "\n");
    const status = {
      status: overallStatus, last_validated: new Date().toISOString(), gates_passed: passed, gates_failed: failed, gates_warning: warnings,
      failed_gates: failedGates.map(g => g.id), warning_gates: warningGates.map(g => g.id), risk_level: riskInfo.risk,
      gates_run: Object.keys(gatesRun).filter(id => gatesRun[id].status !== "not-run"), test_coverage_delta: gateResultsMeta.unit_tests?.testDelta ?? null,
      message: failed === 0 && warnings === 0 ? `✅ All ${passed} gates passed.` : failed === 0 && warnings > 0 ? `⚠️ All ${passed} gates passed, ${warnings} warning(s): ${warningGates.map(g => `[${g.id}] ${g.label}`).join(", ")}` : `❌ ${failed} gate(s) failed, ${warnings} warning(s): ${failedGates.map(g => `[${g.id}] ${g.label}`).join(", ")}. Run /validate for details.`,
    };
    writeStatus(VALIDATION_DIR, status);
  } else {
    process.stdout.write("  ⏭️  Corrida parcial — evidence.json/status.json no actualizados (se preserva la corrida completa previa)\n");
  }

  // Print summary
  printSummary(passed, failed, warnings, failedGates, warningGates);

  return {
    success: failed === 0,
    overallStatus,
    passed, failed, warnings,
    failedGates, warningGates,
    results, gateResultsMeta,
    riskLevel: riskInfo.risk,
    evidence,
    isCompleteRun,
  };
}

// ── Summary printer ────────────────────────────────────────────────────────

function printSummary(passed, failed, warnings, failedGates, warningGates) {
  process.stdout.write("\n");
  process.stdout.write("  " + "─".repeat(50) + "\n");
  process.stdout.write(`  📋 Results: ${passed} passed, ${failed} failed, ${warnings} warnings\n`);
  process.stdout.write(`  Status: ${failed === 0 ? "✅ PASS" : "❌ FAIL"}\n`);
  if (failedGates.length > 0) {
    process.stdout.write("\n  ⛔ Failed gates (blocking):\n");
    for (const g of failedGates) {
      process.stdout.write(`    [${g.id}] ${g.label}:\n`);
      process.stdout.write(`      ${g.output.split("\n").slice(0, 5).join("\n      ")}\n`);
    }
  }
  if (warningGates.length > 0) {
    process.stdout.write("\n  ⚠️  Warnings (non-blocking):\n");
    for (const g of warningGates) {
      process.stdout.write(`    [${g.id}] ${g.label}:\n`);
      process.stdout.write(`      ${g.output.split("\n").slice(0, 5).join("\n      ")}\n`);
    }
  }
  process.stdout.write("  " + "─".repeat(50) + "\n");
  process.stdout.write("\n");
}

// ── Checks completos (portados del monolito) ─────────────────────────────────

function checkDocs(projectRoot) {
  process.stdout.write("  ── Documentation Check ──\n");
  const docs = ["ARCHITECTURE.md", "AGENTS.md", "FEATURES.md", "QUICKSTART.md"];
  const missing = docs.filter(d => !fs.existsSync(path.join(projectRoot, d)));
  if (missing.length > 0) {
    process.stdout.write(`  ❌ Missing: ${missing.join(", ")}\n`);
    return { passed: false, output: `Missing docs: ${missing.join(", ")}`, errors: missing, warnings: [] };
  }
  process.stdout.write("  ✅ All documentation files present\n");
  return { passed: true, output: "Documentation OK", errors: [], warnings: [] };
}

function checkSecurityHeaders(projectRoot) {
  process.stdout.write("  ── Security Headers Check ──\n");
  let adminCount = 0;

  // Check admin API guards
  const adminDir = path.join(projectRoot, "app/api/admin");
  if (fs.existsSync(adminDir)) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (entry.name === "route.ts") adminCount++;
      }
    };
    walk(adminDir);
  }
  process.stdout.write(`  ${adminCount > 0 ? "✅" : "⚠️"} ${adminCount} Admin API routes\n`);

  // Check security headers in next.config
  const nextConfig = fs.readFileSync(path.join(projectRoot, "next.config.mjs"), "utf-8");
  const headersOk = nextConfig.includes("Content-Security-Policy") && nextConfig.includes("X-Frame-Options");
  process.stdout.write(`  ${headersOk ? "✅" : "❌"} Security headers configured\n`);

  // Check NEXTAUTH_SECRET fallback
  const authTs = fs.readFileSync(path.join(projectRoot, "auth.ts"), "utf-8");
  const nextauthOk = authTs.includes("NEXTAUTH_SECRET") && (authTs.includes("fallback") || authTs.includes("randomUUID"));
  process.stdout.write(`  ${nextauthOk ? "✅" : "❌"} NEXTAUTH_SECRET fallback\n`);

  const passed = headersOk && nextauthOk;
  return { passed, output: `Admin: ${adminCount}, Headers: ${headersOk}, NextAuth: ${nextauthOk}` };
}

function checkLoopMetrics() {
  const METRICS_FILE = process.env.LOOP_METRICS_FILE || path.join(VALIDATION_DIR, "loop-metrics.json");
  const THRESHOLD = parseFloat(process.env.LOOP_REWORK_THRESHOLD || "1.5");
  process.stdout.write(`  ⏳ Loop metrics (rework/duracion)... `);
  try {
    const data = JSON.parse(fs.readFileSync(METRICS_FILE, "utf-8"));
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length === 0) { process.stdout.write("ℹ️  (sin eventos)\n"); return { passed: true, output: "No events" }; }
    const total = events.length;
    const totalIter = events.reduce((s, e) => s + (e.iterations || 1), 0);
    const totalGatesFailed = events.reduce((s, e) => s + (e.gatesFailed || 0), 0);
    const escalations = events.filter((e) => e.escalated).length;
    const reworkRate = (totalIter / total).toFixed(2);
    const blocked = totalIter / total > THRESHOLD;
    const line = `(${total} eventos, rework ${reworkRate}/ev, gatesFail ${totalGatesFailed}, escalados ${escalations})`;
    if (blocked) { process.stdout.write(`❌ ${line}\n`); return { passed: false, output: `Rework ${reworkRate} > threshold ${THRESHOLD}` }; }
    process.stdout.write(`✅ ${line}\n`);
    return { passed: true, output: line };
  } catch { process.stdout.write("ℹ️  (no metrics file)\n"); return { passed: true, output: "No metrics file" }; }
}

function checkFileSizes(projectRoot) {
  const MAX_LINES = 500;
  process.stdout.write(`  ⏳ File size check... `);
  const exemptPatterns = [/^lib\/constants\//, /^lib\/db\/schema\.ts$/, /^scripts\//, /^drizzle\//, /^tests\//];
  const bigFiles = [];
  const walk = (dir, rel = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "coverage") continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) { walk(fullPath, relPath); continue; }
      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      if (exemptPatterns.some(p => p.test(relPath))) continue;
      try {
        const lines = fs.readFileSync(fullPath, "utf-8").split("\n").length;
        if (lines > MAX_LINES) bigFiles.push({ file: relPath, lines });
      } catch { /* skip unreadable files */ }
    }
  };
  walk(projectRoot);
  if (bigFiles.length > 0) {
    const msg = bigFiles.map(f => `  ${f.file}: ${f.lines} lines`).join("\n");
    process.stdout.write(`⚠️ ${bigFiles.length} files > ${MAX_LINES} lines\n`);
    return { passed: false, output: `Large files:\n${msg}` };
  }
  process.stdout.write("✅\n");
  return { passed: true, output: "All files within limits" };
}

function checkEvidenceManifest() {
  process.stdout.write(`  ⏳ Evidence manifest (completionClaim)... `);
  const entry = latestEvidenceEntry(ARTIFACTS_DIR);
  if (!entry) { process.stdout.write("❌ (no artifact entries found)\n"); return { passed: false, output: "No artifact entries found." }; }
  const manifest = readEvidenceManifest(ARTIFACTS_DIR, entry);
  if (!manifest) { process.stdout.write(`❌ (missing manifest in ${entry})\n`); return { passed: false, output: `No evidence-manifest.json in ${entry}.` }; }
  const claimable = require("./evidence.js").deriveCompletionClaim(manifest, ARTIFACTS_DIR, entry);
  if (!claimable) { process.stdout.write(`❌ (completionClaim=false in ${entry})\n`); return { passed: false, output: `completionClaim=false in ${entry}.` }; }
  process.stdout.write(`✅ (${entry}: completionClaim=true)\n`);
  return { passed: true, output: `${entry}: valid` };
}

function checkRiskPolicy(baseRef) {
  process.stdout.write(`  ⏳ Risk policy... `);
  const changedFiles = getChangedFiles(baseRef);
  const { risk, most_sensitive_file: sensitive } = riskRules.getMaxRisk(changedFiles);
  const REQUIRED_GATES = ["typecheck", "lint", "unit_tests", "secrets", "sast", "migrations"];
  if (risk === "HIGH") {
    const evidence = readEvidenceManifest(ARTIFACTS_DIR, latestEvidenceEntry(ARTIFACTS_DIR));
    const gatesRun = evidence?.gatesRun || readGlobalEvidence()?.gatesRun || {};
    const skipped = REQUIRED_GATES.filter(g => { const rid = resolveGateId(g); return !gatesRun[rid] || gatesRun[rid].status === "not-run"; });
    const issues = [];
    if (skipped.length > 0) issues.push(`HIGH risk (${sensitive}): skipped gates: ${skipped.join(", ")}`);
    const entry = latestEvidenceEntry(ARTIFACTS_DIR);
    if (!entry || !readEvidenceManifest(ARTIFACTS_DIR, entry)) issues.push(`HIGH risk: evidence-manifest.json required`);
    if (issues.length > 0) { process.stdout.write(`❌ (HIGH risk: ${sensitive})\n`); return { passed: false, output: issues.join("\n") }; }
    process.stdout.write(`✅ (HIGH risk: ${sensitive})\n`);
    return { passed: true, output: `Risk: HIGH (${sensitive})` };
  }
  if (risk === "MEDIUM") {
    const evidence = readEvidenceManifest(ARTIFACTS_DIR, latestEvidenceEntry(ARTIFACTS_DIR));
    const gatesRun = evidence?.gatesRun || readGlobalEvidence()?.gatesRun || {};
    const skipped = REQUIRED_GATES.filter(g => !gatesRun[g] || gatesRun[g].status === "not-run");
    if (skipped.length > 0) { process.stdout.write(`❌ (MEDIUM risk: ${sensitive})\n`); return { passed: false, output: `MEDIUM risk: skipped gates: ${skipped.join(", ")}` }; }
    process.stdout.write(`✅ (MEDIUM risk: ${sensitive})\n`);
    return { passed: true, output: `Risk: MEDIUM (${sensitive})` };
  }
  process.stdout.write(`✅ (LOW risk)\n`);
  return { passed: true, output: `Risk: LOW` };
}

function readGlobalEvidence() {
  try { return JSON.parse(fs.readFileSync(EVIDENCE_FILE, "utf-8")); } catch { return null; }
}

module.exports = { runHarnessValidation, parseArgs, printSummary };