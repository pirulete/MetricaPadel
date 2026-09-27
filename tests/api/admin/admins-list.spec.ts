/**
 * API tests de GET /api/admin/admins — happy-path con SQL real + guards 401/403.
 * Verifica que lista ADMIN y SUPER_ADMIN con los campos esperados.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
} from "../admin/marketing/helpers";

const SUPER_ADMIN_EMAIL = `padel-admins-sa-${Date.now()}@test.local`;
const ADMIN_EMAIL = `padel-admins-admin-${Date.now()}@test.local`;
const USER_EMAIL = `padel-admins-user-${Date.now()}@test.local`;
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

test.describe("Admins list — guards 401/403", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("401 sin sesión", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/admin/admins`)).status()).toBe(401);
  });

  test("403 para USER y ADMIN", async () => {
    test.skip(!HAS_DB, "Requiere DATABASE_URL");
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: PASSWORD });
    const adminCtx = await createAuthedContext(ADMIN_EMAIL, PASSWORD);
    const userCtx = await createAuthedContext(USER_EMAIL, PASSWORD);
    try {
      expect((await adminCtx.get("/api/admin/admins")).status()).toBe(403);
      expect((await userCtx.get("/api/admin/admins")).status()).toBe(403);
    } finally {
      await adminCtx.dispose();
      await userCtx.dispose();
      await deleteUserByEmail(ADMIN_EMAIL);
      await deleteUserByEmail(USER_EMAIL);
    }
  });
});

test.describe("Admins list — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "SUPER_ADMIN", email: SUPER_ADMIN_EMAIL, password: PASSWORD });
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: PASSWORD });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(SUPER_ADMIN_EMAIL);
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
  });

  test("GET lista ADMIN y SUPER_ADMIN (no USER) con campos esperados", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, PASSWORD);
    try {
      const res = await ctx.get("/api/admin/admins");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.admins)).toBe(true);

      const emails = body.admins.map((a: { email: string }) => a.email);
      expect(emails).toContain(SUPER_ADMIN_EMAIL);
      expect(emails).toContain(ADMIN_EMAIL);
      expect(emails).not.toContain(USER_EMAIL);

      const sa = body.admins.find((a: { email: string }) => a.email === SUPER_ADMIN_EMAIL);
      expect(sa.role).toBe("SUPER_ADMIN");
      expect(sa.status).toBe("ACTIVE");
      expect(sa.id).toBeTruthy();
      expect(sa.createdAt).toBeTruthy();

      // Búsqueda por email (ILIKE)
      const searchRes = await ctx.get(`/api/admin/admins?search=${encodeURIComponent(ADMIN_EMAIL)}`);
      expect(searchRes.status()).toBe(200);
      const searchBody = await searchRes.json();
      expect(searchBody.admins.some((a: { email: string }) => a.email === ADMIN_EMAIL)).toBe(true);
    } finally {
      await ctx.dispose();
    }
  });
});