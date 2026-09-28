/**
 * E2E test — Etapa 4 G12 Gestión de alumnos en curso.
 * Flujo: login coach → detalle de curso → tab Alumnos → modal de búsqueda →
 * agregar alumno → verificar en lista → remover (confirm) → verificar que
 * desaparece. Requiere servidor en http://localhost:3000 + DB (NeonDB/Docker).
 */
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import bcryptjs from "bcryptjs";
import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { serverUp } from "../api/auth/helpers";
import { signIn } from "../api/admin/marketing/helpers";

for (const envFile of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(p)) loadEnv({ path: p, override: false });
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const COACH_EMAIL = `e2e-coursestu-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `e2e-coursestu-student-${Date.now()}@test.local`;
const STUDENT_PASSWORD = "TestPass123!";
const COURSE_NAME = `Curso alumnos E2E ${Date.now()}`;

let pool: Pool;
let coachId: string;
let studentId: string;
let courseId: string;

test.beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("neon.tech") ? { rejectUnauthorized: false } : false,
  });
  const hash = await bcryptjs.hash(COACH_PASSWORD, 10);

  // Coach (ADMIN)
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Coach', 'CourseStu', $2, 'ACTIVE', 'ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'ADMIN', email_verified_at = now()`,
    [COACH_EMAIL, hash]
  );
  // Alumno a agregar (USER)
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Player', 'CourseStu', $2, 'ACTIVE', 'USER', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'USER', email_verified_at = now()`,
    [STUDENT_EMAIL, hash]
  );

  const coachRows = await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL]);
  coachId = coachRows.rows[0].id;
  const studentRows = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
  studentId = studentRows.rows[0].id;

  // Curso activo del coach
  const courseRows = await pool.query(
    `INSERT INTO courses (id, owner_id, name, level, schedule, days, invite_code, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'iniciacion', 'Lunes 18:00', '[]'::jsonb, 'PAD-E2E1', 'active', now(), now())
     RETURNING id`,
    [coachId, COURSE_NAME]
  );
  courseId = courseRows.rows[0].id;
});

test.afterAll(async () => {
  if (pool) {
    await pool.query(`DELETE FROM course_enrollments WHERE course_id = $1`, [courseId]);
    await pool.query(`DELETE FROM course_rubrics WHERE course_id = $1`, [courseId]);
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[COACH_EMAIL, STUDENT_EMAIL]]);
    await pool.end();
  }
});

test.describe("Course Students (G12) — E2E", () => {
  test("tab Alumnos → agregar alumno → verificar → remover", async ({ page }) => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    test.setTimeout(120_000);

    await signIn(page.request, COACH_EMAIL, COACH_PASSWORD);

    // 1) Detalle de curso: tab "Alumnos" visible para coach
    await page.goto(`${BASE_URL}/cursos/${courseId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("tab", { name: "Alumnos" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("tab", { name: "Rúbricas" })).toBeVisible({ timeout: 15000 });

    // 2) Modal de búsqueda abre y muestra resultados
    await page.getByRole("button", { name: "Agregar alumno" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Agregar alumno" })).toBeVisible();
    await page.getByLabel("Buscar alumnos").fill(STUDENT_EMAIL);
    await expect(page.getByText("Player CourseStu", { exact: false })).toBeVisible({ timeout: 15000 });

    // 3) Agregar alumno → aparece en la lista
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(page.getByText(STUDENT_EMAIL)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Player CourseStu", { exact: false })).toBeVisible({ timeout: 15000 });

    // 4) Remover: confirm dialog aceptado + DELETE responde 200
    const removeResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/courses/${courseId}/students/${studentId}`) &&
        res.request().method() === "DELETE"
    );
    page.on("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: /Quitar a Player CourseStu del curso/i }).click();
    const res = await removeResponse;
    expect(res.status()).toBe(200);

    // 5) Alumno desaparece de la lista
    await expect(page.getByText(STUDENT_EMAIL)).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Player CourseStu", { exact: false })).not.toBeVisible({ timeout: 15000 });
  });
});