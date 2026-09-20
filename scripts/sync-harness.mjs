#!/usr/bin/env node

/**
 * sync-harness.js — Sincroniza el harness de un proyecto fuente (p.ej. StreetMove)
 * hacia este skeleton whitelabel.
 *
 * Clasifica cada archivo en 3 categorías:
 *   COPY   — archivos genéricos seguros de sobrescribir (configs, components/ui, lib genérico).
 *   REVIEW — archivos que fueron generificados/adaptados en el skeleton. NO se copian;
 *            se reporta el `git diff` del proyecto fuente desde la última sync para portar a mano.
 *   NEVER  — archivos propios de cada proyecto (nunca se sincronizan).
 *
 * Uso:
 *   node scripts/sync-harness.js [--src <ruta>] [--dry-run|--apply]
 *
 *   --src      Ruta del proyecto fuente (default: env STREETMOVE_SRC o ../StreetMove/StreetMoveWebsite)
 *   --dry-run  Muestra qué se copiaría y qué cambió en REVIEW sin tocar nada (default)
 *   --apply    Copia los archivos COPY, genera el reporte de REVIEW, actualiza el estado y commitea
 *
 * Estado de sync: .validation/sync-state.json  { last_src_sha, synced_at }
 * Reporte:        production_artifacts/sync/YYYY-MM-DD/sync-report.md
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const STATE_FILE = path.join(PROJECT_ROOT, ".validation", "sync-state.json");
const SYNC_ARTIFACTS_DIR = path.join(PROJECT_ROOT, "production_artifacts", "sync");

const SRC_DEFAULT = process.env.STREETMOVE_SRC || path.join(PROJECT_ROOT, "..", "StreetMove", "StreetMoveWebsite");

// ── Manifiestos ──────────────────────────────────────────────────────────────
const COPY = [
  // Root configs
  ".gitignore", ".nvmrc", ".gitleaks.toml", ".semgrepignore",
  "tsconfig.json", "jest.config.js", "jest.coverage.config.js", "postcss.config.mjs", "drizzle.config.ts",
  "components.json", "eslint.config.mjs", "sentry.server.config.ts",
  "instrumentation.ts",
  // CI / hooks
  ".github/workflows/ci.yml", ".husky/pre-commit",
  // shadcn/ui primitives
  ...["accordion","alert-dialog","badge","button","card","dialog","dropdown-menu",
      "form","input","label","popover","section","select","switch","table","tabs",
      "textarea","tooltip"].map((n) => `components/ui/${n}.tsx`),
  // Generic scripts (no project pages hardcoded)
  "scripts/check-env-vars.js", "scripts/ocr-review.js", "scripts/check-api-integration.js",
  // Generic lib
  "lib/rate-limit.ts", "lib/api-handler.ts", "lib/date-utils.ts",
  "lib/db/session-audit-queries.ts", "lib/validations/password.ts",
  "lib/api-docs/swagger-ui.d.ts",
  // Agents already generic
  ".opencode/agents/qa-fix.md", ".opencode/agents/architect-fix.md",
  ".opencode/package.json", ".opencode/.gitignore",
  // Generic agent templates
  ".agents/templates/task-worksheet.md",
];

const REVIEW = [
  // Agent team core
  "AGENTS.md", ".agents/agents.md", ".agents/workflows/ship-feature.md",
  "opencode.json",
  ".opencode/agents/pm.md", ".opencode/agents/architect.md",
  ".opencode/agents/auth-security.md", ".opencode/agents/db-engineer.md",
  ".opencode/agents/app-engineer.md", ".opencode/agents/admin-engineer.md",
  ".opencode/agents/qa-release.md", ".opencode/agents/qa-validator.md",
  ".opencode/agents/ponytail-reviewer.md", ".opencode/agents/ui-designer.md",
  ".opencode/commands/ship-feature.md", ".opencode/commands/validate.md",
  ".opencode/commands/fix-problems.md", ".opencode/commands/fix-failing-test.md",
  ".opencode/commands/ponytail-review.md", ".opencode/commands/design.md",
  // Harness scripts
  "scripts/validate-harness.js", "scripts/migrate.ts", "scripts/wait-for-ci.js",
  "scripts/lighthouse.mjs", "scripts/pagespeed.mjs",
  // Whitelabel lib
  "auth.ts", "lib/auth/schemas.ts", "lib/auth/admin-guard.ts",
  "lib/auth/role-utils.ts", "lib/auth/protected-routes.ts",
  "lib/db/schema.ts", "lib/db/queries/index.ts", "lib/db/queries/auth.ts",
  "lib/db/index.ts", "lib/audit/helpers.ts", "lib/api-docs/spec.ts",
  "lib/email/send-verification.ts", "lib/utils.ts", "lib/validations/user.ts",
  "app/api/auth/[...nextauth]/route.ts", "app/api/auth/register/route.ts",
  "app/api/auth/signin/route.ts", "app/api/auth/logout/route.ts",
  "app/api/auth/verify-email/route.ts", "app/api/auth/resend-code/route.ts",
  "app/api/auth/forgot-password/route.ts", "app/api/auth/reset-password/route.ts",
  "app/api/auth/verify-reset-code/route.ts", "app/api/auth/refresh-session/route.ts",
  // Adapted configs
  "package.json", ".env.example", "next.config.mjs",
  "types/next-auth.d.ts", "types/auth.ts", "tests/unit/setup.ts",
];

// NEVER — explícito para documentación (no se toca):
// README.md, QUICKSTART.md, app/(public|app|admin), app/api/health, app/api/user/*,
// .engram/config.json, .validation/status.json, .validation/sync-state.json,
// FEATURES.md, .agents/patterns/recurring-issues.md (patrones del proyecto fuente),
// .agents/workflows/{admin-release,auth-release,student-release}.md,
// .opencode/commands/{admin-release,auth-release,student-release,supercommitpre,supercommitpro}.md,
// scripts/{01,02}-*.sql, activate-user.ts, list-schedules.ts, make-admin.ts,
// migrate-data-to-prod.ts, migrate-db.*, migrate-plan-types.ts, seed-*.ts, update-plan-type.ts

// ── Helpers ──────────────────────────────────────────────────────────────────
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { last_src_sha: null, synced_at: null };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function getSrcSha(src) {
  try {
    return execSync("git rev-parse HEAD", { cwd: src, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function srcDiffSince(src, sinceSha, file) {
  // Cambios en SRC desde last_src_sha..HEAD para un archivo
  try {
    const range = sinceSha ? `${sinceSha}..HEAD` : "HEAD~5..HEAD";
    const out = execSync(`git diff ${range} -- "${file}"`, {
      cwd: src, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim();
  } catch {
    return null;
  }
}

function copyFile(srcRoot, dstRoot, rel) {
  const src = path.join(srcRoot, rel);
  const dst = path.join(dstRoot, rel);
  if (!fs.existsSync(src)) return "missing-in-src";
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return "copied";
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const srcArg = (() => {
    const i = args.indexOf("--src");
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  })();
  const src = path.resolve(srcArg || SRC_DEFAULT);
  const mode = args.includes("--apply") ? "apply" : "dry-run";

  if (!fs.existsSync(src)) {
    console.error(`❌ Proyecto fuente no encontrado: ${src}`);
    console.error(`   Usa --src <ruta> o STREETMOVE_SRC`);
    process.exit(1);
  }

  console.log(`🔀 Sync harness`);
  console.log(`   Fuente:  ${src}`);
  console.log(`   Destino: ${PROJECT_ROOT}`);
  console.log(`   Modo:    ${mode}`);
  console.log("");

  const srcSha = getSrcSha(src);
  const state = readState();
  const lastSha = state.last_src_sha;
  console.log(`   SRC HEAD:      ${srcSha || "N/A"}`);
  console.log(`   Última sync:   ${lastSha || "primera vez"} (${state.synced_at || "-"})`);
  console.log("");

  // ── 1. COPY files ──────────────────────────────────────────────────────
  const copyResults = [];
  for (const rel of COPY) {
    const dst = path.join(PROJECT_ROOT, rel);
    const srcFile = path.join(src, rel);
    if (!fs.existsSync(srcFile)) {
      copyResults.push({ rel, action: "missing-in-src" });
      continue;
    }
    const same = fs.existsSync(dst) && fs.readFileSync(srcFile).equals(fs.readFileSync(dst));

    if (same) {
      copyResults.push({ rel, action: "same" });
    } else if (mode === "apply") {
      const r = copyFile(src, PROJECT_ROOT, rel);
      copyResults.push({ rel, action: r });
    } else {
      copyResults.push({ rel, action: "would-copy" });
    }
  }

  console.log("── Archivos COPY ──");
  for (const r of copyResults) {
    const icon = r.action === "same" ? "✅" : r.action === "copied" ? "✅ copiado" : r.action === "would-copy" ? "🔄 se copiaría" : "⚠️ falta en SRC";
    console.log(`  ${icon}  ${r.rel}`);
  }
  console.log("");

  // ── 2. REVIEW diff report ─────────────────────────────────────────────
  const reviewEntries = [];
  for (const rel of REVIEW) {
    const srcFile = path.join(src, rel);
    if (!fs.existsSync(srcFile)) continue; // no existe en SRC → nada que portar
    const dstExists = fs.existsSync(path.join(PROJECT_ROOT, rel));

    if (!lastSha) {
      // Primera sync: sin referencia previa. Marcar todo como "revisar"
      // (el contenido del skeleton está adaptado/generificado).
      if (dstExists) reviewEntries.push({ rel, diff: null, firstSync: true });
      continue;
    }

    const diff = srcDiffSince(src, lastSha, rel);
    if (diff && diff.length > 0) {
      reviewEntries.push({ rel, diff, changedInSrc: true });
    }
  }

  console.log(`── Archivos REVIEW (cambios en SRC desde ${lastSha || "HEAD~5"} para portar a mano) ──`);
  if (reviewEntries.length === 0) {
    console.log("  (sin cambios nuevos en el proyecto fuente)");
  } else {
    for (const e of reviewEntries) {
      console.log(`  🔍  ${e.rel}${e.firstSync ? "  (primera sync — revisar adaptación)" : ""}`);
    }
  }
  console.log("");

  // ── 3. Reporte ─────────────────────────────────────────────────────────
  if (mode === "apply" || reviewEntries.length > 0 || copyResults.some((r) => r.action === "would-copy" || r.action === "copied")) {
    const dateDir = new Date().toISOString().split("T")[0];
    const reportDir = path.join(SYNC_ARTIFACTS_DIR, dateDir);
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, "sync-report.md");

    let md = `# Sync Report\n\n`;
    md += `> Fuente: \`${src}\`\n`;
    md += `> Fecha: ${new Date().toISOString()}\n`;
    md += `> SRC HEAD: \`${srcSha || "N/A"}\`\n`;
    md += `> Última sync: \`${lastSha || "primera vez"}\`\n\n`;

    md += `## COPY\n\n`;
    md += `| Archivo | Acción |\n|---|---|\n`;
    for (const r of copyResults) md += `| \`${r.rel}\` | ${r.action} |\n`;
    md += "\n";

    md += `## REVIEW (portar a mano)\n\n`;
    if (reviewEntries.length === 0) {
      md += "Sin cambios nuevos en el proyecto fuente.\n";
    } else {
      for (const e of reviewEntries) {
        md += `### \`${e.rel}\`\n\n`;
        if (e.firstSync) {
          md += "Primera sync: archivo adaptado en el skeleton — revisar que el contenido fuente siga siendo compatible.\n";
        } else {
          md += "```diff\n" + e.diff + "\n```\n";
        }
        md += "\n";
      }
    }

    fs.writeFileSync(reportPath, md, "utf-8");
    console.log(`📄 Reporte: ${reportPath}`);

    if (mode === "apply") {
      writeState({ last_src_sha: srcSha, synced_at: new Date().toISOString() });
      console.log("💾 Estado de sync actualizado (.validation/sync-state.json)");
      try {
        execSync("git add -A && git commit -q -m \"chore: sync harness desde StreetMove\"", {
          cwd: PROJECT_ROOT, stdio: ["pipe", "pipe", "pipe"],
        });
        console.log("✅ Commit de sync creado");
      } catch {
        console.log("ℹ️  Sin cambios que committear (o commit falló)");
      }
    }
  } else {
    console.log("📄 Sin cambios pendientes — no se genera reporte.");
  }

  if (mode === "dry-run") {
    console.log("");
    console.log("ℹ️  Modo dry-run: no se modificó nada. Usa --apply para copiar COPY + generar reporte.");
  }
}

main();
