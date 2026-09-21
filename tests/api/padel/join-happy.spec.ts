/**
 * Happy-path API tests de /api/courses/join (alumno) con SQL real + edge cases.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-join-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-join-user-${Date.now()}@test.local`;
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

test.describe("Courses join — happy-path (SQL real)", () => {
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
    await pool.query(`DELETE FROM users WHERE email IN ($1, $2)`, [ADMIN_EMAIL, USER_EMAIL]);
  });

  test("join 201 + edge cases 404/409/400", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const userCtx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const pool = getPool();
    try {
      // Coach crea curso
      const post = await adminCtx.post("/api/courses", {
        data: { name: "Curso join", level: "intermedio" },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const course = (await post.json()).course;
      const inviteCode = course.inviteCode;

      // Alumno se une (case-insensitive: minúsculas)
      const join = await userCtx.post("/api/courses/join", {
        data: { inviteCode: inviteCode.toLowerCase() },
        headers: { "Content-Type": "application/json" },
      });
      expect(join.status()).toBe(201);
      const joinBody = await join.json();
      expect(joinBody.enrollment.courseId).toBe(course.id);
      expect(joinBody.enrollment.courseName).toBe("Curso join");

      // Verificación SQL real: enrollment insertado
      const { rows: enrRows } = await pool.query(
        `SELECT count(*)::int AS n FROM course_enrollments ce
         JOIN users u ON u.id = ce.student_id
         WHERE ce.course_id = $1 AND u.email = $2`,
        [course.id, USER_EMAIL]
      );
      expect(enrRows[0].n).toBe(1);

      // Ya inscrito → 409
      const again = await userCtx.post("/api/courses/join", {
        data: { inviteCode },
        headers: { "Content-Type": "application/json" },
      });
      expect(again.status()).toBe(409);

      // Código inválido → 404
      const bad = await userCtx.post("/api/courses/join", {
        data: { inviteCode: "PAD-ZZZZ" },
        headers: { "Content-Type": "application/json" },
      });
      expect(bad.status()).toBe(404);

      // Coach (ADMIN) en endpoint alumno → 403 (guard de rol; el branch own_course
      // de la query es defense-in-depth, inalcanzable vía API porque solo ADMIN crea cursos)
      const own = await adminCtx.post("/api/courses/join", {
        data: { inviteCode },
        headers: { "Content-Type": "application/json" },
      });
      expect(own.status()).toBe(403);

      // Formato inválido → 400 (Zod)
      const format = await userCtx.post("/api/courses/join", {
        data: { inviteCode: "ABC" },
        headers: { "Content-Type": "application/json" },
      });
      expect(format.status()).toBe(400);
    } finally {
      await adminCtx.dispose();
      await userCtx.dispose();
    }
  });
});