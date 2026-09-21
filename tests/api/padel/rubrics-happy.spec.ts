/**
 * Happy-path API tests de /api/rubrics (CRUD + archive) con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-admin-rubrics-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";

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

test.describe("Rubrics — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = $1`, [ADMIN_EMAIL]);
  });

  test("POST crea rúbrica con 4 niveles + GET detalle + PUT + DELETE archive", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      // POST crea rúbrica
      const post = await ctx.post("/api/rubrics", {
        data: {
          title: "Saque de padel",
          category: "tecnica_basica",
          criteria: [
            { name: "Precisión", descriptors: ["Excelente", "Bueno", "Aceptable", "En desarrollo"] },
            { name: "Potencia", descriptors: ["Alta", "Media", "Baja", "Muy baja"] },
          ],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const created = await post.json();
      const rubricId = created.rubric.rubric.id;
      expect(created.rubric.levels).toHaveLength(4);
      expect(created.rubric.criteria).toHaveLength(2);
      expect(created.rubric.descriptors).toHaveLength(8);
      expect(created.rubric.rubric.status).toBe("draft");

      // Verificación SQL real: 4 levels + 2 criteria + 8 descriptors
      const { rows: levelRows } = await pool.query(
        `SELECT count(*)::int AS n FROM rubric_levels WHERE rubric_id = $1`,
        [rubricId]
      );
      expect(levelRows[0].n).toBe(4);
      const { rows: descriptorRows } = await pool.query(
        `SELECT count(*)::int AS n FROM rubric_descriptors d
         JOIN rubric_criteria c ON c.id = d.criteria_id WHERE c.rubric_id = $1`,
        [rubricId]
      );
      expect(descriptorRows[0].n).toBe(8);

      // GET detalle
      const detail = await ctx.get(`/api/rubrics/${rubricId}`);
      expect(detail.status()).toBe(200);
      const detailBody = await detail.json();
      expect(detailBody.rubric.title).toBe("Saque de padel");
      expect(detailBody.criteria).toHaveLength(2);

      // GET lista
      const list = await ctx.get("/api/rubrics");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      const found = listBody.rubrics.find((r: { id: string }) => r.id === rubricId);
      expect(found).toBeTruthy();
      expect(found.criteriaCount).toBe(2);
      expect(found.levelCount).toBe(4);

      // PUT actualiza title + reemplaza criteria
      const put = await ctx.put(`/api/rubrics/${rubricId}`, {
        data: {
          title: "Saque mejorado",
          criteria: [
            { name: "Precisión", descriptors: ["A", "B", "C", "D"] },
          ],
        },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(200);
      const putBody = await put.json();
      expect(putBody.rubric.title).toBe("Saque mejorado");

      // DELETE archiva (soft)
      const del = await ctx.delete(`/api/rubrics/${rubricId}`);
      expect(del.status()).toBe(200);
      const delBody = await del.json();
      expect(delBody.rubric.status).toBe("archived");

      // Verificación SQL real: status archived
      const { rows: archivedRows } = await pool.query(
        `SELECT status FROM rubrics WHERE id = $1`,
        [rubricId]
      );
      expect(archivedRows[0].status).toBe("archived");

      // POST inválido → 400
      const bad = await ctx.post("/api/rubrics", {
        data: { title: "", category: "tecnica_basica", criteria: [] },
        headers: { "Content-Type": "application/json" },
      });
      expect(bad.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });
});