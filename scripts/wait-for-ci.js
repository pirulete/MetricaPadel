#!/usr/bin/env node
/**
 * wait-for-ci.js
 *
 * Espera a que el check de CI asociado a un commit SHA pase en GitHub.
 * Diseñado para el flujo de /supercommitpro: se pushea el merge commit a
 * rama-preview (no protegida), CI corre sobre ese SHA, y solo cuando el check
 * está verde se permite el push a main (branch protection lo exige por SHA).
 *
 * Uso:
 *   node scripts/wait-for-ci.js --sha <sha> [--owner <owner>] [--repo <repo>]
 *       [--check validate] [--timeout 480] [--interval 15] [--token <token>]
 *
 * Auth: --token, o GH_TOKEN/GITHUB_TOKEN env. Fallback automático a `gh` CLI
 * (gh auth login). Repo privado → token o gh CLI requeridos.
 *
 * Exit codes:
 *   0  CI en verde (success/neutral/skipped)
 *   1  Check falló (failed/error/cancelled/timed_out/action_required/startup_failure)
 *   2  Timeout esperando
 *   3  Error de autenticación/API/red/uso
 */

const HELP = `Usage: node scripts/wait-for-ci.js --sha <commit-sha> [options]

Espera a que el check de CI pase en GitHub para un SHA dado.

Options:
  --sha <sha>        Commit SHA a monitorear (requerido)
  --owner <owner>    Dueño del repositorio (default: env GITHUB_REPOSITORY o git remote origin)
  --repo <repo>      Repositorio (default: env GITHUB_REPOSITORY o git remote origin)
  --check <name>     Nombre del check requerido (default: validate)
  --timeout <sec>    Timeout en segundos (default: 480)
  --interval <sec>   Intervalo de polling en segundos (default: 15)
  --token <token>    GitHub token (default: GH_TOKEN o GITHUB_TOKEN env, fallback gh CLI)
  --help             Muestra esta ayuda

Exit codes:
  0  CI en verde
  1  Check falló
  2  Timeout esperando
  3  Error de autenticación/API/red/uso
`;

const TERMINAL_FAILURES = new Set([
  "failure",
  "error",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
]);

class CiFailedError extends Error {
  constructor(message, conclusion) {
    super(message);
    this.name = "CiFailedError";
    this.exitCode = 1;
    this.conclusion = conclusion;
  }
}

class CiTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "CiTimeoutError";
    this.exitCode = 2;
  }
}

class CiApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "CiApiError";
    this.exitCode = 3;
  }
}

/**
 * Interpreta la lista de check-runs y devuelve { state, conclusion }.
 * state: "pending" | "success" | "failed"
 */
function checkState(checkRuns, checkName) {
  const run = checkRuns.find((r) => r.name === checkName) || checkRuns[0];
  if (!run) return { state: "pending" };
  if (run.status === "in_progress" || run.status === "queued" || run.status === "pending") {
    return { state: "pending" };
  }
  if (run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped") {
    return { state: "success", conclusion: run.conclusion };
  }
  if (TERMINAL_FAILURES.has(run.conclusion)) {
    return { state: "failed", conclusion: run.conclusion };
  }
  return { state: "pending" };
}

