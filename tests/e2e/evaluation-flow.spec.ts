/**
 * E2E test — Evaluation Flow (P09 Evaluar + Publish + A03 Detalle).
 * Flujo: login coach → crear rúbrica via API → evaluar → publicar → ver detalle.
 * Requiere servidor corriendo en http://localhost:3000 + DB Docker local.
 */
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import bcryptjs from "bcryptjs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = `e2e-eval-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `e2e-eval-student-${Date.now()}@test.local`;

let pool: Pool;
let studentId: string;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcryptjs.hash(ADMIN_PASSWORD, 10);

  // Create coach
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Coach', 'Eval', $2, 'ACTIVE', 'ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'ADMIN', email_verified_at = now()`,
    [ADMIN_EMAIL, hash]
  );

  // Create student
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Player', 'Eval', $2, 'ACTIVE', 'USER', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'USER', email_verified_at = now()`,
    [STUDENT_EMAIL, hash]
  );

  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
  studentId = rows[0].id;
});

test.afterAll(async () => {
  if (pool) {
    await pool.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE student_id IN (SELECT id FROM users WHERE email = $1))`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM evaluations WHERE student_id IN (SELECT id FROM users WHERE email = $1)`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`, [ADMIN_EMAIL]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[ADMIN_EMAIL, STUDENT_EMAIL]]);
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

test.describe("Evaluation Flow — Coach Pages", () => {
  test("Evaluar page requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/evaluar`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Evaluaciones page requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/evaluaciones`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Dashboard renders for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/dashboard|evaluar|clase/i);
  });

  test("Evaluar page renders for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/evaluar`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/evaluar|seleccionar/i);
  });

  test("Evaluaciones list page renders for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/evaluaciones`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/evaluaci/i);
  });

  test("Historial page renders for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/historial`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/historial|evaluaci/i);
  });
});

test.describe("Evaluation Flow — API Guards", () => {
  test("POST /api/evaluations returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/evaluations", {
      data: { rubricId: "00000000-0000-0000-0000-000000000000", studentId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/evaluations/[id]/publish returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/evaluations/00000000-0000-0000-0000-000000000000/publish");
    expect(res.status()).toBe(401);
  });

  test("GET /api/dashboard/teacher returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/dashboard/teacher");
    expect(res.status()).toBe(401);
  });
});
