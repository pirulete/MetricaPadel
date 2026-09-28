/**
 * Happy-path API tests de Evaluación en Pareja (SPEC-01) con SQL real:
 * create → save → publish → 2 filas, versiones independientes, auditoría,
 * independencia alumno (CA-03/04/05/06).
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-pair-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_A_EMAIL = `padel-pair-a-${Date.now()}@test.local`;
const STUDENT_B_EMAIL = `padel-pair-b-${Date.now()}@test.local`;
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

test.describe("Pair evaluations — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: STUDENT_A_EMAIL, password: STUDENT_PASSWORD });
    await createUser({ role: "USER", email: STUDENT_B_EMAIL, password: STUDENT_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM audit_logs WHERE action_type = 'PAIR_EVALUATION_PUBLISHED' AND user_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [
      [ADMIN_EMAIL, STUDENT_A_EMAIL, STUDENT_B_EMAIL],
    ]);
  });

  test("create → save → publish → 2 filas, versiones, auditoría, independencia", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // Seed: curso + 2 alumnos inscritos
      const courseRes = await ctx.post("/api/courses", {
        data: { name: "Curso pareja", level: "intermedio" },
        headers: { "Content-Type": "application/json" },
      });
      expect(courseRes.status()).toBe(201);
      const courseId = (await courseRes.json()).course.id;

      const { rows: aRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_A_EMAIL]);
      const { rows: bRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_B_EMAIL]);
      const studentAId = aRows[0].id as string;
      const studentBId = bRows[0].id as string;

      for (const studentId of [studentAId, studentBId]) {
        const add = await ctx.post(`/api/courses/${courseId}/students`, {
          data: { studentId },
          headers: { "Content-Type": "application/json" },
        });
        expect(add.status()).toBe(201);
      }

      // Seed: rúbrica con 2 criterios
      const rubricRes = await ctx.post("/api/rubrics", {
        data: {
          title: "Rúbrica pareja",
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

      // POST crea 2 borradores (CA-04)
      const post = await ctx.post("/api/evaluations/pair", {
        data: { studentAId, studentBId, rubricId, courseId },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const created = await post.json();
      expect(created.evaluationA.status).toBe("draft");
      expect(created.evaluationB.status).toBe("draft");
      expect(created.evaluationA.studentId).toBe(studentAId);
      expect(created.evaluationB.studentId).toBe(studentBId);
      expect(created.evaluationA.version).toBeNull();
      expect(created.evaluationB.version).toBeNull();
      const evaluationAId = created.evaluationA.id;
      const evaluationBId = created.evaluationB.id;

      // Verificación SQL real: 2 filas draft
      const { rows: draftRows } = await pool.query(
        `SELECT count(*)::int AS n FROM evaluations WHERE id = ANY($1) AND status = 'draft'`,
        [[evaluationAId, evaluationBId]]
      );
      expect(draftRows[0].n).toBe(2);

      // PUT guarda scores de ambos (criterio compartido: mismo level en ambos)
      const put = await ctx.put("/api/evaluations/pair", {
        data: {
          evaluationAId,
          evaluationBId,
          scoresA: [
            { criteriaId: criteria[0].id, levelId: levels[0].id },
            { criteriaId: criteria[1].id, levelId: levels[1].id },
          ],
          scoresB: [
            { criteriaId: criteria[0].id, levelId: levels[0].id },
            { criteriaId: criteria[1].id, levelId: levels[2].id },
          ],
          globalCommentA: "Comentario A",
          globalCommentB: "Comentario B",
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(200);
      const putBody = await put.json();
      expect(putBody.evaluationA.totalScore).toBe(levels[0].score + levels[1].score);
      expect(putBody.evaluationB.totalScore).toBe(levels[0].score + levels[2].score);

      // Verificación SQL real: scores persistidos por alumno
      const { rows: scoreRows } = await pool.query(
        `SELECT evaluation_id, count(*)::int AS n FROM evaluation_scores WHERE evaluation_id = ANY($1) GROUP BY evaluation_id`,
        [[evaluationAId, evaluationBId]]
      );
      expect(scoreRows).toHaveLength(2);
      for (const row of scoreRows) expect(row.n).toBe(2);

      // Publish incompleto no aplica (completo). Publicar pareja.
      const publish = await ctx.post("/api/evaluations/pair/publish", {
        data: { evaluationAId, evaluationBId, durationSeconds: 90 },
        headers: { "Content-Type": "application/json" },
      });
      expect(publish.status()).toBe(200);
      const publishBody = await publish.json();
      expect(publishBody.evaluationA.status).toBe("published");
      expect(publishBody.evaluationB.status).toBe("published");
      expect(publishBody.evaluationA.version).toBe(1);
      expect(publishBody.evaluationB.version).toBe(1);
      expect(publishBody.evaluationA.publishedAt).toBeTruthy();
      expect(publishBody.evaluationB.publishedAt).toBeTruthy();

      // Verificación SQL real: 2 filas published + versiones (CA-04/CA-05)
      const { rows: pubRows } = await pool.query(
        `SELECT student_id, status, version FROM evaluations WHERE id = ANY($1) ORDER BY student_id`,
        [[evaluationAId, evaluationBId]]
      );
      expect(pubRows).toHaveLength(2);
      for (const row of pubRows) {
        expect(row.status).toBe("published");
        expect(row.version).toBe(1);
      }

      // Auditoría PAIR_EVALUATION_PUBLISHED con payload (CA-06)
      const { rows: auditRows } = await pool.query(
        `SELECT new_values FROM audit_logs WHERE action_type = 'PAIR_EVALUATION_PUBLISHED' AND entity_id = $1`,
        [evaluationAId]
      );
      expect(auditRows).toHaveLength(1);
      const payload = auditRows[0].new_values;
      expect(payload.student_a_id).toBe(studentAId);
      expect(payload.student_b_id).toBe(studentBId);
      expect(payload.course_id).toBe(courseId);
      expect(payload.duration_seconds).toBe(90);
      // D7: criterio 0 compartido (mismo level), criterio 1 individual
      expect(payload.shared_criteria_count).toBe(1);
      expect(payload.individual_criteria_count).toBe(1);

      // Independencia alumno (CA-03): cada alumno ve solo su evaluación
      const ctxA = await createAuthedContext(STUDENT_A_EMAIL, STUDENT_PASSWORD);
      const ctxB = await createAuthedContext(STUDENT_B_EMAIL, STUDENT_PASSWORD);
      try {
        const listA = await ctxA.get("/api/student/evaluations");
        const listB = await ctxB.get("/api/student/evaluations");
        expect(listA.status()).toBe(200);
        expect(listB.status()).toBe(200);
        const bodyA = await listA.json();
        const bodyB = await listB.json();
        expect(bodyA.items.map((e: { id: string }) => e.id)).toContain(evaluationAId);
        expect(bodyA.items.map((e: { id: string }) => e.id)).not.toContain(evaluationBId);
        expect(bodyB.items.map((e: { id: string }) => e.id)).toContain(evaluationBId);
        expect(bodyB.items.map((e: { id: string }) => e.id)).not.toContain(evaluationAId);
      } finally {
        await ctxA.dispose();
        await ctxB.dispose();
      }

      // Re-publish → 400 not_draft (R6: retry tratado como éxito por el cliente)
      const republish = await ctx.post("/api/evaluations/pair/publish", {
        data: { evaluationAId, evaluationBId },
        headers: { "Content-Type": "application/json" },
      });
      expect(republish.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });
});