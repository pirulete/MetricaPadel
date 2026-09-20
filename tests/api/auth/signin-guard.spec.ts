/**
 * Guard tests del endpoint de signin (POST /api/auth/signin).
 * 400: body inválido (loginSchema). 401: credenciales incorrectas no autentican.
 * Skip graceful sin servidor; los tests con DB requieren DATABASE_URL.
 * @group api
 */
import { test, expect } from "@playwright/test";
import { BASE_URL, HAS_DB, serverUp, uniqueIp } from "./helpers";

test.describe("POST /api/auth/signin — guard validación de entrada", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("body vacío → 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/signin`, {
      data: {},
      headers: { "x-forwarded-for": uniqueIp() },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  test("email inválido y password vacía → 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/signin`, {
      data: { email: "not-an-email", password: "" },
      headers: { "x-forwarded-for": uniqueIp() },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });
});

test.describe("POST /api/auth/signin — credenciales incorrectas no autentican", () => {
  test.skip(!HAS_DB, "Requiere DATABASE_URL (getUserByEmail consulta NeonDB)");

  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("usuario inexistente → 401 y sin sesión", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/signin`, {
      data: { email: `no-existe-${Date.now()}@test.local`, password: "WrongPass123" },
      headers: { "x-forwarded-for": uniqueIp() },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Email o contraseña inválidos");

    // El intento no debe dejar sesión establecida en el mismo contexto
    const session = await request.get(`${BASE_URL}/api/auth/session`);
    const data = (await session.json().catch(() => null)) as { user?: unknown } | null;
    expect(!data?.user).toBe(true);
  });
});
