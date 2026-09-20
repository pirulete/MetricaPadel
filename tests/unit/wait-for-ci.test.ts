/**
 * @jest-environment node
 */
import {
  waitForCi,
  checkState,
  fetchCheckRuns,
  CiApiError,
} from "../../scripts/wait-for-ci";

type FetchResponse = {
  status: number;
  json: () => Promise<unknown>;
  ok: boolean;
};

function makeResponse(status: number, body: unknown): FetchResponse {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function checkRun(name: string, status: string, conclusion?: string) {
  return { name, status, conclusion };
}

function makeFetchImpl(responses: FetchResponse[]) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const next = responses.shift();
    if (!next) throw new Error("fetch llamado de más");
    return next;
  };
  return { fetchImpl, calls };
}

const OPTS = {
  owner: "pirulete",
  repo: "StreetMoveWebsite",
  sha: "abc123",
  check: "validate",
  intervalMs: 1,
  token: "",
};

describe("checkState", () => {
  it("pending cuando no hay check-runs aún", () => {
    expect(checkState([], "validate")).toEqual({ state: "pending" });
  });

  it("pending mientras el check está in_progress", () => {
    expect(checkState([checkRun("validate", "in_progress")], "validate")).toEqual({ state: "pending" });
  });

  it("success para conclusion success", () => {
    expect(checkState([checkRun("validate", "completed", "success")], "validate")).toEqual({
      state: "success",
      conclusion: "success",
    });
  });

  it("success para neutral y skipped (GitHub los cuenta como pass)", () => {
    expect(checkState([checkRun("validate", "completed", "neutral")], "validate")).toEqual({
      state: "success",
      conclusion: "neutral",
    });
    expect(checkState([checkRun("validate", "completed", "skipped")], "validate")).toEqual({
      state: "success",
      conclusion: "skipped",
    });
  });

  it("failed para conclusiones terminales", () => {
    for (const conclusion of ["failure", "error", "cancelled", "timed_out"]) {
      expect(checkState([checkRun("validate", "completed", conclusion)], "validate")).toEqual({
        state: "failed",
        conclusion,
      });
    }
  });

  it("falla al check nombrado, no al primero", () => {
    const runs = [
      checkRun("Other Check", "completed", "success"),
      checkRun("validate", "completed", "failure"),
    ];
    expect(checkState(runs, "validate")).toEqual({ state: "failed", conclusion: "failure" });
  });

  it("usa el primer run como fallback si no existe el nombrado", () => {
    const runs = [checkRun("Other Check", "completed", "success")];
    expect(checkState(runs, "validate")).toEqual({ state: "success", conclusion: "success" });
  });
});

