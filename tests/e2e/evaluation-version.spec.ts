/**
 * E2E test — Etapa 4 G6 Versionado de evaluaciones.
 * Flujo: login coach → crear evaluación (API) → guardar scores → publicar (v1)
 * → re-evaluar → publicar (v2) → verificar badge v2 en la lista del alumno,
 * serie de versiones y navegación del coach al historial.
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
const COACH_EMAIL = `e2e-evalver-coach-${Date.now()}@test.local`;
const COACH_PASSWORD = "TestPass123!";
const STUDENT_EMAIL = `e2e-evalver-student-${Date.now()}@test.local`;
const STUDENT_PASSWORD = "TestPass123!";
const RUBRIC_TITLE = `Saque versión E2E ${Date.now()}`;

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
     VALUES (gen_random_uuid(), $1, 'Coach', 'EvalVer', $2, 'ACTIVE', 'ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'ADMIN', email_verified_at = now()`,
    [COACH_EMAIL, hash]
  );
  // Alumno (USER)
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Player', 'EvalVer', $2, 'ACTIVE', 'USER', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'USER', email_verified_at = now()`,
    [STUDENT_EMAIL, hash]
  );

  const coachRows = await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL]);
  coachId = coachRows.rows[0].id;
  const studentRows = await pool.query(`SELECT id FROM users WHERE email = $1`, [STUDENT_EMAIL]);
  studentId = studentRows.rows[0].id;

  // Rúbrica activa con 1 criterio + 4 niveles + descriptors
  const rubricRows = await pool.query(
    `INSERT INTO rubrics (id, owner_id, title, category, scope, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'tecnica_basica', 'personal', 'active', now(), now())
     RETURNING id`,
    [coachId, RUBRIC_TITLE]
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

  await pool.query(
    `INSERT INTO rubric_descriptors (id, criteria_id, level_id, text)
     VALUES (gen_random_uuid(), $1, $2, 'Excelente: descriptor')`,
    [criteriaId, levelId]
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
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[COACH_EMAIL, STUDENT_EMAIL]]);
    await pool.end();
  }
});

/** Crea borrador + guarda scores + publica. Retorna { id, version } de la evaluación publicada. */
async function createAndPublishEvaluation(page: import("@playwright/test").Page) {
  const createRes = await page.request.post("/api/evaluations", {
    data: { studentId, rubricId },
    headers: { "Content-Type": "application/json" },
  });
  expect(createRes.status()).toBe(201);
  const evaluationId = (await createRes.json()).evaluation.id as string;

  const saveRes = await page.request.put(`/api/evaluations/${evaluationId}`, {
    data: { scores: [{ criteriaId, levelId }], globalComment: "Comentario E2E" },
    headers: { "Content-Type": "application/json" },
  });
  expect(saveRes.status()).toBe(200);

  const publishRes = await page.request.post(`/api/evaluations/${evaluationId}/publish`);
  expect(publishRes.status()).toBe(200);
  const body = await publishRes.json();
  return { id: evaluationId, version: body.evaluation.version as number };
}

test.describe("Evaluation Versioning (G6) — E2E", () => {
  test("publicar dos veces genera v1 y v2 + badge v2 + serie + historial", async ({ page }) => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    test.setTimeout(120_000);

    // Coach autenticado (cookie jar compartido con el browser context)
    await signIn(page.request, COACH_EMAIL, COACH_PASSWORD);

    // 1) Primera publicación → v1
    const first = await createAndPublishEvaluation(page);
    expect(first.version).toBe(1);

    // 2) Segunda publicación (mismo studentId + rubricId) → v2
    const second = await createAndPublishEvaluation(page);
    expect(second.version).toBe(2);

    // 3) Badge "v2" visible en evaluation-card de la lista del alumno (A03)
    await page.goto(`${BASE_URL}/logout`);
    await signIn(page.request, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.goto(`${BASE_URL}/evaluaciones`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("v2", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("v1", { exact: true })).toBeVisible({ timeout: 15000 });

    // 4) Serie de versiones: /api/evaluations/series retorna 2 versiones
    //    para el mismo (studentId, rubricId). NOTA: el route handler de este
    //    endpoint no existe aún en app/api (tech debt) — el test fallará con
    //    404 hasta que se implemente (ver release-report).
    await signIn(page.request, COACH_EMAIL, COACH_PASSWORD);
    const seriesRes = await page.request.get(
      `/api/evaluations/series?studentId=${studentId}&rubricId=${rubricId}`
    );
    expect(seriesRes.status()).toBe(200);
    const seriesBody = await seriesRes.json();
    const series = Array.isArray(seriesBody.series) ? seriesBody.series : seriesBody.evaluations ?? [];
    expect(series.length).toBe(2);
    expect(series.map((e: { version: number | null }) => e.version).sort()).toEqual([1, 2]);

    // 5) Navegación: coach ve el historial con ambas versiones publicadas
    await page.goto(`${BASE_URL}/historial`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Player EvalVer/i, { timeout: 15000 });
    await expect(page.locator("body")).toContainText(new RegExp(RUBRIC_TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    await expect(page.locator("body")).toContainText(/Publicada/);
  });
});