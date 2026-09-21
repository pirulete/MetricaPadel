/**
 * Unit tests de queries de rúbricas (padel) con db mockeado.
 * Cubre: createRubric (transacción levels+criteria+descriptors), getRubricById
 * (ownership), listRubrics (counts + status), updateRubric (reemplazo criteria),
 * archiveRubric (soft). Ownership ajeno → null (404).
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = (queue: any[][]) => {
    const c: any = {};
    c.then = (resolve: (v: any) => void) => resolve(queue.shift() ?? []);
    c.from = jest.fn(() => c);
    c.leftJoin = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.groupBy = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.values = jest.fn(() => c);
    c.set = jest.fn(() => c);
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  const txQueue: any[][] = [];
  const tx = {
    insert: jest.fn(() => makeChain(txQueue)),
    update: jest.fn(() => makeChain(txQueue)),
    delete: jest.fn(() => makeChain(txQueue)),
    select: jest.fn(() => makeChain(txQueue)),
  };

  const dbQueue: any[][] = [];
  return {
    db: {
      transaction: jest.fn(async (cb: any) => cb(tx)),
      query: {
        rubrics: { findFirst: jest.fn() },
        rubricCriteria: { findMany: jest.fn() },
        rubricLevels: { findMany: jest.fn() },
        rubricDescriptors: { findMany: jest.fn() },
      },
      select: jest.fn(() => makeChain(dbQueue)),
      update: jest.fn(() => makeChain(dbQueue)),
    },
    __txQueue: txQueue,
    __dbQueue: dbQueue,
  };
});

import { db } from "@/lib/db";
import {
  createRubric,
  getRubricById,
  listRubrics,
  updateRubric,
  archiveRubric,
  DEFAULT_RUBRIC_LEVELS,
} from "@/lib/db/queries/padel/rubrics";

const mocked = jest.requireMock("@/lib/db") as any;
const txQueue = mocked.__txQueue as any[][];
const dbQueue = mocked.__dbQueue as any[][];

const rubric = {
  id: "r1",
  ownerId: "coach1",
  title: "Saque",
  category: "tecnica",
  status: "draft",
  createdAt: new Date("2026-09-20T10:00:00Z"),
  updatedAt: new Date("2026-09-20T10:00:00Z"),
};

const levels = DEFAULT_RUBRIC_LEVELS.map((l, i) => ({
  id: `lv${i}`,
  rubricId: "r1",
  name: l.name,
  score: l.score,
  sortOrder: l.sortOrder,
}));

const criterion = { id: "c1", rubricId: "r1", name: "Precisión", sortOrder: 0 };
const descriptors = levels.map((l, i) => ({
  id: `d${i}`,
  criteriaId: "c1",
  levelId: l.id,
  text: `desc ${i}`,
}));

beforeEach(() => {
  jest.clearAllMocks();
  txQueue.length = 0;
  dbQueue.length = 0;
});

describe("createRubric", () => {
  it("crea rúbrica + 4 niveles fijos + criteria + descriptors en transacción", async () => {
    txQueue.push([rubric], levels, [criterion], [descriptors[0]], [descriptors[1]], [descriptors[2]], [descriptors[3]]);

    const result = await createRubric({
      ownerId: "coach1",
      title: "Saque",
      category: "tecnica",
      criteria: [{ name: "Precisión", descriptors: ["desc 0", "desc 1", "desc 2", "desc 3"] }],
    });

    expect(db.transaction).toHaveBeenCalled();
    expect(result.rubric).toEqual(rubric);
    expect(result.levels).toHaveLength(4);
    expect(result.levels.map((l) => l.score)).toEqual([4, 3, 2, 1]);
    expect(result.criteria).toHaveLength(1);
    expect(result.descriptors).toHaveLength(4);
  });

  it("crea 8 descriptores con 2 criterios", async () => {
    txQueue.push(
      [rubric], levels,
      [{ ...criterion, id: "c1" }], [descriptors[0]], [descriptors[1]], [descriptors[2]], [descriptors[3]],
      [{ ...criterion, id: "c2" }], [descriptors[0]], [descriptors[1]], [descriptors[2]], [descriptors[3]],
    );

    const result = await createRubric({
      ownerId: "coach1",
      title: "Saque",
      category: "tecnica",
      criteria: [
        { name: "Precisión", descriptors: ["a", "b", "c", "d"] },
        { name: "Potencia", descriptors: ["e", "f", "g", "h"] },
      ],
    });

    expect(result.criteria).toHaveLength(2);
    expect(result.descriptors).toHaveLength(8);
  });
});

describe("getRubricById", () => {
  it("retorna null si la rúbrica no pertenece al owner (anti-IDOR)", async () => {
    (db.query.rubrics.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await getRubricById("coach1", "r1")).toBeNull();
  });

  it("retorna detalle completo (rubric + levels + criteria + descriptors)", async () => {
    (db.query.rubrics.findFirst as jest.Mock).mockResolvedValue(rubric);
    (db.query.rubricCriteria.findMany as jest.Mock).mockResolvedValue([criterion]);
    (db.query.rubricLevels.findMany as jest.Mock).mockResolvedValue(levels);
    (db.query.rubricDescriptors.findMany as jest.Mock).mockResolvedValue(descriptors);

    const result = await getRubricById("coach1", "r1");

    expect(result?.rubric).toEqual(rubric);
    expect(result?.levels).toHaveLength(4);
    expect(result?.criteria).toHaveLength(1);
    expect(result?.descriptors).toHaveLength(4);
  });
});

describe("listRubrics", () => {
  it("lista con counts de criteria/levels", async () => {
    const rows = [{ ...rubric, criteriaCount: 1, levelCount: 4 }];
    dbQueue.push(rows);

    const result = await listRubrics("coach1");

    expect(result).toEqual(rows);
    expect(db.select).toHaveBeenCalled();
  });

  it("filtra por status cuando se pasa", async () => {
    dbQueue.push([]);
    await listRubrics("coach1", "archived");
    expect(db.select).toHaveBeenCalled();
  });
});

describe("updateRubric", () => {
  it("retorna null si la rúbrica no pertenece al owner", async () => {
    txQueue.push([]); // select limit(1) → vacío
    expect(await updateRubric("coach1", "r1", { title: "Nuevo" })).toBeNull();
  });

  it("actualiza title/category y reemplaza criteria/descriptors", async () => {
    txQueue.push(
      [{ id: "r1" }], // select limit(1) → existe
      [{ ...rubric, title: "Nuevo", updatedAt: new Date() }], // update returning
      [], // delete criteria (cascade descriptors)
      levels, // select levels para reinsert
      [criterion], [descriptors[0]], [descriptors[1]], [descriptors[2]], [descriptors[3]],
    );

    const result = await updateRubric("coach1", "r1", {
      title: "Nuevo",
      criteria: [{ name: "Precisión", descriptors: ["a", "b", "c", "d"] }],
    });

    expect(result?.title).toBe("Nuevo");
  });
});

describe("archiveRubric", () => {
  it("archiva (soft) la rúbrica del owner", async () => {
    dbQueue.push([{ ...rubric, status: "archived" }]);
    const result = await archiveRubric("coach1", "r1");
    expect(result?.status).toBe("archived");
  });

  it("retorna null si no pertenece al owner", async () => {
    dbQueue.push([]);
    expect(await archiveRubric("coach1", "r1")).toBeNull();
  });
});