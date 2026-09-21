/**
 * Happy-path API tests de /api/user/profile + /api/user/password (G5) con SQL real.
 * @group api
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createAuthedContext,
  createUser,
  getPool,
} from "../admin/marketing/helpers";

const USER_EMAIL = `padel-profile-happy-${Date.now()}@test.local`;
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

const HAS_DB = Boolean(process.env.DATABASE_URL);

test.describe("Profile + Password — happy-path (SQL real)", () => {
  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (SQL real contra NeonDB)", () => {});
    return;
  }

  test.beforeAll(async () => {
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.afterAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM users WHERE email = $1`, [USER_EMAIL]);
  });

  test("GET perfil + PUT actualiza + PUT password correcto/incorrecto", async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    const ctx = await createAuthedContext(USER_EMAIL, USER_PASSWORD);
    const pool = getPool();
    try {
      // GET /api/user/profile → 200 con datos
      const get = await ctx.get("/api/user/profile");
      expect(get.status()).toBe(200);
      const getBody = await get.json();
      expect(getBody.user.email).toBe(USER_EMAIL);
      expect(getBody.user.firstName).toBe("Test");
      expect(getBody.user.lastName).toBe("User");

      // PUT /api/user/profile actualiza firstName/lastName/phone
      const put = await ctx.put("/api/user/profile", {
        data: { firstName: "Milo", lastName: "Pádel", phone: "+5491122334455" },
        headers: { "Content-Type": "application/json" },
      });
      expect(put.status()).toBe(200);
      const putBody = await put.json();
      expect(putBody.user.firstName).toBe("Milo");
      expect(putBody.user.lastName).toBe("Pádel");
      expect(putBody.user.phone).toBe("+5491122334455");

      // Verificación SQL real: perfil actualizado
      const { rows: userRows } = await pool.query(
        `SELECT first_name, last_name, phone FROM users WHERE email = $1`,
        [USER_EMAIL]
      );
      expect(userRows[0].first_name).toBe("Milo");
      expect(userRows[0].last_name).toBe("Pádel");
      expect(userRows[0].phone).toBe("+5491122334455");

      // PUT /api/user/password con contraseña actual correcta → 200
      const pwOk = await ctx.put("/api/user/password", {
        data: { currentPassword: USER_PASSWORD, newPassword: "NewPass456!" },
        headers: { "Content-Type": "application/json" },
      });
      expect(pwOk.status()).toBe(200);

      // Verificación SQL real: hash actualizado y login con la nueva contraseña
      const { rows: hashRows } = await pool.query(
        `SELECT password_hash FROM users WHERE email = $1`,
        [USER_EMAIL]
      );
      expect(hashRows[0].password_hash).toMatch(/^\$2[aby]\$/);

      // PUT /api/user/password con contraseña actual incorrecta → 400
      const pwBad = await ctx.put("/api/user/password", {
        data: { currentPassword: "WrongPass123!", newPassword: "Another456!" },
        headers: { "Content-Type": "application/json" },
      });
      expect(pwBad.status()).toBe(400);
      const pwBadBody = await pwBad.json();
      expect(pwBadBody.error).toBe("La contraseña actual no es correcta");

      // PUT /api/user/password con nueva contraseña igual a la actual → 400 (refine)
      const pwSame = await ctx.put("/api/user/password", {
        data: { currentPassword: "NewPass456!", newPassword: "NewPass456!" },
        headers: { "Content-Type": "application/json" },
      });
      expect(pwSame.status()).toBe(400);

      // PUT /api/user/password con nueva contraseña < 8 chars → 400 (zod)
      const pwShort = await ctx.put("/api/user/password", {
        data: { currentPassword: "NewPass456!", newPassword: "short" },
        headers: { "Content-Type": "application/json" },
      });
      expect(pwShort.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });
});