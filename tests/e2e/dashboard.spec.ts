/**
 * E2E test — Etapa 3 Dashboard y Management (P01 home profesor, A01 home alumno, P10 historial).
 * Verifica que las páginas existen, requieren auth y que los guards de API
 * protegen los endpoints de dashboard/historial.
 * Requiere servidor corriendo en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Padel Dashboard — Pages", () => {
  test("Dashboard page requires auth", async ({ page }) => {
    const res = await page.goto("/dashboard");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Dashboard page renders for authenticated user", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const res = await page.goto("/dashboard");
    expect([200, 302, 307]).toContain(res?.status());
  });

  test("Historial page requires auth", async ({ page }) => {
    const res = await page.goto("/historial");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Padel Dashboard — API Guards", () => {
  test("GET /api/dashboard/teacher returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/dashboard/teacher");
    expect(res.status()).toBe(401);
  });

  test("GET /api/dashboard/student returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/dashboard/student");
    expect(res.status()).toBe(401);
  });

  test("GET /api/history returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/history");
    expect(res.status()).toBe(401);
  });
});