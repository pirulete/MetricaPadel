/**
 * Happy-path API tests de /api/history (P10) con SQL real + filtros + IDOR.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-history-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const OTHER_ADMIN_EMAIL = `padel-history-other-${Date.now()}@test.local`;
const OTHER_ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-history-user-${Date.now()}@test.local`;
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

test.describe("History — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "ADMIN", email: OTHER_ADMIN_EMAIL, password: OTHER_ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email IN ($1, $2))`,
      [ADMIN_EMAIL, OTHER_ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email IN ($1, $2))`,
      [ADMIN_EMAIL, OTHER_ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email IN ($1, $2, $3)`, [ADMIN_EMAIL, OTHER_ADMIN_EMAIL, USER_EMAIL]);
  });

  test("historial lista evaluaciones del coach + filtros + IDOR 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const otherCtx = await createAuthedContext(OTHER_ADMIN_EMAIL, OTHER_ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // Crear rúbrica + evaluación publicada para el coach
      const rubricPost = await ctx.post("/api/rubrics", {
        data: {
          title: "Historial rubric",
          category: "tecnica_basica",
          criteria: [{ name: "Precisión", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(rubricPost.status()).toBe(201);
      const rubricId = (await rubricPost.json()).rubric.rubric.id;

      const evalPost = await ctx.post("/api/evaluations", {
        data: {
          studentId: (await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL])).rows[0].id,
          rubricId,
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(evalPost.status()).toBe(201);
      const evaluationId = (await evalPost.json()).evaluation.id;

      // Guardar scores + publicar
      const criteriaId = (await pool.query(
        `SELECT id FROM rubric_criteria WHERE rubric_id = $1 LIMIT 1`,
        [rubricId]
      )).rows[0].id;
      const levelId = (await pool.query(
        `SELECT id FROM rubric_levels WHERE rubric_id = $1 AND score = 4 LIMIT 1`,
        [rubricId]
      )).rows[0].id;
      const save = await ctx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId, levelId }] },
        headers: { "Content-Type": "application/json" },
      });
      expect(save.status()).toBe(200);
      const publish = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);

      // GET /api/history → incluye la evaluación publicada
      const history = await ctx.get("/api/history");
      expect(history.status()).toBe(200);
      const historyBody = await history.json();
      const found = historyBody.evaluations.find((e: { id: string }) => e.id === evaluationId);
      expect(found).toBeTruthy();
      expect(found.status).toBe("published");
      expect(found.totalScore).toBe(4);
      // maxScore no se denormaliza en el flujo de guardado de Etapa 1 (solo totalScore)

      // Filtro por status
      const published = await ctx.get("/api/history?status=published");
      expect(published.status()).toBe(200);
      const publishedBody = await published.json();
      expect(publishedBody.evaluations.find((e: { id: string }) => e.id === evaluationId)).toBeTruthy();

      // Filtro por studentId
      const studentId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL])).rows[0].id;
      const byStudent = await ctx.get(`/api/history?studentId=${studentId}`);
      expect(byStudent.status()).toBe(200);
      expect((await byStudent.json()).evaluations.length).toBeGreaterThanOrEqual(1);

      // Query inválida → 400
      const bad = await ctx.get("/api/history?status=archived");
      expect(bad.status()).toBe(400);

      // IDOR: otro coach no ve las evaluaciones de este coach
      const otherHistory = await otherCtx.get("/api/history");
      expect(otherHistory.status()).toBe(200);
      const otherBody = await otherHistory.json();
      expect(otherBody.evaluations.find((e: { id: string }) => e.id === evaluationId)).toBeFalsy();
    } finally {
      await ctx.dispose();
      await otherCtx.dispose();
    }
  });
});