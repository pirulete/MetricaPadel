/**
 * Unit tests de checkDimensionalCoverage (R5 — cobertura dimensional).
 * Verifica el soft-block: alreadyEvaluated=false para alumno sin publicaciones
 * y true cuando la categoría de la rúbrica actual ya fue publicada.
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = (queue: any[][]) => {
    const c: any = {};
    c.then = (resolve: (v: any) => void) => resolve(queue.shift() ?? []);
    c.from = jest.fn(() => c);
    c.innerJoin = jest.fn(() => c);
    c.where = jest.fn(() => c);
    return c;
  };

  const dbQueue: any[][] = [];
  return {
    db: {
      selectDistinct: jest.fn(() => makeChain(dbQueue)),
    },
    __dbQueue: dbQueue,
  };
});

import { checkDimensionalCoverage } from "@/lib/padel/coverage";

const mocked = jest.requireMock("@/lib/db") as any;
const dbQueue = mocked.__dbQueue as any[][];

beforeEach(() => {
  jest.clearAllMocks();
  dbQueue.length = 0;
});

describe("checkDimensionalCoverage", () => {
  it("alreadyEvaluated=false para alumno sin evaluaciones publicadas", async () => {
    dbQueue.push([]);
    const result = await checkDimensionalCoverage("stu1", "tecnica_basica");
    expect(result.alreadyEvaluated).toBe(false);
    expect(result.coveredCategories).toEqual([]);
  });

  it("alreadyEvaluated=false cuando la categoría actual no está cubierta", async () => {
    dbQueue.push([{ category: "tactica" }]);
    const result = await checkDimensionalCoverage("stu1", "tecnica_basica");
    expect(result.alreadyEvaluated).toBe(false);
    expect(result.coveredCategories).toEqual(["tactica"]);
  });

  it("alreadyEvaluated=true cuando la categoría ya fue publicada", async () => {
    dbQueue.push([{ category: "tecnica_basica" }, { category: "tactica" }]);
    const result = await checkDimensionalCoverage("stu1", "tecnica_basica");
    expect(result.alreadyEvaluated).toBe(true);
    expect(result.coveredCategories).toContain("tecnica_basica");
  });
});