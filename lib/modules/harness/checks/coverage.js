/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Coverage Check — jest coverage + baseline regression detection.
 */
"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const VALIDATION_DIR = path.join(PROJECT_ROOT, ".validation");

async function runCoverageCheck() {
  process.stdout.write(`  ⏳ Coverage regression (baseline)... `);
  try {
    execSync("npx jest --config jest.coverage.config.js --coverage --silent --no-cache", {
      cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    });
  } catch { /* jest exit code != 0 con coverage, pero el summary se escribe igual */ }
  const summaryPath = path.join(PROJECT_ROOT, "coverage", "coverage-summary.json");
  if (!fs.existsSync(summaryPath)) { process.stdout.write("❌ (no coverage-summary.json)\n"); return { passed: false, output: "No coverage summary" }; }
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
  const COVERAGE_MODULES = [
    { id: "lib", pattern: "/lib/" },
    { id: "app_api", pattern: "/app/api/" },
    { id: "components", pattern: "/components/" },
    { id: "hooks", pattern: "/hooks/" },
  ];
  const round1 = (n) => Math.round(n * 10) / 10;
  const modules = {};
  for (const mod of COVERAGE_MODULES) {
    let lines = 0, branches = 0, functions = 0, statements = 0, count = 0;
    for (const [file, stats] of Object.entries(summary)) {
      if (file === "total") continue;
      if (file.includes(mod.pattern)) {
        lines += stats.lines?.pct ?? 0; branches += stats.branches?.pct ?? 0;
        functions += stats.functions?.pct ?? 0; statements += stats.statements?.pct ?? 0;
        count++;
      }
    }
    if (count > 0) modules[mod.id] = { lines: round1(lines / count), branches: round1(branches / count), functions: round1(functions / count), statements: round1(statements / count), files: count };
  }
  const baselinePath = path.join(VALIDATION_DIR, "coverage-baseline.json");
  if (!fs.existsSync(baselinePath)) {
    fs.mkdirSync(VALIDATION_DIR, { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(modules, null, 2) + "\n");
    process.stdout.write(`✅ (baseline initialized)\n`);
    return { passed: true, output: "Baseline initialized" };
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
  const drops = [];
  for (const [mod, stats] of Object.entries(modules)) {
    const prev = baseline[mod];
    if (!prev) continue;
    for (const metric of ["lines", "branches", "functions", "statements"]) {
      const drop = prev[metric] - stats[metric];
      if (drop > 3) drops.push(`${mod}.${metric}: ${prev[metric]}% → ${stats[metric]}% (-${drop.toFixed(1)}%)`);
    }
  }
  if (drops.length > 0) {
    process.stdout.write(`❌ (regressions >3%)\n`);
    return { passed: false, output: `Coverage regressions >3%:\n  ${drops.join("\n  ")}` };
  }
  const libStats = modules.lib;
  if (libStats) process.stdout.write(`✅ (lib ${libStats.lines}% lines | branches ${libStats.branches}% | functions ${libStats.functions}%)\n`);
  else process.stdout.write("✅ (no lib coverage)\n");
  return { passed: true, output: `Coverage OK: ${JSON.stringify(modules)}` };
}

module.exports = { runCoverageCheck };
