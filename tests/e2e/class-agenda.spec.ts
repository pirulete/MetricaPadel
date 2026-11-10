/**
 * E2E — Agenda de clases (AC-02/AC-03/AC-06/AC-07).
 *
 * (a) Coach: `/cursos/<id>` → tab Agenda → añade un día a la plantilla →
 *     "Habilitar Sem N" → abre el bloque creado → asigna al alumno inscrito →
 *     el bloque queda con "1 asignados". Viewport móvil 375×667.
 * (b) Alumno con la clase asignada: `/dashboard` muestra "Próximas clases" con
 *     el curso y la hora, sin scroll horizontal; (c) alumno sin clases ve el
 *     estado vacío.
 *
 * Seed SQL real (patrón de `transition-editor.spec.ts`): el curso se crea a
 * mano con su inscripción para que el coach no tenga que pasar por el flujo de
 * alta de curso/alumno. La notificación de inbox no se valida por UI (el panel
 * `/notifications` es otra feature); cubierta en `class-agenda-student-happy`.
 *
 * Los hooks `beforeAll`/`afterAll` viven DENTRO del `describe`: a nivel de
 * archivo Playwright los ejecuta entre tests y el seed se borraba antes del
 * segundo escenario.
 *
 * Requiere servidor en http://localhost:3000 + DATABASE_URL. Spec escrita por
 * @app-engineer; la ejecuta @qa-release.
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
const STAMP = Date.now();
const COACH_EMAIL = `e2e-agenda-coach-${STAMP}@test.local`;
const PLAYER_EMAIL = `e2e-agenda-player-${STAMP}@test.local`;
const EMPTY_PLAYER_EMAIL = `e2e-agenda-empty-${STAMP}@test.local`;
const STUDENT_NAME = "E2E Agenda Alumno";
const COURSE_NAME = `Curso E2E Agenda ${STAMP}`;
const PASSWORD = "TestPass123!";
const VIEWPORT = { width: 375, height: 667 };

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const isoDayOfWeek = (): number => {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
};

let pool: Pool | null = null;
let coachId: string | null = null;
let courseId: string | null = null;

async function seedUser(
  email: string,
  role: "ADMIN" | "USER",
  firstName: string,
  lastName: string
): Promise<string | null> {
  if (!pool) return null;
  const hash = await bcryptjs.hash(PASSWORD, 10);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE', $5, now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $4, status = 'ACTIVE', role = $5, email_verified_at = now()
     RETURNING id`,
    [email, firstName, lastName, hash, role]
  );
  return result.rows[0]?.id ?? null;
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin|\/dashboard/, { timeout: 15000 });
}

async function expectNoHorizontalScroll(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(VIEWPORT.width);
}

/**
 * El header de `/cursos/[id]` (título largo + 3 acciones, ajeno a esta feature)
 * desborda a 375 px en TODAS sus tabs — ver BUG-01 en `release-report.md`. Aquí
 * se valida lo que sí controla la agenda: que su panel no tenga scroll interno.
 */
