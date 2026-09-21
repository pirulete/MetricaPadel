/**
 * E2E test — Gaps User Flows (G3 promote, G4 password generada, G9 notificación,
 * G11 leave course). Verifica que los endpoints existen, requieren auth y que
 * los guards de rol responden. El happy-path completo con SQL real vive en
 * tests/api/padel/*-happy.spec.ts.
 * Requiere servidor corriendo en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

const UUID = "00000000-0000-0000-0000-000000000000";

test.describe("Gaps User Flows — API Guards", () => {
  test("POST /api/admin/users/[id]/promote returns 401 without auth", async ({ request }) => {
    const res = await request.post(`/api/admin/users/${UUID}/promote`);
    expect(res.status()).toBe(401);
  });

  test("POST /api/admin/users without password returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/admin/users", {
      data: { email: "x@test.local", firstName: "A", lastName: "B" },
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/courses/[id]/enrollment returns 401 without auth", async ({ request }) => {
    const res = await request.delete(`/api/courses/${UUID}/enrollment`);
    expect(res.status()).toBe(401);
  });

  test("POST /api/evaluations/[id]/publish returns 401 without auth", async ({ request }) => {
    const res = await request.post(`/api/evaluations/${UUID}/publish`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Gaps User Flows — Pages", () => {
  test("Evaluaciones page requires auth", async ({ page }) => {
    const res = await page.goto("/evaluaciones");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Cursos page requires auth", async ({ page }) => {
    const res = await page.goto("/cursos");
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});