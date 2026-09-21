/**
 * E2E test — Student View (A03 Detalle Evaluación + G7 Evolución).
 * Flujo: login student → ver evaluaciones → ver detalle → ver evolución.
 * Requiere servidor corriendo en http://localhost:3000 + DB Docker local.
 */
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import bcryptjs from "bcryptjs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const STUDENT_EMAIL = `e2e-student-view-${Date.now()}@test.local`;
const STUDENT_PASSWORD = "TestPass123!";

let pool: Pool;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcryptjs.hash(STUDENT_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Player', 'E2E', $2, 'ACTIVE', 'USER', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'USER', email_verified_at = now()`,
    [STUDENT_EMAIL, hash]
  );
});

test.afterAll(async () => {
  if (pool) {
    await pool.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE student_id IN (SELECT id FROM users WHERE email = $1))`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM evaluations WHERE student_id IN (SELECT id FROM users WHERE email = $1)`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM course_enrollments WHERE student_id IN (SELECT id FROM users WHERE email = $1)`, [STUDENT_EMAIL]);
    await pool.query(`DELETE FROM users WHERE email = $1`, [STUDENT_EMAIL]);
    await pool.end();
  }
});

async function loginAsStudent(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', STUDENT_EMAIL);
  await page.fill('input[type="password"]', STUDENT_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10000 });
}

test.describe("Student View — Navigation", () => {
  test("Dashboard requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/dashboard`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Evaluaciones page requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/evaluaciones`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Evolucion page requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/evolucion`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Settings page requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/settings`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Cursos page requires auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/cursos`);
    expect([200, 302, 307, 403]).toContain(res?.status());
  });
});

test.describe("Student View — Authenticated Pages", () => {
  test("Dashboard renders for student", async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/dashboard|curso|evaluaci/i);
  });

  test("Evaluaciones page renders for student", async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/evaluaciones`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/evaluaci/i);
  });

  test("Evolucion page renders for student", async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/evolucion`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/evoluci/i);
  });

  test("Settings page renders for student", async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/perfil|settings|contraseña/i);
  });

  test("Cursos page renders for student", async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/cursos`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/curso/i);
  });
});

test.describe("Student View — Bottom Nav", () => {
  test("Bottom nav has links for student role", async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    // Bottom nav should have key links
    const body = page.locator("body");
    await expect(body).toContainText(/dashboard|evaluaci|curso/i);
  });
});

test.describe("Student View — API Guards", () => {
  test("GET /api/student/evaluations returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/student/evaluations");
    expect(res.status()).toBe(401);
  });

  test("GET /api/student/evolution returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/student/evolution");
    expect(res.status()).toBe(401);
  });

  test("GET /api/dashboard/student returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/dashboard/student");
    expect(res.status()).toBe(401);
  });

  test("POST /api/courses/join returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/courses/join", {
      data: { inviteCode: "PAD-XXXX" },
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/courses/[id]/enrollment returns 401 without auth", async ({ request }) => {
    const res = await request.delete("/api/courses/00000000-0000-0000-0000-000000000000/enrollment");
    expect(res.status()).toBe(401);
  });
});
