/**
 * API tests de notificaciones + push del usuario autenticado.
 * 401 sin sesión; happy-path con SQL real (skip graceful sin DATABASE_URL).
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

const USER_EMAIL = `notif-user-${Date.now()}@test.local`;
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

test.describe("User notifications — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("GET /api/user/notifications → 401", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/user/notifications`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/user/notifications/unread-count → 401", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/user/notifications/unread-count`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/user/notifications/preferences → 401", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/user/notifications/preferences`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/user/push/vapid-key → 401", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/user/push/vapid-key`);
    expect(res.status()).toBe(401);
  });

  test("POST /api/user/push/subscription → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/user/push/subscription`, {
      data: { endpoint: "https://example.com/push", p256dh: "x", auth: "y" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("User notifications — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(USER_EMAIL);
  });

  test("GET lista paginada + unread-count + mark-read + soft-delete", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const pool = getPool();
    try {
      // Seed directo: 2 notificaciones (1 leída, 1 no leída)
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE email = $1`,
        [USER_EMAIL]
      );
      const userId = rows[0].id as string;
      const seeded = await pool.query(
        `INSERT INTO notifications (user_id, type, priority, title, body, read, category, created_at)
         VALUES ($1, 'info', 'P2', 'Bienvenido', 'Hola', 0, 'account', now()),
                ($1, 'success', 'P3', 'Email verificado', 'Listo', 1, 'system', now())
         RETURNING id`,
        [userId]
      );
      const [unreadId, readId] = seeded.rows.map((r) => r.id as string);

      // Lista: 2 items, unread = 1
      const list = await ctx.get("/api/user/notifications");
      expect(list.status()).toBe(200);
      const body = await list.json();
      expect(body.items.length).toBe(2);
      expect(body.unread).toBe(1);

      // Filtro unread=true
      const unreadList = await ctx.get("/api/user/notifications?unread=true");
      const unreadBody = await unreadList.json();
      expect(unreadBody.items.length).toBe(1);
      expect(unreadBody.items[0].id).toBe(unreadId);

      // unread-count
      const countRes = await ctx.get("/api/user/notifications/unread-count");
      expect(countRes.status()).toBe(200);
      expect((await countRes.json()).count).toBe(1);

      // Batch mark-read
      const patch = await ctx.patch("/api/user/notifications", {
        data: { ids: [unreadId], read: true },
      });
      expect(patch.status()).toBe(200);
      expect((await patch.json()).updated).toBe(1);

      // Single mark-read (ya leída → 404 no aplica; PATCH sobre leída devuelve ok)
      const single = await ctx.patch(`/api/user/notifications/${readId}`, {
        data: { read: true },
      });
      expect(single.status()).toBe(200);

      // Soft-delete
      const del = await ctx.delete(`/api/user/notifications/${readId}`);
      expect(del.status()).toBe(200);
      const after = await ctx.get("/api/user/notifications");
      const afterBody = await after.json();
      expect(afterBody.items.length).toBe(1);

      // 404 sobre id inexistente
      const missing = await ctx.delete(
        "/api/user/notifications/00000000-0000-0000-0000-000000000000"
      );
      expect(missing.status()).toBe(404);

      // Limpieza
      await pool.query(`DELETE FROM notifications WHERE id = ANY($1)`, [[unreadId, readId]]);
    } finally {
      await ctx.dispose();
    }
  });

  test("preferencias GET/PUT upsert por canal/categoría", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const pool = getPool();
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [USER_EMAIL]);
      const userId = rows[0].id as string;

      const put = await ctx.put("/api/user/notifications/preferences", {
        data: { channel: "push", category: "marketing", enabled: false },
      });
      expect(put.status()).toBe(200);

      const get = await ctx.get("/api/user/notifications/preferences");
      expect(get.status()).toBe(200);
      const { preferences } = await get.json();
      const pref = preferences.find(
        (p: { channel: string; category: string }) =>
          p.channel === "push" && p.category === "marketing"
      );
      expect(pref).toBeTruthy();
      expect(pref.enabled).toBe(false);

      // Body inválido → 400
      const bad = await ctx.put("/api/user/notifications/preferences", {
        data: { channel: "push", category: "marketing", enabled: "no" },
      });
      expect(bad.status()).toBe(400);

      await pool.query(
        `DELETE FROM notification_preferences WHERE user_id = $1 AND channel = 'push' AND category = 'marketing'`,
        [userId]
      );
    } finally {
      await ctx.dispose();
    }
  });
});