/**
 * Unit tests de queries de cursos (padel) con db mockeado.
 * Cubre: listCourses (paginación por cursor G15) y listCoursesForDashboard
 * (array completo sin paginar para el dashboard P01).
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
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  const dbQueue: any[][] = [];
  return {
    db: {
      select: jest.fn(() => makeChain(dbQueue)),
      insert: jest.fn(() => makeChain(dbQueue)),
      update: jest.fn(() => makeChain(dbQueue)),
    },
    __dbQueue: dbQueue,
  };
});

import { db } from "@/lib/db";
import { listCourses, listCoursesForDashboard } from "@/lib/db/queries/padel/courses";

const mocked = jest.requireMock("@/lib/db") as any;
const dbQueue = mocked.__dbQueue as any[][];

const course = {
  id: "c1",
  name: "Pádel iniciación",
  level: "iniciacion",
  schedule: "18:00",
  days: ["Lun"],
  inviteCode: "PAD-AB12",
  status: "active",
  createdAt: new Date("2026-09-20T10:00:00Z"),
  studentCount: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  dbQueue.length = 0;
});

describe("listCourses", () => {
  it("lista cursos del coach paginados (items + nextCursor null)", async () => {
    dbQueue.push([course]);

    const result = await listCourses("coach1");

    expect(result).toEqual({ items: [course], nextCursor: null });
    expect(db.select).toHaveBeenCalled();
  });

  it("G15: retorna nextCursor cuando hay más items (limit+1)", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      ...course,
      id: `c${i}`,
      createdAt: new Date(`2026-09-${String(20 - i).padStart(2, "0")}T10:00:00Z`),
    }));
    dbQueue.push(rows);

    const result = await listCourses("coach1", { limit: 20 });

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe(rows[19].createdAt.toISOString());
  });

  it("G15: sin más items retorna nextCursor null", async () => {
    dbQueue.push([course]);

    const result = await listCourses("coach1", { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });
});

describe("listCoursesForDashboard", () => {
  it("retorna array completo sin paginar (dashboard P01)", async () => {
    const rows = [course, { ...course, id: "c2", name: "Pádel avanzado" }];
    dbQueue.push(rows);

    const result = await listCoursesForDashboard("coach1");

    expect(result).toEqual(rows);
    expect(result).toHaveLength(2);
    expect(db.select).toHaveBeenCalled();
  });
});