/**
 * Happy-path API tests de course-leave (G11) con SQL real.
 * Verifica enrollment eliminado + ya no en dashboard/student ni lista coach + re-join.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-leave-happy-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-leave-happy-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";

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

test.describe("Course leave — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
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
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[ADMIN_EMAIL, USER_EMAIL]]);
  });

  test("join → leave → enrollment eliminado + re-join OK", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const userCtx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const pool = getPool();
    try {
      // Coach crea curso
      const post = await adminCtx.post("/api/courses", {
        data: { name: "Curso leave", level: "iniciacion" },
        headers: { "Content-Type": "application/json" },
      });
      const course = (await post.json()).course;
      const courseId = course.id;

      // Alumno se une
      const join = await userCtx.post("/api/courses/join", {
        data: { inviteCode: course.inviteCode },
        headers: { "Content-Type": "application/json" },
      });
      expect(join.status()).toBe(201);

      // Verificación SQL real: enrollment existe
      const { rows: beforeRows } = await pool.query(
        `SELECT count(*)::int AS n FROM course_enrollments WHERE course_id = $1 AND student_id IN (SELECT id FROM users WHERE email = $2)`,
        [courseId, USER_EMAIL]
      );
      expect(beforeRows[0].n).toBe(1);

      // Alumno se sale
      const leave = await userCtx.delete(`/api/courses/${courseId}/enrollment`);
      expect(leave.status()).toBe(200);
      const leaveBody = await leave.json();
      expect(leaveBody.ok).toBe(true);

      // Verificación SQL real: enrollment eliminado
      const { rows: afterRows } = await pool.query(
        `SELECT count(*)::int AS n FROM course_enrollments WHERE course_id = $1 AND student_id IN (SELECT id FROM users WHERE email = $2)`,
        [courseId, USER_EMAIL]
      );
      expect(afterRows[0].n).toBe(0);

      // Ya no aparece en dashboard/student (cursos activos)
      const dash = await userCtx.get("/api/dashboard/student");
      expect(dash.status()).toBe(200);
      const dashBody = await dash.json();
      expect(dashBody.courses.some((c: { id: string }) => c.id === courseId)).toBe(false);

      // Ya no aparece en lista coach
      const detail = await adminCtx.get(`/api/courses/${courseId}`);
      const detailBody = await detail.json();
      expect(detailBody.course.students.some((s: { email: string }) => s.email === USER_EMAIL)).toBe(false);

      // Doble leave → 404
      const again = await userCtx.delete(`/api/courses/${courseId}/enrollment`);
      expect(again.status()).toBe(404);

      // Re-join OK (UNIQUE liberado)
      const rejoin = await userCtx.post("/api/courses/join", {
        data: { inviteCode: course.inviteCode },
        headers: { "Content-Type": "application/json" },
      });
      expect(rejoin.status()).toBe(201);
    } finally {
      await adminCtx.dispose();
      await userCtx.dispose();
    }
  });
});