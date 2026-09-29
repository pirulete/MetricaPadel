/**
 * Happy-path API tests de rúbricas institucionales (SPEC-EPIC-01).
 * Crear institucional (OWNER/ADMIN), COACH lee pero 403 en PUT/DELETE.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const OWNER_EMAIL = `rubric-owner-${Date.now()}@test.local`;
const OWNER_PASSWORD = "TestPass123!";
const COACH_EMAIL = `rubric-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";

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

test.describe("Institutional rubrics — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: OWNER_EMAIL, password: OWNER_PASSWORD });
    await createUser({ role: "ADMIN", email: COACH_EMAIL, password: COACH_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))))`,
      [OWNER_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
      [OWNER_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
      [OWNER_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [OWNER_EMAIL]
    );
    await pool.query(
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [OWNER_EMAIL]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [OWNER_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[OWNER_EMAIL, COACH_EMAIL]]);
  });

  test("OWNER crea institucional → COACH lee pero 403 PUT/DELETE", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ownerCtx = await createAuthedContext(OWNER_EMAIL, OWNER_PASSWORD);
    const coachCtx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    const pool = getPool();
    const slug = `rubric-academy-${Date.now()}`;
    try {
      // OWNER crea academia
      const post = await ownerCtx.post("/api/academies", {
        data: { name: "Academia Rúbricas", slug },
        headers: { "Content-Type": "application/json" },
      });
      const academyId = (await post.json()).academy.id;

      // OWNER invita al COACH y este acepta
      const invite = await ownerCtx.post(`/api/academies/${academyId}/members/invite`, {
        data: { email: COACH_EMAIL },
        headers: { "Content-Type": "application/json" },
      });
      expect(invite.status()).toBe(201);
      const coachUserId = (
        await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL])
      ).rows[0].id as string;
      const accept = await coachCtx.post(`/api/academies/${academyId}/members/${coachUserId}/accept`);
      expect(accept.status()).toBe(200);

      // OWNER crea rúbrica institucional
      const createRubric = await ownerCtx.post(`/api/academies/${academyId}/rubrics`, {
        data: {
          title: "Saque institucional",
          category: "tecnica_basica",
          criteria: [
            { name: "Precisión", descriptors: ["Excelente", "Bueno", "Aceptable", "En desarrollo"] },
          ],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(createRubric.status()).toBe(201);
      const rubricId = (await createRubric.json()).rubric.rubric.id;

      // Verificación SQL real: scope institutional + academyId
      const { rows: rubricRows } = await pool.query(
        `SELECT scope, academy_id FROM rubrics WHERE id = $1`,
        [rubricId]
      );
      expect(rubricRows[0].scope).toBe("institutional");
      expect(rubricRows[0].academy_id).toBe(academyId);

      // COACH lee la lista institucional
      const list = await coachCtx.get(`/api/academies/${academyId}/rubrics`);
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      expect(listBody.items.find((r: { id: string }) => r.id === rubricId)).toBeTruthy();

      // COACH puede leer el detalle de la rúbrica institucional (GET /api/rubrics/[id])
      const detail = await coachCtx.get(`/api/rubrics/${rubricId}`);
      expect(detail.status()).toBe(200);

      // COACH NO puede editar (403)
      const coachPut = await coachCtx.put(`/api/rubrics/${rubricId}`, {
        data: { title: "Hackeado" },
        headers: { "Content-Type": "application/json" },
      });
      expect(coachPut.status()).toBe(403);

      // COACH NO puede archivar (403)
      const coachDelete = await coachCtx.delete(`/api/rubrics/${rubricId}`);
      expect(coachDelete.status()).toBe(403);

      // OWNER sí puede editar
      const ownerPut = await ownerCtx.put(`/api/rubrics/${rubricId}`, {
        data: { title: "Saque institucional v2" },
        headers: { "Content-Type": "application/json" },
      });
      expect(ownerPut.status()).toBe(200);

      // COACH no puede crear rúbrica institucional (403)
      const coachCreate = await coachCtx.post(`/api/academies/${academyId}/rubrics`, {
        data: {
          title: "No permitido",
          category: "tactica",
          criteria: [
            { name: "Criterio", descriptors: ["a", "b", "c", "d"] },
          ],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(coachCreate.status()).toBe(403);
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))))`,
        [OWNER_EMAIL]
      );
      await pool2.query(
        `DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
        [OWNER_EMAIL]
      );
      await pool2.query(
        `DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
        [OWNER_EMAIL]
      );
      await pool2.query(
        `DELETE FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [OWNER_EMAIL]
      );
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [OWNER_EMAIL]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
        [OWNER_EMAIL]
      );
    }
  });
});