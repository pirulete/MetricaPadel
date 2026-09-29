/**
 * API tests de GET /api/evaluations/coverage (R5 — aviso pre-publish).
 * Guards 401/403 sin DB + happy-path con SQL real contra NeonDB.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-cov-endpoint-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-cov-endpoint-user-${Date.now()}@test.local`;
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
const UUID = "00000000-0000-0000-0000-000000000000";

test.describe("GET /api/evaluations/coverage — guards", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("401 sin sesión", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/evaluations/coverage?studentId=${UUID}&rubricId=${UUID}`
    );
    expect(res.status()).toBe(401);
  });

  test("403 para rol USER", async () => {
    test.skip(!HAS_DB, "Requiere DATABASE_URL");
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    try {
      const res = await ctx.get(
        `/api/evaluations/coverage?studentId=${UUID}&rubricId=${UUID}`
      );
      expect(res.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("400 con query inválida", async () => {
    test.skip(!HAS_DB, "Requiere DATABASE_URL");
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      const res = await ctx.get(`/api/evaluations/coverage?studentId=no-uuid&rubricId=${UUID}`);
      expect(res.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });
});

test.describe("GET /api/evaluations/coverage — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)
         OR student_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
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
    await pool.query(`DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[ADMIN_EMAIL, USER_EMAIL]]);
  });

  test("retorna coveredCategories vacío + alreadyEvaluated=false antes de publicar", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL]);
      const studentId = rows[0].id as string;

      const rubricRes = await ctx.post("/api/rubrics", {
        data: {
          title: "Rúbrica cobertura",
          category: "tactica",
          criteria: [{ name: "Criterio único", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      const rubricId = (await rubricRes.json()).rubric.rubric.id;

      const res = await ctx.get(`/api/evaluations/coverage?studentId=${studentId}&rubricId=${rubricId}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.coveredCategories).toEqual([]);
      expect(body.alreadyEvaluated).toBe(false);
    } finally {
      await ctx.dispose();
    }
  });

  test("retorna categoría cubierta + alreadyEvaluated=true tras publicar", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL]);
      const studentId = rows[0].id as string;

      const rubricRes = await ctx.post("/api/rubrics", {
        data: {
          title: "Rúbrica publicada",
          category: "fisica",
          criteria: [{ name: "Criterio único", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      const rubric = await rubricRes.json();
      const rubricId = rubric.rubric.rubric.id;
      const levels = rubric.rubric.levels;
      const criteria = rubric.rubric.criteria;

      await ctx.put(`/api/rubrics/${rubricId}`, {
        data: { status: "active" },
        headers: { "Content-Type": "application/json" },
      });

      const post = await ctx.post("/api/evaluations", {
        data: { studentId, rubricId },
        headers: { "Content-Type": "application/json" },
      });
      const evaluationId = (await post.json()).evaluation.id;

      await ctx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId: criteria[0].id, levelId: levels[0].id }] },
        headers: { "Content-Type": "application/json" },
      });
      const publish = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);

      // Verificación SQL real: la categoría quedó publicada
      const { rows: covRows } = await pool.query(
        `SELECT DISTINCT r.category FROM evaluations e
         INNER JOIN rubrics r ON r.id = e.rubric_id
         WHERE e.student_id = $1 AND e.status = 'published'`,
        [studentId]
      );
      expect(covRows.map((r) => r.category)).toContain("fisica");

      const res = await ctx.get(`/api/evaluations/coverage?studentId=${studentId}&rubricId=${rubricId}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.coveredCategories).toContain("fisica");
      expect(body.alreadyEvaluated).toBe(true);

      // Anti-IDOR: rúbrica ajena → 404
      const foreign = await ctx.get(
        `/api/evaluations/coverage?studentId=${studentId}&rubricId=${UUID}`
      );
      expect(foreign.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});