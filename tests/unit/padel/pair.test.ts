/**
 * Unit tests de lógica pura de Evaluación en Pareja (lib/padel/pair.ts, SPEC-01).
 * @jest-environment node
 */
import {
  SHARED_CATEGORIES,
  INDIVIDUAL_CATEGORIES,
  isSharedCategory,
  applySharedSelection,
  syncPairScores,
  computePairTotals,
  validatePairPublish,
  computePairAuditCounts,
  buildPairAuditPayload,
} from "@/lib/padel/pair";

const C1 = "00000000-0000-0000-0000-000000000001";
const C2 = "00000000-0000-0000-0000-000000000002";
const L1 = "00000000-0000-0000-0000-000000000011";
const L2 = "00000000-0000-0000-0000-000000000012";
const L3 = "00000000-0000-0000-0000-000000000013";

describe("categorías compartidas/individuales", () => {
  it("expone 3 categorías compartidas y 3 individuales", () => {
    expect(SHARED_CATEGORIES).toEqual(["tactica", "actitud_equipo", "reglas"]);
    expect(INDIVIDUAL_CATEGORIES).toEqual(["tecnica_basica", "tecnica_especifica", "fisica"]);
  });

  it("isSharedCategory true para compartidas", () => {
    expect(isSharedCategory("tactica")).toBe(true);
    expect(isSharedCategory("reglas")).toBe(true);
    expect(isSharedCategory("actitud_equipo")).toBe(true);
  });

  it("isSharedCategory false para individuales y desconocidas", () => {
    expect(isSharedCategory("tecnica_basica")).toBe(false);
    expect(isSharedCategory("fisica")).toBe(false);
    expect(isSharedCategory("otra")).toBe(false);
  });
});

describe("applySharedSelection", () => {
  it("sincroniza nivel en ambos alumnos (upsert)", () => {
    const { scoresA, scoresB } = applySharedSelection([], [], C1, L2);
    expect(scoresA).toEqual([{ criteriaId: C1, levelId: L2 }]);
    expect(scoresB).toEqual([{ criteriaId: C1, levelId: L2 }]);
  });

  it("actualiza nivel existente en ambos sin duplicar", () => {
    const { scoresA, scoresB } = applySharedSelection(
      [{ criteriaId: C1, levelId: L1 }],
      [{ criteriaId: C1, levelId: L1 }],
      C1,
      L3
    );
    expect(scoresA).toEqual([{ criteriaId: C1, levelId: L3 }]);
    expect(scoresB).toEqual([{ criteriaId: C1, levelId: L3 }]);
  });

  it("no muta los arrays originales", () => {
    const a = [{ criteriaId: C1, levelId: L1 }];
    const b = [{ criteriaId: C1, levelId: L1 }];
    applySharedSelection(a, b, C1, L2);
    expect(a[0].levelId).toBe(L1);
    expect(b[0].levelId).toBe(L1);
  });
});

describe("syncPairScores", () => {
  it("copia A → B en criterios compartidos", () => {
    const { scoresA, scoresB } = syncPairScores(
      [{ criteriaId: C1, levelId: L2 }],
      [{ criteriaId: C1, levelId: L1 }],
      [C1]
    );
    expect(scoresB[0].levelId).toBe(L2);
    expect(scoresA[0].levelId).toBe(L2);
  });

  it("copia B → A si A no tiene el criterio", () => {
    const { scoresA, scoresB } = syncPairScores(
      [],
      [{ criteriaId: C1, levelId: L3 }],
      [C1]
    );
    expect(scoresA).toEqual([{ criteriaId: C1, levelId: L3 }]);
    expect(scoresB[0].levelId).toBe(L3);
  });

  it("no toca criterios no compartidos", () => {
    const { scoresA, scoresB } = syncPairScores(
      [{ criteriaId: C1, levelId: L1 }],
      [{ criteriaId: C1, levelId: L2 }],
      []
    );
    expect(scoresA[0].levelId).toBe(L1);
    expect(scoresB[0].levelId).toBe(L2);
  });
});

