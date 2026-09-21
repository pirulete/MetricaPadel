/**
 * Happy-path API tests de /api/student/evolution (G7) con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-evolution-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-evolution-student-${Date.now()}@test.local`;
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

test.describe("Student evolution — happy-path (SQL real)", () => {
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

  test("alumno ve evolución agrupada por categoría con tendencia", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const studentCtx = await createAuthedContext(STUDENT_EMAIL, STUDENT_PASSWORD);
    const pool = getPool();
    try {
      // Seed: 2 rúbricas (fisica + tactica) + 2 evaluaciones publicadas
      const rubricRes = await adminCtx.post("/api/rubrics", {
        data: {
          title: "Rúbrica física",
          category: "fisica",
          criteria: [{ name: "Resistencia", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(rubricRes.status()).toBe(201);
      const rubric = await rubricRes.json();
      const rubricId = rubric.rubric.rubric.id;
      const levels = rubric.rubric.levels;
      const criteria = rubric.rubric.criteria;

      const rubric2Res = await adminCtx.post("/api/rubrics", {
        data: {
          title: "Rúbrica táctica",
          category: "tactica",
          criteria: [{ name: "Posicionamiento", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(rubric2Res.status()).toBe(201);
      const rubric2 = await rubric2Res.json();
      const rubric2Id = rubric2.rubric.rubric.id;
      const levels2 = rubric2.rubric.levels;
      const criteria2 = rubric2.rubric.criteria;

      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
      const studentId = rows[0].id as string;

      const publishEval = async (rid: string, lvls: typeof levels, crits: typeof criteria) => {
        const evRes = await adminCtx.post("/api/evaluations", {
          data: { studentId, rubricId: rid },
          headers: { "Content-Type": "application/json" },
        });
        expect(evRes.status()).toBe(201);
        const evaluationId = (await evRes.json()).evaluation.id;
        await adminCtx.put(`/api/evaluations/${evaluationId}`, {
          data: { scores: [{ criteriaId: crits[0].id, levelId: lvls[0].id }] },
          headers: { "Content-Type": "application/json" },
        });
        const publish = await adminCtx.post(`/api/evaluations/${evaluationId}/publish`);
        expect(publish.status()).toBe(200);
        return evaluationId;
      };

      // fisica v1 (score 4) y v2 (score 4) → stable; tactica v1 (score 4) → sin comparación
      await publishEval(rubricId, levels, criteria);
      await publishEval(rubricId, levels, criteria);
      await publishEval(rubric2Id, levels2, criteria2);

      // GET evolución
      const res = await studentCtx.get("/api/student/evolution");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.evolution).toHaveLength(2);

      const fisica = body.evolution.find((g: { category: string }) => g.category === "fisica");
      expect(fisica).toBeTruthy();
      expect(fisica.trend).toBe("stable");
      expect(fisica.items).toHaveLength(2);
      expect(fisica.items[0].version).toBe(1);
      expect(fisica.items[1].version).toBe(2);
      expect(fisica.items[1].rubricTitle).toBe("Rúbrica física");

      const tactica = body.evolution.find((g: { category: string }) => g.category === "tactica");
      expect(tactica).toBeTruthy();
      expect(tactica.trend).toBe("stable");
      expect(tactica.items).toHaveLength(1);

      // Verificación SQL real: versiones 1 y 2 persistidas
      const { rows: verRows } = await pool.query(
        `SELECT version FROM evaluations WHERE student_id = $1 AND rubric_id = $2 ORDER BY version`,
        [studentId, rubricId]
      );
      expect(verRows.map((r) => r.version)).toEqual([1, 2]);

      // ADMIN (coach) en endpoint alumno → 403
      expect((await adminCtx.get("/api/student/evolution")).status()).toBe(403);
    } finally {
      await adminCtx.dispose();
      await studentCtx.dispose();
    }
  });
});