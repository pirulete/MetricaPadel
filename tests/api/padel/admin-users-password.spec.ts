/**
 * API tests de guards de admin-users con password generada (G4).
 * 401 sin sesión; 403 de rol, 400 password corta, 409 duplicado con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
} from "../admin/marketing/helpers";

const ADMIN_EMAIL = `padel-pwd-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const USER_EMAIL = `padel-pwd-user-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";
const DUP_EMAIL = `padel-pwd-dup-${Date.now()}@test.local`;

let serverProbe: Promise<boolean> | null = null;

function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/providers`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

test.describe("Admin users password — 401 sin sesión", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("POST /api/admin/users → 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/users`, {
      data: { email: "x@test.local", firstName: "A", lastName: "B" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Admin users password — 403/400/409 (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    await createUser({ role: "USER", email: DUP_EMAIL, password: "PlayerPass123!" });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(USER_EMAIL);
    await deleteUserByEmail(DUP_EMAIL);
  });

  test("USER en endpoint coach → 403", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    try {
      const res = await ctx.post("/api/admin/users", {
        data: { email: "x@test.local", firstName: "A", lastName: "B" },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  test("400: password menor a 8 caracteres", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      const res = await ctx.post("/api/admin/users", {
        data: { email: "x@test.local", firstName: "A", lastName: "B", password: "short" },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });

  test("409: email duplicado", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      const res = await ctx.post("/api/admin/users", {
        data: { email: DUP_EMAIL, firstName: "A", lastName: "B" },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(409);
    } finally {
      await ctx.dispose();
    }
  });
});