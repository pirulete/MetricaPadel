#!/usr/bin/env node
/**
 * neon-preview-branch.ts — CLI for Neon preview branch management.
 *
 * Usage:
 *   npx tsx scripts/neon-preview-branch.ts [--ensure|--reset|--cleanup] [--migrate] [--dry-run]
 *
 * Flags:
 *   --ensure    Create preview branch if it doesn't exist (default)
 *   --reset     Reset preview branch to parent head (Restore from parent)
 *   --cleanup   Delete stale branches outside allowlist (older than 14 days)
 *   --migrate   Run db:migrate after ensure/reset
 *   --dry-run   Show what would be done without mutating
 *
 * Requires: NEON_API_KEY, NEON_PROJECT_ID in .env.local
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import {
  ensurePreviewBranch,
  resetBranch,
  cleanupStaleBranches,
  maskConnectionString,
  getConnectionString,
  getBranchByName,
  type NeonBranch,
} from "../lib/neon/branching";

const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_PROJECT_ID = process.env.NEON_PROJECT_ID;
const NEON_PARENT_BRANCH = process.env.NEON_PARENT_BRANCH || "production";
const NEON_PREVIEW_BRANCH = process.env.NEON_PREVIEW_BRANCH || "preview";

function parseArgs(args: string[]) {
  const flags = {
    ensure: false,
    reset: false,
    cleanup: false,
    migrate: false,
    dryRun: false,
  };
  for (const arg of args) {
    if (arg === "--ensure") flags.ensure = true;
    else if (arg === "--reset") flags.reset = true;
    else if (arg === "--cleanup") flags.cleanup = true;
    else if (arg === "--migrate") flags.migrate = true;
    else if (arg === "--dry-run") flags.dryRun = true;
  }
  // Default to --ensure if no action specified
  if (!flags.ensure && !flags.reset && !flags.cleanup) {
    flags.ensure = true;
  }
  return flags;
}

async function runMigrate() {
  const { execSync } = await import("child_process");
  console.log("🗄️  Running db:migrate...");
  try {
    execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", cwd: process.cwd() });
    console.log("✅ Migrations applied");
  } catch {
    console.error("❌ Migration failed");
    process.exit(1);
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (!NEON_API_KEY || !NEON_PROJECT_ID) {
    console.error("❌ Missing NEON_API_KEY or NEON_PROJECT_ID in .env.local");
    console.error("   Set them in .env.local:");
    console.error("   NEON_API_KEY=napi_...");
    console.error("   NEON_PROJECT_ID=your-project-id");
    process.exit(1);
  }

  console.log(`🔑 Project: ${NEON_PROJECT_ID}`);
  console.log(`🌿 Branch: ${NEON_PREVIEW_BRANCH} (parent: ${NEON_PARENT_BRANCH})`);
  if (flags.dryRun) console.log("🧪 DRY RUN — no mutations");
  console.log("");

  if (flags.ensure) {
    console.log("🔍 Checking preview branch...");
    const result = await ensurePreviewBranch(
      NEON_API_KEY,
      NEON_PROJECT_ID,
      NEON_PREVIEW_BRANCH,
      NEON_PARENT_BRANCH
    );
    if (result.created) {
      console.log(`✅ Branch "${NEON_PREVIEW_BRANCH}" created from "${NEON_PARENT_BRANCH}"`);
    } else {
      console.log(`✅ Branch "${NEON_PREVIEW_BRANCH}" already exists`);
    }
    console.log(`   Connection: ${maskConnectionString(result.connectionString)}`);
    console.log("");
  }

  if (flags.reset) {
    const branch = await getBranchByName(NEON_API_KEY, NEON_PROJECT_ID, NEON_PREVIEW_BRANCH);
    if (!branch) {
      console.error(`❌ Branch "${NEON_PREVIEW_BRANCH}" not found`);
      process.exit(1);
    }
    if (flags.dryRun) {
      console.log(`🧪 Would reset branch "${NEON_PREVIEW_BRANCH}" to parent head`);
    } else {
      console.log(`🔄 Resetting branch "${NEON_PREVIEW_BRANCH}" to parent head...`);
      await resetBranch(NEON_API_KEY, NEON_PROJECT_ID, branch.id);
      console.log(`✅ Branch "${NEON_PREVIEW_BRANCH}" reset to "${NEON_PARENT_BRANCH}" head`);
    }
    console.log("");
  }

  if (flags.cleanup) {
    console.log("🧹 Cleaning up stale branches (older than 14 days)...");
    if (flags.dryRun) {
      console.log("🧪 Would delete stale branches (dry run)");
    } else {
      const deleted = await cleanupStaleBranches(
        NEON_API_KEY,
        NEON_PROJECT_ID,
        ["main", NEON_PREVIEW_BRANCH],
        14
      );
      if (deleted.length === 0) {
        console.log("✅ No stale branches to clean up");
      } else {
        console.log(`🗑️  Deleted ${deleted.length} branch(es): ${deleted.join(", ")}`);
      }
    }
    console.log("");
  }

  if (flags.migrate) {
    await runMigrate();
  }

  console.log("✅ Done");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
