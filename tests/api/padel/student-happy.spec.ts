/**
 * Happy-path API tests de /api/student/evaluations (lista, detalle, mark-read)
 * con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-admin-student-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `padel-student-view-${Date.now()}@test.local`;
const STUDENT_PASSWORD = "TestPass123!";

let serverProbe: Promise<boolean> | null = null;

function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/csrf`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Student evaluations — happy-path (SQL real)", () => {
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

  test("alumno ve lista published + detalle enriquecido + mark-read", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const studentCtx = await createAuthedContext(STUDENT_EMAIL, STUDENT_PASSWORD);
    const pool = getPool();
    try {
      // Seed: rúbrica + evaluación publicada vía API coach
      const rubricRes = await adminCtx.post("/api/rubrics", {
        data: {
          title: "Rúbrica alumno",
          category: "fisica",
          criteria: [
            { name: "Resistencia", descriptors: ["A", "B", "C", "D"] },
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

      const evRes = await adminCtx.post("/api/evaluations", {
        data: { studentId, rubricId },
        headers: { "Content-Type": "application/json" },
      });
      const evaluationId = (await evRes.json()).evaluation.id;

      await adminCtx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId: criteria[0].id, levelId: levels[0].id }] },
        headers: { "Content-Type": "application/json" },
      });
      const publish = await adminCtx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publish.status()).toBe(200);

      // Lista alumno: solo published
      const list = await studentCtx.get("/api/student/evaluations");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      const found = listBody.evaluations.find((e: { id: string }) => e.id === evaluationId);
      expect(found).toBeTruthy();
      expect(found.rubricTitle).toBe("Rúbrica alumno");
      expect(found.readAt).toBeNull();

      // Detalle enriquecido
      const detail = await studentCtx.get(`/api/student/evaluations/${evaluationId}`);
      expect(detail.status()).toBe(200);
      const detailBody = await detail.json();
      expect(detailBody.rubric.title).toBe("Rúbrica alumno");
      expect(detailBody.scores).toHaveLength(1);
      expect(detailBody.scores[0].criterionName).toBe("Resistencia");
      expect(detailBody.scores[0].levelName).toBe(levels[0].name);
      expect(detailBody.scores[0].descriptor).toBeTruthy();

      // Mark-read (idempotente)
      const read = await studentCtx.post(`/api/student/evaluations/${evaluationId}/read`);
      expect(read.status()).toBe(200);
      const readBody = await read.json();
      expect(readBody.evaluation.readAt).toBeTruthy();

      // Verificación SQL real: read_at seteado
      const { rows: evRows } = await pool.query(
        `SELECT read_at FROM evaluations WHERE id = $1`,
        [evaluationId]
      );
      expect(evRows[0].read_at).toBeTruthy();

      // IDOR: alumno no ve evaluación de otro (404)
      const other = await studentCtx.get(
        "/api/student/evaluations/00000000-0000-0000-0000-000000000000"
      );
      expect(other.status()).toBe(404);
    } finally {
      await adminCtx.dispose();
      await studentCtx.dispose();
    }
  });
});