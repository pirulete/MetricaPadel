/**
 * API tests de GET /api/admin/academies (global) — happy-path con SQL real + guards 401/403.
 * Verifica que lista TODAS las academias con owner y métricas (memberCount, rubricCount).
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
  getPool,
} from "../admin/marketing/helpers";

const SUPER_ADMIN_EMAIL = `padel-acad-sa-${Date.now()}@test.local`;
const ADMIN_EMAIL = `padel-acad-admin-${Date.now()}@test.local`;
const PASSWORD = "TestPass123!";

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

test.describe("Academies global — guards 401/403", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("401 sin sesión", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/admin/academies`)).status()).toBe(401);
  });

  test("403 para ADMIN", async () => {
    test.skip(!HAS_DB, "Requiere DATABASE_URL");
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: PASSWORD });
    const ctx = await createAuthedContext(ADMIN_EMAIL, PASSWORD);
    try {
      expect((await ctx.get("/api/admin/academies")).status()).toBe(403);
    } finally {
      await ctx.dispose();
      await deleteUserByEmail(ADMIN_EMAIL);
    }
  });
});

test.describe("Academies global — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "SUPER_ADMIN", email: SUPER_ADMIN_EMAIL, password: PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE slug LIKE 'padel-acad-test-%')`
    );
    await pool.query(`DELETE FROM academies WHERE slug LIKE 'padel-acad-test-%'`);
    await deleteUserByEmail(SUPER_ADMIN_EMAIL);
  });

  test("GET lista todas las academias con owner y métricas", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, PASSWORD);
    const pool = getPool();
    try {
      // Crea una academia de prueba con owner = SUPER_ADMIN + membresía OWNER
      const { rows: saRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [SUPER_ADMIN_EMAIL]);
      const saId = saRows[0].id as string;
      const slug = `padel-acad-test-${Date.now()}`;
      const { rows: acadRows } = await pool.query(
        `INSERT INTO academies (id, owner_id, name, slug, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'Academia Test', $2, 'active', now(), now())
         RETURNING id`,
        [saId, slug]
      );
      const academyId = acadRows[0].id as string;
      await pool.query(
        `INSERT INTO academy_memberships (id, academy_id, user_id, role, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'OWNER', 'active', now(), now())`,
        [academyId, saId]
      );

      const res = await ctx.get("/api/admin/academies");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.academies)).toBe(true);

      const acad = body.academies.find((a: { slug: string }) => a.slug === slug);
      expect(acad).toBeTruthy();
      expect(acad.name).toBe("Academia Test");
      expect(acad.status).toBe("active");
      expect(acad.ownerId).toBe(saId);
      expect(acad.ownerEmail).toBe(SUPER_ADMIN_EMAIL);
      expect(acad.memberCount).toBeGreaterThanOrEqual(1);
      expect(typeof acad.rubricCount).toBe("number");
    } finally {
      await ctx.dispose();
    }
  });
});