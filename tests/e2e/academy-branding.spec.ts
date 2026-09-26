/**
 * E2E test — SPEC-EPIC-01 Academia & Branding Institucional.
 * Flujo navegable completo: login coach → crear academia (UI) → invitar profesor (UI)
 * → crear rúbrica institucional (UI) → evaluar alumno → exportar PDF.
 * Requiere servidor corriendo en http://localhost:3000 + DB (NeonDB/Docker).
 */
import { test, expect } from "@playwright/test";
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
const COACH_EMAIL = `e2e-academy-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const INVITED_EMAIL = `e2e-academy-invited-${Date.now()}@test.local`;
const STUDENT_EMAIL = `e2e-academy-student-${Date.now()}@test.local`;
const ACADEMY_SLUG = `e2e-academy-${Date.now()}`;

let pool: Pool;
let studentId: string;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcryptjs.hash(COACH_PASSWORD, 10);

  // Coach (ADMIN) — crea academia, invita, evalúa
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Coach', 'Academy', $2, 'ACTIVE', 'ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'ADMIN', email_verified_at = now()`,
    [COACH_EMAIL, hash]
  );
  // Profesor invitado (ADMIN)
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Coach', 'Invited', $2, 'ACTIVE', 'ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'ADMIN', email_verified_at = now()`,
    [INVITED_EMAIL, hash]
  );
  // Alumno (USER)
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Player', 'Academy', $2, 'ACTIVE', 'USER', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'USER', email_verified_at = now()`,
    [STUDENT_EMAIL, hash]
  );
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
  studentId = rows[0].id;
});

test.afterAll(async () => {
  if (pool) {
    await pool.query(
      `DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM academy_memberships WHERE academy_id IN (SELECT id FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [COACH_EMAIL]
    );
    await pool.query(
      `DELETE FROM academies WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [COACH_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [
      [COACH_EMAIL, INVITED_EMAIL, STUDENT_EMAIL],
    ]);
    await pool.end();
  }
});

async function loginAsCoach(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', COACH_EMAIL);
  await page.fill('input[type="password"]', COACH_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
}

test.describe("Academy Branding — Full Flow", () => {
  test("crear academia → invitar → rúbrica institucional → evaluar → exportar PDF", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsCoach(page);

    // 1) Crear academia vía UI modal
    await page.goto(`${BASE_URL}/academias`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/academias/i);
    await page.getByRole("button", { name: "Crear academia" }).first().click();
    await page.fill("#academy-name", "Academia E2E Branding");
    await page.fill("#academy-slug", ACADEMY_SLUG);
    await page.fill("#academy-color", "#7c3aed");
    await page.getByRole("button", { name: "Crear academia" }).last().click();
    await expect(page.locator("body")).toContainText(/Academia E2E Branding/i, { timeout: 15000 });

    // 2) Abrir detalle de la academia
    await page.getByRole("link", { name: "Ver detalle" }).first().click();
    await page.waitForURL("**/academias/*", { timeout: 15000 });
    await expect(page.locator("body")).toContainText(/branding|miembros|r[uú]bricas/i);

    // 3) Invitar profesor vía UI modal (tab Miembros)
    await page.getByRole("tab", { name: /miembros/i }).click();
    await page.getByRole("button", { name: "Invitar profesor" }).click();
    await page.fill("#invite-email", INVITED_EMAIL);
    await page.getByRole("button", { name: "Invitar", exact: true }).click();
    await expect(page.locator("body")).toContainText(new RegExp(INVITED_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), {
      timeout: 15000,
    });

    // 4) Crear rúbrica institucional vía UI modal (tab Rúbricas)
    await page.getByRole("tab", { name: /r[uú]bricas/i }).click();
    await page.getByRole("button", { name: "Nueva rúbrica" }).click();
    await page.fill("#rubric-title", "Saque institucional E2E");
    await page.locator("#rubric-category").click();
    await page.getByRole("option", { name: "Técnica Básica" }).click();
    await page.getByPlaceholder("Criterio 1").fill("Precisión");
    await page.getByPlaceholder("Excelente: descriptor").fill("Excelente");
    await page.getByPlaceholder("Bueno: descriptor").fill("Bueno");
    await page.getByPlaceholder("Aceptable: descriptor").fill("Aceptable");
    await page.getByPlaceholder("En desarrollo: descriptor").fill("En desarrollo");
    await page.getByRole("button", { name: "Crear rúbrica" }).click();
    await expect(page.locator("body")).toContainText(/Saque institucional E2E/i, { timeout: 15000 });

    // 5) Evaluar: la página /evaluar renderiza para el coach
    await page.goto(`${BASE_URL}/evaluar`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/evaluar|seleccionar/i);

    // 6) Exportar PDF: crear evaluación con la rúbrica institucional (API autenticada
    //    con la misma sesión del navegador), publicar y verificar el PDF + botón en UI.
    const rubricId = (
      await pool.query(`SELECT id FROM rubrics WHERE title = 'Saque institucional E2E' LIMIT 1`)
    ).rows[0].id as string;
    expect(rubricId).toBeTruthy();

    const evalRes = await page.request.post("/api/evaluations", {
      data: { studentId, rubricId },
      headers: { "Content-Type": "application/json" },
    });
    expect(evalRes.status()).toBe(201);
    const evaluationId = (await evalRes.json()).evaluation.id;

    const criteriaId = (
      await pool.query(`SELECT id FROM rubric_criteria WHERE rubric_id = $1 LIMIT 1`, [rubricId])
    ).rows[0].id as string;
    const levelId = (
      await pool.query(`SELECT id FROM rubric_levels WHERE rubric_id = $1 AND score = 4 LIMIT 1`, [rubricId])
    ).rows[0].id as string;

    const saveRes = await page.request.put(`/api/evaluations/${evaluationId}`, {
      data: { scores: [{ criteriaId, levelId }], globalComment: "Buen saque E2E" },
      headers: { "Content-Type": "application/json" },
    });
    expect(saveRes.status()).toBe(200);
    const publishRes = await page.request.post(`/api/evaluations/${evaluationId}/publish`);
    expect(publishRes.status()).toBe(200);

    const pdfRes = await page.request.get(`/api/evaluations/${evaluationId}/pdf`);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
    const pdfBytes = await pdfRes.body();
    expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF");

    // Botón "Exportar PDF" visible en el detalle de la evaluación (UI)
    await page.goto(`${BASE_URL}/evaluaciones/${evaluationId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /exportar pdf/i })).toBeVisible({ timeout: 15000 });
  });
});