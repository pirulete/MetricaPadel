/**
 * API tests de guards de Academias (SPEC-EPIC-01).
 * 401 sin sesión (sin DB); 403 de rol y 404 IDOR con SQL real (skip graceful).
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

const ADMIN_EMAIL = `academy-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `academy-user-${Date.now()}@test.local`;
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

const UUID = "00000000-0000-0000-0000-000000000000";

test.describe("Academias — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("GET /api/academies → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/academies`)).status()).toBe(401);
  });

  test("POST /api/academies → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/academies`, {
      data: { name: "X", slug: "x-academy" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/academies/[id] → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/academies/${UUID}`)).status()).toBe(401);
  });

  test("PUT /api/academies/[id] → 401", async ({ request }) => {
    expect((await request.put(`${BASE_URL}/api/academies/${UUID}`)).status()).toBe(401);
  });

  test("DELETE /api/academies/[id] → 401", async ({ request }) => {
    expect((await request.delete(`${BASE_URL}/api/academies/${UUID}`)).status()).toBe(401);
  });

  test("POST /api/academies/[id]/logo → 401", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/academies/${UUID}/logo`)).status()).toBe(401);
  });

  test("POST /api/academies/[id]/members/invite → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/academies/${UUID}/members/invite`, {
      data: { email: "x@test.local" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/academies/[id]/members/[userId]/accept → 401", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/academies/${UUID}/members/${UUID}/accept`)).status()).toBe(401);
  });

  test("GET /api/academies/[id]/members → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/academies/${UUID}/members`)).status()).toBe(401);
  });

  test("DELETE /api/academies/[id]/members/[userId] → 401", async ({ request }) => {
    expect((await request.delete(`${BASE_URL}/api/academies/${UUID}/members/${UUID}`)).status()).toBe(401);
  });

  test("GET /api/academies/[id]/rubrics → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/academies/${UUID}/rubrics`)).status()).toBe(401);
  });

  test("POST /api/academies/[id]/rubrics → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/academies/${UUID}/rubrics`, {
      data: { title: "X", category: "tecnica_basica", criteria: [] },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/evaluations/[id]/pdf → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/evaluations/${UUID}/pdf`)).status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Academias — 403/404 con SQL real", () => {
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
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
  });

  test("POST /api/academies con USER → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const res = await ctx.post("/api/academies", {
      data: { name: "No permitido", slug: "no-permitido" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);
  });

  test("POST /api/academies con slug inválido → 400", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await ctx.post("/api/academies", {
      data: { name: "X", slug: "MAYÚSCULAS" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("GET /api/academies/[id] ajeno → 404 (anti-IDOR)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await ctx.get(`/api/academies/${UUID}`);
    expect(res.status()).toBe(404);
  });

  test("PUT /api/academies/[id] ajeno → 404 (anti-IDOR)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await ctx.put(`/api/academies/${UUID}`, {
      data: { name: "X" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(404);
  });
});