/**
 * Happy-path API tests de cobertura dimensional (R5) con SQL real.
 * Verifica que publish devuelve alreadyEvaluated=false en la primera
 * evaluación y true cuando la categoría ya fue publicada para el alumno.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-coverage-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-coverage-student-${Date.now()}@test.local`;
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

test.describe("Cobertura dimensional (R5) — happy-path (SQL real)", () => {
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
      `DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
      [STUDENT_EMAIL]
    );
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

  /** Crea rúbrica + borrador + scores completos; retorna evaluationId listo para publicar. */
  async function createReadyEvaluation(
    ctx: Awaited<ReturnType<typeof createAuthedContext>>,
    studentId: string,
    category: string,
    title: string
  ): Promise<string> {
    const rubricRes = await ctx.post("/api/rubrics", {
      data: {
        title,
        category,
        criteria: [{ name: "Criterio único", descriptors: ["A", "B", "C", "D"] }],
      },
      headers: { "Content-Type": "application/json" },
    });
    const rubric = await rubricRes.json();
    const rubricId = rubric.rubric.rubric.id;
    const levels = rubric.rubric.levels;
    const criteria = rubric.rubric.criteria;

    const post = await ctx.post("/api/evaluations", {
      data: { studentId, rubricId },
      headers: { "Content-Type": "application/json" },
    });
    const evaluationId = (await post.json()).evaluation.id;

    await ctx.put(`/api/evaluations/${evaluationId}`, {
      data: { scores: [{ criteriaId: criteria[0].id, levelId: levels[0].id }] },
      headers: { "Content-Type": "application/json" },
    });

    return evaluationId;
  }

  test("publish devuelve alreadyEvaluated=false en la primera evaluación", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
      const studentId = rows[0].id as string;

      const evaluationId = await createReadyEvaluation(ctx, studentId, "tecnica_basica", "Rúbrica primera");

      const publish = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);
      const body = await publish.json();
      expect(body.evaluation.status).toBe("published");
      expect(body.alreadyEvaluated).toBe(false);
    } finally {
      await ctx.dispose();
    }
  });

  test("publish devuelve alreadyEvaluated=true cuando la categoría ya fue publicada", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
      const studentId = rows[0].id as string;

      // Primera evaluación publicada en tactica → false
      const firstId = await createReadyEvaluation(ctx, studentId, "tactica", "Rúbrica base");
      const publish1 = await ctx.post(`/api/evaluations/${firstId}/publish`);
      expect(publish1.status()).toBe(200);
      expect((await publish1.json()).alreadyEvaluated).toBe(false);

      // Segunda evaluación con la MISMA categoría → true (soft-block)
      const secondId = await createReadyEvaluation(ctx, studentId, "tactica", "Rúbrica repetida");
      const publish2 = await ctx.post(`/api/evaluations/${secondId}/publish`);
      expect(publish2.status()).toBe(200);
      const body2 = await publish2.json();
      expect(body2.evaluation.status).toBe("published");
      expect(body2.alreadyEvaluated).toBe(true);
    } finally {
      await ctx.dispose();
    }
  });
});