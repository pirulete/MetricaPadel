/**
 * API tests de guards de ownership SUPER_ADMIN (v0.9).
 * 401 sin sesión; 403 de rol; 400/404 con SQL real (skip graceful).
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

const ADMIN_EMAIL = `owng-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `owng-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";
const SUPER_ADMIN_EMAIL = `owng-sa-${Date.now()}@test.local`;
const SUPER_ADMIN_PASSWORD = "TestPass123!";

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

test.describe("Academy ownership — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("POST /api/academies → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/academies`, {
      data: { name: "X", slug: "x-academy" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/academies/[id]/transfer-ownership → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/academies/${UUID}/transfer-ownership`, {
      data: { targetUserId: UUID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/academies/[id]/restore → 401", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/academies/${UUID}/restore`)).status()).toBe(401);
  });

  test("PUT /api/academies/[id]/members/[userId] → 401", async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/academies/${UUID}/members/${UUID}`, {
      data: { role: "ADMIN" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Academy ownership — 403/400/404 con SQL real", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  let academyId = "";

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    await createUser({ role: "SUPER_ADMIN", email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD });
    // Academia real para tests que validan body/roles (el guard corre ANTES de Zod).
    const saCtx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const res = await saCtx.post("/api/academies", {
      data: { name: "Academia Guard", slug: `own-guard-${Date.now()}` },
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok()) academyId = (await res.json()).academy.id;
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
      [[ADMIN_EMAIL, USER_EMAIL, SUPER_ADMIN_EMAIL]]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [[ADMIN_EMAIL, USER_EMAIL, SUPER_ADMIN_EMAIL]]
    );
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
    await deleteUserByEmail(SUPER_ADMIN_EMAIL);
  });

  test("POST /api/academies con ADMIN → 403 (guardSuperAdmin)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await ctx.post("/api/academies", {
      data: { name: "No permitido", slug: "no-permitido" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);
  });

  test("POST /api/academies/[id]/transfer-ownership con ADMIN → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await ctx.post(`/api/academies/${UUID}/transfer-ownership`, {
      data: { targetUserId: UUID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);
  });

  test("POST /api/academies/[id]/restore con ADMIN → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect((await ctx.post(`/api/academies/${UUID}/restore`)).status()).toBe(403);
  });

  test("POST /api/academies/[id]/transfer-ownership academia inexistente → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const res = await ctx.post(`/api/academies/${UUID}/transfer-ownership`, {
      data: { targetUserId: UUID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(404);
  });

  test("POST /api/academies/[id]/restore academia inexistente → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    expect((await ctx.post(`/api/academies/${UUID}/restore`)).status()).toBe(404);
  });

  test("POST /api/academies/[id]/transfer-ownership body inválido → 400", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const res = await ctx.post(`/api/academies/${academyId}/transfer-ownership`, {
      data: { targetUserId: "no-uuid" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("PUT /api/academies/[id]/members/[userId] con USER (sin membresía) → 404 anti-IDOR", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const res = await ctx.put(`/api/academies/${academyId}/members/${UUID}`, {
      data: { role: "ADMIN" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(404);
  });

  test("PUT /api/academies/[id]/members/[userId] academia inexistente → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const res = await ctx.put(`/api/academies/${UUID}/members/${UUID}`, {
      data: { role: "ADMIN" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(404);
  });

  test("PUT /api/academies/[id]/members/[userId] role inválido → 400", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const res = await ctx.put(`/api/academies/${academyId}/members/${UUID}`, {
      data: { role: "SUPER_ADMIN" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });
});