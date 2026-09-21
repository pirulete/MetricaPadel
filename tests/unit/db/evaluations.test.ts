/**
 * Unit tests de queries de evaluaciones (padel) con db mockeado.
 * Cubre: createEvaluation (borrador), getEvaluationById / getStudentEvaluationById
 * (ownership + solo published), listEvaluations / listStudentEvaluations,
 * saveEvaluationScores (recalcula totalScore, solo draft), publishEvaluation
 * (valida criterios completos), markEvaluationRead (idempotente).
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
        evaluations: { findFirst: jest.fn() },
        evaluationScores: { findMany: jest.fn() },
      },
      select: jest.fn(() => makeChain(dbQueue)),
      insert: jest.fn(() => makeChain(dbQueue)),
      update: jest.fn(() => makeChain(dbQueue)),
    },
    __txQueue: txQueue,
    __dbQueue: dbQueue,
  };
});

import { db } from "@/lib/db";
import {
  createEvaluation,
  getEvaluationById,
  getStudentEvaluationById,
  listEvaluations,
  listStudentEvaluations,
  saveEvaluationScores,
  publishEvaluation,
  markEvaluationRead,
} from "@/lib/db/queries/padel/evaluations";

const mocked = jest.requireMock("@/lib/db") as any;
const txQueue = mocked.__txQueue as any[][];
const dbQueue = mocked.__dbQueue as any[][];

const evaluation = {
  id: "e1",
  studentId: "stu1",
  teacherId: "coach1",
  rubricId: "r1",
  status: "draft",
  totalScore: null,
  maxScore: null,
  globalComment: null,
  publishedAt: null,
  readAt: null,
  createdAt: new Date("2026-09-20T10:00:00Z"),
  updatedAt: new Date("2026-09-20T10:00:00Z"),
};

const score = {
  id: "s1",
  evaluationId: "e1",
  criteriaId: "c1",
  levelId: "lv2",
  score: 3,
  comment: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  txQueue.length = 0;
  dbQueue.length = 0;
});

describe("createEvaluation", () => {
  it("inserta borrador (status draft)", async () => {
    dbQueue.push([evaluation]);
    const result = await createEvaluation({ studentId: "stu1", teacherId: "coach1", rubricId: "r1" });
    expect(result).toEqual(evaluation);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("getEvaluationById", () => {
  it("retorna null si no pertenece al teacher (anti-IDOR)", async () => {
    (db.query.evaluations.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await getEvaluationById("coach1", "e1")).toBeNull();
  });

  it("retorna evaluation + scores", async () => {
    (db.query.evaluations.findFirst as jest.Mock).mockResolvedValue(evaluation);
    (db.query.evaluationScores.findMany as jest.Mock).mockResolvedValue([score]);
    const result = await getEvaluationById("coach1", "e1");
    expect(result?.evaluation).toEqual(evaluation);
    expect(result?.scores).toHaveLength(1);
  });
});

describe("getStudentEvaluationById", () => {
  it("retorna null si no pertenece al alumno", async () => {
    (db.query.evaluations.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await getStudentEvaluationById("stu1", "e1")).toBeNull();
  });

  it("retorna null si la evaluación no está publicada (borrador invisible)", async () => {
    (db.query.evaluations.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await getStudentEvaluationById("stu1", "e1")).toBeNull();
  });

  it("retorna evaluation + scores si es del alumno y está publicada", async () => {
    (db.query.evaluations.findFirst as jest.Mock).mockResolvedValue({ ...evaluation, status: "published" });
    (db.query.evaluationScores.findMany as jest.Mock).mockResolvedValue([score]);
    const result = await getStudentEvaluationById("stu1", "e1");
    expect(result?.evaluation.status).toBe("published");
  });
});

describe("listEvaluations", () => {
  it("lista con studentName y rubricTitle", async () => {
    const rows = [{ id: "e1", studentId: "stu1", studentName: "Ana Pérez", rubricTitle: "Saque", status: "draft", totalScore: null, maxScore: null, updatedAt: new Date() }];
    dbQueue.push(rows);
    const result = await listEvaluations("coach1");
    expect(result).toEqual(rows);
  });
});

describe("listStudentEvaluations", () => {
  it("lista solo publicadas para el alumno", async () => {
    const rows = [{ id: "e1", rubricTitle: "Saque", category: "tecnica_basica", totalScore: 7, maxScore: 8, publishedAt: new Date(), readAt: null }];
    dbQueue.push(rows);
    const result = await listStudentEvaluations("stu1");
    expect(result).toEqual(rows);
  });
});

describe("saveEvaluationScores", () => {
  it("retorna null si la evaluación no es del teacher", async () => {
    txQueue.push([]); // select limit(1) → vacío
    expect(await saveEvaluationScores("coach1", "e1", { scores: [] })).toBeNull();
  });

  it("retorna null si ya está publicada (solo borradores)", async () => {
    txQueue.push([{ ...evaluation, status: "published" }]);
    expect(await saveEvaluationScores("coach1", "e1", { scores: [] })).toBeNull();
  });

  it("reemplaza scores y recalcula totalScore desde los niveles", async () => {
    txQueue.push(
      [evaluation], // select limit(1) → borrador
      [{ id: "lv2", score: 3 }, { id: "lv1", score: 4 }], // select levels
      [], // delete scores existentes
      [], // insert score 1
      [], // insert score 2
      [{ ...evaluation, totalScore: 7, updatedAt: new Date() }], // update returning
    );

    const result = await saveEvaluationScores("coach1", "e1", {
      scores: [
        { criteriaId: "c1", levelId: "lv2" },
        { criteriaId: "c2", levelId: "lv1" },
      ],
      globalComment: "Bien",
    });

    expect(result?.totalScore).toBe(7);
  });
});

describe("publishEvaluation", () => {
  it("retorna not_found si no existe", async () => {
    txQueue.push([]);
    expect(await publishEvaluation("coach1", "e1")).toEqual({ ok: false, reason: "not_found" });
  });

  it("retorna not_draft si ya está publicada", async () => {
    txQueue.push([{ ...evaluation, status: "published" }]);
    expect(await publishEvaluation("coach1", "e1")).toEqual({ ok: false, reason: "not_draft" });
  });

  it("retorna incomplete si falta un criterio sin score", async () => {
    txQueue.push(
      [evaluation], // select evaluation
      [{ id: "c1" }, { id: "c2" }], // criteria de la rúbrica
      [{ criteriaId: "c1" }], // scores existentes (falta c2)
    );
    const result = await publishEvaluation("coach1", "e1");
    expect(result).toEqual({ ok: false, reason: "incomplete", missingCriteria: 1 });
  });

  it("publica y setea publishedAt cuando todos los criterios tienen score", async () => {
    txQueue.push(
      [evaluation], // select evaluation
      [{ id: "c1" }, { id: "c2" }], // criteria
      [{ criteriaId: "c1" }, { criteriaId: "c2" }], // scores completos
      [{ ...evaluation, status: "published", publishedAt: new Date(), updatedAt: new Date() }], // update returning
    );
    const result = await publishEvaluation("coach1", "e1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evaluation.status).toBe("published");
  });
});

describe("markEvaluationRead", () => {
  it("marca como leída (idempotente) y retorna la fila", async () => {
    dbQueue.push([{ ...evaluation, status: "published", readAt: new Date() }]);
    const result = await markEvaluationRead("stu1", "e1");
    expect(result?.readAt).toBeInstanceOf(Date);
  });

  it("retorna null si no pertenece al alumno", async () => {
    dbQueue.push([]);
    expect(await markEvaluationRead("stu1", "e1")).toBeNull();
  });
});