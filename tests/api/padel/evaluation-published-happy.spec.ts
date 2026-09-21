/**
 * Happy-path API tests de evaluation-published (G9) con SQL real.
 * Verifica notificación creada en `notifications` para studentId + aparece en dashboard/student.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-evalpub-happy-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-evalpub-happy-student-${Date.now()}@test.local`;
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

test.describe("Evaluation published — happy-path (SQL real)", () => {
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

  test("publish crea notificación para el alumno + aparece en dashboard/student", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // Seed: rúbrica + evaluación completa
      const rubricRes = await ctx.post("/api/rubrics", {
        data: {
          title: "Rúbrica notificación",
          category: "tecnica_basica",
          criteria: [{ name: "Saque", descriptors: ["A", "B", "C", "D"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      const rubric = await rubricRes.json();
      const rubricId = rubric.rubric.rubric.id;
      const levels = rubric.rubric.levels;
      const criteria = rubric.rubric.criteria;

      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
      const studentId = rows[0].id as string;

      const post = await ctx.post("/api/evaluations", {
        data: { studentId, rubricId },
        headers: { "Content-Type": "application/json" },
      });
      const evaluationId = (await post.json()).evaluation.id;

      await ctx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId: criteria[0].id, levelId: levels[0].id }] },
        headers: { "Content-Type": "application/json" },
      });

      // Publish OK
      const publish = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);

      // Verificación SQL real: notificación creada para studentId con groupId = evaluationId
      const { rows: notifRows } = await pool.query(
        `SELECT type, priority, category, group_id, cta_url FROM notifications
         WHERE user_id = $1 AND group_id = $2`,
        [studentId, evaluationId]
      );
      expect(notifRows).toHaveLength(1);
      expect(notifRows[0].type).toBe("success");
      expect(notifRows[0].priority).toBe("P1");
      expect(notifRows[0].category).toBe("system");
      expect(notifRows[0].cta_url).toBe(`/evaluaciones/${evaluationId}`);

      // Re-publish → dedup: no duplica (misma groupId en ventana 1h)
      const republish = await ctx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(republish.status()).toBe(400); // ya publicada → not_draft

      // Aparece en dashboard/student del alumno
      const studentCtx = await createAuthedContext(STUDENT_EMAIL, STUDENT_PASSWORD);
      try {
        const dash = await studentCtx.get("/api/dashboard/student");
        expect(dash.status()).toBe(200);
        const dashBody = await dash.json();
        const notif = dashBody.notifications.find(
          (n: { groupId: string }) => n.groupId === evaluationId
        );
        expect(notif).toBeTruthy();
        expect(notif.title).toBe("Nueva evaluación publicada");
      } finally {
        await studentCtx.dispose();
      }
    } finally {
      await ctx.dispose();
    }
  });
});