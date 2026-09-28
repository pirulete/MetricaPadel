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
import { getCoverageSummary, RUBRIC_CATEGORIES } from "@/lib/padel/coverage-summary";

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

describe("getCoverageSummary", () => {
  const all = [...RUBRIC_CATEGORIES];

  it("0/6 cuando ninguna categoría está cubierta", () => {
    const s = getCoverageSummary([], all);
    expect(s.covered).toBe(0);
    expect(s.total).toBe(6);
    expect(s.percentage).toBe(0);
    expect(s.uncovered).toEqual(all);
  });

  it("3/6 → 50% con las 3 faltantes listadas", () => {
    const s = getCoverageSummary(
      [{ category: "reglas" }, { category: "tactica" }, { category: "fisica" }],
      all
    );
    expect(s.covered).toBe(3);
    expect(s.total).toBe(6);
    expect(s.percentage).toBe(50);
    expect(s.uncovered).toEqual(["tecnica_basica", "tecnica_especifica", "actitud_equipo"]);
  });

  it("6/6 → 100% sin faltantes", () => {
    const s = getCoverageSummary(all.map((c) => ({ category: c })), all);
    expect(s.covered).toBe(6);
    expect(s.percentage).toBe(100);
    expect(s.uncovered).toEqual([]);
  });

  it("deduplica categorías repetidas", () => {
    const s = getCoverageSummary(
      [{ category: "tactica" }, { category: "tactica" }, { category: "reglas" }],
      all
    );
    expect(s.covered).toBe(2);
    expect(s.percentage).toBe(33);
  });

  it("allCategories vacío → percentage 0 (sin NaN)", () => {
    const s = getCoverageSummary([{ category: "tactica" }], []);
    expect(s.covered).toBe(1);
    expect(s.total).toBe(0);
    expect(s.percentage).toBe(0);
    expect(s.uncovered).toEqual([]);
  });
});