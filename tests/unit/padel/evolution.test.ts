/**
 * Unit tests de funciones puras de evolución (lib/padel/evolution.ts).
 * @jest-environment node
 */
import { computeTrend, groupByCategory } from "@/lib/padel/evolution";

describe("computeTrend", () => {
  it("up cuando el último score supera al anterior", () => {
    expect(computeTrend([2, 3])).toBe("up");
    expect(computeTrend([1, 2, 4])).toBe("up");
  });

  it("down cuando el último score es menor al anterior", () => {
    expect(computeTrend([3, 2])).toBe("down");
    expect(computeTrend([4, 3, 1])).toBe("down");
  });

  it("stable con scores iguales", () => {
    expect(computeTrend([3, 3])).toBe("stable");
    expect(computeTrend([2, 2, 2])).toBe("stable");
  });

  it("stable con menos de 2 puntos (sin comparación)", () => {
    expect(computeTrend([])).toBe("stable");
    expect(computeTrend([4])).toBe("stable");
  });
});

describe("groupByCategory", () => {
  const base = {
    totalScore: 10,
    maxScore: 12,
    publishedAt: new Date("2026-01-01"),
  };

  it("agrupa por categoría preservando el orden de entrada", () => {
    const groups = groupByCategory([
      { ...base, category: "fisica", totalScore: 8 },
      { ...base, category: "tactica", totalScore: 9 },
      { ...base, category: "fisica", totalScore: 10 },
    ]);
    expect(Object.keys(groups)).toEqual(["fisica", "tactica"]);
    expect(groups.fisica.map((e) => e.totalScore)).toEqual([8, 10]);
    expect(groups.tactica).toHaveLength(1);
  });

  it("omite evaluaciones sin categoría", () => {
    const groups = groupByCategory([
      { ...base, category: "fisica" },
      { ...base, category: "" },
    ]);
    expect(Object.keys(groups)).toEqual(["fisica"]);
  });

  it("retorna objeto vacío sin evaluaciones", () => {
    expect(groupByCategory([])).toEqual({});
  });
});