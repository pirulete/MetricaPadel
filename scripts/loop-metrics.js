#!/usr/bin/env node
/**
 * loop-metrics.js — Track loop engineering metrics for /fix-problems and /ship-feature workflows.
 *
 * Usage:
 *   node scripts/loop-metrics.js --record <change_id> --iterations <n> [--gates-failed <n>] [--loop-duration-ms <n>] [--module <mod>]
 *   node scripts/loop-metrics.js --report
 *   node scripts/loop-metrics.js --status
 *
 * Metrics are stored in .validation/loop-metrics.json
 */

const fs = require("fs");
const path = require("path");

const METRICS_FILE = path.join(__dirname, "..", ".validation", "loop-metrics.json");

function ensureDir() {
  const dir = path.dirname(METRICS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readMetrics() {
  try {
    return JSON.parse(fs.readFileSync(METRICS_FILE, "utf-8"));
  } catch {
    return { events: [] };
  }
}

function writeMetrics(data) {
  ensureDir();
  fs.writeFileSync(METRICS_FILE, JSON.stringify(data, null, 2) + "\n");
}

function parseArgs(args) {
  const result = { command: "status" };
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--record") { result.command = "record"; result.changeId = args[++i]; }
    else if (arg === "--report") { result.command = "report"; }
    else if (arg === "--status") { result.command = "status"; }
    else if (arg === "--iterations") result.iterations = parseInt(args[++i], 10);
    else if (arg === "--gates-failed") result.gatesFailed = parseInt(args[++i], 10);
    else if (arg === "--loop-duration-ms") result.loopDurationMs = parseInt(args[++i], 10);
    else if (arg === "--module") result.module = args[++i];
  }
  return result;
}

function recordEvent(opts) {
  const metrics = readMetrics();
  metrics.events.push({
    change_id: opts.changeId,
    timestamp: new Date().toISOString(),
    iterations: opts.iterations || 0,
    gates_failed: opts.gatesFailed || 0,
    loop_duration_ms: opts.loopDurationMs || 0,
    module: opts.module || "unknown",
  });
  writeMetrics(metrics);
  console.log(`✅ Recorded: ${opts.changeId} (${opts.iterations} iterations, ${opts.gatesFailed} gates failed)`);
}

function printReport() {
  const metrics = readMetrics();
  if (metrics.events.length === 0) {
    console.log("No events recorded yet.");
    return;
  }
  console.log(`\n📊 Loop Metrics Report (${metrics.events.length} events)\n`);
  console.log("Change ID".padEnd(35) + "Iterations".padEnd(12) + "Gates Failed".padEnd(14) + "Duration (ms)".padEnd(15) + "Module");
  console.log("-".repeat(90));
  for (const e of metrics.events) {
    console.log(
      (e.change_id || "unknown").padEnd(35) +
      String(e.iterations).padEnd(12) +
      String(e.gates_failed).padEnd(14) +
      String(e.loop_duration_ms || 0).padEnd(15) +
      (e.module || "unknown")
    );
  }
}

function printStatus() {
  const metrics = readMetrics();
  console.log(JSON.stringify({ event_count: metrics.events.length, file: METRICS_FILE }, null, 2));
}

const args = parseArgs(process.argv);
if (args.command === "record") {
  if (!args.changeId) { console.error("❌ --record requires --changeId"); process.exit(1); }
  recordEvent(args);
} else if (args.command === "report") {
  printReport();
} else {
  printStatus();
}
