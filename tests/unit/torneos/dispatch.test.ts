/**
 * EC-04 — despacho del job de agenda (`lib/torneos/dispatch.ts`).
 *
 * Cubre las 4 ramas de `resolveWorkerUrl` y los 4 desenlaces de `dispatchRun`.
 * Sin SQL real, sin red (`fetch` mockeado) y sin `TOURNAMENT_WORKER_SECRET` real.
 * Prohibido el automock: `jest.mock` con factory evita `new Pool(...)` de lib/db (N4).
 */
jest.mock("@/lib/db", () => ({
  db: {
    update: jest.fn(),
    insert: jest.fn(),
    select: jest.fn(),
    execute: jest.fn(),
  },
}));

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import {
  DISPATCH_TIMEOUT_MS,
  dispatchRun,
  resolveWorkerUrl,
} from "@/lib/torneos/dispatch";

const dbMock = db as unknown as {
  update: jest.Mock;
  insert: jest.Mock;
  select: jest.Mock;
  execute: jest.Mock;
};

const WORKER_PATH = "/api/internal/tournament-worker";
const ENV_KEYS = [
  "TOURNAMENT_WORKER_URL",
  "NEXT_PUBLIC_BASE_URL",
  "TOURNAMENT_WORKER_SECRET",
] as const;

const fetchMock = jest.fn();
let savedEnv: Record<string, string | undefined> = {};

/** Simula el UPDATE … RETURNING de `dispatchRun` con las filas indicadas. */
function mockUpdateReturning(
  rows: Array<{ id: string; dispatchAttempts: number }>,
) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  dbMock.update.mockReturnValue({ set });
  return { set, where, returning };
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = savedEnv[key];
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  jest.restoreAllMocks();
});

describe("resolveWorkerUrl — 4 ramas", () => {
  it("override explícito (TOURNAMENT_WORKER_URL) gana sobre baseUrl y se recorta", () => {
    process.env.TOURNAMENT_WORKER_URL = "  https://worker.test/run  ";
    expect(resolveWorkerUrl("https://base.test")).toBe(
      "https://worker.test/run",
    );
  });

  it("NEXT_PUBLIC_BASE_URL + path, con slash final recortado", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://app.test///";
    expect(resolveWorkerUrl("https://fallback.test")).toBe(
      `https://app.test${WORKER_PATH}`,
    );
  });

  it("fallback a baseUrl del request cuando no hay envs", () => {
    expect(resolveWorkerUrl("https://request.test/")).toBe(
      `https://request.test${WORKER_PATH}`,
    );
  });

  it("recorta espacios de NEXT_PUBLIC_BASE_URL y de baseUrl", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "  https://app.test  ";
    expect(resolveWorkerUrl()).toBe(`https://app.test${WORKER_PATH}`);
    delete process.env.NEXT_PUBLIC_BASE_URL;
    expect(resolveWorkerUrl("  https://request.test  ")).toBe(
      `https://request.test${WORKER_PATH}`,
    );
  });

  it("sin env ni baseUrl útiles ⇒ null", () => {
    expect(resolveWorkerUrl()).toBeNull();
    expect(resolveWorkerUrl("   ")).toBeNull();
    process.env.TOURNAMENT_WORKER_URL = "   ";
    expect(resolveWorkerUrl()).toBeNull();
  });
});

describe("dispatchRun", () => {
  it("run ya no está queued ⇒ not_queued y sin fetch", async () => {
    mockUpdateReturning([]);

    await expect(dispatchRun("run-1")).resolves.toEqual({
      ok: false,
      reason: "not_queued",
    });
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queued sin URL de worker ⇒ no_worker_url con los intentos actuales", async () => {
    mockUpdateReturning([{ id: "run-1", dispatchAttempts: 1 }]);

    await expect(dispatchRun("run-1")).resolves.toEqual({
      ok: false,
      reason: "no_worker_url",
      dispatchAttempts: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Sin URL"),
      "run-1",
    );
  });

  it("despacho correcto ⇒ ok con status y secreto en header", async () => {
    const { set } = mockUpdateReturning([{ id: "run-1", dispatchAttempts: 2 }]);
    fetchMock.mockResolvedValue({ ok: true, status: 202 });

    const result = await dispatchRun("run-1", {
      workerUrl: "https://worker.test/dispatch",
      secret: "s3cret",
      timeoutMs: DISPATCH_TIMEOUT_MS,
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      dispatchAttempts: 2,
    });
    // El UPDATE cobra el intento y sella `lastDispatchAt` (objeto real, no vacío).
    const payload = set.mock.calls[0][0] as {
      dispatchAttempts: unknown;
      lastDispatchAt: unknown;
    };
    expect(payload.dispatchAttempts).toBeDefined();
    expect(payload.dispatchAttempts).not.toBe("");
    // `sql`${col} + 1`` — asertar el SQL renderizado (no basta `!== ""`: el
    // mutante `sql`` `` es un objeto SQL vacío, también distinto de `""`).
    const increment = new PgDialect().sqlToQuery(payload.dispatchAttempts as SQL);
    expect(increment.sql).toContain("dispatch_attempts");
    expect(increment.sql).toContain("+ 1");
    expect(payload.lastDispatchAt).toBeInstanceOf(Date);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://worker.test/dispatch");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ runId: "run-1" }));
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-worker-secret": "s3cret",
    });
  });

  it("sin secreto disponible ⇒ header x-worker-secret ausente", async () => {
    mockUpdateReturning([{ id: "run-1", dispatchAttempts: 1 }]);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await dispatchRun("run-1", { workerUrl: "https://worker.test/dispatch" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ "content-type": "application/json" });
  });

  it("worker rechaza el claim (409) ⇒ ok false conservando el status", async () => {
    mockUpdateReturning([{ id: "run-1", dispatchAttempts: 1 }]);
    fetchMock.mockResolvedValue({ ok: false, status: 409 });

    await expect(
      dispatchRun("run-1", { workerUrl: "https://worker.test/dispatch" }),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      dispatchAttempts: 1,
    });
  });

  it("fallo de red ⇒ dispatch_error (nunca lanza)", async () => {
    mockUpdateReturning([{ id: "run-1", dispatchAttempts: 3 }]);
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      dispatchRun("run-1", { workerUrl: "https://worker.test/dispatch" }),
    ).resolves.toEqual({
      ok: false,
      reason: "dispatch_error",
      dispatchAttempts: 3,
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Fallo"),
      "run-1",
      expect.any(Error),
    );
  });
});
