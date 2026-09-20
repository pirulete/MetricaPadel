/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Checks: Migration journal consistency + Snapshot consistency.
 * CJS para compatibilidad con Jest y harness.
 */
"use strict";

const fs = require("fs");
const path = require("path");

function checkMigrations(projectRoot) {
  process.stdout.write(`  ⏳ Migration journal consistency... `);
  const drizzlePath = path.join(projectRoot, "drizzle");
  const journalPath = path.join(drizzlePath, "meta", "_journal.json");

  if (!fs.existsSync(journalPath)) {
    process.stdout.write("❌ (_journal.json not found)\n");
    return { passed: false, output: "_journal.json not found" };
  }

  const sqlFiles = fs.readdirSync(drizzlePath)
    .filter(f => f.endsWith('.sql'))
    .map(f => f.replace(/\.sql$/, ''));

  let journal;
  try {
    journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
  } catch (e) {
    process.stdout.write("❌ (invalid _journal.json)\n");
    return { passed: false, output: `Invalid _journal.json: ${e.message}` };
  }

  const journalTags = (journal.entries || []).map(e => e.tag);
  const orphans = sqlFiles.filter(tag => !journalTags.includes(tag));

  if (orphans.length > 0) {
    process.stdout.write(`❌ (${orphans.length} orphan migrations)\n`);
    return {
      passed: false,
      output: `Archivos SQL sin entry en _journal.json:\n${orphans.map(f => `  - ${f}.sql`).join("\n")}\n\nUsa pnpm run db:generate para crear migraciones con journal automático.`,
    };
  }

  process.stdout.write(`✅ (${sqlFiles.length} migrations registered)\n`);
  return { passed: true, output: `${sqlFiles.length} migration files, all registered in journal` };
}

function checkSnapshots(projectRoot) {
  const issues = [];
  const warnings = [];
  const drizzlePath = path.join(projectRoot, "drizzle");
  const metaPath = path.join(drizzlePath, "meta");
  const journalPath = path.join(metaPath, "_journal.json");
  const schemaPath = path.join(projectRoot, "lib", "db", "schema.ts");

  if (!fs.existsSync(journalPath)) {
    return { passed: false, output: "_journal.json not found" };
  }

  let journal;
  try {
    journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
  } catch (e) {
    return { passed: false, output: `Invalid _journal.json: ${e.message}` };
  }

  const entries = journal.entries || [];
  if (entries.length === 0) {
    return { passed: false, output: "No journal entries" };
  }

  const last = entries[entries.length - 1];
  const snapshotFile = path.join(metaPath, `${String(last.idx).padStart(4, '0')}_snapshot.json`);

  if (!fs.existsSync(snapshotFile)) {
    issues.push(`Missing snapshot for latest journal entry ${last.idx} (${last.tag})`);
  } else {
    try {
      const snap = JSON.parse(fs.readFileSync(snapshotFile, "utf-8"));
      if (snap.prevId && entries.length > 1) {
        const prevIdx = entries[entries.length - 2].idx;
        const prevSnapFile = path.join(metaPath, `${String(prevIdx).padStart(4, '0')}_snapshot.json`);
        if (fs.existsSync(prevSnapFile)) {
          const prevSnap = JSON.parse(fs.readFileSync(prevSnapFile, "utf-8"));
          if (snap.prevId !== prevSnap.id) {
            warnings.push(`prevId mismatch: snapshot ${last.idx} prevId (${snap.prevId}) ≠ snapshot ${prevIdx} id (${prevSnap.id})`);
          }
        }
      }
      if (fs.existsSync(schemaPath)) {
        const snapMtime = fs.statSync(snapshotFile).mtimeMs;
        const schemaMtime = fs.statSync(schemaPath).mtimeMs;
        if (schemaMtime > snapMtime + 5000) {
          warnings.push(`schema.ts is newer than latest snapshot — run 'pnpm run db:generate' to sync`);
        }
      }
    } catch (e) {
      issues.push(`Invalid snapshot file: ${e.message}`);
    }
  }

  const missingSnapshots = [];
  for (const entry of entries) {
    const sf = path.join(metaPath, `${String(entry.idx).padStart(4, '0')}_snapshot.json`);
    if (!fs.existsSync(sf)) {
      missingSnapshots.push(entry.idx);
    }
  }

  const passed = issues.length === 0;
  const output = [];
  if (issues.length > 0) output.push(`Issues:\n${issues.map(i => `  ❌ ${i}`).join("\n")}`);
  if (warnings.length > 0) output.push(`Warnings:\n${warnings.map(w => `  ⚠️  ${w}`).join("\n")}`);
  if (missingSnapshots.length > 0 && missingSnapshots.length < entries.length) {
    output.push(`  ℹ️  ${missingSnapshots.length} entries without snapshots (historical gaps — OK if latest has one)`);
  }
  if (output.length === 0) output.push("All snapshot checks passed.");

  return { passed, output: output.join("\n"), warnings };
}

module.exports = { checkMigrations, checkSnapshots };
