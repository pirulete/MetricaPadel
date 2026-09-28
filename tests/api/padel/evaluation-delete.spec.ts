/**
 * API tests de soft-delete de evaluaciones (G16).
 * 401 sin sesión; 403 de rol; 404 inexistente; happy-path DELETE con SQL real
 * (deleted_at persistido, oculta de GET/lista, auditoría).
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

const ADMIN_EMAIL = `padel-evaldel-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-evaldel-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-evaldel-student-${Date.now()}@test.local`;
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

test.describe("Evaluation delete — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("DELETE /api/evaluations/[id] → 401", async ({ request }) => {
    expect((await request.delete(`${BASE_URL}/api/evaluations/${UUID}`)).status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Evaluation delete — 403/404 (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
  });

  test("USER en endpoint coach → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    try {
      expect((await ctx.delete(`/api/evaluations/${UUID}`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("404: evaluación inexistente", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      expect((await ctx.delete(`/api/evaluations/${UUID}`)).status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});

test.describe("Evaluation delete — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: STUDENT_EMAIL, password: STUDENT_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)
         OR student_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(STUDENT_EMAIL);
  });

  test("DELETE archiva evaluación publicada: deleted_at persistido + oculta de GET/lista + auditoría", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // Seed: rúbrica vía API
      const rubricRes = await ctx.post("/api/rubrics", {
        data: {
          title: "Rúbrica soft-delete",
          category: "tecnica_basica",
          criteria: [
            { name: "Drive", descriptors: ["A", "B", "C", "D"] },
            { name: "Revés", descriptors: ["A", "B", "C", "D"] },
          ],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(rubricRes.status()).toBe(201);
      const rubric = await rubricRes.json();
      const rubricId = rubric.rubric.rubric.id;
      const levels = rubric.rubric.levels;
      const criteria = rubric.rubric.criteria;

      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
      const studentId = rows[0].id as string;

      // POST crea borrador + PUT scores + publish
      const post = await ctx.post("/api/evaluations", {
        data: { studentId, rubricId },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const evaluationId = (await post.json()).evaluation.id;

      const put = await ctx.put(`/api/evaluations/${evaluationId}`, {
        data: {
          scores: [
            { criteriaId: criteria[0].id, levelId: levels[0].id },
            { criteriaId: criteria[1].id, levelId: levels[1].id },
          ],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(200);

      const publish = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);

      // DELETE archiva
      const del = await ctx.delete(`/api/evaluations/${evaluationId}`);
      expect(del.status()).toBe(200);
      expect(await del.json()).toEqual({ success: true });

      // Verificación SQL real: deleted_at persistido
      const { rows: evRows } = await pool.query(
        `SELECT deleted_at FROM evaluations WHERE id = $1`,
        [evaluationId]
      );
      expect(evRows[0].deleted_at).not.toBeNull();

      // GET detalle coach → 404 (oculta archivadas)
      expect((await ctx.get(`/api/evaluations/${evaluationId}`)).status()).toBe(404);

      // PUT sobre archivada → 404 (no editable)
      const putArchived = await ctx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId: criteria[0].id, levelId: levels[0].id }] },
        headers: { "Content-Type": "application/json" },
      });
      expect(putArchived.status()).toBe(404);

      // Publish sobre archivada → 404
      expect((await ctx.post(`/api/evaluations/${evaluationId}/publish`)).status()).toBe(404);

      // Lista coach excluye la archivada
      const list = await ctx.get("/api/evaluations");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      expect(listBody.evaluations.some((e: { id: string }) => e.id === evaluationId)).toBe(false);

      // Alumno: lista publicadas excluye la archivada
      const studentCtx = await createAuthedContext(STUDENT_EMAIL, STUDENT_PASSWORD);
      try {
        const studentList = await studentCtx.get("/api/student/evaluations");
        expect(studentList.status()).toBe(200);
        const studentBody = await studentList.json();
        expect(studentBody.evaluations.some((e: { id: string }) => e.id === evaluationId)).toBe(false);
        // Detalle alumno → 404
        expect((await studentCtx.get(`/api/student/evaluations/${evaluationId}`)).status()).toBe(404);
      } finally {
        await studentCtx.dispose();
      }

      // Auditoría: DELETE registrado
      const { rows: auditRows } = await pool.query(
        `SELECT action_type FROM audit_logs WHERE entity_name = 'evaluation' AND entity_id = $1 AND action_type = 'DELETE'`,
        [evaluationId]
      );
      expect(auditRows.length).toBe(1);

      // DELETE repetido → 404 (ya archivada)
      expect((await ctx.delete(`/api/evaluations/${evaluationId}`)).status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});