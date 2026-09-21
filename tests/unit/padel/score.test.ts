/**
 * Unit tests de funciones puras de score (lib/padel/score.ts).
 * @jest-environment node
 */
import {
  computeMaxScore,
  computeTotalScore,
  validatePublish,
} from "@/lib/padel/score";

describe("computeMaxScore", () => {
  it("calcula criterios × 4 (nivel máximo)", () => {
    expect(computeMaxScore(3)).toBe(12);
    expect(computeMaxScore(1)).toBe(4);
    expect(computeMaxScore(0)).toBe(0);
  });
});

describe("computeTotalScore", () => {
  it("suma scores seleccionados", () => {
    expect(computeTotalScore([{ score: 4 }, { score: 3 }, { score: 2 }])).toBe(9);
  });

  it("retorna 0 sin scores", () => {
    expect(computeTotalScore([])).toBe(0);
  });
});

describe("validatePublish", () => {
  it("true cuando todos los criterios tienen score", () => {
    const scores = [
      { criteriaId: "c1" },
      { criteriaId: "c2" },
      { criteriaId: "c3" },
    ];
    expect(validatePublish(scores, 3)).toBe(true);
  });

  it("false cuando falta un criterio", () => {
    const scores = [{ criteriaId: "c1" }, { criteriaId: "c2" }];
    expect(validatePublish(scores, 3)).toBe(false);
  });

  it("false con criteriaCount 0", () => {
    expect(validatePublish([], 0)).toBe(false);
  });

  it("false con scores vacíos", () => {
    expect(validatePublish([], 2)).toBe(false);
  });
});