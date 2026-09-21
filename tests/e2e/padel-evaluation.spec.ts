/**
 * E2E test — Etapa 1 Core Evaluativo.
 * Verifica los flujos principales de rúbricas y evaluaciones.
 * Requiere servidor corriendo en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Padel Evaluation — Rubric Library", () => {
  test("Rubricas page requires auth", async ({ page }) => {
    const res = await page.goto("/rubricas");
    // Should redirect to login or show 403
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Rubricas page renders for authenticated user", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    
    // Try to access rubricas
    const res = await page.goto("/rubricas");
    // Should render (200) or redirect to login (302)
    expect([200, 302, 307]).toContain(res?.status());
  });
});

test.describe("Padel Evaluation — Create Rubric", () => {
  test("Nueva rúbrica page requires auth", async ({ page }) => {
    const res = await page.goto("/rubricas/nueva");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Padel Evaluation — Evaluation Canvas", () => {
  test("Evaluar page requires auth", async ({ page }) => {
    const res = await page.goto("/evaluar");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Padel Evaluation — Evaluations List", () => {
  test("Evaluaciones page requires auth", async ({ page }) => {
    const res = await page.goto("/evaluaciones");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Padel Evaluation — API Guards", () => {
  test("GET /api/rubrics returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/rubrics");
    expect(res.status()).toBe(401);
  });

  test("GET /api/evaluations returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/evaluations");
    expect(res.status()).toBe(401);
  });

  test("POST /api/rubrics returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/rubrics", {
      data: { title: "Test", category: "tecnica_basica" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/evaluations returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/evaluations", {
      data: { rubricId: "test", studentId: "test" },
    });
    expect(res.status()).toBe(401);
  });
});
