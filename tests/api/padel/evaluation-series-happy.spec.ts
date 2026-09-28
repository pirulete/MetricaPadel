/**
 * Happy-path API tests de GET /api/evaluations/series (G6 coach) con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-admin-series-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-student-series-${Date.now()}@test.local`;
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

test.describe("Evaluations series — happy-path (SQL real)", () => {
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

  test("GET /api/evaluations/series retorna v1 y v2 ordenadas + [] para alumno ajeno", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // Seed: rúbrica vía API
      const rubricRes = await ctx.post("/api/rubrics", {
        data: {
          title: "Rúbrica serie",
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

      // Publicar dos veces → v1 y v2
      const evaluationIds: string[] = [];
      for (let i = 0; i < 2; i++) {
        const post = await ctx.post("/api/evaluations", {
          data: { studentId, rubricId },
          headers: { "Content-Type": "application/json" },
        });
        expect(post.status()).toBe(201);
        const created = await post.json();
        const evaluationId = created.evaluation.id;

        const put = await ctx.put(`/api/evaluations/${evaluationId}`, {
          data: {
            scores: criteria.map((c: { id: string }, idx: number) => ({
              criteriaId: c.id,
              levelId: levels[idx % levels.length].id,
            })),
            globalComment: `Versión ${i + 1}`,
          },
          headers: { "Content-Type": "application/json" },
        });
        expect(put.status()).toBe(200);

        const publish = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
        expect(publish.status()).toBe(200);
        evaluationIds.push(evaluationId);
      }

      // Verificación SQL real: versiones 1 y 2
      const { rows: verRows } = await pool.query(
        `SELECT version FROM evaluations WHERE student_id = $1 AND rubric_id = $2 AND status = 'published' ORDER BY version`,
        [studentId, rubricId]
      );
      expect(verRows.map((r) => r.version)).toEqual([1, 2]);

      // GET serie → 2 items ordenados por version
      const seriesRes = await ctx.get(`/api/evaluations/series?studentId=${studentId}&rubricId=${rubricId}`);
      expect(seriesRes.status()).toBe(200);
      const body = await seriesRes.json();
      expect(body.series).toHaveLength(2);
      expect(body.series.map((e: { version: number }) => e.version)).toEqual([1, 2]);
      expect(body.series[0].scores.length).toBeGreaterThan(0);
      expect(body.series[0].scores[0].criterionName).toBeTruthy();

      // Query inválida → 400
      const bad = await ctx.get(`/api/evaluations/series?studentId=no-uuid&rubricId=${rubricId}`);
      expect(bad.status()).toBe(400);

      // Anti-IDOR: alumno ajeno (UUID inexistente) → 200 con [] (scoped teacherId)
      const foreign = await ctx.get(
        `/api/evaluations/series?studentId=00000000-0000-0000-0000-000000000000&rubricId=${rubricId}`
      );
      expect(foreign.status()).toBe(200);
      expect((await foreign.json()).series).toEqual([]);
    } finally {
      await ctx.dispose();
    }
  });
});