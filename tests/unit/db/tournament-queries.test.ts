/**
 * Unit tests de las queries de Torneos de F0c (db mockeado, sin SQL real):
 * `buildInstance` (round-trip DB → Instancia, anti-IDOR), `createRun` (UNIQUE
 * parcial → run_active), `claimRun` (idempotente), `finishRun` (1 transacción:
 * terminal + slots + agenda_draft), `getRun`/`listRecentRuns` (DTO + clamp) y
 * el reaper perezoso (`decideReapAction` + `reapStaleRuns`).
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = (queue: any[][]) => {
    const c: any = {};
    c.then = (resolve: (v: any) => void) => resolve(queue.shift() ?? []);
    c.from = jest.fn(() => c);
    c.innerJoin = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.values = jest.fn(() => c);
    c.set = jest.fn(() => c);
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  const dbQueue: any[][] = [];
  const txQueue: any[][] = [];
  const txInserts: Array<{ table: any; values: any }> = [];
  const txUpdates: Array<{ table: any; values: any }> = [];
  const dbUpdates: Array<{ table: any; values: any }> = [];

  const trackedUpdate = (queue: any[][], sink: Array<{ table: any; values: any }>) =>
    jest.fn((table: any) => {
      const chain = makeChain(queue);
      chain.set = jest.fn((values: any) => {
        sink.push({ table, values });
        return chain;
      });
      return chain;
    });

  const tx = {
    insert: jest.fn((table: any) => {
      const chain = makeChain(txQueue);
      chain.values = jest.fn((values: any) => {
        txInserts.push({ table, values });
        return chain;
      });
      return chain;
    }),
    update: trackedUpdate(txQueue, txUpdates),
    select: jest.fn(() => makeChain(txQueue)),
  };

  return {
    db: {
      transaction: jest.fn(async (cb: any) => cb(tx)),
      select: jest.fn(() => makeChain(dbQueue)),
      insert: jest.fn(() => makeChain(dbQueue)),
      update: trackedUpdate(dbQueue, dbUpdates),
    },
    __dbQueue: dbQueue,
    __txQueue: txQueue,
    __txInserts: txInserts,
    __txUpdates: txUpdates,
    __dbUpdates: dbUpdates,
  };
});

import { tournamentAgendaSlots, tournaments } from "@/lib/db/schema";
import { buildInstance } from "@/lib/db/queries/torneos/instance";
import {
  claimRun,
  clampRunListLimit,
  createRun,
  decideReapAction,
  finishRun,
  getRun,
  listRecentRuns,
  reapStaleRuns,
  toRunSummary,
} from "@/lib/db/queries/torneos/runs";

const mocked = jest.requireMock("@/lib/db") as any;
const dbQueue = mocked.__dbQueue as any[][];
const txQueue = mocked.__txQueue as any[][];
const txInserts = mocked.__txInserts as Array<{ table: any; values: any }>;
const txUpdates = mocked.__txUpdates as Array<{ table: any; values: any }>;
const dbUpdates = mocked.__dbUpdates as Array<{ table: any; values: any }>;

const NOW = new Date("2026-11-04T12:00:00.000Z");
const iso = (secondsAgo: number) =>
  new Date(NOW.getTime() - secondsAgo * 1000);

const runRow = {
  id: "r1",
  tournamentId: "t1",
  requestedBy: "coach1",
  status: "queued",
  params: { timeLimitMs: 60000 },
  engineStatus: null,
  objective: null,
  mipGap: null,
  timeMs: null,
  diagnostics: null,
  error: null,
  slotsCount: 0,
  dispatchAttempts: 0,
  lastDispatchAt: null,
  createdAt: iso(0),
  startedAt: null,
  finishedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  dbQueue.length = 0;
  txQueue.length = 0;
  txInserts.length = 0;
  txUpdates.length = 0;
  dbUpdates.length = 0;
});

// ---------------------------------------------------------------------------
// buildInstance
// ---------------------------------------------------------------------------

describe("buildInstance", () => {
  const tournamentRow = { id: "t1", courts: 2 };
  const blocks = [
    { idx: 0, dayLabel: "Jue", startTime: "14:00", phase: "previa", isExtension: false, capacity: 2 },
    { idx: 1, dayLabel: "Jue", startTime: "15:15", phase: "previa", isExtension: false, capacity: 1 },
  ];
  const categories = [
    { id: "cat1", tournamentId: "t1", code: "3ra", sex: "H", level: 3, sortOrder: 0 },
  ];
  const groups = [
    { id: "g1", tournamentId: "t1", categoryId: "cat1", code: "3ra-G1", size: 3, sortOrder: 0 },
    { id: "g2", tournamentId: "t1", categoryId: "cat1", code: "3ra-G2", size: 3, sortOrder: 1 },
  ];
  const teams = [
    { id: "tm1", tournamentId: "t1", categoryId: "cat1", groupId: "g1", code: "p1", sortOrder: 0 },
    { id: "tm2", tournamentId: "t1", categoryId: "cat1", groupId: "g1", code: "p2", sortOrder: 1 },
  ];
  const persons = [
    { id: "pp1", tournamentId: "t1", documentId: "111", sex: "H", displayName: null },
    { id: "pp2", tournamentId: "t1", documentId: "222", sex: "H", displayName: null },
  ];
  const members = [
    { teamId: "tm1", documentId: "222" },
    { teamId: "tm1", documentId: "111" },
  ];
  const availability = [{ teamId: "tm1", blockIdx: 3 }];
  const matches = [
    {
      id: "m1", tournamentId: "t1", categoryId: "cat1", phase: "previa", round: "grupo",
      groupId: "g1", teamAId: "tm1", teamBId: "tm2", sourceGroups: [], feeders: [],
      code: "3ra-G1-1",
    },
    {
      id: "m2", tournamentId: "t1", categoryId: "cat1", phase: "final", round: "final",
      groupId: null, teamAId: null, teamBId: null, sourceGroups: ["3ra-G1"],
      feeders: ["3ra-semi-1"], code: "3ra-final-1",
    },
  ];

  it("torneo ajeno o inexistente ⇒ null (anti-IDOR)", async () => {
    dbQueue.push([]);
    expect(await buildInstance("t1", "otro-coach")).toBeNull();
  });

  it("arma la instancia canónica con orden determinista (AC-04)", async () => {
    dbQueue.push([tournamentRow], blocks, categories, groups, teams, persons, members, availability, matches);

    const instance = await buildInstance("t1", "coach1");

    expect(instance).not.toBeNull();
    expect(instance!.nCanchas).toBe(2);
    expect(instance!.bloques.map((b: { idx: number }) => b.idx)).toEqual([0, 1]);
    expect(instance!.bloques[1]).toMatchObject({ dayLabel: "Jue", startTime: "15:15", capacity: 1 });

    expect(instance!.categorias["3ra"].grupos).toEqual(["3ra-G1", "3ra-G2"]);
    expect(instance!.grupos["3ra-G1"]).toEqual({
      categoria: "3ra",
      parejas: ["p1", "p2"],
      tam: 3,
    });

    // personas ordenadas alfabéticamente (la DB no garantiza el orden)
    expect(instance!.parejas["p1"].personas).toEqual(["111", "222"]);
    expect(instance!.parejas["p1"].bloqueados.has(3)).toBe(true);
    expect(instance!.personas["111"].parejas).toEqual(["p1"]);

    expect(instance!.partidos["3ra-G1-1"]).toMatchObject({
      phase: "previa",
      ronda: "grupo",
      grupo: "3ra-G1",
      parejas: ["p1", "p2"],
    });
    // final: parejas desconocidas, se resuelven por gruposOrigen/alimentadores
    expect(instance!.partidos["3ra-final-1"]).toMatchObject({
      parejas: null,
      gruposOrigen: ["3ra-G1"],
      alimentadores: ["3ra-semi-1"],
    });
  });
});

// ---------------------------------------------------------------------------
// createRun / claimRun
// ---------------------------------------------------------------------------

describe("createRun", () => {
  it("encola la corrida en queued con el snapshot de params", async () => {
    dbQueue.push([runRow]);

    const result = await createRun({
      tournamentId: "t1",
      requestedBy: "coach1",
      params: { timeLimitMs: 60000 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.run.status).toBe("queued");
  });

  it("23505 del índice parcial ⇒ run_active (409), no excepción", async () => {
    const unique = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    mocked.db.insert.mockImplementationOnce(() => {
      throw unique;
    });

    const result = await createRun({
      tournamentId: "t1",
      requestedBy: "coach1",
      params: {},
    });

    expect(result).toMatchObject({ ok: false, reason: "run_active" });
  });

  it("otros errores de DB se propagan", async () => {
    mocked.db.insert.mockImplementationOnce(() => {
      throw new Error("connection lost");
    });

    await expect(
      createRun({ tournamentId: "t1", requestedBy: "coach1", params: {} }),
    ).rejects.toThrow("connection lost");
  });
});

describe("claimRun", () => {
  it("queued → running devuelve la fila reclamada", async () => {
    dbQueue.push([{ ...runRow, status: "running", startedAt: NOW }]);

    const claimed = await claimRun("r1");

    expect(claimed?.status).toBe("running");
    expect(claimed?.startedAt).toEqual(NOW);
  });

  it("idempotente: si ya no está queued devuelve null (409 not_claimed)", async () => {
    dbQueue.push([]);
    expect(await claimRun("r1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// finishRun
// ---------------------------------------------------------------------------

describe("finishRun", () => {
  const slots = [
    { matchId: "m1", blockIdx: 0, court: 1 },
    { matchId: "m2", blockIdx: 1, court: 2 },
  ];

  it("succeeded: 1 tx con estado terminal + slots + agenda_draft", async () => {
    const finished = { ...runRow, status: "succeeded", slotsCount: 2, finishedAt: NOW };
    txQueue.push([finished]); // update run
    txQueue.push([]); // insert slots (await del chain)
    txQueue.push([]); // update tournaments
    txQueue.push([]); // await update tournaments

    const result = await finishRun("r1", {
      status: "succeeded",
      engineStatus: "optimal",
      objective: 1234.5,
      timeMs: 5000,
      slots,
    });

    expect(result).toMatchObject({ ok: true, slotsCount: 2 });

    const slotInsert = txInserts.find((i) => i.table === tournamentAgendaSlots);
    expect(slotInsert?.values).toHaveLength(2);
    expect(slotInsert?.values[0]).toMatchObject({ runId: "r1", matchId: "m1", blockIdx: 0, court: 1 });

    const agendaUpdate = txUpdates.find((u) => u.table === tournaments);
    expect(agendaUpdate?.values.status).toBe("agenda_draft");

    const runUpdate = txUpdates.find((u) => u.table !== tournaments);
    // numeric de pg se escribe como string
    expect(runUpdate?.values).toMatchObject({ objective: "1234.5", slotsCount: 2 });
  });

  it("invalid conserva los slots y también pasa a agenda_draft (EC-04)", async () => {
    txQueue.push([{ ...runRow, status: "invalid", slotsCount: 2 }]);
    txQueue.push([]);
    txQueue.push([]);
    txQueue.push([]);

    const result = await finishRun("r1", { status: "invalid", slots });

    expect(result.ok).toBe(true);
    expect(txInserts.some((i) => i.table === tournamentAgendaSlots)).toBe(true);
    expect(txUpdates.some((u) => u.table === tournaments)).toBe(true);
  });

  it("infeasible: 0 slots y el torneo NO pasa a agenda_draft (EC-02)", async () => {
    txQueue.push([{ ...runRow, status: "infeasible", engineStatus: "infeasible" }]);

    const result = await finishRun("r1", {
      status: "infeasible",
      engineStatus: "infeasible",
    });

    expect(result).toMatchObject({ ok: true, slotsCount: 0 });
    expect(txInserts).toHaveLength(0);
    expect(txUpdates.some((u) => u.table === tournaments)).toBe(false);
  });

  it("failed guarda error.code y no escribe slots (EC-12)", async () => {
    txQueue.push([{ ...runRow, status: "failed", error: { code: "solver_error" } }]);

    const result = await finishRun("r1", {
      status: "failed",
      error: { code: "solver_error" },
    });

    expect(result.ok).toBe(true);
    expect(txInserts).toHaveLength(0);
    expect(txUpdates[0].values).toMatchObject({ status: "failed", error: { code: "solver_error" } });
  });

  it("not_running si el reaper ya cerró el run (nunca slots huérfanos)", async () => {
    txQueue.push([]);

    const result = await finishRun("r1", { status: "succeeded", slots });

    expect(result).toEqual({ ok: false, reason: "not_running" });
    expect(txInserts).toHaveLength(0);
  });

  it("transición ilegal se rechaza sin tocar la DB", async () => {
    const result = await finishRun("r1", { status: "queued" as any });

    expect(result).toEqual({ ok: false, reason: "invalid_transition" });
    expect(txQueue).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getRun / listRecentRuns
// ---------------------------------------------------------------------------

describe("getRun", () => {
  it("null si el run no existe", async () => {
    dbQueue.push([]);
    expect(await getRun("r1")).toBeNull();
  });

  it("normaliza numeric string → number en el DTO", () => {
    const summary = toRunSummary({
      ...runRow,
      status: "succeeded",
      objective: "987.25",
      mipGap: "0.01",
      error: { code: "solver_error", message: "boom" },
    });

    expect(summary.objective).toBe(987.25);
    expect(summary.mipGap).toBe(0.01);
    expect(summary.error).toEqual({ code: "solver_error", message: "boom" });
  });

  it("includeSlots devuelve los slots con code/category/phase/round", async () => {
    dbQueue.push([{ ...runRow, status: "succeeded", slotsCount: 1 }]);
    dbQueue.push([
      {
        matchId: "m1",
        code: "3ra-G1-1",
        categoryCode: "3ra",
        phase: "previa",
        round: "grupo",
        blockIdx: 0,
        court: 1,
      },
    ]);

    const run = await getRun("r1", { includeSlots: true });

    expect(run?.slots).toHaveLength(1);
    expect(run?.slots?.[0]).toMatchObject({ code: "3ra-G1-1", categoryCode: "3ra" });
  });

  it("ownerId ajeno ⇒ null (anti-IDOR, nunca 403)", async () => {
    dbQueue.push([runRow]); // el run existe
    dbQueue.push([]); // el torneo no es del owner

    expect(await getRun("r1", { ownerId: "otro-coach" })).toBeNull();
  });
});

describe("listRecentRuns", () => {
  it("mapea los runs al DTO de polling", async () => {
    dbQueue.push([{ ...runRow, status: "succeeded", objective: "10", slotsCount: 3 }]);

    const items = await listRecentRuns("t1");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ runId: "r1", objective: 10, slotsCount: 3 });
  });

  it("clampRunListLimit: default 20, máximo 50, mínimo 1", () => {
    expect(clampRunListLimit()).toBe(20);
    expect(clampRunListLimit(500)).toBe(50);
    expect(clampRunListLimit(0)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reaper
// ---------------------------------------------------------------------------

describe("decideReapAction", () => {
  const queued = (secondsAgo: number, attempts: number) => ({
    id: "r1",
    status: "queued" as const,
    dispatchAttempts: attempts,
    createdAt: iso(secondsAgo),
    startedAt: null,
  });

  it("queued fresco (<90s) ⇒ none", () => {
    expect(decideReapAction(queued(30, 0), NOW).action).toBe("none");
  });

  it("queued vencido con <2 intentos ⇒ redispatch", () => {
    expect(decideReapAction(queued(120, 1), NOW).action).toBe("redispatch");
  });

  it("queued con 2 intentos ⇒ dispatch_failed", () => {
    expect(decideReapAction(queued(120, 2), NOW).action).toBe("dispatch_failed");
  });

  it("queued > 300s ⇒ dispatch_failed aunque queden intentos", () => {
    expect(decideReapAction(queued(301, 0), NOW).action).toBe("dispatch_failed");
  });

  it("running colgado > maxDuration+60s ⇒ worker_crash", () => {
    const run = {
      id: "r1",
      status: "running" as const,
      dispatchAttempts: 1,
      createdAt: iso(400),
      startedAt: iso(361),
    };
    expect(decideReapAction(run, NOW).action).toBe("worker_crash");
  });

  it("running dentro del presupuesto ⇒ none", () => {
    const run = {
      id: "r1",
      status: "running" as const,
      dispatchAttempts: 1,
      createdAt: iso(120),
      startedAt: iso(100),
    };
    expect(decideReapAction(run, NOW).action).toBe("none");
  });
});

describe("reapStaleRuns", () => {
  it("sin runs activos no escribe nada", async () => {
    dbQueue.push([]);

    const result = await reapStaleRuns("t1", { now: NOW });

    expect(result).toEqual({ redispatched: [], failed: [] });
    expect(dbUpdates).toHaveLength(0);
  });

  it("queued 120s con 1 intento ⇒ re-dispatch e incrementa dispatchAttempts", async () => {
    dbQueue.push([
      { id: "r1", status: "queued", dispatchAttempts: 1, createdAt: iso(120), startedAt: null },
    ]);
    dbQueue.push([{ id: "r1" }]); // update returning

    const result = await reapStaleRuns("t1", { now: NOW });

    expect(result.redispatched).toEqual(["r1"]);
    expect(result.failed).toEqual([]);
    expect(dbUpdates[0].values).toMatchObject({ dispatchAttempts: 2 });
  });

  it("queued con 2 intentos ⇒ failed(dispatch_failed)", async () => {
    dbQueue.push([
      { id: "r1", status: "queued", dispatchAttempts: 2, createdAt: iso(120), startedAt: null },
    ]);
    dbQueue.push([{ id: "r1" }]);

    const result = await reapStaleRuns("t1", { now: NOW });

    expect(result.failed).toEqual(["r1"]);
    expect(dbUpdates[0].values).toMatchObject({
      status: "failed",
      error: { code: "dispatch_failed" },
    });
  });

  it("running colgado ⇒ failed(worker_crash)", async () => {
    dbQueue.push([
      { id: "r1", status: "running", dispatchAttempts: 1, createdAt: iso(400), startedAt: iso(400) },
    ]);
    dbQueue.push([{ id: "r1" }]);

    const result = await reapStaleRuns("t1", { now: NOW });

    expect(result.failed).toEqual(["r1"]);
    expect(dbUpdates[0].values).toMatchObject({
      status: "failed",
      error: { code: "worker_crash" },
    });
  });

  it("idempotente: si el UPDATE no afecta filas no reporta acción", async () => {
    dbQueue.push([
      { id: "r1", status: "queued", dispatchAttempts: 2, createdAt: iso(120), startedAt: null },
    ]);
    dbQueue.push([]); // el run ya fue cerrado por otra invocación

    const result = await reapStaleRuns("t1", { now: NOW });

    expect(result.redispatched).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});
