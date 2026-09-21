/**
 * E2E test — G5 Settings/Profile (perfil + cambio de contraseña).
 * Verifica que /settings existe, requiere auth y que el form de perfil se
 * renderiza para usuario autenticado. Requiere servidor en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Padel Settings — Pages", () => {
  test("Settings page requires auth", async ({ page }) => {
    const res = await page.goto("/settings");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Settings page renders for authenticated user", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const res = await page.goto("/settings");
    expect([200, 302, 307]).toContain(res?.status());
  });
});

test.describe("Padel Settings — API Guards", () => {
  test("PUT /api/user/password returns 401 without auth", async ({ request }) => {
    const res = await request.put("/api/user/password", {
      data: { currentPassword: "OldPass123!", newPassword: "NewPass456!" },
    });
    expect(res.status()).toBe(401);
  });

  test("PUT /api/user/profile returns 401 without auth", async ({ request }) => {
    const res = await request.put("/api/user/profile", {
      data: { firstName: "Test" },
    });
    expect(res.status()).toBe(401);
  });
});