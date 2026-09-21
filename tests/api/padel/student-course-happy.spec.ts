/**
 * Happy-path API tests de GET /api/student/courses/[id] (G8) con SQL real.
 * Verifica 200 con course + rubrics + evaluaciones enriquecidas, 404 para
 * alumno no inscrito (anti-IDOR) y 403 para rol ADMIN.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = "padel-student-course-admin@test.local";
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = "padel-student-course-user@test.local";
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

test.describe("Student course detail — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    const pool = getPool();
    // Aggressive cleanup before creating users
    await pool.query(`DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT e.id FROM evaluations e INNER JOIN users u ON e.student_id = u.id WHERE u.email = $1)`, [USER_EMAIL]);
    await pool.query(`DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT e.id FROM evaluations e INNER JOIN users u ON e.teacher_id = u.id WHERE u.email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM evaluations WHERE student_id IN (SELECT id FROM users WHERE email = $1)`, [USER_EMAIL]);
    await pool.query(`DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM course_rubrics WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [USER_EMAIL]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[ADMIN_EMAIL, USER_EMAIL]]);
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)
         OR student_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM course_rubrics WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
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
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[ADMIN_EMAIL, USER_EMAIL]]);
  });

  test("alumno inscrito ve curso + rúbricas + evaluaciones publicadas", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const userCtx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const pool = getPool();
    try {
      // Coach crea curso
      const post = await adminCtx.post("/api/courses", {
        data: { name: "Curso G8", level: "intermedio", schedule: "18:00", days: ["Lun", "Mié"] },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const course = (await post.json()).course;
      const courseId = course.id;

      // Coach crea rúbrica y la asigna al curso
      const rubricRes = await adminCtx.post("/api/rubrics", {
        data: {
          title: "Rúbrica G8",
          category: "tecnica_basica",
          criteria: [{ name: "Drive", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(rubricRes.status()).toBe(201);
      const rubric = (await rubricRes.json()).rubric;
      const rubricId = rubric.rubric.id;
      const levels = rubric.levels;
      const criteria = rubric.criteria;

      // Publish rubric (must be active to assign) — only set status, don't replace criteria
      const pubRes = await adminCtx.put(`/api/rubrics/${rubricId}`, {
        data: { status: "active" },
        headers: { "Content-Type": "application/json" },
      });
      expect(pubRes.status()).toBe(200);

      const assign = await adminCtx.post(`/api/courses/${courseId}/rubrics`, {
        data: { rubricId },
        headers: { "Content-Type": "application/json" },
      });
      expect(assign.status()).toBe(201);

      // Alumno se une
      const join = await userCtx.post("/api/courses/join", {
        data: { inviteCode: course.inviteCode },
        headers: { "Content-Type": "application/json" },
      });
      expect(join.status()).toBe(201);

      // Coach crea evaluación, la liga al curso vía SQL (courseId no está en el schema API)
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL]);
      const studentId = rows[0].id as string;

      const evRes = await adminCtx.post("/api/evaluations", {
        data: { studentId, rubricId },
        headers: { "Content-Type": "application/json" },
      });
      expect(evRes.status()).toBe(201);
      const evaluationId = (await evRes.json()).evaluation.id;
      await pool.query(`UPDATE evaluations SET course_id = $1 WHERE id = $2`, [courseId, evaluationId]);

      await adminCtx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId: criteria[0].id, levelId: levels[0].id }] },
        headers: { "Content-Type": "application/json" },
      });
      const publish = await adminCtx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);

      // GET detalle alumno → 200 con course + rubrics + evaluations
      const detail = await userCtx.get(`/api/student/courses/${courseId}`);
      expect(detail.status()).toBe(200);
      const body = await detail.json();
      expect(body.course.name).toBe("Curso G8");
      expect(body.course.level).toBe("intermedio");
      expect(body.course.schedule).toBe("18:00");
      expect(body.course.days).toEqual(["Lun", "Mié"]);

      expect(body.rubrics).toHaveLength(1);
      expect(body.rubrics[0].rubricId).toBe(rubricId);
      expect(body.rubrics[0].title).toBe("Rúbrica G8");
      expect(body.rubrics[0].category).toBe("tecnica_basica");

      expect(body.evaluations).toHaveLength(1);
      const ev = body.evaluations[0];
      expect(ev.id).toBe(evaluationId);
      expect(ev.rubricTitle).toBe("Rúbrica G8");
      expect(ev.totalScore).toBe(levels[0].score);
      expect(ev.maxScore).toBeGreaterThan(0);
      expect(typeof ev.maxScore).toBe("number");
      expect(ev.scores).toHaveLength(1);
      expect(ev.scores[0].criterionName).toBe("Drive");
      expect(typeof ev.scores[0].levelName).toBe("string");
      expect(ev.scores[0].score).toBeGreaterThan(0);
      expect(ev.scores[0].score).toBe(levels[0].score);

      // Verificación SQL real: enrollment existe
      const { rows: enrRows } = await pool.query(
        `SELECT count(*)::int AS n FROM course_enrollments WHERE course_id = $1 AND student_id = $2`,
        [courseId, studentId]
      );
      expect(enrRows[0].n).toBe(1);
    } finally {
      await adminCtx.dispose();
      await userCtx.dispose();
    }
  });

  test("alumno no inscrito → 404 (anti-IDOR)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const userCtx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    try {
      // Curso sin el alumno inscrito
      const post = await adminCtx.post("/api/courses", {
        data: { name: "Curso ajeno", level: "iniciacion" },
        headers: { "Content-Type": "application/json" },
      });
      const courseId = (await post.json()).course.id;

      const detail = await userCtx.get(`/api/student/courses/${courseId}`);
      expect(detail.status()).toBe(404);

      // UUID inexistente → 404
      const missing = await userCtx.get(
        "/api/student/courses/00000000-0000-0000-0000-000000000000"
      );
      expect(missing.status()).toBe(404);
    } finally {
      await adminCtx.dispose();
      await userCtx.dispose();
    }
  });

  test("rol ADMIN en endpoint alumno → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      const res = await adminCtx.get(
        "/api/student/courses/00000000-0000-0000-0000-000000000000"
      );
      expect(res.status()).toBe(403);
    } finally {
      await adminCtx.dispose();
    }
  });
});