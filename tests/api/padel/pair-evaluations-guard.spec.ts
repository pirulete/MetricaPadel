/**
 * API tests de guards de Evaluación en Pareja (SPEC-01).
 * 401 sin sesión (sin DB); 403 de rol y 400/404 con SQL real (skip graceful).
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-pair-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-pair-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-pair-student-${Date.now()}@test.local`;
const STUDENT_PASSWORD = "TestPass123!";

let serverProbe: Promise<boolean> | null = null;

function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/providers`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

const UUID = "00000000-0000-0000-0000-000000000000";

test.describe("Pair evaluations — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("POST /api/evaluations/pair → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/evaluations/pair`, {
      data: { studentAId: UUID, studentBId: UUID, rubricId: UUID, courseId: UUID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("PUT /api/evaluations/pair → 401", async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/evaluations/pair`, {
      data: { evaluationAId: UUID, evaluationBId: UUID, scoresA: [], scoresB: [] },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/evaluations/pair/publish → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/evaluations/pair/publish`, {
      data: { evaluationAId: UUID, evaluationBId: UUID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Pair evaluations — 403/400/404 (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    await createUser({ role: "USER", email: STUDENT_EMAIL, password: STUDENT_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
    await deleteUserByEmail(STUDENT_EMAIL);
  });

  test("USER en endpoints de pareja → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    try {
      const post = await ctx.post("/api/evaluations/pair", {
        data: { studentAId: UUID, studentBId: UUID, rubricId: UUID, courseId: UUID },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(403);
      const put = await ctx.put("/api/evaluations/pair", {
        data: { evaluationAId: UUID, evaluationBId: UUID, scoresA: [], scoresB: [] },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(403);
      const publish = await ctx.post("/api/evaluations/pair/publish", {
        data: { evaluationAId: UUID, evaluationBId: UUID },
        headers: { "Content-Type": "application/json" },
      });
      expect(publish.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("400: studentAId === studentBId", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      const res = await ctx.post("/api/evaluations/pair", {
        data: { studentAId: UUID, studentBId: UUID, rubricId: UUID, courseId: UUID },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });

  test("404: alumno no inscrito al curso (CA-07)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // Seed: curso sin alumnos + rúbrica
      const courseRes = await ctx.post("/api/courses", {
        data: { name: "Curso sin alumnos", level: "iniciacion" },
        headers: { "Content-Type": "application/json" },
      });
      expect(courseRes.status()).toBe(201);
      const courseId = (await courseRes.json()).course.id;

      const rubricRes = await ctx.post("/api/rubrics", {
        data: {
          title: "Rúbrica guard",
          category: "tecnica_basica",
          criteria: [{ name: "Precisión", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(rubricRes.status()).toBe(201);
      const rubricId = (await rubricRes.json()).rubric.rubric.id;

      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
      const studentId = rows[0].id as string;

      // Alumno no inscrito → 404 (no 403)
      const res = await ctx.post("/api/evaluations/pair", {
        data: { studentAId: studentId, studentBId: studentId, rubricId, courseId },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400); // A === B primero (Zod)

      const res2 = await ctx.post("/api/evaluations/pair", {
        data: { studentAId: studentId, studentBId: UUID, rubricId, courseId },
        headers: { "Content-Type": "application/json" },
      });
      expect(res2.status()).toBe(404); // B no existe / no USER
    } finally {
      await ctx.dispose();
    }
  });

  test("404: rúbrica ajena o inexistente", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
      const studentId = rows[0].id as string;

      const res = await ctx.post("/api/evaluations/pair", {
        data: { studentAId: studentId, studentBId: UUID, rubricId: UUID, courseId: UUID },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });

  test("404: publish de evaluación inexistente", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      const res = await ctx.post("/api/evaluations/pair/publish", {
        data: { evaluationAId: UUID, evaluationBId: UUID },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});