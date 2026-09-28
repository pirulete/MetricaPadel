/**
 * E2E test — Etapa 4 G7 Evolución del alumno.
 * Flujo: login student → /evolucion → verifica heading, categorías con trend
 * indicator, empty state para alumno sin evaluaciones y link en bottom-nav.
 * Requiere servidor corriendo en http://localhost:3000 + DB (NeonDB/Docker).
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
const COACH_EMAIL = `e2e-evol-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `e2e-evol-student-${Date.now()}@test.local`;
const STUDENT_PASSWORD = "TestPass123!";
const EMPTY_EMAIL = `e2e-evol-empty-${Date.now()}@test.local`;
const EMPTY_PASSWORD = "TestPass123!";

let pool: Pool;
let coachId: string;
let studentId: string;
let rubricId: string;
let criteriaId: string;
let levelId: string;

test.beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("neon.tech") ? { rejectUnauthorized: false } : false,
  });
  const hash = await bcryptjs.hash(COACH_PASSWORD, 10);

  // Coach (ADMIN)
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Coach', 'Evol', $2, 'ACTIVE', 'ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'ADMIN', email_verified_at = now()`,
    [COACH_EMAIL, hash]
  );
  // Alumno con evaluaciones (USER)
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Player', 'Evol', $2, 'ACTIVE', 'USER', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'USER', email_verified_at = now()`,
    [STUDENT_EMAIL, hash]
  );
  // Alumno sin evaluaciones (USER) — para validar empty state
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Empty', 'Evol', $2, 'ACTIVE', 'USER', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'USER', email_verified_at = now()`,
    [EMPTY_EMAIL, hash]
  );

  const coachRows = await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL]);
  coachId = coachRows.rows[0].id;
  const studentRows = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
  studentId = studentRows.rows[0].id;

  // Rúbrica activa con 1 criterio + 1 nivel
  const rubricRows = await pool.query(
    `INSERT INTO rubrics (id, owner_id, title, category, scope, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Evolución E2E', 'tecnica_basica', 'personal', 'active', now(), now())
     RETURNING id`,
    [coachId]
  );
  rubricId = rubricRows.rows[0].id;

  const criteriaRows = await pool.query(
    `INSERT INTO rubric_criteria (id, rubric_id, name, sort_order)
     VALUES (gen_random_uuid(), $1, 'Precisión', 1)
     RETURNING id`,
    [rubricId]
  );
  criteriaId = criteriaRows.rows[0].id;

  const levelRows = await pool.query(
    `INSERT INTO rubric_levels (id, rubric_id, name, score, sort_order)
     VALUES (gen_random_uuid(), $1, 'Excelente', 4, 1)
     RETURNING id`,
    [rubricId]
  );
  levelId = levelRows.rows[0].id;

  // 2 evaluaciones publicadas con scores 3 → 4 (trend up = "Mejorando")
  await pool.query(
    `INSERT INTO evaluations (id, student_id, teacher_id, rubric_id, status, version, total_score, max_score, global_comment, published_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'published', 1, 3, 4, 'v1', now() - interval '10 days', now() - interval '10 days', now() - interval '10 days'),
            (gen_random_uuid(), $1, $2, $3, 'published', 2, 4, 4, 'v2', now(), now(), now())`,
    [studentId, coachId, rubricId]
  );
  // Score rows para historial protegido (FK no cascade)
  await pool.query(
    `INSERT INTO evaluation_scores (id, evaluation_id, criteria_id, level_id, score)
     SELECT gen_random_uuid(), e.id, $2, $3, e.total_score
     FROM evaluations e WHERE e.student_id = $1 AND e.status = 'published'`,
    [studentId, criteriaId, levelId]
  );
});

test.afterAll(async () => {
  if (pool) {
    await pool.query(
      `DELETE FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE student_id = $1)`,
      [studentId]
    );
    await pool.query(`DELETE FROM evaluations WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM rubric_descriptors WHERE criteria_id = $1`, [criteriaId]);
    await pool.query(`DELETE FROM rubric_criteria WHERE rubric_id = $1`, [rubricId]);
    await pool.query(`DELETE FROM rubric_levels WHERE rubric_id = $1`, [rubricId]);
    await pool.query(`DELETE FROM rubrics WHERE id = $1`, [rubricId]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[COACH_EMAIL, STUDENT_EMAIL, EMPTY_EMAIL]]);
    await pool.end();
  }
});

test.describe("Student Evolution (G7) — E2E", () => {
  test("alumno con evaluaciones ve heading + categorías con trend indicator", async ({ page }) => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    test.setTimeout(60_000);

    await signIn(page.request, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.goto(`${BASE_URL}/evolucion`);
    await page.waitForLoadState("networkidle");

    // Heading
    await expect(page.getByRole("heading", { name: "Mi evolución" })).toBeVisible({ timeout: 15000 });

    // Categoría con trend indicator (2 evaluaciones 3→4 = "Mejorando")
    await expect(page.getByRole("heading", { name: "Técnica Básica" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Mejorando", { exact: true })).toBeVisible({ timeout: 15000 });
    // Badge de versión v2 en el listado de items
    await expect(page.getByText("v2", { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test("alumno sin evaluaciones ve empty state", async ({ page }) => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    test.setTimeout(60_000);

    await signIn(page.request, EMPTY_EMAIL, EMPTY_PASSWORD);
    await page.goto(`${BASE_URL}/evolucion`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Mi evolución" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Sin datos de evolución todavía")).toBeVisible({ timeout: 15000 });
  });

  test("link a /evolucion visible en bottom-nav para USER", async ({ page }) => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    test.setTimeout(60_000);

    await signIn(page.request, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");

    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(nav.getByRole("link", { name: /Evolución/i })).toBeVisible({ timeout: 15000 });
    await expect(nav.getByRole("link", { name: /Evolución/i })).toHaveAttribute("href", "/evolucion");
  });
});