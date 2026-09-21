/**
 * API tests G10 — CRUD admin users (PUT update, DELETE soft-lock, unlock).
 * Happy-path con SQL real + guards (400 self-lock, 403 other ADMIN, 404).
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

const ADMIN_EMAIL = `padel-crud-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const PLAYER_EMAIL = `padel-crud-player-${Date.now()}@test.local`;
const PLAYER_PASSWORD = "TestPass123!";
const ADMIN2_EMAIL = `padel-crud-admin2-${Date.now()}@test.local`;
const ADMIN2_PASSWORD = "TestPass123!";

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

test.describe("Admin users CRUD — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("PUT /api/admin/users/[id] → 401", async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/admin/users/${UUID}`, {
      data: { firstName: "X" },
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/admin/users/[id] → 401", async ({ request }) => {
    expect((await request.delete(`${BASE_URL}/api/admin/users/${UUID}`)).status()).toBe(401);
  });
});

test.describe("Admin users CRUD — happy-path y guards (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: PLAYER_EMAIL, password: PLAYER_PASSWORD });
    await createUser({ role: "ADMIN", email: ADMIN2_EMAIL, password: ADMIN2_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM audit_logs WHERE entity_name = 'user' AND entity_id::uuid IN (SELECT id FROM users WHERE email = ANY($1))`,
      [[ADMIN_EMAIL, PLAYER_EMAIL, ADMIN2_EMAIL]]
    );
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(PLAYER_EMAIL);
    await deleteUserByEmail(ADMIN2_EMAIL);
  });

  test("PUT actualiza firstName/lastName/phone → 200 + verificación SQL + auditoría", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [PLAYER_EMAIL]);
      const userId = rows[0].id as string;

      const res = await ctx.put(`/api/admin/users/${userId}`, {
        data: { firstName: "Lucas", lastName: "García", phone: "+34600111222" },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.user.firstName).toBe("Lucas");
      expect(body.user.lastName).toBe("García");
      expect(body.user.phone).toBe("+34600111222");

      // Verificación SQL real
      const { rows: userRows } = await pool.query(
        `SELECT first_name, last_name, phone FROM users WHERE id = $1`,
        [userId]
      );
      expect(userRows[0].first_name).toBe("Lucas");
      expect(userRows[0].last_name).toBe("García");
      expect(userRows[0].phone).toBe("+34600111222");

      // Auditoría UPDATE registrada
      const { rows: auditRows } = await pool.query(
        `SELECT action_type, old_values, new_values FROM audit_logs
         WHERE entity_name = 'user' AND entity_id = $1 AND action_type = 'UPDATE'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      expect(auditRows[0].action_type).toBe("UPDATE");
      expect(auditRows[0].new_values.firstName).toBe("Lucas");

      // PUT inválido → 400
      const bad = await ctx.put(`/api/admin/users/${userId}`, {
        data: {},
        headers: { "Content-Type": "application/json" },
      });
      expect(bad.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });

  test("DELETE bloquea usuario → 200 + status=LOCKED en DB + auditoría", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [PLAYER_EMAIL]);
      const userId = rows[0].id as string;

      const res = await ctx.delete(`/api/admin/users/${userId}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.user.status).toBe("LOCKED");

      // Verificación SQL real
      const { rows: userRows } = await pool.query(`SELECT status FROM users WHERE id = $1`, [userId]);
      expect(userRows[0].status).toBe("LOCKED");

      // Auditoría UPDATE (ACTIVE → LOCKED)
      const { rows: auditRows } = await pool.query(
        `SELECT action_type, old_values, new_values FROM audit_logs
         WHERE entity_name = 'user' AND entity_id = $1 AND action_type = 'UPDATE'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      expect(auditRows[0].old_values.status).toBe("ACTIVE");
      expect(auditRows[0].new_values.status).toBe("LOCKED");

      // POST unlock → 200 + status=ACTIVE
      const unlock = await ctx.post(`/api/admin/users/${userId}`);
      expect(unlock.status()).toBe(200);
      const unlockBody = await unlock.json();
      expect(unlockBody.user.status).toBe("ACTIVE");
      const { rows: afterUnlock } = await pool.query(`SELECT status FROM users WHERE id = $1`, [userId]);
      expect(afterUnlock[0].status).toBe("ACTIVE");
    } finally {
      await ctx.dispose();
    }
  });

  test("DELETE no puede bloquearte a ti mismo → 400", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [ADMIN_EMAIL]);
      const adminId = rows[0].id as string;
      const res = await ctx.delete(`/api/admin/users/${adminId}`);
      expect(res.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });

  test("DELETE no puede bloquear a otro ADMIN → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [ADMIN2_EMAIL]);
      const admin2Id = rows[0].id as string;
      const res = await ctx.delete(`/api/admin/users/${admin2Id}`);
      expect(res.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("DELETE usuario inexistente → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      expect((await ctx.delete(`/api/admin/users/${UUID}`)).status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });

  test("USER sin rol ADMIN → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(PLAYER_EMAIL, PLAYER_PASSWORD);
    try {
      expect((await ctx.put(`/api/admin/users/${UUID}`, { data: { firstName: "X" } })).status()).toBe(403);
      expect((await ctx.delete(`/api/admin/users/${UUID}`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });
});