describe("waitForCi", () => {
  it("resuelve success cuando pending → success", async () => {
    const { fetchImpl } = makeFetchImpl([
      makeResponse(200, { check_runs: [checkRun("validate", "in_progress")] }),
      makeResponse(200, { check_runs: [checkRun("validate", "completed", "success")] }),
    ]);
    const result = await waitForCi({ ...OPTS, fetchImpl });
    expect(result).toEqual({ status: "success", conclusion: "success" });
  });

  it("lanza CiFailedError (exit 1) cuando el check falla", async () => {
    const { fetchImpl } = makeFetchImpl([
      makeResponse(200, { check_runs: [checkRun("validate", "completed", "failure")] }),
    ]);
    await expect(waitForCi({ ...OPTS, fetchImpl })).rejects.toMatchObject({
      name: "CiFailedError",
      exitCode: 1,
      conclusion: "failure",
    });
  });

  it("lanza CiTimeoutError (exit 2) cuando expira el timeout", async () => {
    // fetch infinito: siempre in_progress — el loop debe cortar por deadline.
    // timeoutMs=20/intervalMs=2 en timers reales es determinista: el deadline
    // se supera sin depender de scheduling de <1ms.
    const fetchImpl = async () =>
      makeResponse(200, { check_runs: [checkRun("validate", "in_progress")] })
    await expect(waitForCi({ ...OPTS, fetchImpl, timeoutMs: 20, intervalMs: 2 })).rejects.toMatchObject({
      name: "CiTimeoutError",
      exitCode: 2,
    })
  });

  it("lanza CiApiError (exit 3) en 401", async () => {
    const { fetchImpl } = makeFetchImpl([makeResponse(401, {})]);
    await expect(waitForCi({ ...OPTS, fetchImpl })).rejects.toMatchObject({ exitCode: 3 });
  });

  it("lanza CiApiError (exit 3) en 403", async () => {
    const { fetchImpl } = makeFetchImpl([makeResponse(403, {})]);
    await expect(waitForCi({ ...OPTS, fetchImpl })).rejects.toMatchObject({ exitCode: 3 });
  });

  it("lanza CiApiError (exit 3) en rate limit 429", async () => {
    const { fetchImpl } = makeFetchImpl([makeResponse(429, {})]);
    await expect(waitForCi({ ...OPTS, fetchImpl })).rejects.toMatchObject({ exitCode: 3 });
  });

  it("lanza CiApiError (exit 3) en 404 (commit no pusheado)", async () => {
    const { fetchImpl } = makeFetchImpl([makeResponse(404, {})]);
    await expect(waitForCi({ ...OPTS, fetchImpl })).rejects.toMatchObject({ exitCode: 3 });
  });

  it("lanza CiApiError (exit 3) en errores de red del fetch", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(waitForCi({ ...OPTS, fetchImpl })).rejects.toMatchObject({
      name: "CiApiError",
      exitCode: 3,
    });
  });

  it("valida argumentos requeridos", async () => {
    await expect(waitForCi({ ...OPTS, sha: "" })).rejects.toMatchObject({ exitCode: 3 });
    await expect(waitForCi({ ...OPTS, owner: "", repo: "" })).rejects.toMatchObject({ exitCode: 3 });
  });

  it("incluye el token en los headers del request", async () => {
    let seenHeaders: Record<string, string> | undefined;
    const fetchImpl = async (_url: string, init?: { headers?: Record<string, string> }) => {
      seenHeaders = init?.headers as Record<string, string>;
      return makeResponse(200, { check_runs: [checkRun("validate", "completed", "success")] });
    };
    await waitForCi({ ...OPTS, fetchImpl, token: "tok_123" });
    expect(seenHeaders?.Authorization).toBe("Bearer tok_123");
  });
});

describe("fetchCheckRuns", () => {
  it("parsea check_runs del payload", async () => {
    const runs = [checkRun("validate", "completed", "success")];
    const { fetchImpl } = makeFetchImpl([makeResponse(200, { check_runs: runs })]);
    const result = await fetchCheckRuns({ ...OPTS, fetchImpl });
    expect(result).toEqual(runs);
  });

  it("retorna [] si el payload no tiene check_runs", async () => {
    const { fetchImpl } = makeFetchImpl([makeResponse(200, {})]);
    const result = await fetchCheckRuns({ ...OPTS, fetchImpl });
    expect(result).toEqual([]);
  });

  it("respeta --check al armar el URL", async () => {
    const { fetchImpl, calls } = makeFetchImpl([
      makeResponse(200, { check_runs: [checkRun("validate", "completed", "success")] }),
    ]);
    await waitForCi({ ...OPTS, check: "validate", fetchImpl });
    expect(calls[0]).toBe(
      "https://api.github.com/repos/pirulete/StreetMoveWebsite/commits/abc123/check-runs",
    );
  });

  it("sin token, usa gh CLI como fallback en 404 (repo privado)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- test CJS
    const ghApi = jest.spyOn(require("child_process"), "execSync").mockReturnValue(
      JSON.stringify([checkRun("validate", "completed", "success")]),
    );
    try {
      const { fetchImpl } = makeFetchImpl([makeResponse(404, {})]);
      const result = await fetchCheckRuns({ ...OPTS, token: "", fetchImpl });
      expect(result).toEqual([checkRun("validate", "completed", "success")]);
      expect(ghApi).toHaveBeenCalledWith(
        expect.stringContaining("gh api"),
        expect.objectContaining({ stdio: ["pipe", "pipe", "ignore"] }),
      );
    } finally {
      ghApi.mockRestore();
    }
  });

  it("sin token y sin gh CLI disponible, propaga 404 como CiApiError", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- test CJS
    const ghApi = jest.spyOn(require("child_process"), "execSync").mockImplementation(() => {
      throw new Error("gh: not found");
    });
    try {
      const { fetchImpl } = makeFetchImpl([makeResponse(404, {})]);
      await expect(fetchCheckRuns({ ...OPTS, token: "", fetchImpl })).rejects.toThrow(CiApiError);
    } finally {
      ghApi.mockRestore();
    }
  });
});
