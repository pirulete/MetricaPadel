/**
 * Unit tests de queries de historial (padel) con db mockeado.
 * Cubre: listHistory (filtros + paginación por cursor G15).
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = (queue: any[][]) => {
    const c: any = {};
    c.then = (resolve: (v: any) => void) => resolve(queue.shift() ?? []);
    c.from = jest.fn(() => c);
    c.innerJoin = jest.fn(() => c);
    c.leftJoin = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  const dbQueue: any[][] = [];
  return {
    db: {
      select: jest.fn(() => makeChain(dbQueue)),
    },
    __dbQueue: dbQueue,
  };
});

import { db } from "@/lib/db";
import { listHistory } from "@/lib/db/queries/padel/history";

const mocked = jest.requireMock("@/lib/db") as any;
const dbQueue = mocked.__dbQueue as any[][];

const item = {
  id: "e1",
  studentName: "Ana Pérez",
  rubricTitle: "Saque",
  courseName: null,
  date: new Date("2026-09-20T10:00:00Z"),
  totalScore: 4,
  maxScore: 4,
  status: "published",
};

beforeEach(() => {
  jest.clearAllMocks();
  dbQueue.length = 0;
});

describe("listHistory", () => {
  it("lista historial del coach paginado (items + nextCursor null)", async () => {
    dbQueue.push([item]);

    const result = await listHistory("coach1");

    expect(result).toEqual({ items: [item], nextCursor: null });
    expect(db.select).toHaveBeenCalled();
  });

  it("G15: retorna nextCursor cuando hay más items (limit+1)", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      ...item,
      id: `e${i}`,
      date: new Date(`2026-09-${String(20 - i).padStart(2, "0")}T10:00:00Z`),
    }));
    dbQueue.push(rows);

    const result = await listHistory("coach1", {}, { limit: 20 });

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe(rows[19].date!.toISOString());
  });

  it("G15: sin más items retorna nextCursor null", async () => {
    dbQueue.push([item]);

    const result = await listHistory("coach1", {}, { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("G15: borradores con date null no generan cursor (quedan en página 1)", async () => {
    const draft = { ...item, id: "d1", status: "draft", date: null };
    const rows = [draft, item];
    dbQueue.push(rows);

    const result = await listHistory("coach1", {}, { limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });
});