describe("computePairTotals", () => {
  const levelScoreById = new Map([
    [L1, 4],
    [L2, 3],
    [L3, 1],
  ]);

  it("suma scores por alumno y maxScore = criterios × nivel máximo", () => {
    const { totalA, totalB, maxScore } = computePairTotals(
      [
        { criteriaId: C1, levelId: L1 },
        { criteriaId: C2, levelId: L2 },
      ],
      [
        { criteriaId: C1, levelId: L2 },
        { criteriaId: C2, levelId: L1 },
      ],
      levelScoreById
    );
    expect(totalA).toBe(7);
    expect(totalB).toBe(7);
    expect(maxScore).toBe(8); // 2 criterios × 4
  });

  it("maxScore usa la unión de criterios de ambos alumnos", () => {
    const { maxScore } = computePairTotals(
      [{ criteriaId: C1, levelId: L1 }],
      [
        { criteriaId: C1, levelId: L1 },
        { criteriaId: C2, levelId: L2 },
      ],
      levelScoreById
    );
    expect(maxScore).toBe(8);
  });

  it("levelId desconocido suma 0", () => {
    const { totalA } = computePairTotals(
      [{ criteriaId: C1, levelId: "00000000-0000-0000-0000-000000000099" }],
      [],
      levelScoreById
    );
    expect(totalA).toBe(0);
  });
});

describe("validatePairPublish", () => {
  it("válido cuando ambos cubren todos los criterios", () => {
    const result = validatePairPublish(
      [{ criteriaId: C1 }, { criteriaId: C2 }],
      [{ criteriaId: C1 }, { criteriaId: C2 }],
      2
    );
    expect(result.valid).toBe(true);
    expect(result.missingA).toBe(0);
    expect(result.missingB).toBe(0);
  });

  it("inválido si a A le falta un criterio", () => {
    const result = validatePairPublish(
      [{ criteriaId: C1 }],
      [{ criteriaId: C1 }, { criteriaId: C2 }],
      2
    );
    expect(result.valid).toBe(false);
    expect(result.missingA).toBe(1);
    expect(result.missingB).toBe(0);
  });

  it("inválido si a B le falta un criterio", () => {
    const result = validatePairPublish(
      [{ criteriaId: C1 }, { criteriaId: C2 }],
      [{ criteriaId: C1 }],
      2
    );
    expect(result.valid).toBe(false);
    expect(result.missingA).toBe(0);
    expect(result.missingB).toBe(1);
  });

  it("inválido con criteriaCount 0", () => {
    const result = validatePairPublish([], [], 0);
    expect(result.valid).toBe(false);
  });
});

describe("computePairAuditCounts", () => {
  it("cuenta shared cuando ambos tienen el mismo levelId", () => {
    const { shared, individual } = computePairAuditCounts(
      [
        { criteriaId: C1, levelId: L1 },
        { criteriaId: C2, levelId: L2 },
      ],
      [
        { criteriaId: C1, levelId: L1 },
        { criteriaId: C2, levelId: L3 },
      ]
    );
    expect(shared).toBe(1);
    expect(individual).toBe(1);
  });

  it("criterio solo en un alumno cuenta como individual", () => {
    const { shared, individual } = computePairAuditCounts(
      [{ criteriaId: C1, levelId: L1 }],
      []
    );
    expect(shared).toBe(0);
    expect(individual).toBe(1);
  });
});

describe("buildPairAuditPayload", () => {
  it("construye payload con conteos derivados y durationSeconds default 0", () => {
    const payload = buildPairAuditPayload({
      coachId: "coach-1",
      courseId: "course-1",
      studentAId: "student-a",
      studentBId: "student-b",
      scoresA: [{ criteriaId: C1, levelId: L1 }],
      scoresB: [{ criteriaId: C1, levelId: L1 }],
    });
    expect(payload).toEqual({
      coach_id: "coach-1",
      course_id: "course-1",
      student_a_id: "student-a",
      student_b_id: "student-b",
      shared_criteria_count: 1,
      individual_criteria_count: 0,
      duration_seconds: 0,
    });
  });

  it("respeta durationSeconds explícito", () => {
    const payload = buildPairAuditPayload({
      coachId: "coach-1",
      courseId: "course-1",
      studentAId: "student-a",
      studentBId: "student-b",
      scoresA: [],
      scoresB: [],
      durationSeconds: 42,
    });
    expect(payload.duration_seconds).toBe(42);
  });
});