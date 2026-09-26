/**
 * Happy-path API tests de GET /api/evaluations/[id]/pdf (SPEC-EPIC-01).
 * PDF válido con branding de academia + 400 si draft + 404 si ajeno.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const COACH_EMAIL = `pdf-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `pdf-student-${Date.now()}@test.local`;
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

test.describe("Evaluation PDF — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_EMAIL, password: COACH_PASSWORD });
    await createUser({ role: "USER", email: STUDENT_EMAIL, password: STUDENT_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[COACH_EMAIL, STUDENT_EMAIL]]);
  });

  test("PDF válido con branding de academia + draft 400 + ajeno 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const coachCtx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    const studentCtx = await createAuthedContext(STUDENT_EMAIL, STUDENT_PASSWORD);
    const pool = getPool();
    const slug = `pdf-academy-${Date.now()}`;
    try {
      // Coach crea academia (branding para el PDF)
      const academyRes = await coachCtx.post("/api/academies", {
        data: { name: "Academia PDF", slug, primaryColor: "#7c3aed" },
        headers: { "Content-Type": "application/json" },
      });
      expect(academyRes.status()).toBe(201);

      // Coach crea rúbrica institucional (academyId → branding en PDF)
      const rubricRes = await coachCtx.post(`/api/academies/${(await academyRes.json()).academy.id}/rubrics`, {
        data: {
          title: "Rúbrica PDF",
          category: "tecnica_basica",
          criteria: [{ name: "Saque", descriptors: ["Excelente", "Bueno", "Aceptable", "En desarrollo"] }],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(rubricRes.status()).toBe(201);
      const rubricId = (await rubricRes.json()).rubric.rubric.id;

      // Coach crea evaluación draft
      const studentId = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL])
      ).rows[0].id as string;
      const evalRes = await coachCtx.post("/api/evaluations", {
        data: { studentId, rubricId },
        headers: { "Content-Type": "application/json" },
      });
      expect(evalRes.status()).toBe(201);
      const evaluationId = (await evalRes.json()).evaluation.id;

      // Draft → 400
      const draftPdf = await coachCtx.get(`/api/evaluations/${evaluationId}/pdf`);
      expect(draftPdf.status()).toBe(400);

      // Guarda scores + publica
      const criteriaId = (
        await pool.query(`SELECT id FROM rubric_criteria WHERE rubric_id = $1`, [rubricId])
      ).rows[0].id as string;
      const levelId = (
        await pool.query(`SELECT id FROM rubric_levels WHERE rubric_id = $1 AND score = 4`, [rubricId])
      ).rows[0].id as string;
      const saveRes = await coachCtx.put(`/api/evaluations/${evaluationId}`, {
        data: { scores: [{ criteriaId, levelId }], globalComment: "Buen saque" },
        headers: { "Content-Type": "application/json" },
      });
      expect(saveRes.status()).toBe(200);
      const publishRes = await coachCtx.post(`/api/evaluations/${evaluationId}/publish`);
      expect(publishRes.status()).toBe(200);

      // PDF válido (coach)
      const pdfRes = await coachCtx.get(`/api/evaluations/${evaluationId}/pdf`);
      expect(pdfRes.status()).toBe(200);
      expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
      expect(pdfRes.headers()["content-disposition"]).toContain("attachment");
      const pdfBytes = await pdfRes.body();
      expect(pdfBytes.length).toBeGreaterThan(100);
      expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF");

      // PDF válido (student, guardUser)
      const studentPdf = await studentCtx.get(`/api/evaluations/${evaluationId}/pdf`);
      expect(studentPdf.status()).toBe(200);

      // Ajeno → 404 (otro coach sin relación)
      const otherEmail = `pdf-other-${Date.now()}@test.local`;
      await createUser({ role: "ADMIN", email: otherEmail, password: COACH_PASSWORD });
      const otherCtx = await createAuthedContext(otherEmail, COACH_PASSWORD);
      const otherPdf = await otherCtx.get(`/api/evaluations/${evaluationId}/pdf`);
      expect(otherPdf.status()).toBe(404);
      await pool.query(`DELETE FROM users WHERE email = $1`, [otherEmail]);
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1))`,
        [COACH_EMAIL]
      );
      await pool2.query(
        `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`,
        [COACH_EMAIL]
      );
      await pool2.query(
        `DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))))`,
        [COACH_EMAIL]
      );
      await pool2.query(
        `DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
        [COACH_EMAIL]
      );
      await pool2.query(
        `DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
        [COACH_EMAIL]
      );
      await pool2.query(
        `DELETE FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [COACH_EMAIL]
      );
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [COACH_EMAIL]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
        [COACH_EMAIL]
      );
    }
  });
});