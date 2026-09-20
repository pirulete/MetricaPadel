/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Evidence — I/O para evidence manifest, latest entry selection, completion claim.
 * Extraído de validate-harness.js para reutilización.
 * CJS para compatibilidad con Jest (CJS) y harness (ESM via import interop).
 */
"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Ordena entries de production_artifacts por mtime descendente,
 * priorizando los que tienen evidence-manifest.json.
 * @param {string} artifactsDir
 * @returns {string|null}
 */
function latestEvidenceEntry(artifactsDir) {
  if (!fs.existsSync(artifactsDir)) return null;
  const entries = fs.readdirSync(artifactsDir)
    .filter(f => f !== "previous")
    .filter(f => fs.statSync(path.join(artifactsDir, f)).isDirectory());
  if (entries.length === 0) return null;
  const byMtimeDesc = (a, b) => fs.statSync(path.join(artifactsDir, b)).mtimeMs - fs.statSync(path.join(artifactsDir, a)).mtimeMs;
  const withManifest = entries.filter(e => fs.existsSync(path.join(artifactsDir, e, "evidence-manifest.json"))).sort(byMtimeDesc);
  const withoutManifest = entries.filter(e => !fs.existsSync(path.join(artifactsDir, e, "evidence-manifest.json"))).sort(byMtimeDesc);
  return (withManifest.length > 0 ? withManifest[0] : withoutManifest[0]);
}

/**
 * Ordena entries lexicográficamente (para checkArtifacts).
 * @param {string} artifactsDir
 * @returns {string|null}
 */
function latestArtifactEntry(artifactsDir) {
  if (!fs.existsSync(artifactsDir)) return null;
  const entries = fs.readdirSync(artifactsDir)
    .filter(f => f !== "previous")
    .filter(f => fs.statSync(path.join(artifactsDir, f)).isDirectory())
    .sort()
    .reverse();
  return entries.length > 0 ? entries[0] : null;
}

/**
 * Normaliza ids de gates: "migrations" → "migrations_check".
 * @param {string} id
 * @returns {string}
 */
function resolveGateId(id) {
  return id === "migrations" ? "migrations_check" : id;
}

/**
 * Lee el evidence-manifest.json de un entry.
 * @param {string} artifactsDir
 * @param {string} entry
 * @returns {object|null}
 */
function readEvidenceManifest(artifactsDir, entry) {
  const manifestPath = path.join(artifactsDir, entry, "evidence-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Gates de severidad error que deben pasar para completionClaim.
 */
const REQUIRED_ERROR_GATES = ["typecheck", "unit_tests", "build", "secrets", "migrations_check"];

/**
 * Deriva completionClaim desde un manifest.
 * @param {object} manifest
 * @param {string} artifactsDir
 * @param {string|null} latestEntry
 * @returns {boolean}
 */
function deriveCompletionClaim(manifest, artifactsDir, latestEntry) {
  if (!manifest || !manifest.gatesRun) return false;
  const gates = manifest.gatesRun;
  const allRequiredPass = REQUIRED_ERROR_GATES.every(g => {
    const gate = gates[g];
    return gate && gate.status === "pass";
  });
  if (!allRequiredPass) return false;
  if (manifest.riskLevel === "HIGH") {
    const hasEscalation = fs.existsSync(path.join(artifactsDir, manifest.change_id || "", "escalation-report.md"))
      || (latestEntry && fs.existsSync(path.join(artifactsDir, latestEntry, "escalation-report.md")));
    if (!hasEscalation) return false;
  }
  return true;
}

/**
 * Deriva completionClaim desde los resultados de una corrida del harness.
 * @param {object} gatesRun
 * @param {string} riskLevel
 * @param {string|null} artifactEntry
 * @param {string} artifactsDir
 * @returns {boolean}
 */
function deriveCompletionClaimFromRun(gatesRun, riskLevel, artifactEntry, artifactsDir) {
  const allRequiredPass = REQUIRED_ERROR_GATES.every(g => {
    const gate = gatesRun[g];
    return gate && gate.status === "pass";
  });
  if (!allRequiredPass) return false;
  if (riskLevel === "HIGH") {
    const manifest = artifactEntry ? readEvidenceManifest(artifactsDir, artifactEntry) : null;
    return Boolean(manifest && deriveCompletionClaim(manifest, artifactsDir, artifactEntry));
  }
  return true;
}

module.exports = {
  latestEvidenceEntry,
  latestArtifactEntry,
  resolveGateId,
  readEvidenceManifest,
  REQUIRED_ERROR_GATES,
  deriveCompletionClaim,
  deriveCompletionClaimFromRun,
};
