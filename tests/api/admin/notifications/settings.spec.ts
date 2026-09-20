/**
 * API tests de settings de notificaciones (admin).
 * 401 sin sesión, 403 con sesión USER, PUT happy-path con SQL real (skip graceful).
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAdminContext,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
  getPool,
} from "../marketing/helpers";

const ADMIN_EMAIL = `notif-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `notif-admin-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";

let serverProbe: Promise<boolean> | null = null;

function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/csrf`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

test.describe("Admin notifications settings — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("GET → 401", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/notifications/settings`);
    expect(res.status()).toBe(401);
  });

  test("PUT → 401", async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/admin/notifications/settings`, {
      data: { pushEnabled: true },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Admin notifications settings — 403 con sesión USER", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL para crear sesión USER (SQL real)", () => {});
  } else {
    test.beforeEach(async () => {
      test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    });

    test.beforeAll(async () => {
      await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    });

    test.afterAll(async () => {
      await deleteUserByEmail(USER_EMAIL);
    });

    test("GET y PUT → 403", async () => {
      const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
      try {
        const get = await ctx.get("/api/admin/notifications/settings");
        expect(get.status()).toBe(403);
        const put = await ctx.put("/api/admin/notifications/settings", {
          data: { inboxEnabled: false },
        });
        expect(put.status()).toBe(403);
      } finally {
        await ctx.dispose();
      }
    });
  }
});

test.describe("Admin notifications settings — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  let ctx: Awaited<ReturnType<typeof createAdminContext>>;

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    ctx = await createAdminContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test.afterAll(async () => {
    await ctx.dispose();
    await deleteUserByEmail(ADMIN_EMAIL);
  });

  test("GET defaults + PUT actualiza + auditoría registrada", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const pool = getPool();

    // Limpiar settings previos del test (hermético)
    await pool.query(
      `DELETE FROM marketing_settings WHERE key IN ('notifications.pushEnabled', 'notifications.inboxEnabled')`
    );

    // GET defaults
    const get = await ctx.get("/api/admin/notifications/settings");
    expect(get.status()).toBe(200);
    const defaults = await get.json();
    expect(typeof defaults.pushEnabled).toBe("boolean");
    expect(defaults.inboxEnabled).toBe(true);

    // PUT actualiza ambos toggles
    const put = await ctx.put("/api/admin/notifications/settings", {
      data: { pushEnabled: false, inboxEnabled: false },
    });
    expect(put.status()).toBe(200);
    expect((await put.json()).ok).toBe(true);

    // GET refleja el cambio
    const after = await ctx.get("/api/admin/notifications/settings");
    const updated = await after.json();
    expect(updated.pushEnabled).toBe(false);
    expect(updated.inboxEnabled).toBe(false);

    // Auditoría registrada (UPDATE notification_settings)
    const audit = await pool.query(
      `SELECT action_type, entity_name FROM audit_logs
       WHERE entity_name = 'notification_settings' AND entity_id = 'notifications.pushEnabled'
       ORDER BY created_at DESC LIMIT 1`
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0].action_type).toBe("UPDATE");

    // Body inválido → 400
    const bad = await ctx.put("/api/admin/notifications/settings", {
      data: { pushEnabled: "yes" },
    });
    expect(bad.status()).toBe(400);

    // Limpieza
    await pool.query(
      `DELETE FROM marketing_settings WHERE key IN ('notifications.pushEnabled', 'notifications.inboxEnabled')`
    );
  });
});