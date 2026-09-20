#!/usr/bin/env node
import { execSync } from "child_process";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/ocr-review.js [--fix]\n\nRun OCR code review on git diff.\n\n  --fix    Include fix suggestions\n  --help   Show this help");
  process.exit(0);
}

if (!process.env.OPENCODE_REVIEW_MODEL) {
  console.log("⚠️  OPENCODE_REVIEW_MODEL not set — skipping code review");
  process.exit(0);
}

try { execSync("npx ocr --help", { encoding: "utf-8", stdio: "pipe", timeout: 30_000 }); }
catch { console.log("⚠️  @alibaba-group/open-code-review not installed — skipping code review"); process.exit(0); }

const fixMode = args.includes("--fix");
let stdout;
try { stdout = execSync(`npx ocr review . --output json${fixMode ? " --fix" : ""}`, { encoding: "utf-8", stdio: "pipe", timeout: 120_000 }); }
catch (err) { if (err.stderr) console.warn("⚠️  OCR stderr:", err.stderr.trim().split("\n").slice(-5).join("\n")); stdout = err.stdout || ""; }

let data;
try { data = JSON.parse(stdout); } catch { data = null; }
if (!data) { console.log("⚠️  OCR returned invalid JSON"); process.exit(0); }

const issues = data.issues || [];
if (!issues.length) { console.log("No issues found"); process.exit(0); }

const sevCount = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
for (const i of issues) {
  const s = (i.severity || "INFO").toUpperCase();
  if (sevCount[s] !== undefined) sevCount[s]++; else sevCount.INFO++;
}

console.log(`\n🔍 OCR Code Review — ${fixMode ? "Fix" : "Report"} Mode\n`);
console.log("Summary:");
for (const [s, c] of Object.entries(sevCount)) if (c > 0) console.log(`  ${s}:${" ".repeat(8 - s.length)}${c}`);
console.log("");

for (const issue of issues) {
  const sev = (issue.severity || "INFO").toUpperCase().padEnd(8);
  const loc = issue.location || issue.file || "";
  const fl = loc ? `${loc}${issue.line ? ":" + issue.line : ""}` : issue.path || "unknown";
  console.log(`  ${sev} ${fl}  ${issue.message || issue.rule || "No message"}`);
}

if (fixMode) {
  let has = false;
  console.log("");
  for (const issue of issues) {
    if (issue.suggestion) {
      has = true;
      console.log(`${issue.location || issue.file || "unknown"}${issue.line ? ":" + issue.line : ""}`);
      console.log(`  ${issue.message || issue.rule || ""}`);
      console.log("  ```suggestion");
      console.log(`  ${issue.suggestion}`);
      console.log("  ```\n");
    }
  }
  if (!has) console.log("No suggestions from LLM\n");
}

const critical = issues.filter(i => (i.severity || "").toUpperCase() === "CRITICAL").length;
console.log(`✅ Code review completed (${issues.length} issues found, ${critical} critical)`);
process.exit(0);
