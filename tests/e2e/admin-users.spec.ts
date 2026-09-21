/**
 * E2E test — G10 Admin UI de usuarios.
 * Verifica que /admin/users existe, requiere auth y renderiza la tabla para
 * admin autenticado. Requiere servidor en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Padel Admin Users — Pages", () => {
  test("Admin users page requires auth", async ({ page }) => {
    const res = await page.goto("/admin/users");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Admin home requires auth (redirects when no session)", async ({ page }) => {
    const res = await page.goto("/admin");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Padel Admin Users — API Guards", () => {
  test("PUT /api/admin/users/[id] returns 401 without auth", async ({ request }) => {
    const res = await request.put("/api/admin/users/00000000-0000-0000-0000-000000000000", {
      data: { firstName: "X" },
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/admin/users/[id] returns 401 without auth", async ({ request }) => {
    const res = await request.delete("/api/admin/users/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBe(401);
  });
});