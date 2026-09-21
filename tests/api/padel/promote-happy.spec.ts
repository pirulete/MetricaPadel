/**
 * Happy-path API tests de promote (G3) con SQL real.
 * Verifica role ADMIN en DB + auditoría UPDATE.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-promote-happy-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-promote-happy-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";

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

test.describe("Promote — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM audit_logs WHERE entity_name = 'user' AND entity_id::uuid IN (SELECT id FROM users WHERE email = $1)`,
      [USER_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[ADMIN_EMAIL, USER_EMAIL]]);
  });

  test("POST promote cambia role a ADMIN en DB + audita UPDATE", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
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

      // Auditoría UPDATE registrada
      const { rows: auditRows } = await pool.query(
        `SELECT action_type, old_values, new_values FROM audit_logs
         WHERE entity_name = 'user' AND entity_id = $1 AND action_type = 'UPDATE'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      expect(auditRows[0].action_type).toBe("UPDATE");
      expect(auditRows[0].old_values.role).toBe("USER");
      expect(auditRows[0].new_values.role).toBe("ADMIN");

      // Re-promote → 404 (ya ADMIN)
      const again = await ctx.post(`/api/admin/users/${userId}/promote`);
      expect(again.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});