async function expectAgendaPanelFitsItself(page: Page) {
  const overflow = await page
    .getByRole("tabpanel")
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("Agenda de clases — móvil", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("neon.tech") ? { rejectUnauthorized: false } : false,
    });
    coachId = await seedUser(COACH_EMAIL, "ADMIN", "E2E", "Coach");
    const studentId = await seedUser(PLAYER_EMAIL, "USER", "E2E", "Agenda Alumno");
    await seedUser(EMPTY_PLAYER_EMAIL, "USER", "E2E", "Sin Clases");
    if (!coachId || !studentId) return;

    // Base36: mantiene unicidad entre corridas (el truncado decimal colisionaba cada ~16 min).
    const inviteCode = `E2E${STAMP.toString(36)}`.slice(0, 10).toUpperCase();
    const course = await pool.query<{ id: string }>(
      `INSERT INTO courses (id, owner_id, name, level, schedule, days, invite_code, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'iniciacion', 'Martes y Jueves', '[]'::jsonb, $3, 'active', now(), now())
       RETURNING id`,
      [coachId, COURSE_NAME, inviteCode]
    );
    courseId = course.rows[0]?.id ?? null;
    if (!courseId) return;
    await pool.query(
      `INSERT INTO course_enrollments (id, course_id, student_id, joined_at)
       VALUES (gen_random_uuid(), $1, $2, now())
       ON CONFLICT DO NOTHING`,
      [courseId, studentId]
    );
  });

  test.afterAll(async () => {
    if (!pool) return;
    const emails = [COACH_EMAIL, PLAYER_EMAIL, EMPTY_PLAYER_EMAIL];
    if (courseId) {
      await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    }
    await pool.query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))
         OR entity_name IN ('weekly_slot', 'class_block', 'block_enrollment')`,
      [emails]
    );
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
    await pool.end();
  });

  test("coach configura la plantilla, habilita la semana y asigna al alumno", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL || !courseId, "Requiere DATABASE_URL (seed SQL real)");
    await login(page, COACH_EMAIL);

    await page.goto(`${BASE_URL}/cursos/${courseId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: COURSE_NAME })).toBeVisible();

    await page.getByRole("tab", { name: "Agenda" }).click();
    await expect(page.getByRole("button", { name: "Añadir día a la plantilla" })).toBeVisible();

    // Plantilla: un día (hoy) a las 18:00 → al habilitar la semana crea un bloque de hoy
    await page.getByRole("button", { name: "Añadir día a la plantilla" }).click();
    const slotDialog = page.getByRole("dialog");
    await expect(slotDialog.getByText("Nuevo día de la plantilla")).toBeVisible();
    await slotDialog.getByRole("combobox", { name: "Día", exact: true }).click();
    await page.getByRole("option", { name: DAY_NAMES[isoDayOfWeek() - 1] as string }).click();
    await slotDialog.getByLabel("Hora").fill("18:00");
    await slotDialog.getByRole("button", { name: "Añadir día" }).click();
    await expect(slotDialog).toBeHidden();

    // Habilitar la semana visible (materialización idempotente)
    await page.getByRole("button", { name: /^Habilitar Sem \d+$/ }).click();
    const enableDialog = page.getByRole("dialog");
    await expect(enableDialog.getByRole("heading", { name: /Habilitar Semana \d+/ })).toBeVisible();
    await enableDialog.getByRole("button", { name: /^Habilitar \d+$/ }).click();
    await expect(enableDialog).toBeHidden();

    // Bloque creado → abrir sheet de asignación
    await page.getByRole("button", { name: /^Abrir bloque/ }).first().click();
    const blockDialog = page.getByRole("dialog");
    await expect(blockDialog.getByText(/Ocupación/)).toBeVisible();

    const availableCheckbox = blockDialog.getByRole("checkbox").first();
    await expect(availableCheckbox).toBeVisible();
    await availableCheckbox.check();
    await blockDialog.getByRole("button", { name: /^Asignar 1/ }).click();

    await expect(blockDialog.getByText("Asignados (1)")).toBeVisible();
    // El alumno aparece 2 veces (fila de asignados + fila "Ya asignado" de disponibles).
    await expect(blockDialog.getByText(STUDENT_NAME).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(blockDialog).toBeHidden();
    await expect(page.getByText(/1 asignados/)).toBeVisible();

    await expectAgendaPanelFitsItself(page);
  });

  test("alumno ve su clase en «Próximas clases» y otro alumno ve el vacío", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL || !courseId, "Requiere DATABASE_URL (seed SQL real)");

    await login(page, PLAYER_EMAIL);
    const upcoming = page.locator("#proximas-clases");
    await expect(upcoming.getByRole("heading", { name: "Próximas clases" })).toBeVisible();
    await expect(upcoming.getByText(COURSE_NAME)).toBeVisible({ timeout: 15000 });
    await expect(upcoming.getByText(/18:00/)).toBeVisible();
    await expect(upcoming.getByText("Programada")).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Alumno sin inscripciones → estado vacío recuperable
    await page.context().clearCookies();
    await login(page, EMPTY_PLAYER_EMAIL);
    await expect(page.locator("#proximas-clases").getByText("No tienes clases programadas")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
