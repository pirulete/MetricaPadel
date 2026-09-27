/**
 * API tests de promote (Super Admin) — happy-path con SQL real + guards 401/403.
 * Verifica role ADMIN en DB + auditoría ADMIN_PROMOTED.
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

const SUPER_ADMIN_EMAIL = `padel-promote-sa-${Date.now()}@test.local`;
const ADMIN_EMAIL = `padel-promote-admin-${Date.now()}@test.local`;
const USER_EMAIL = `padel-promote-user-${Date.now()}@test.local`;
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
const UUID = "00000000-0000-0000-0000-000000000000";

test.describe("Promote — guards 401/403", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("401 sin sesión", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/admin/users/${UUID}/promote`)).status()).toBe(401);
  });

  test("403 para ADMIN (ya no puede promover, AC-01)", async () => {
    test.skip(!HAS_DB, "Requiere DATABASE_URL");
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: PASSWORD });
    const ctx = await createAuthedContext(ADMIN_EMAIL, PASSWORD);
    try {
      expect((await ctx.post(`/api/admin/users/${UUID}/promote`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
      await deleteUserByEmail(ADMIN_EMAIL);
    }
  });
});

test.describe("Promote — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "SUPER_ADMIN", email: SUPER_ADMIN_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM audit_logs WHERE entity_name = 'user' AND entity_id::uuid IN (SELECT id FROM users WHERE email = $1)`,
      [USER_EMAIL]
    );
    await deleteUserByEmail(SUPER_ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
  });

  test("POST promote cambia role a ADMIN en DB + audita ADMIN_PROMOTED", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL]);
      const userId = rows[0].id as string;

      const res = await ctx.post(`/api/admin/users/${userId}/promote`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.user.id).toBe(userId);
      expect(body.user.role).toBe("ADMIN");

      // Verificación SQL real: role ADMIN
      const { rows: userRows } = await pool.query(
        `SELECT role FROM users WHERE id = $1`,
        [userId]
      );
      expect(userRows[0].role).toBe("ADMIN");

      // Auditoría ADMIN_PROMOTED registrada
      const { rows: auditRows } = await pool.query(
        `SELECT action_type, new_values, metadata FROM audit_logs
         WHERE entity_name = 'user' AND entity_id = $1 AND action_type = 'ADMIN_PROMOTED'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      expect(auditRows[0].action_type).toBe("ADMIN_PROMOTED");
      expect(auditRows[0].new_values.role).toBe("ADMIN");
      expect(auditRows[0].metadata.superAdmin).toBe(true);

      // Re-promote → 404 (ya ADMIN)
      const again = await ctx.post(`/api/admin/users/${userId}/promote`);
      expect(again.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});