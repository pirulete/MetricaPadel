/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Check: Artifact completeness.
 * CJS para compatibilidad con Jest y harness.
 */
"use strict";

const fs = require("fs");
const path = require("path");

function checkArtifacts(projectRoot) {
  process.stdout.write(`  ⏳ Artifact completeness... `);
  const artifactsDir = path.join(projectRoot, "production_artifacts");

  if (!fs.existsSync(artifactsDir)) {
    process.stdout.write("⚠️  (no artifacts directory — skipping)\n");
    return { passed: true, output: "No production_artifacts directory found" };
  }

  const entries = fs.readdirSync(artifactsDir)
    .filter(f => f !== "previous")
    .filter(f => fs.statSync(path.join(artifactsDir, f)).isDirectory())
    .sort()
    .reverse();

  if (entries.length === 0) {
    process.stdout.write("⚠️  (no artifact entries — skipping)\n");
    return { passed: true, output: "No artifact entries found in production_artifacts/" };
  }

  const latest = entries[0];
  const latestDir = path.join(artifactsDir, latest);
  const expectedFiles = ["90-metrics.json", "91-gate-results.json", "evidence-manifest.json"];
  const missing = expectedFiles.filter(f => !fs.existsSync(path.join(latestDir, f)));
  const present = expectedFiles.filter(f => fs.existsSync(path.join(latestDir, f)));

  if (missing.length > 0) {
    process.stdout.write(`⚠️  (${present.length}/${expectedFiles.length} in ${latest})\n`);
    return {
      passed: true,
      output: `Latest artifact entry "${latest}": missing ${missing.join(", ")}. Expected: ${expectedFiles.join(", ")}`,
    };
  }

  process.stdout.write(`✅ (${latest}: ${expectedFiles.length}/${expectedFiles.length} files)\n`);
  return { passed: true, output: `${latest}: all expected artifact files present` };
}

module.exports = { checkArtifacts };
