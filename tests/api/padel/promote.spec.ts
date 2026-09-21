/**
 * API tests de guards de promote (G3).
 * 401 sin sesión (sin DB); 403 de rol y 404 ya-ADMIN/inexistente con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-promote-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-promote-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";
const ADMIN2_EMAIL = `padel-promote-admin2-${Date.now()}@test.local`;
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

const UUID = "00000000-0000-0000-0000-000000000000";

test.describe("Promote — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("POST /api/admin/users/[id]/promote → 401", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/admin/users/${UUID}/promote`)).status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Promote — 403/404 (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    await createUser({ role: "ADMIN", email: ADMIN2_EMAIL, password: ADMIN2_PASSWORD });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
    await deleteUserByEmail(ADMIN2_EMAIL);
  });

  test("USER en endpoint coach → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    try {
      expect((await ctx.post(`/api/admin/users/${UUID}/promote`)).status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("404: usuario inexistente", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      expect((await ctx.post(`/api/admin/users/${UUID}/promote`)).status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });

  test("404: usuario ya ADMIN", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = await import("../admin/marketing/helpers").then((m) => m.getPool());
    try {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [ADMIN2_EMAIL]);
      const admin2Id = rows[0].id as string;
      expect((await ctx.post(`/api/admin/users/${admin2Id}/promote`)).status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});