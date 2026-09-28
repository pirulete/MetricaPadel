/**
 * E2E test — Evaluación en Pareja (SPEC-01).
 * Flujo navegable: curso → Evaluar en Pareja → 2 alumnos → rúbrica →
 * toggle criterio compartido (CA-01) → publicar → éxito.
 * Requiere servidor corriendo en http://localhost:3000 + DB.
 */
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import bcryptjs from "bcryptjs";
import { request as pwRequest } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = `e2e-pair-admin-${Date.now()}@test.local`;
const ADMIN_PASSWORD = "TestPass123!";
const STUDENT_A_EMAIL = `e2e-pair-a-${Date.now()}@test.local`;
const STUDENT_B_EMAIL = `e2e-pair-b-${Date.now()}@test.local`;

let pool: Pool;
let courseId: string;
let studentAId: string;
let studentBId: string;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcryptjs.hash(ADMIN_PASSWORD, 10);

  for (const [email, role, first] of [
    [ADMIN_EMAIL, "ADMIN", "Coach"],
    [STUDENT_A_EMAIL, "USER", "Ana"],
    [STUDENT_B_EMAIL, "USER", "Bruno"],
  ] as const) {
    await pool.query(
      `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Pair', $3, 'ACTIVE', $4, now(), now(), now())
       ON CONFLICT (email) DO UPDATE SET password_hash = $3, status = 'ACTIVE', role = $4, email_verified_at = now()`,
      [email, first, hash, role]
    );
  }

  const { rows: aRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_A_EMAIL]);
  const { rows: bRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_B_EMAIL]);
  studentAId = aRows[0].id;
  studentBId = bRows[0].id;

  // Seed vía API: curso + inscripciones + rúbrica
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
  const csrf = await ctx.get("/api/auth/csrf");
  const csrfToken = csrf.ok() ? (await csrf.json()).csrfToken || "" : "";
  const signin = await ctx.post("/api/auth/callback/credentials", {
    form: { csrfToken, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, redirect: "false" },
  });
  if (!signin.ok() && signin.status() !== 302) throw new Error("Sign-in falló en seed E2E");

  const courseRes = await ctx.post("/api/courses", {
    data: { name: "Curso E2E pareja", level: "intermedio" },
    headers: { "Content-Type": "application/json" },
  });
  courseId = (await courseRes.json()).course.id;

  for (const studentId of [studentAId, studentBId]) {
    await ctx.post(`/api/courses/${courseId}/students`, {
      data: { studentId },
      headers: { "Content-Type": "application/json" },
    });
  }

  const rubricRes = await ctx.post("/api/rubrics", {
    data: {
      title: "Rúbrica E2E pareja",
      category: "tactica",
      criteria: [
        { name: "Posición", descriptors: ["A", "B", "C", "D"] },
        { name: "Lectura", descriptors: ["A", "B", "C", "D"] },
      ],
    },
    headers: { "Content-Type": "application/json" },
  });
  if (!rubricRes.ok()) throw new Error("Fallo al crear rúbrica en seed E2E");
  await ctx.dispose();
});

test.afterAll(async () => {
  if (pool) {
    await pool.query(
      `DELETE FROM audit_logs WHERE action_type = 'PAIR_EVALUATION_PUBLISHED' AND user_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM evaluations WHERE teacher_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM courses WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_descriptors WHERE criteria_id IN (SELECT id FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubric_levels WHERE rubric_id IN (SELECT id FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1))`,
      [ADMIN_EMAIL]
    );
    await pool.query(
      `DELETE FROM rubrics WHERE owner_id IN (SELECT id FROM users WHERE email = $1)`,
      [ADMIN_EMAIL]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [
      [ADMIN_EMAIL, STUDENT_A_EMAIL, STUDENT_B_EMAIL],
    ]);
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

test.describe("Evaluación en Pareja — flujo navegable", () => {
  test("curso → pareja → 2 alumnos → rúbrica → toggle compartido → publicar", async ({ page }) => {
    await loginAsAdmin(page);

    // Curso detalle → botón "Evaluar en Pareja"
    await page.goto(`${BASE_URL}/cursos/${courseId}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Evaluar en Pareja" }).click();
    await page.waitForURL(`**/evaluar/pareja?courseId=${courseId}`);

    // Seleccionar 2 alumnos (Ana y Bruno)
    await page.getByRole("button", { name: /Ana Pair/ }).click();
    await page.getByRole("button", { name: /Bruno Pair/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    // Seleccionar rúbrica
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Rúbrica E2E pareja" }).click();

    // Toggle "Evaluar en Pareja" en el primer criterio (CA-01)
    const sharedSwitch = page.getByRole("switch", { name: "Evaluar Posición en pareja" });
    await sharedSwitch.click();
    await expect(sharedSwitch).toBeChecked();

    // Puntuar criterio compartido (aplica a ambos)
    await page.getByRole("button", { name: /Excelente/ }).first().click();

    // Puntuar criterio individual: columna A y B (scoped a la card del criterio)
    const lecturaCard = page
      .locator("div.rounded-xl.border.border-border.p-4")
      .filter({ hasText: "Lectura" });
    await lecturaCard.getByRole("button", { name: /Bueno/ }).first().click();
    await lecturaCard.getByRole("button", { name: /Bueno/ }).nth(1).click();

    // Guardar borradores
    await page.getByRole("button", { name: "Guardar borradores" }).click();
    await expect(page.getByText("Borradores guardados")).toBeVisible({ timeout: 10000 });

    // Publicar → éxito + redirección a /evaluaciones
    await page.getByRole("button", { name: "Publicar evaluación en pareja" }).click();
    await expect(page.getByText("Evaluación en pareja publicada")).toBeVisible({ timeout: 10000 });
    await page.waitForURL("**/evaluaciones", { timeout: 10000 });
  });
});