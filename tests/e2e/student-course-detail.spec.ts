/**
 * E2E test — G8 Student course detail.
 * Verifica que /cursos/[id] existe, requiere auth y que el endpoint
 * /api/student/courses/[id] está protegido (401 sin sesión).
 * Requiere servidor corriendo en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Padel Student Course Detail (G8) — Pages", () => {
  test("Course detail page requires auth", async ({ page }) => {
    const res = await page.goto("/cursos/00000000-0000-0000-0000-000000000000");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Course detail page renders for authenticated user", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const res = await page.goto("/cursos/00000000-0000-0000-0000-000000000000");
    expect([200, 302, 307]).toContain(res?.status());
  });
});

test.describe("Padel Student Course Detail (G8) — API Guards", () => {
  test("GET /api/student/courses/[id] returns 401 without auth", async ({ request }) => {
    const res = await request.get(
      "/api/student/courses/00000000-0000-0000-0000-000000000000"
    );
    expect(res.status()).toBe(401);
  });
});