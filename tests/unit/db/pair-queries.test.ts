/**
 * Unit tests de queries transaccionales de evaluación en pareja (SPEC-01 2v2).
 * Cubre: createPairDrafts (2 drafts, rollback si 2º insert falla, 404 si
 * alumno no inscrito), savePairEvaluationScores (happy-path, 404/403/not_draft),
 * publishPairEvaluation (2 published con versiones por alumno, 400 si faltan
 * criterios, rollback si falla un update, auditoría PAIR_EVALUATION_PUBLISHED
 * dentro de la transacción).
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

  const txQueue: any[][] = [];
  const dbQueue: any[][] = [];
  const txInserts: Array<{ table: any; values: any }> = [];

  const tx = {
    insert: jest.fn((table: any) => {
      const c = makeChain(txQueue);
      c.values = jest.fn((values: any) => {
        txInserts.push({ table, values });
        return c;
      });
      return c;
    }),
    update: jest.fn(() => makeChain(txQueue)),
    delete: jest.fn(() => makeChain(txQueue)),
    select: jest.fn(() => makeChain(txQueue)),
  };

  return {
    db: {
      transaction: jest.fn(async (cb: any) => cb(tx)),
      select: jest.fn(() => makeChain(dbQueue)),
      insert: jest.fn(() => makeChain(dbQueue)),
      update: jest.fn(() => makeChain(dbQueue)),
    },
    __txQueue: txQueue,
    __dbQueue: dbQueue,
    __txInserts: txInserts,
  };
});

jest.mock("@/lib/audit/helpers", () => ({
  auditCreate: jest.fn(async () => {}),
}));

import { auditLogs } from "@/lib/db/schema";
import {
  createPairDrafts,
  savePairEvaluationScores,
  publishPairEvaluation,
} from "@/lib/db/queries/padel/pair";
import { auditCreate } from "@/lib/audit/helpers";

const mocked = jest.requireMock("@/lib/db") as any;
const txQueue = mocked.__txQueue as any[];
const dbQueue = mocked.__dbQueue as any[];
const txInserts = mocked.__txInserts as Array<{ table: any; values: any }>;

const draftA = {
  id: "ea1",
  studentId: "stuA",
  teacherId: "coach1",
  rubricId: "r1",
  courseId: "c1",
  status: "draft",
  version: null,
  totalScore: null,
  maxScore: null,
  globalComment: null,
  publishedAt: null,
  readAt: null,
  deletedAt: null,
  createdAt: new Date("2026-09-28T10:00:00Z"),
  updatedAt: new Date("2026-09-28T10:00:00Z"),
};

const draftB = { ...draftA, id: "eb1", studentId: "stuB" };

const publishedA = {
  ...draftA,
  status: "published",
  version: 1,
  maxScore: 8,
  totalScore: 7,
  publishedAt: new Date(),
  updatedAt: new Date(),
};
const publishedB = {
  ...draftB,
  status: "published",
  version: 3,
  maxScore: 8,
  totalScore: 6,
  publishedAt: new Date(),
  updatedAt: new Date(),
};

const enrollment = { id: "en1", courseId: "c1", studentId: "stuA", joinedAt: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  txQueue.length = 0;
  dbQueue.length = 0;
  txInserts.length = 0;
});

describe("createPairDrafts", () => {
  it("crea 2 borradores draft con version null y audita CREATE por cada uno", async () => {
    dbQueue.push([enrollment], [enrollment]);
    txQueue.push([draftA], [draftB]);

    const result = await createPairDrafts({
      studentAId: "stuA",
      studentBId: "stuB",
      teacherId: "coach1",
      rubricId: "r1",
      courseId: "c1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evaluationA.id).toBe("ea1");
      expect(result.evaluationB.id).toBe("eb1");
      expect(result.evaluationA.status).toBe("draft");
      expect(result.evaluationA.version).toBeNull();
    }
    expect(auditCreate).toHaveBeenCalledTimes(2);
  });

  it("rollback si falla el 2º insert (la transacción rechaza)", async () => {
    dbQueue.push([enrollment], [enrollment]);
    txQueue.push([draftA], Promise.reject(new Error("insert failed")));

    await expect(createPairDrafts({
      studentAId: "stuA",
      studentBId: "stuB",
      teacherId: "coach1",
      rubricId: "r1",
      courseId: "c1",
    })).rejects.toThrow("insert failed");
  });

  it("retorna student_not_enrolled si un alumno no está inscrito (CA-07)", async () => {
    dbQueue.push([]); // enrollment A vacío

    const result = await createPairDrafts({
      studentAId: "stuA",
      studentBId: "stuB",
      teacherId: "coach1",
      rubricId: "r1",
      courseId: "c1",
    });

    expect(result).toEqual({ ok: false, reason: "student_not_enrolled" });
  });
});

describe("savePairEvaluationScores", () => {
  it("guarda scores de ambos borradores en una transacción (RF-06)", async () => {
    txQueue.push(
      [draftA], // validación A
      [draftB], // validación B
      [draftA], // helper A: select
      [{ id: "lv1", score: 3 }], // helper A: levels
      [], // helper A: delete
      [], // helper A: insert
      [{ ...draftA, totalScore: 3, updatedAt: new Date() }], // helper A: update
      [draftB], // helper B: select
      [{ id: "lv1", score: 3 }], // helper B: levels
      [], // helper B: delete
      [], // helper B: insert
      [{ ...draftB, totalScore: 3, updatedAt: new Date() }], // helper B: update
    );

    const result = await savePairEvaluationScores("coach1", {
      evaluationAId: "ea1",
      evaluationBId: "eb1",
      scoresA: [{ criteriaId: "c1", levelId: "lv1" }],
      scoresB: [{ criteriaId: "c1", levelId: "lv1" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evaluationA.totalScore).toBe(3);
      expect(result.evaluationB.totalScore).toBe(3);
    }
  });

  it("retorna not_found si el borrador A no existe", async () => {
    txQueue.push([]); // validación A → vacío

    const result = await savePairEvaluationScores("coach1", {
      evaluationAId: "ea1",
      evaluationBId: "eb1",
      scoresA: [],
      scoresB: [],
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("retorna not_owner si el borrador no es del teacher (403)", async () => {
    txQueue.push([{ ...draftA, teacherId: "other-coach" }]);

    const result = await savePairEvaluationScores("coach1", {
      evaluationAId: "ea1",
      evaluationBId: "eb1",
      scoresA: [],
      scoresB: [],
    });

    expect(result).toEqual({ ok: false, reason: "not_owner" });
  });

  it("retorna not_draft si un borrador ya está publicado", async () => {
    txQueue.push([{ ...draftA, status: "published" }]);

    const result = await savePairEvaluationScores("coach1", {
      evaluationAId: "ea1",
      evaluationBId: "eb1",
      scoresA: [],
      scoresB: [],
    });

    expect(result).toEqual({ ok: false, reason: "not_draft" });
  });
});

describe("publishPairEvaluation", () => {
  it("publica ambos con versión por alumno y audita PAIR_EVALUATION_PUBLISHED en la tx", async () => {
    dbQueue.push([enrollment], [enrollment]);
    txQueue.push(
      [draftA], // select A
      [draftB], // select B
      [{ id: "c1" }, { id: "c2" }], // countMissing A: criteria
      [{ criteriaId: "c1" }, { criteriaId: "c2" }], // countMissing A: scores
      [{ id: "c1" }, { id: "c2" }], // countMissing B: criteria
      [{ criteriaId: "c1" }, { criteriaId: "c2" }], // countMissing B: scores
      [{ maxVersion: 0 }], // versión A → 1
      [{ maxVersion: 2 }], // versión B → 3
      [{ count: 2 }], // maxScore A
      [{ count: 2 }], // maxScore B
      [
        { evaluationId: "ea1", criteriaId: "c1", levelId: "lv1", score: 3, comment: null },
        { evaluationId: "ea1", criteriaId: "c2", levelId: "lv2", score: 4, comment: null },
        { evaluationId: "eb1", criteriaId: "c1", levelId: "lv1", score: 3, comment: null },
        { evaluationId: "eb1", criteriaId: "c2", levelId: "lv3", score: 2, comment: null },
      ], // pairScores (c1 compartido, c2 individual)
      [publishedA], // update A
      [publishedB], // update B
      [], // audit insert
    );

    const result = await publishPairEvaluation(
      "coach1",
      { evaluationAId: "ea1", evaluationBId: "eb1", durationSeconds: 120 },
      { userId: "coach1", ipAddress: "127.0.0.1" }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evaluationA.status).toBe("published");
      expect(result.evaluationA.version).toBe(1);
      expect(result.evaluationB.version).toBe(3);
    }

    // D5: auditoría insertada dentro de la transacción con payload completo
    const auditInsert = txInserts.find((i) => i.table === auditLogs);
    expect(auditInsert).toBeDefined();
    expect(auditInsert!.values.actionType).toBe("PAIR_EVALUATION_PUBLISHED");
    expect(auditInsert!.values.newValues).toMatchObject({
      coach_id: "coach1",
      course_id: "c1",
      student_a_id: "stuA",
      student_b_id: "stuB",
      shared_criteria_count: 1,
      individual_criteria_count: 1,
      duration_seconds: 120,
    });
  });

  it("retorna incomplete si faltan criterios en un alumno (400)", async () => {
    dbQueue.push([enrollment], [enrollment]);
    txQueue.push(
      [draftA], // select A
      [draftB], // select B
      [{ id: "c1" }, { id: "c2" }], // countMissing A: criteria
      [{ criteriaId: "c1" }], // countMissing A: scores (falta c2 → 1)
    );

    const result = await publishPairEvaluation("coach1", {
      evaluationAId: "ea1",
      evaluationBId: "eb1",
    });

    expect(result).toEqual({
      ok: false,
      reason: "incomplete",
      missingCriteria: { evaluationA: 1, evaluationB: 0 },
    });
  });

  it("rollback si falla el 1er update", async () => {
    dbQueue.push([enrollment], [enrollment]);
    txQueue.push(
      [draftA], // select A
      [draftB], // select B
      [{ id: "c1" }, { id: "c2" }], // countMissing A: criteria
      [{ criteriaId: "c1" }, { criteriaId: "c2" }], // countMissing A: scores
      [{ id: "c1" }, { id: "c2" }], // countMissing B: criteria
      [{ criteriaId: "c1" }, { criteriaId: "c2" }], // countMissing B: scores
      [{ maxVersion: 0 }], // versión A
      [{ maxVersion: 0 }], // versión B
      [{ count: 2 }], // maxScore A
      [{ count: 2 }], // maxScore B
      [{ evaluationId: "ea1", criteriaId: "c1", levelId: "lv1", score: 3, comment: null }], // pairScores
      Promise.reject(new Error("update failed")), // update A → rechaza
    );

    await expect(publishPairEvaluation("coach1", {
      evaluationAId: "ea1",
      evaluationBId: "eb1",
    })).rejects.toThrow("update failed");
  });

  it("retorna not_found si un borrador no existe o no es del teacher", async () => {
    txQueue.push([]); // select A → vacío

    const result = await publishPairEvaluation("coach1", {
      evaluationAId: "ea1",
      evaluationBId: "eb1",
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("retorna student_not_enrolled si un alumno ya no está inscrito (defensa en profundidad)", async () => {
    dbQueue.push([enrollment], []); // enrollment B vacío
    txQueue.push([draftA], [draftB]);

    const result = await publishPairEvaluation("coach1", {
      evaluationAId: "ea1",
      evaluationBId: "eb1",
    });

    expect(result).toEqual({ ok: false, reason: "student_not_enrolled" });
  });
});