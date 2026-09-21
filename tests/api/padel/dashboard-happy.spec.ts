/**
 * Happy-path API tests de /api/dashboard/teacher + /api/dashboard/student con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-dash-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-dash-user-${Date.now()}@test.local`;
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

test.describe("Dashboard — happy-path (SQL real)", () => {
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
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email IN ($1, $2)`, [ADMIN_EMAIL, USER_EMAIL]);
  });

  test("teacher dashboard: métricas + cursos; student dashboard: nivel + cursos", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const userCtx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const pool = getPool();
    try {
      // Coach crea curso y alumno se une → students=1
      const post = await adminCtx.post("/api/courses", {
        data: { name: "Curso dash", level: "iniciacion", days: ["Lun"] },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const course = (await post.json()).course;

      const join = await userCtx.post("/api/courses/join", {
        data: { inviteCode: course.inviteCode },
        headers: { "Content-Type": "application/json" },
      });
      expect(join.status()).toBe(201);

      // Teacher dashboard
      const teacher = await adminCtx.get("/api/dashboard/teacher");
      expect(teacher.status()).toBe(200);
      const teacherBody = await teacher.json();
      expect(teacherBody.metrics.students).toBe(1);
      expect(teacherBody.metrics.evaluations).toBe(0);
      expect(teacherBody.metrics.average).toBeNull(); // sin publicadas → null
      expect(teacherBody.courses.length).toBeGreaterThanOrEqual(1);
      const found = teacherBody.courses.find((c: { id: string }) => c.id === course.id);
      expect(found).toBeTruthy();
      expect(found.studentCount).toBe(1);

      // Student dashboard
      const student = await userCtx.get("/api/dashboard/student");
      expect(student.status()).toBe(200);
      const studentBody = await student.json();
      expect(studentBody.level).toBeNull(); // sin evaluaciones publicadas
      expect(studentBody.courses.length).toBeGreaterThanOrEqual(1);
      const sFound = studentBody.courses.find((c: { id: string }) => c.id === course.id);
      expect(sFound).toBeTruthy();
      expect(Array.isArray(studentBody.notifications)).toBe(true);

      // Verificación SQL real: enrollment existe
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM course_enrollments WHERE course_id = $1`,
        [course.id]
      );
      expect(rows[0].n).toBe(1);
    } finally {
      await adminCtx.dispose();
      await userCtx.dispose();
    }
  });
});