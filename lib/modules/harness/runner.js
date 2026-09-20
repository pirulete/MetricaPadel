/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Runner — process-tree-safe command runner con timeout.
 * Extraído de validate-harness.js para reutilización.
 * CJS para compatibilidad con Jest y harness.
 *
 * Resuelve el problema histórico: execSync con timeout mata solo el hijo
 * directo, orfanando la cadena npm → node → playwright → chromium.
 * Solución: spawn con detached:true + process.kill(-pid) mata todo el árbol.
 */
"use strict";

const { spawn } = require("child_process");
const { readBaseline, writeBaseline, extractTestCount } = require("./status.js");

let currentGateChild = null;

function killProcessTree(child) {
  if (!child || child.killed) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
}

["SIGINT", "SIGTERM"].forEach((sig) => {
  process.on(sig, () => {
    killProcessTree(currentGateChild);
    process.exit(130);
  });
});

/**
 * @param {string} cmd
 * @param {number} timeoutMs
 * @param {string} [cwd]
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number|null, killed: boolean}>}
 */
function runGateCommand(cmd, timeoutMs, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    currentGateChild = child;
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      killProcessTree(child);
      if (!settled) { settled = true; resolve({ stdout, stderr, exitCode: null, killed: true }); }
    }, timeoutMs);
    timer.unref();
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", () => {
      clearTimeout(timer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      if (!settled) { settled = true; resolve({ stdout, stderr, exitCode: 1, killed: false }); }
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      if (currentGateChild === child) currentGateChild = null;
      if (!settled) { settled = true; resolve({ stdout, stderr, exitCode: code, killed: signal !== null }); }
    });
  });
}

/**
 * @param {object} gate
 * @param {string} validationDir
 * @returns {Promise<object>}
 */
async function runGate(gate, validationDir) {
  const label = gate.label;
  process.stdout.write(`  ⏳ ${label}... `);
  const start = Date.now();
  const { stdout, stderr, exitCode, killed } = await runGateCommand(gate.cmd, gate.timeout || 120_000);
  const output = stdout + stderr;
  const ok = !killed && exitCode === 0;
  if (!ok) {
    const msg = output.trim().split("\n").slice(-10).join("\n");
    process.stdout.write(killed ? "❌ (timeout, tree killed)\n" : "❌\n");
    return { passed: false, output: msg, command: gate.cmd, exitCode: exitCode ?? 1, durationMs: Date.now() - start, testCount: null, testDelta: null };
  }
  let testCount = null;
  let testDelta = null;
  if (gate.id === "unit_tests" || gate.id === "api_tests") {
    const lines = output.trim().split("\n").filter(l => l.includes("Tests:") || l.includes("Suites:"));
    const summary = lines.length > 0 ? lines[lines.length - 1].trim() : "ok";
    testCount = extractTestCount(output);
    if (testCount !== null && gate.id === "unit_tests") {
      const baseline = readBaseline(validationDir);
      const prev = baseline[gate.id] ?? null;
      testDelta = prev === null ? null : testCount - prev;
      baseline[gate.id] = testCount;
      writeBaseline(validationDir, baseline);
    }
    process.stdout.write(`✅ ${summary}`);
    if (testDelta !== null) process.stdout.write(` ${testDelta >= 0 ? "+" : ""}${testDelta}`);
    process.stdout.write("\n");
  } else if (gate.id === "sast") {
    const jsonPart = output.split("---JSON-REPORT---\n")[1];
    if (jsonPart) {
      try {
        const report = JSON.parse(jsonPart);
        const total = report.results?.length || 0;
        const errors = report.results?.filter(r => r.extra?.severity === "ERROR" || r?.extra?.severity === "error").length || 0;
        const warnings = report.results?.filter(r => r.extra?.severity === "WARNING" || r?.extra?.severity === "warning").length || 0;
        const info = report.results?.filter(r => r.extra?.severity === "INFO" || r?.extra?.severity === "info").length || 0;
        process.stdout.write(`✅ ${total} findings (${errors} errors, ${warnings} warnings, ${info} info)\n`);
      } catch { process.stdout.write("✅ (report saved)\n"); }
    } else { process.stdout.write("✅\n"); }
  } else {
    process.stdout.write("✅\n");
  }
  return { passed: true, output: output.trim(), command: gate.cmd, exitCode: 0, durationMs: Date.now() - start, testCount, testDelta };
}

module.exports = { runGateCommand, runGate, killProcessTree };
