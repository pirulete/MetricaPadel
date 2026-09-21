/**
 * Happy-path API tests de gestión de alumnos por curso (G12) con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-students-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_A_EMAIL = `padel-students-a-${Date.now()}@test.local`;
const STUDENT_B_EMAIL = `padel-students-b-${Date.now()}@test.local`;
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

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Course students — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: STUDENT_A_EMAIL, password: STUDENT_PASSWORD });
    await createUser({ role: "USER", email: STUDENT_B_EMAIL, password: STUDENT_PASSWORD });
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
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [
      [ADMIN_EMAIL, STUDENT_A_EMAIL, STUDENT_B_EMAIL],
    ]);
  });

  test("agregar alumno + search candidatos + remover alumno", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // Seed: curso
      const courseRes = await ctx.post("/api/courses", {
        data: { name: "Curso G12", level: "intermedio" },
        headers: { "Content-Type": "application/json" },
      });
      expect(courseRes.status()).toBe(201);
      const courseId = (await courseRes.json()).course.id;

      const { rows: aRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_A_EMAIL]);
      const { rows: bRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_B_EMAIL]);
      const studentAId = aRows[0].id as string;
      const studentBId = bRows[0].id as string;

      // Search: ambos candidatos antes de inscribir
      const search = await ctx.get(`/api/courses/${courseId}/students/search?q=${encodeURIComponent("padel-students")}`);
      expect(search.status()).toBe(200);
      const searchBody = await search.json();
      const ids = searchBody.candidates.map((c: { id: string }) => c.id);
      expect(ids).toContain(studentAId);
      expect(ids).toContain(studentBId);

      // POST agrega alumno A
      const add = await ctx.post(`/api/courses/${courseId}/students`, {
        data: { studentId: studentAId },
        headers: { "Content-Type": "application/json" },
      });
      expect(add.status()).toBe(201);
      const addBody = await add.json();
      expect(addBody.enrollment.courseId).toBe(courseId);
      expect(addBody.enrollment.studentId).toBe(studentAId);

      // Verificación SQL real: enrollment insertado
      const { rows: enrRows } = await pool.query(
        `SELECT count(*)::int AS n FROM course_enrollments WHERE course_id = $1 AND student_id = $2`,
        [courseId, studentAId]
      );
      expect(enrRows[0].n).toBe(1);

      // Duplicado → 409
      const dup = await ctx.post(`/api/courses/${courseId}/students`, {
        data: { studentId: studentAId },
        headers: { "Content-Type": "application/json" },
      });
      expect(dup.status()).toBe(409);

      // Search ya no incluye a A (inscrito), sí a B
      const search2 = await ctx.get(`/api/courses/${courseId}/students/search?q=${encodeURIComponent("padel-students")}`);
      const search2Body = await search2.json();
      const ids2 = search2Body.candidates.map((c: { id: string }) => c.id);
      expect(ids2).not.toContain(studentAId);
      expect(ids2).toContain(studentBId);

      // Detalle del curso incluye a A
      const detail = await ctx.get(`/api/courses/${courseId}`);
      const detailBody = await detail.json();
      expect(detailBody.course.students.map((s: { id: string }) => s.id)).toContain(studentAId);

      // DELETE remueve a A
      const del = await ctx.delete(`/api/courses/${courseId}/students/${studentAId}`);
      expect(del.status()).toBe(200);

      // Verificación SQL real: enrollment eliminado
      const { rows: delRows } = await pool.query(
        `SELECT count(*)::int AS n FROM course_enrollments WHERE course_id = $1 AND student_id = $2`,
        [courseId, studentAId]
      );
      expect(delRows[0].n).toBe(0);

      // Re-remover → 404
      const delAgain = await ctx.delete(`/api/courses/${courseId}/students/${studentAId}`);
      expect(delAgain.status()).toBe(404);

      // Agregar alumno inexistente → 404
      const badAdd = await ctx.post(`/api/courses/${courseId}/students`, {
        data: { studentId: "00000000-0000-0000-0000-000000000000" },
        headers: { "Content-Type": "application/json" },
      });
      expect(badAdd.status()).toBe(404);

      // IDOR: curso ajeno → 404
      const idor = await ctx.post(`/api/courses/${"00000000-0000-0000-0000-000000000000"}/students`, {
        data: { studentId: studentBId },
        headers: { "Content-Type": "application/json" },
      });
      expect(idor.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});