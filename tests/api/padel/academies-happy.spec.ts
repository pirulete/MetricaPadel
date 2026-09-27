/**
 * Happy-path API tests de /api/academies (CRUD + logo) con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `academy-happy-${Date.now()}@test.local`;
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

test.describe("Academias — happy-path (SQL real)", () => {
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
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = $1`, [ADMIN_EMAIL]);
  });

  test("POST crea academia + OWNER + GET lista + GET detalle + PUT + logo + DELETE archive", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    const slug = `academy-happy-${Date.now()}`;
    try {
      // POST crea academia
      const post = await ctx.post("/api/academies", {
        data: { name: "Academia Happy", slug, primaryColor: "#16a34a" },
        headers: { "Content-Type": "application/json" },
      });
      expect(post.status()).toBe(201);
      const created = await post.json();
      const academyId = created.academy.id;
      expect(created.academy.slug).toBe(slug);
      expect(created.academy.primaryColor).toBe("#16a34a");

      // Verificación SQL real: academia + membresía OWNER activa
      const { rows: academyRows } = await pool.query(
        `SELECT name, status FROM academies WHERE id = $1`,
        [academyId]
      );
      expect(academyRows[0].status).toBe("active");
      const { rows: memberRows } = await pool.query(
        `SELECT role, status FROM academy_memberships WHERE academy_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)`,
        [academyId, ADMIN_EMAIL]
      );
      expect(memberRows[0].role).toBe("OWNER");
      expect(memberRows[0].status).toBe("active");

      // GET lista (el OWNER la ve)
      const list = await ctx.get("/api/academies");
      expect(list.status()).toBe(200);
      const listBody = await list.json();
      const found = listBody.academies.find((a: { id: string }) => a.id === academyId);
      expect(found).toBeTruthy();
      expect(found.role).toBe("OWNER");
      expect(found.memberCount).toBe(1);

      // GET detalle + myRole
      const detail = await ctx.get(`/api/academies/${academyId}`);
      expect(detail.status()).toBe(200);
      const detailBody = await detail.json();
      expect(detailBody.academy.name).toBe("Academia Happy");
      expect(detailBody.myRole).toBe("OWNER");

      // PUT actualiza branding
      const put = await ctx.put(`/api/academies/${academyId}`, {
        data: { name: "Academia Happy Renombrada", primaryColor: "#0ea5e9" },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(200);
      const putBody = await put.json();
      expect(putBody.academy.name).toBe("Academia Happy Renombrada");
      expect(putBody.academy.primaryColor).toBe("#0ea5e9");

      // POST logo (PNG 1x1 válido)
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );
      const logoRes = await ctx.post(`/api/academies/${academyId}/logo`, {
        multipart: {
          file: { name: "logo.png", mimeType: "image/png", buffer: png },
        },
      });
      expect(logoRes.status()).toBe(200);
      const logoBody = await logoRes.json();
      expect(logoBody.academy.logoUrl).toMatch(/^data:image\/png;base64,/);

      // Verificación SQL real: logoUrl persistido
      const { rows: logoRows } = await pool.query(
        `SELECT logo_url FROM academies WHERE id = $1`,
        [academyId]
      );
      expect(logoRows[0].logo_url).toMatch(/^data:image\/png;base64,/);

      // DELETE archiva (soft)
      const del = await ctx.delete(`/api/academies/${academyId}`);
      expect(del.status()).toBe(200);
      const delBody = await del.json();
      expect(delBody.academy.status).toBe("archived");

      // Verificación SQL real: status archived
      const { rows: archivedRows } = await pool.query(
        `SELECT status FROM academies WHERE id = $1`,
        [academyId]
      );
      expect(archivedRows[0].status).toBe("archived");

      // La academia archivada ya no aparece en la lista
      const listAfter = await ctx.get("/api/academies");
      const listAfterBody = await listAfter.json();
      expect(listAfterBody.academies.find((a: { id: string }) => a.id === academyId)).toBeFalsy();
    } finally {
      const pool2 = getPool();
      await pool2.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [ADMIN_EMAIL]
      );
      await pool2.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
        [ADMIN_EMAIL]
      );
    }
  });

  test("POST slug duplicado → 409", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const slug = `academy-dup-${Date.now()}`;
    try {
      const first = await ctx.post("/api/academies", {
        data: { name: "Primera", slug },
        headers: { "Content-Type": "application/json" },
      });
      expect(first.status()).toBe(201);

      const second = await ctx.post("/api/academies", {
        data: { name: "Segunda", slug },
        headers: { "Content-Type": "application/json" },
      });
      expect(second.status()).toBe(409);
    } finally {
      const pool = getPool();
      await pool.query(
        `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
        [ADMIN_EMAIL]
      );
      await pool.query(
        `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
        [ADMIN_EMAIL]
      );
    }
  });
});