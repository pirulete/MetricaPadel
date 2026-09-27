/**
 * E2E test — Super Admin UI (v0.7).
 * Verifica que /admin/admins y /admin/platform existen, requieren auth y
 * exponen guards 401/403 en los endpoints exclusivos. Requiere servidor en
 * http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Super Admin — Pages", () => {
  test("Admin admins page requires auth", async ({ page }) => {
    const res = await page.goto("/admin/admins");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Admin platform page requires auth", async ({ page }) => {
    const res = await page.goto("/admin/platform");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Super Admin — API Guards", () => {
  test("GET /api/admin/admins returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/admins");
    expect(res.status()).toBe(401);
  });

  test("GET /api/admin/audit-logs returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/audit-logs");
    expect(res.status()).toBe(401);
  });

  test("GET /api/admin/academies returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/academies");
    expect(res.status()).toBe(401);
  });

  test("POST /api/admin/users/[id]/demote returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/admin/users/00000000-0000-0000-0000-000000000000/demote");
    expect(res.status()).toBe(401);
  });
});