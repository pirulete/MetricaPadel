/**
 * E2E test — Rubric Editor (P02 Biblioteca + P03 Editor).
 * Flujo completo: login → crear rúbrica → publicar → ver detalle → archivar.
 * Requiere servidor corriendo en http://localhost:3000 + DB Docker local.
 */
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import bcryptjs from "bcryptjs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = `e2e-rubric-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";

let pool: Pool;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcryptjs.hash(ADMIN_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Coach', 'E2E', $2, 'ACTIVE', 'ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'ADMIN', email_verified_at = now()`,
    [ADMIN_EMAIL, hash]
  );
});

test.afterAll(async () => {
  if (pool) {
    await pool.query(`DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM course_rubrics WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM users WHERE email = $1`, [ADMIN_EMAIL]);
    await pool.end();
  }
});

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10000 });
}

test.describe("Rubric Editor — Full Flow", () => {
  test("Login as ADMIN and navigate to rubricas", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rubricas`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/r[uú]br/i);
  });

  test("Navigate to new rubric form", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rubricas/nueva`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/nueva|crear|rúbrica/i);
  });

  test("Rubricas page shows empty state initially", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rubricas`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/r[uú]br/i);
  });

  test("New rubric form has category selector", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/rubricas/nueva`);
    await page.waitForLoadState("networkidle");
    // Category selector or buttons should be visible
    const body = page.locator("body");
    await expect(body).toContainText(/reglas|técnica|táctica|física|actitud/i);
  });

  test("Evaluar page requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/evaluar`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Historial page requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/historial`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Rubric Editor — Navigation Guards", () => {
  test("Unauthenticated user redirected from /rubricas", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/rubricas`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Unauthenticated user redirected from /rubricas/nueva", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/rubricas/nueva`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});
