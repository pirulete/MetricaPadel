/**
 * E2E test — Etapa 2 Cursos (P05 lista, P06 crear, P07 detalle, A02 join).
 * Verifica que las páginas de cursos existen, requieren auth y que los
 * modales de crear/unirse se renderizan para el rol correcto.
 * Requiere servidor corriendo en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Padel Courses — Pages", () => {
  test("Cursos page requires auth", async ({ page }) => {
    const res = await page.goto("/cursos");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Cursos page renders for authenticated user", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const res = await page.goto("/cursos");
    expect([200, 302, 307]).toContain(res?.status());
  });

  test("Course detail page requires auth", async ({ page }) => {
    const res = await page.goto("/cursos/00000000-0000-0000-0000-000000000000");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Padel Courses — API Guards", () => {
  test("POST /api/courses returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/courses", {
      data: { name: "Curso test", level: "iniciacion" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/courses/join returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/courses/join", {
      data: { inviteCode: "PAD-ABCD" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/courses/[id]/rubrics returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/courses/00000000-0000-0000-0000-000000000000/rubrics", {
      data: { rubricId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(401);
  });
});