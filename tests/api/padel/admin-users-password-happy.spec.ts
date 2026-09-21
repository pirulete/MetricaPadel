/**
 * Happy-path API tests de admin-users con password generada (G4) con SQL real.
 * Sin password → generatedPassword + login real con ella; con password → sin generatedPassword.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  deleteUserByEmail,
  getPool,
  signIn,
} from "../admin/marketing/helpers";
import { request as pwRequest } from "@playwright/test";

const ADMIN_EMAIL = `padel-pwd-happy-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const GEN_EMAIL = `padel-pwd-happy-gen-${Date.now()}@test.local`;
const EXPLICIT_EMAIL = `padel-pwd-happy-exp-${Date.now()}@test.local`;

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

test.describe("Admin users password — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "ADMIN", email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  test.afterAll(async () => {
    await deleteUserByEmail(ADMIN_EMAIL);
    await deleteUserByEmail(GEN_EMAIL);
    await deleteUserByEmail(EXPLICIT_EMAIL);
  });

  test("sin password → generatedPassword + login real con ella", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const pool = getPool();
    try {
      const res = await ctx.post("/api/admin/users", {
        data: { email: GEN_EMAIL, firstName: "Gen", lastName: "Password" },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.user.role).toBe("USER");
      expect(body.user.status).toBe("ACTIVE");
      expect(body.generatedPassword).toBeTruthy();
      expect(body.generatedPassword).toHaveLength(12);
      expect(body.generatedPassword).toMatch(/[A-Z]/);
      expect(body.generatedPassword).toMatch(/[a-z]/);
      expect(body.generatedPassword).toMatch(/[0-9]/);
      expect(body.generatedPassword).not.toMatch(/[Il0O1]/);

      // Verificación SQL real: hash bcrypt presente (nunca password en claro)
      const { rows } = await pool.query(
        `SELECT password_hash FROM users WHERE email = $1`,
        [GEN_EMAIL]
      );
      expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
      expect(rows[0].password_hash).not.toContain(body.generatedPassword);

      // Login real con la password generada
      const loginCtx = await pwRequest.newContext({ baseURL: BASE_URL });
      await signIn(loginCtx, GEN_EMAIL, body.generatedPassword);
      const session = await loginCtx.get("/api/auth/session");
      expect(session.ok()).toBe(true);
      const sessionBody = await session.json();
      expect(sessionBody.user.email).toBe(GEN_EMAIL);
      await loginCtx.dispose();
    } finally {
      await ctx.dispose();
    }
  });

  test("con password explícita → sin generatedPassword", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      const res = await ctx.post("/api/admin/users", {
        data: { email: EXPLICIT_EMAIL, firstName: "Exp", lastName: "Password", password: "MiClaveSegura123!" },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.generatedPassword).toBeUndefined();
      expect(body.user.email).toBe(EXPLICIT_EMAIL);
    } finally {
      await ctx.dispose();
    }
  });
});