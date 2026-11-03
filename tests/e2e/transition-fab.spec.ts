/**
 * E2E — FAB "Crear transición" (G1/A3-A5).
 *
 * (a) ADMIN en `/dashboard` ve el FAB (`link` con nombre accesible "Crear
 *     transición"); 1 toque → `/transiciones/nueva`; oculto en `/transiciones`
 *     y dentro del editor.
 * (b) USER en `/dashboard` no ve el FAB (0 elementos): guard de UI coherente
 *     con `validateAdmin`.
 * (c) A 375×667: target ≥48 px, sin solape con `BottomNav` (`y + height ≤ vh - 61`)
 *     y sin scroll horizontal.
 *
 * Seed idéntico a `transition-editor.spec.ts` (dotenv + Pool + bcryptjs).
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
const COACH_EMAIL = `e2e-fab-coach-${Date.now()}@test.local`;
const PLAYER_EMAIL = `e2e-fab-player-${Date.now()}@test.local`;
const PASSWORD = "TestPass123!";
const VIEWPORT = { width: 375, height: 667 };
const BOTTOM_NAV_HEIGHT = 61;

let pool: Pool | null = null;

async function seedUser(email: string, role: "ADMIN" | "USER") {
  if (!pool) return;
  const hash = await bcryptjs.hash(PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'E2E', 'Fab', $2, 'ACTIVE', $3, now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = $3, email_verified_at = now()`,
    [email, hash, role]
  );
}

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon.tech") ? { rejectUnauthorized: false } : false,
  });
  await seedUser(COACH_EMAIL, "ADMIN");
  await seedUser(PLAYER_EMAIL, "USER");
});

test.afterAll(async () => {
  if (!pool) return;
  const emails = [COACH_EMAIL, PLAYER_EMAIL];
  await pool.query(
    `DELETE FROM audit_logs WHERE entity_name = 'coach_transition'
       AND user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails]
  );
  await pool.query(
    `DELETE FROM coach_transitions WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails]
  );
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
  await pool.end();
});

async function login(page: Page, email: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // ADMIN/SUPER_ADMIN aterrizan en `/admin`; USER en `/dashboard` (login page).
  await page.waitForURL(/\/admin|\/dashboard/, { timeout: 15000 });
}

/** F13: sin scroll horizontal del documento en el viewport móvil. */
async function expectNoHorizontalScroll(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(VIEWPORT.width);
}

test.describe("FAB de transiciones — móvil", () => {
  test.use({ viewport: VIEWPORT });

  test("ADMIN ve el FAB en /dashboard, 1 toque al editor, oculto en biblioteca/editor", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "Requiere DATABASE_URL (seed SQL real)");
    await login(page, COACH_EMAIL);

    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");

    const fab = page.getByRole("link", { name: "Crear transición" });
    await expect(fab).toBeVisible();

    // A5 — target ≥48 px y sin solape con BottomNav (alto ≈61 px)
    const box = await fab.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT.height - BOTTOM_NAV_HEIGHT);
    }
    await expectNoHorizontalScroll(page);

    // 1 toque → editor
    await fab.click();
    await page.waitForURL("**/transiciones/nueva", { timeout: 15000 });
    await expect(page.getByLabel("Título de la transición")).toBeVisible();

    // Oculto en el editor (modo foco)
    await expect(page.getByRole("link", { name: "Crear transición" })).toHaveCount(0);

    // Oculto en la biblioteca (ya existe "Nueva")
    await page.goto(`${BASE_URL}/transiciones`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("link", { name: "Crear transición" })).toHaveCount(0);
  });

  test("USER no ve el FAB en /dashboard", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "Requiere DATABASE_URL (seed SQL real)");
    await login(page, PLAYER_EMAIL);

    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("link", { name: "Crear transición" })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});
