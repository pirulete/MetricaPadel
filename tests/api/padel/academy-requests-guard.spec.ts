/**
 * API tests de guards de /api/academy-requests (v0.9).
 * 401 sin sesión; 403 de rol; 400/404/409 con SQL real (skip graceful).
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

const COACH_EMAIL = `reqg-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const USER_EMAIL = `reqg-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";
const SUPER_ADMIN_EMAIL = `reqg-sa-${Date.now()}@test.local`;
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

test.describe("Academy requests — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("POST /api/academy-requests → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/academy-requests`, {
      data: { type: "join_academy", academyId: UUID, requestedRole: "COACH" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/academy-requests → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/academy-requests`)).status()).toBe(401);
  });

  test("POST /api/academy-requests/[id]/approve → 401", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/academy-requests/${UUID}/approve`)).status()).toBe(401);
  });

  test("POST /api/academy-requests/[id]/reject → 401", async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/academy-requests/${UUID}/reject`)).status()).toBe(401);
  });

  test("GET /api/academy-requests/available-academies → 401", async ({ request }) => {
    expect((await request.get(`${BASE_URL}/api/academy-requests/available-academies`)).status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Academy requests — 403/400/404/409 con SQL real", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: COACH_EMAIL, password: COACH_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    await createUser({ role: "SUPER_ADMIN", email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM academy_access_requests WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [[COACH_EMAIL, USER_EMAIL]]
    );
    await pool.query(
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1)))`,
      [[COACH_EMAIL, USER_EMAIL, SUPER_ADMIN_EMAIL]]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [[COACH_EMAIL, USER_EMAIL, SUPER_ADMIN_EMAIL]]
    );
    await deleteUserByEmail(COACH_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
    await deleteUserByEmail(SUPER_ADMIN_EMAIL);
  });

  test("POST /api/academy-requests con USER → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const res = await ctx.post("/api/academy-requests", {
      data: { type: "join_academy", academyId: UUID, requestedRole: "COACH" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);
  });

  test("GET /api/academy-requests con ADMIN → 403 (solo SUPER_ADMIN)", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    expect((await ctx.get("/api/academy-requests")).status()).toBe(403);
  });

  test("POST /api/academy-requests/[id]/approve con ADMIN → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    expect((await ctx.post(`/api/academy-requests/${UUID}/approve`)).status()).toBe(403);
  });

  test("POST /api/academy-requests/[id]/reject con ADMIN → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    expect((await ctx.post(`/api/academy-requests/${UUID}/reject`)).status()).toBe(403);
  });

  test("GET /api/academy-requests/available-academies con USER → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    expect((await ctx.get("/api/academy-requests/available-academies")).status()).toBe(403);
  });

  test("POST join a academia inexistente → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    const res = await ctx.post("/api/academy-requests", {
      data: { type: "join_academy", academyId: UUID, requestedRole: "COACH" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(404);
  });

  test("POST body inválido (requestedRole OWNER en join) → 400", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    // Zod corre ANTES del check de academia → 400 aunque la academia no exista.
    const ctx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    const res = await ctx.post("/api/academy-requests", {
      data: { type: "join_academy", academyId: UUID, requestedRole: "OWNER" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST create duplicado pendiente → 409", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(COACH_EMAIL, COACH_PASSWORD);
    const slug = `reqg-dup-${Date.now()}`;
    try {
      const first = await ctx.post("/api/academy-requests", {
        data: { type: "create_academy", name: "Dup", slug },
        headers: { "Content-Type": "application/json" },
      });
      expect(first.status()).toBe(201);

      const second = await ctx.post("/api/academy-requests", {
        data: { type: "create_academy", name: "Dup", slug },
        headers: { "Content-Type": "application/json" },
      });
      expect(second.status()).toBe(409);
    } finally {
      const pool = getPool();
      await pool.query(
        `DELETE FROM academy_access_requests WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
        [COACH_EMAIL]
      );
    }
  });

  test("approve solicitud inexistente → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    expect((await ctx.post(`/api/academy-requests/${UUID}/approve`)).status()).toBe(404);
  });

  test("reject solicitud inexistente → 404", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    expect((await ctx.post(`/api/academy-requests/${UUID}/reject`)).status()).toBe(404);
  });
});