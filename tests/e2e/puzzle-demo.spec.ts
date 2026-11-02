/**
 * E2E test — Spike Konva + transición de puzzle (AC-09 / AC-12).
 *
 * (a) sin sesión → /puzzle-demo redirige a /login (LOCKED nunca permitido).
 * (b) usuario ACTIVE → abre la ruta, `aria-live` muestra el paso 1, "Siguiente paso"
 *     avanza al paso 2, "Paso anterior" vuelve al 1 y está deshabilitado en el paso 0.
 *
 * Requiere servidor corriendo en http://localhost:3000 + DB.
 * Especificación escrita en @app-engineer; la ejecución corresponde a @qa-release.
 */
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import bcryptjs from "bcryptjs";
import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";

for (const envFile of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(p)) loadEnv({ path: p, override: false });
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const EMAIL = `e2e-puzzle-${Date.now()}@test.local`;
const PASSWORD = "TestPass123!";

let pool: Pool;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcryptjs.hash(PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Puzzle', 'E2E', $2, 'ACTIVE', 'USER', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'USER', email_verified_at = now()`,
    [EMAIL, hash]
  );
});

test.afterAll(async () => {
  if (!pool) return;
  await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]);
  await pool.end();
});

async function loginActiveUser(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10000 });
}

test.describe("Puzzle demo — spike Konva", () => {
  test("sin sesión redirige a /login", async ({ page }) => {
    await page.goto(`${BASE_URL}/puzzle-demo`);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("usuario ACTIVE navega los pasos con aria-live", async ({ page }) => {
    await loginActiveUser(page);

    await page.goto(`${BASE_URL}/puzzle-demo`);
    await page.waitForLoadState("networkidle");

    const live = page.locator('p[aria-live="polite"]');
    const prev = page.getByRole("button", { name: "Paso anterior" });
    const next = page.getByRole("button", { name: "Siguiente paso" });

    // Paso 0: aria-live con el paso 1 y "Paso anterior" deshabilitado (E4).
    await expect(live).toContainText("Paso 1");
    await expect(prev).toBeDisabled();

    // Avanzar → paso 2; "Paso anterior" se habilita.
    await next.click();
    await expect(live).toContainText("Paso 2");
    await expect(prev).toBeEnabled();

    // Retroceder → vuelve al paso 1 y se deshabilita de nuevo en el extremo.
    await prev.click();
    await expect(live).toContainText("Paso 1");
    await expect(prev).toBeDisabled();
  });
});
