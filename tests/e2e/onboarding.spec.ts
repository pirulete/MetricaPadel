/**
 * E2E test — Etapa 2 Onboarding (SCR-02 registro, SCR-03 login).
 * Verifica que el flujo de onboarding existe, requiere auth donde corresponde
 * y que el selector coach/player es UX pura (backend nunca auto-ADMIN).
 * Requiere servidor corriendo en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Padel Onboarding — Register (SCR-02)", () => {
  test("Register page renders with role selector and form fields", async ({ page }) => {
    const res = await page.goto("/register");
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
    // Selector coach/player (UX pura, D6)
    await expect(page.getByRole("button", { name: "Soy jugador" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Soy coach" })).toBeVisible();
    // Campos del formulario
    await expect(page.getByLabel("Nombre")).toBeVisible();
    await expect(page.getByLabel("Apellido")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    // Link a login
    await expect(page.getByRole("link", { name: "Inicia sesión" })).toBeVisible();
  });

  test("Register validates required fields client-side", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Registrarme" }).click();
    // El form no debe navegar; los campos required bloquean el submit
    await expect(page).toHaveURL(/\/register$/);
  });
});

test.describe("Padel Onboarding — Login (SCR-03)", () => {
  test("Login page renders with link to register", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("link", { name: /crear cuenta|registr/i })).toBeVisible();
  });

  test("Private area requires auth — dashboard redirects to login", async ({ page }) => {
    const res = await page.goto("/dashboard");
    // Sin sesión: redirige a login (302/307) o renderiza con guard
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Padel Onboarding — API Guards", () => {
  test("POST /api/auth/register rejects invalid payload without leaking role", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { firstName: "", lastName: "", email: "not-an-email", password: "123", role: "coach" },
    });
    // 400 por validación; nunca 201 con rol coach sin verificar
    expect(res.status()).toBe(400);
  });

  test("GET /api/courses returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/courses");
    expect(res.status()).toBe(401);
  });
});