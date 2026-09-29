/**
 * Happy-path API tests de evaluation.read (G13) con SQL real.
 * Verifica que la primera lectura crea notificación para el coach en `notifications`
 * y que re-leer no duplica (dedup por groupId = evaluationId).
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const COACH_EMAIL = `padel-evalread-happy-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-evalread-happy-student-${Date.now()}@test.local`;
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

test.describe("Evaluation read — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_EMAIL, password: COACH_PASSWORD });
    await createUser({ role: "USER", email: STUDENT_EMAIL, password: STUDENT_PASSWORD });
    // Cleanup leftover data from previous runs
    const pool = getPool();
    await pool.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [COACH_EMAIL]);
    await pool.query(`DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE student_id IN (SELECT id FROM users WHERE email = $1))`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM evaluations WHERE student_id IN (SELECT id FROM users WHERE email = $1)`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`, [COACH_EMAIL]);
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)
         OR student_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[COACH_EMAIL, STUDENT_EMAIL]]);
  });

  test("primera lectura crea notificación para el coach; re-leer no duplica", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const coachCtx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    const pool = getPool();
    try {
      // Seed: rúbrica + evaluación completa + publish
      const rubricRes = await coachCtx.post("/api/rubrics", {
        data: {
          title: "Rúbrica lectura",
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

      const post = await coachCtx.post("/api/evaluations", {
        data: { studentId, rubricId },
        headers: { "Content-Type": "application/json" },
      });
      const evaluationId = (await post.json()).evaluation.id;

      await coachCtx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId: criteria[0].id, levelId: levels[0].id }] },
        headers: { "Content-Type": "application/json" },
      });
      const publish = await coachCtx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);

      // Alumno lee por primera vez
      const studentCtx = await createAuthedContext(STUDENT_EMAIL, STUDENT_PASSWORD);
      try {
        const read = await studentCtx.post(`/api/student/evaluations/${evaluationId}/read`);
        expect(read.status()).toBe(200);
        const body = await read.json();
        expect(body.evaluation.id).toBe(evaluationId);
        expect(body.evaluation.readAt).toBeTruthy();

        // Verificación SQL real: notificación creada para el coach con groupId = evaluationId
        const { rows: notifRows } = await pool.query(
          `SELECT type, priority, category, group_id, title FROM notifications
           WHERE user_id = (SELECT id FROM users WHERE email = $1) AND group_id = $2`,
          [COACH_EMAIL, evaluationId]
        );
        expect(notifRows).toHaveLength(1);
        expect(notifRows[0].type).toBe("info");
        expect(notifRows[0].priority).toBe("P2");
        expect(notifRows[0].category).toBe("system");
        expect(notifRows[0].title).toBe("Evaluación leída");

        // Re-leer → idempotente 200 y NO duplica notificación (dedup groupId)
        const reread = await studentCtx.post(`/api/student/evaluations/${evaluationId}/read`);
        expect(reread.status()).toBe(200);
        const { rows: notifRows2 } = await pool.query(
          `SELECT id FROM notifications
           WHERE user_id = (SELECT id FROM users WHERE email = $1) AND group_id = $2`,
          [COACH_EMAIL, evaluationId]
        );
        expect(notifRows2).toHaveLength(1);
      } finally {
        await studentCtx.dispose();
      }
    } finally {
      await coachCtx.dispose();
    }
  });
});