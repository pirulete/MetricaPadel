/**
 * Unit tests de queries de enrollments (padel) con db mockeado.
 * Cubre: joinCourse (transacción + validaciones), listStudentCourses,
 * listCourseStudents, getEnrollment, deleteEnrollment (G11).
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
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  const txQueue: any[][] = [];
  const tx = {
    insert: jest.fn(() => makeChain(txQueue)),
    select: jest.fn(() => makeChain(txQueue)),
  };

  const dbQueue: any[][] = [];
  return {
    db: {
      transaction: jest.fn(async (cb: any) => cb(tx)),
      select: jest.fn(() => makeChain(dbQueue)),
      delete: jest.fn(() => makeChain(dbQueue)),
    },
    __txQueue: txQueue,
    __dbQueue: dbQueue,
  };
});

import { db } from "@/lib/db";
import {
  deleteEnrollment,
  getEnrollment,
  getStudentCourseDetail,
  joinCourse,
} from "@/lib/db/queries/padel/enrollments";

const mocked = jest.requireMock("@/lib/db") as any;
const txQueue = mocked.__txQueue as any[][];
const dbQueue = mocked.__dbQueue as any[][];

const course = {
  id: "c1",
  name: "Pádel iniciación",
  status: "active",
  ownerId: "coach-1",
  inviteCode: "PAD-AB12",
};
const enrollment = {
  id: "e1",
  courseId: "c1",
  studentId: "s1",
  joinedAt: new Date("2026-09-21T10:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  txQueue.length = 0;
  dbQueue.length = 0;
});

describe("joinCourse", () => {
  it("inscribe al alumno cuando el curso existe y está activo", async () => {
    txQueue.push([course]);
    txQueue.push([]); // existing enrollment check
    txQueue.push([enrollment]);

    const result = await joinCourse("s1", "PAD-AB12");

    expect(result).toEqual({ ok: true, enrollment, courseId: "c1", courseName: "Pádel iniciación" });
  });

  it("retorna not_found si el curso no existe", async () => {
    txQueue.push([]);
    const result = await joinCourse("s1", "PAD-XXXX");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("retorna already_enrolled si ya está inscrito", async () => {
    txQueue.push([course]);
    txQueue.push([{ id: "e1" }]);
    const result = await joinCourse("s1", "PAD-AB12");
    expect(result).toEqual({ ok: false, reason: "already_enrolled" });
  });
});

describe("getEnrollment", () => {
  it("retorna la fila si existe", async () => {
    dbQueue.push([enrollment]);
    expect(await getEnrollment("c1", "s1")).toEqual(enrollment);
  });

  it("retorna null si no existe", async () => {
    dbQueue.push([]);
    expect(await getEnrollment("c1", "s1")).toBeNull();
  });
});

describe("deleteEnrollment", () => {
  it("elimina la inscripción y retorna la fila", async () => {
    dbQueue.push([enrollment]);

    const result = await deleteEnrollment("c1", "s1");

    expect(result).toEqual(enrollment);
    expect(db.delete).toHaveBeenCalled();
  });

  it("retorna null si no existe la inscripción (404)", async () => {
    dbQueue.push([]);

    const result = await deleteEnrollment("c1", "s1");

    expect(result).toBeNull();
  });
});

describe("getStudentCourseDetail", () => {
  const courseRow = {
    id: "c1",
    name: "Pádel iniciación",
    level: "iniciacion",
    schedule: "18:00",
    days: ["Lun", "Mié"],
    status: "active",
    ownerId: "coach-1",
    inviteCode: "PAD-AB12",
  };
  const rubricRow = {
    id: "cr1",
    rubricId: "r1",
    title: "Rúbrica base",
    category: "tecnica_basica",
    assignedAt: new Date("2026-09-21T10:00:00Z"),
  };
  const evaluationRow = {
    id: "ev1",
    studentId: "s1",
    teacherId: "coach-1",
    rubricId: "r1",
    courseId: "c1",
    status: "published",
    totalScore: 3,
    maxScore: 3,
    publishedAt: new Date("2026-09-21T11:00:00Z"),
    readAt: null,
  };
  const scoreRow = {
    id: "sc1",
    evaluationId: "ev1",
    criteriaId: "crit1",
    levelId: "lv1",
    score: 3,
    comment: null,
  };

  it("retorna course + rubrics + evaluaciones enriquecidas si está inscrito", async () => {
    dbQueue.push([enrollment]); // getEnrollment
    dbQueue.push([courseRow]); // course
    dbQueue.push([rubricRow]); // listCourseRubrics
    dbQueue.push([evaluationRow]); // evaluations
    dbQueue.push([{ id: "r1", title: "Rúbrica base", category: "tecnica_basica" }]); // rubricRows
    dbQueue.push([scoreRow]); // scores
    dbQueue.push([{ id: "crit1", rubricId: "r1", name: "Drive" }]); // criteria
    dbQueue.push([{ id: "lv1", rubricId: "r1", name: "Bueno" }]); // levels

    const result = await getStudentCourseDetail("s1", "c1");

    expect(result).not.toBeNull();
    expect(result!.course).toEqual({
      id: "c1",
      name: "Pádel iniciación",
      level: "iniciacion",
      schedule: "18:00",
      days: ["Lun", "Mié"],
    });
    expect(result!.rubrics).toEqual([rubricRow]);
    expect(result!.evaluations).toHaveLength(1);
    expect(result!.evaluations[0]).toMatchObject({
      id: "ev1",
      rubricTitle: "Rúbrica base",
      category: "tecnica_basica",
      totalScore: 3,
      maxScore: 3,
    });
    expect(result!.evaluations[0].scores).toEqual([
      {
        criteriaId: "crit1",
        criterionName: "Drive",
        levelId: "lv1",
        levelName: "Bueno",
        score: 3,
        comment: null,
      },
    ]);
  });

  it("retorna null si el alumno no está inscrito (anti-IDOR)", async () => {
    dbQueue.push([]); // getEnrollment → null

    const result = await getStudentCourseDetail("s1", "c1");

    expect(result).toBeNull();
  });

  it("retorna null si el curso no existe", async () => {
    dbQueue.push([enrollment]); // getEnrollment
    dbQueue.push([]); // course → null

    const result = await getStudentCourseDetail("s1", "c1");

    expect(result).toBeNull();
  });

  it("retorna evaluaciones vacías si no hay publicadas", async () => {
    dbQueue.push([enrollment]); // getEnrollment
    dbQueue.push([courseRow]); // course
    dbQueue.push([rubricRow]); // listCourseRubrics
    dbQueue.push([]); // evaluations → vacío
    // rubricIds vacío → Promise.resolve([]) sin tocar la cola

    const result = await getStudentCourseDetail("s1", "c1");

    expect(result).not.toBeNull();
    expect(result!.evaluations).toEqual([]);
    expect(result!.rubrics).toEqual([rubricRow]);
  });
});