async function fetchCheckRuns({ owner, repo, sha, token, fetchImpl }) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "wait-for-ci",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`,
    { headers },
  );
  // Sin token, la API de repos privados devuelve 404 (oculta la existencia del commit).
  // Fallback a gh CLI (comúnmente autenticado vía `gh auth login`).
  if ((res.status === 401 || res.status === 403 || res.status === 404) && !token) {
    const runs = await fetchCheckRunsViaGh(owner, repo, sha);
    if (runs) return runs;
  }
  if (res.status === 401 || res.status === 403) {
    throw new CiApiError(`Autenticación rechazada (${res.status}) — revisa GH_TOKEN o gh auth login`);
  }
  if (res.status === 429) throw new CiApiError("Rate limit excedido (429) — reintenta en unos minutos");
  if (res.status === 404) {
    throw new CiApiError(`Commit ${sha} no encontrado (404) — ¿fue pusheado a GitHub?`);
  }
  if (!res.ok) throw new CiApiError(`Error GitHub API (${res.status})`);
  const data = await res.json();
  return Array.isArray(data.check_runs) ? data.check_runs : [];
}

/**
 * Intenta obtener check-runs vía gh CLI (fallback sin GH_TOKEN).
 * Retorna null si gh no está disponible o falla.
 */
function fetchCheckRunsViaGh(owner, repo, sha) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- script CJS intencional
    const { execSync } = require("child_process");
    const result = execSync(
      `gh api "repos/${owner}/${repo}/commits/${sha}/check-runs" --jq '.check_runs'`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
    );
    const parsed = JSON.parse(result.trim());
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Poll del check de CI hasta que termine o expire el timeout.
 *
 * @param {object} opts
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} opts.sha
 * @param {string} [opts.check="validate"]
 * @param {number} [opts.timeoutMs=480000]
 * @param {number} [opts.intervalMs=15000]
 * @param {string} [opts.token=""]
 * @param {(input: string, init?: object) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>} [opts.fetchImpl] Inyectable para tests.
 * @returns {Promise<{status: "success", conclusion: string}>}
 * @throws {CiFailedError} exitCode 1
 * @throws {CiTimeoutError} exitCode 2
 * @throws {CiApiError} exitCode 3
 */
async function waitForCi({
  owner,
  repo,
  sha,
  check = "validate",
  timeoutMs = 480_000,
  intervalMs = 15_000,
  token = "",
  fetchImpl = global.fetch,
}) {
  if (!owner || !repo) throw new CiApiError("Faltan --owner/--repo");
  if (!sha) throw new CiApiError("Falta --sha");
  if (typeof fetchImpl !== "function") throw new CiApiError("Fetch no disponible — requiere Node 18+");

  const deadline = Date.now() + timeoutMs;
  let lastState;
  while (true) {
    let runs;
    try {
      runs = await fetchCheckRuns({ owner, repo, sha, token, fetchImpl });
    } catch (err) {
      if (err instanceof CiApiError) throw err;
      throw new CiApiError(`Error de red: ${err.message}`);
    }
    const state = checkState(runs, check);
    lastState = state.state;
    if (state.state === "success") return { status: "success", conclusion: state.conclusion };
    if (state.state === "failed") {
      throw new CiFailedError(`Check "${check}" falló (${state.conclusion})`, state.conclusion);
    }
    if (Date.now() >= deadline) {
      throw new CiTimeoutError(
        `Timeout tras ${Math.round(timeoutMs / 1000)}s — último estado: ${lastState}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function parseArgs(argv) {
  const args = {
    owner: "",
    repo: "",
    sha: "",
    check: "validate",
    timeoutMs: 480_000,
    intervalMs: 15_000,
    token: "",
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case "--sha": args.sha = val; i++; break;
      case "--owner": args.owner = val; i++; break;
      case "--repo": args.repo = val; i++; break;
      case "--check": args.check = val; i++; break;
      case "--timeout": args.timeoutMs = Number(val) * 1000; i++; break;
      case "--interval": args.intervalMs = Number(val) * 1000; i++; break;
      case "--token": args.token = val; i++; break;
      case "--help": case "-h": args.help = true; break;
      default: break;
    }
  }
  return args;
}

function resolveOwnerRepoFromGit() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- script CJS intencional
  const { execSync } = require("child_process");
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
    const match = remote.match(/[:/]([^/:]+)\/([^/.]+)(\.git)?$/);
    if (match) return { owner: match[1], repo: match[2] };
  } catch {
    // sin remote configurado — se reportará la falta de owner/repo
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  let owner = args.owner;
  let repo = args.repo;
  if ((!owner || !repo) && process.env.GITHUB_REPOSITORY) {
    const [envOwner, envRepo] = process.env.GITHUB_REPOSITORY.split("/");
    if (!owner) owner = envOwner;
    if (!repo) repo = envRepo;
  }
  if (!owner || !repo) {
    const fromGit = resolveOwnerRepoFromGit();
    if (fromGit) {
      if (!owner) owner = fromGit.owner;
      if (!repo) repo = fromGit.repo;
    }
  }

  const token = args.token || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

  try {
    const result = await waitForCi({
      owner,
      repo,
      sha: args.sha,
      check: args.check,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      token,
    });
    console.log(`✅  CI en verde — ${result.conclusion} (${owner}/${repo}@${args.sha})`);
    process.exit(0);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(err.exitCode || 3);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  waitForCi,
  checkState,
  fetchCheckRuns,
  CiFailedError,
  CiTimeoutError,
  CiApiError,
};
