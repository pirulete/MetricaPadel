/**
 * Happy-path API tests de /api/courses (CRUD + rubrics assign) con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-courses-happy-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";

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

test.describe("Courses — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
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
    await pool.query(`DELETE FROM users WHERE email = $1`, [ADMIN_EMAIL]);
  });

  test("POST crea curso + GET lista + GET detalle + PUT + DELETE archive + rubrics assign", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // POST crea curso con inviteCode PAD-XXXX
      const post = await ctx.post("/api/courses", {
        data: { name: "Pádel iniciación", level: "iniciacion", schedule: "18:00", days: ["Lun", "Mié"] },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const created = await post.json();
      const courseId = created.course.id;
      expect(created.course.inviteCode).toMatch(/^PAD-[A-Z0-9]{4}$/);
      expect(created.course.status).toBe("active");

      // Verificación SQL real: curso insertado con invite_code
      const { rows: courseRows } = await pool.query(
        `SELECT invite_code, status FROM courses WHERE id = $1`,
        [courseId]
      );
      expect(courseRows[0].status).toBe("active");
      expect(courseRows[0].invite_code).toMatch(/^PAD-[A-Z0-9]{4}$/);

      // GET lista
      const list = await ctx.get("/api/courses");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      const found = listBody.courses.find((c: { id: string }) => c.id === courseId);
      expect(found).toBeTruthy();
      expect(found.studentCount).toBe(0);

      // GET detalle
      const detail = await ctx.get(`/api/courses/${courseId}`);
      expect(detail.status()).toBe(200);
      const detailBody = await detail.json();
      expect(detailBody.course.course.name).toBe("Pádel iniciación");
      expect(detailBody.course.students).toHaveLength(0);
      expect(detailBody.course.rubrics).toHaveLength(0);

      // PUT actualiza nombre
      const put = await ctx.put(`/api/courses/${courseId}`, {
        data: { name: "Pádel iniciación martes" },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(200);
      const putBody = await put.json();
      expect(putBody.course.name).toBe("Pádel iniciación martes");

      // POST rúbrica activa + asignar al curso
      const rubricPost = await ctx.post("/api/rubrics", {
        data: {
          title: "Saque",
          category: "tecnica_basica",
          criteria: [{ name: "Precisión", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(rubricPost.status()).toBe(201);
      const rubricBody = await rubricPost.json();
      const rubricId = rubricBody.rubric.rubric.id;

      // Activar rúbrica (draft → active) vía SQL (el PUT de rúbricas no expone status)
      await pool.query(`UPDATE rubrics SET status = 'active' WHERE id = $1`, [rubricId]);

      const assign = await ctx.post(`/api/courses/${courseId}/rubrics`, {
        data: { rubricId },
        headers: { "Content-Type": "application/json" },
      });
      expect(assign.status()).toBe(201);

      // Verificación SQL real: course_rubrics
      const { rows: crRows } = await pool.query(
        `SELECT count(*)::int AS n FROM course_rubrics WHERE course_id = $1 AND rubric_id = $2`,
        [courseId, rubricId]
      );
      expect(crRows[0].n).toBe(1);

      // GET rubrics del curso
      const rubricsList = await ctx.get(`/api/courses/${courseId}/rubrics`);
      expect(rubricsList.status()).toBe(200);
      const rubricsBody = await rubricsList.json();
      expect(rubricsBody.rubrics).toHaveLength(1);
      expect(rubricsBody.rubrics[0].title).toBe("Saque");

      // Re-asignar misma rúbrica → 409 (D2)
      const reassign = await ctx.post(`/api/courses/${courseId}/rubrics`, {
        data: { rubricId },
        headers: { "Content-Type": "application/json" },
      });
      expect(reassign.status()).toBe(409);

      // DELETE archiva (soft)
      const del = await ctx.delete(`/api/courses/${courseId}`);
      expect(del.status()).toBe(200);
      const delBody = await del.json();
      expect(delBody.course.status).toBe("archived");

      // Verificación SQL real: status archived
      const { rows: archivedRows } = await pool.query(
        `SELECT status FROM courses WHERE id = $1`,
        [courseId]
      );
      expect(archivedRows[0].status).toBe("archived");

      // POST inválido → 400
      const bad = await ctx.post("/api/courses", {
        data: { name: "", level: "iniciacion" },
        headers: { "Content-Type": "application/json" },
      });
      expect(bad.status()).toBe(400);

      // 404 IDOR: curso inexistente
      expect((await ctx.get(`/api/courses/${"00000000-0000-0000-0000-000000000000"}`)).status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});