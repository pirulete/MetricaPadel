/**
 * Happy-path API tests de /api/evaluations (crear borrador, guardar scores,
 * publicar) con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-admin-evals-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-student-evals-${Date.now()}@test.local`;
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

test.describe("Evaluations — happy-path (SQL real)", () => {
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
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[ADMIN_EMAIL, STUDENT_EMAIL]]);
  });

  test("POST borrador + PUT scores + publish + GET detalle/lista", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // Seed: rúbrica vía API
      const rubricRes = await ctx.post("/api/rubrics", {
        data: {
          title: "Rúbrica evaluación",
          category: "tactica",
          criteria: [
            { name: "Posición", descriptors: ["A", "B", "C", "D"] },
            { name: "Lectura", descriptors: ["A", "B", "C", "D"] },
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

      // POST crea borrador
      const post = await ctx.post("/api/evaluations", {
        data: { studentId, rubricId },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const created = await post.json();
      const evaluationId = created.evaluation.id;
      expect(created.evaluation.status).toBe("draft");

      // PUT guarda scores (1 criterio → publish debe fallar por incompleto)
      const put = await ctx.put(`/api/evaluations/${evaluationId}`, {
        data: {
          scores: [
            { criteriaId: criteria[0].id, levelId: levels[0].id, comment: "Muy bien" },
          ],
          globalComment: "Primer borrador",
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(200);
      const putBody = await put.json();
      expect(putBody.evaluation.totalScore).toBe(levels[0].score);

      // Publish incompleto → 400
      const publishIncomplete = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publishIncomplete.status()).toBe(400);

      // PUT completa scores (2 criterios)
      const putFull = await ctx.put(`/api/evaluations/${evaluationId}`, {
        data: {
          scores: [
            { criteriaId: criteria[0].id, levelId: levels[0].id },
            { criteriaId: criteria[1].id, levelId: levels[1].id },
          ],
          globalComment: "Listo",
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(putFull.status()).toBe(200);
      const putFullBody = await putFull.json();
      expect(putFullBody.evaluation.totalScore).toBe(levels[0].score + levels[1].score);

      // Verificación SQL real: scores persistidos
      const { rows: scoreRows } = await pool.query(
        `SELECT count(*)::int AS n FROM evaluation_scores WHERE evaluation_id = $1`,
        [evaluationId]
      );
      expect(scoreRows[0].n).toBe(2);

      // Publish OK
      const publish = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);
      const publishBody = await publish.json();
      expect(publishBody.evaluation.status).toBe("published");
      expect(publishBody.evaluation.publishedAt).toBeTruthy();

      // Verificación SQL real: status published
      const { rows: evRows } = await pool.query(
        `SELECT status FROM evaluations WHERE id = $1`,
        [evaluationId]
      );
      expect(evRows[0].status).toBe("published");

      // PUT sobre publicada → 404 (no editable)
      const putPublished = await ctx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId: criteria[0].id, levelId: levels[0].id }] },
        headers: { "Content-Type": "application/json" },
      });
      expect(putPublished.status()).toBe(404);

      // GET detalle (coach)
      const detail = await ctx.get(`/api/evaluations/${evaluationId}`);
      expect(detail.status()).toBe(200);
      const detailBody = await detail.json();
      expect(detailBody.evaluation.id).toBe(evaluationId);
      expect(detailBody.student.email).toBe(STUDENT_EMAIL);
      expect(detailBody.scores).toHaveLength(2);

      // GET lista con filtro published
      const list = await ctx.get("/api/evaluations?status=published");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      expect(listBody.evaluations.some((e: { id: string }) => e.id === evaluationId)).toBe(true);

      // POST con rúbrica ajena/inexistente → 404
      const badRubric = await ctx.post("/api/evaluations", {
        data: { studentId, rubricId: "00000000-0000-0000-0000-000000000000" },
        headers: { "Content-Type": "application/json" },
      });
      expect(badRubric.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});