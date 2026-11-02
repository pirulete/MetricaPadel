/**
 * Unit tests de queries de transiciones del coach (db mockeado).
 * Cubre: listTransitions (paginación por cursor G15 sobre `updatedAt`),
 * getTransitionById (anti-IDOR + safeParse del scenario guardado, F10),
 * createTransition, updateTransition y deleteTransition (ownership vía returning).
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = (queue: any[][]) => {
    const c: any = {};
    c.then = (resolve: (v: any) => void) => resolve(queue.shift() ?? []);
    c.from = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.set = jest.fn(() => c);
    c.values = jest.fn(() => c);
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  const dbQueue: any[][] = [];
  return {
    db: {
      select: jest.fn(() => makeChain(dbQueue)),
      insert: jest.fn(() => makeChain(dbQueue)),
      update: jest.fn(() => makeChain(dbQueue)),
      delete: jest.fn(() => makeChain(dbQueue)),
    },
    __dbQueue: dbQueue,
  };
});

import {
  createTransition,
  deleteTransition,
  getTransitionById,
  listTransitions,
  updateTransition,
} from "@/lib/db/queries/padel/transitions";

const mocked = jest.requireMock("@/lib/db") as any;
const dbQueue = mocked.__dbQueue as any[][];

const steps = [
  {
    id: 1,
    label: "Salida",
    positions: { A: { x: 2, y: 15 }, B: { x: 8, y: 15 }, C: { x: 2, y: 5 }, D: { x: 8, y: 5 } },
    shot: null,
  },
];

const scenario = { initialStepIndex: 0, steps };

const row = {
  id: "t1",
  ownerId: "coach1",
  title: "Contra pared",
  scenario,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  updatedAt: new Date("2026-11-02T10:00:00Z"),
};

const summary = {
  id: "t1",
  title: "Contra pared",
  stepCount: 1,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
};

beforeEach(() => {
  jest.clearAllMocks();
  dbQueue.length = 0;
});

describe("listTransitions", () => {
  it("lista con cursor: limit+1 detecta hasMore y devuelve nextCursor ISO", async () => {
    dbQueue.push([summary, { ...summary, id: "t0", updatedAt: new Date("2026-10-30T10:00:00Z") }]);

    const result = await listTransitions("coach1", { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].stepCount).toBe(1);
    expect(result.nextCursor).toBe("2026-11-02T10:00:00.000Z");
  });

  it("sin cursor: página única y nextCursor null", async () => {
    dbQueue.push([summary]);

    const result = await listTransitions("coach1");

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });
});

describe("getTransitionById", () => {
  it("devuelve el DTO desnormalizado cuando la fila es del owner", async () => {
    dbQueue.push([row]);

    const dto = await getTransitionById("coach1", "t1");

    expect(dto).toEqual({
      id: "t1",
      title: "Contra pared",
      initialStepIndex: 0,
      steps,
      createdAt: "2026-11-01T10:00:00.000Z",
      updatedAt: "2026-11-02T10:00:00.000Z",
    });
  });

  it("fila ajena o inexistente → null (anti-IDOR)", async () => {
    dbQueue.push([]);

    expect(await getTransitionById("coach2", "t1")).toBeNull();
  });

  it("scenario corrupto en DB → null en vez de excepción (F10)", async () => {
    dbQueue.push([{ ...row, scenario: { steps: "no-es-un-array" } }]);

    expect(await getTransitionById("coach1", "t1")).toBeNull();
  });
});

describe("createTransition", () => {
  it("inserta y devuelve el DTO con steps intactos", async () => {
    dbQueue.push([row]);

    const dto = await createTransition({
      ownerId: "coach1",
      title: "Contra pared",
      initialStepIndex: 0,
      steps,
    });

    expect(dto.id).toBe("t1");
    expect(dto.steps).toEqual(steps);
  });
});

describe("updateTransition", () => {
  it("actualiza por (id, ownerId) y devuelve el DTO", async () => {
    dbQueue.push([{ ...row, title: "Contra pared v2" }]);

    const dto = await updateTransition("coach1", "t1", {
      title: "Contra pared v2",
      initialStepIndex: 0,
      steps,
    });

    expect(dto?.title).toBe("Contra pared v2");
  });

  it("returning vacío (ajena/inexistente) → null", async () => {
    dbQueue.push([]);

    const dto = await updateTransition("coach2", "t1", {
      title: "x",
      initialStepIndex: 0,
      steps,
    });

    expect(dto).toBeNull();
  });
});

describe("deleteTransition", () => {
  it("borra por (id, ownerId) y devuelve la fila para auditoría", async () => {
    dbQueue.push([row]);

    const deleted = await deleteTransition("coach1", "t1");

    expect(deleted?.id).toBe("t1");
    expect(deleted?.title).toBe("Contra pared");
  });

  it("si no es del owner no borra nada → null", async () => {
    dbQueue.push([]);

    expect(await deleteTransition("coach2", "t1")).toBeNull();
  });
});
