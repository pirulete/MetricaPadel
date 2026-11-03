/**
 * E2E — Editor de transiciones del coach (AC-01/AC-03/AC-06/AC-09).
 *
 * (a) Flujo mínimo navegable en viewport móvil 375×667 (F13): login ADMIN →
 *     `/transiciones` → Nueva → añadir paso → Probar (preview visible) → Guardar
 *     → la URL pasa a la transición y al recargar persiste; en `/transiciones` y
 *     en el editor no hay scroll horizontal (`scrollWidth <= 375`).
 * (b) `USER` en `/transiciones` → redirigido a `/dashboard` (guard de página).
 * (c) `USER` llama a `/api/transitions` → `403` (guard de API, AC-09).
 *
 * Selectores reales: `transition-library` (link "Nueva"), `editor-screen`
 * (input aria-label "Título de la transición", status "Reproduciendo paso N de M"),
 * `step-filmstrip` (tab "Paso N", botón "Añadir paso") y `context-bar`
 * (botones "Probar" / "Guardar").
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
const COACH_EMAIL = `e2e-transition-coach-${Date.now()}@test.local`;
const PLAYER_EMAIL = `e2e-transition-player-${Date.now()}@test.local`;
const PASSWORD = "TestPass123!";
const VIEWPORT = { width: 375, height: 667 };

let pool: Pool | null = null;

async function seedUser(email: string, role: "ADMIN" | "USER") {
  if (!pool) return;
  const hash = await bcryptjs.hash(PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'E2E', 'Transition', $2, 'ACTIVE', $3, now(), now(), now())
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

test.describe("Editor de transiciones — móvil", () => {
  test.use({ viewport: VIEWPORT });

  test("crear → probar → guardar → recargar persiste, sin scroll horizontal", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "Requiere DATABASE_URL (seed SQL real)");
    await login(page, COACH_EMAIL);

    // Biblioteca del coach
    await page.goto(`${BASE_URL}/transiciones`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Transiciones" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // CTA "Nueva" → editor en blanco (1 paso por defecto)
    await page.getByRole("link", { name: "Nueva", exact: true }).click();
    await page.waitForURL("**/transiciones/nueva");
    const titleInput = page.getByLabel("Título de la transición");
    await expect(titleInput).toBeVisible();
    await expectNoHorizontalScroll(page);

    // B5: el canvas sigue montado y completo con el strip de flujo arriba (AC-01)
    await expect(page.getByRole("group", { name: /Cancha del paso/ })).toBeVisible();

    // B3: strip del flujo visible con exactamente un paso activo (`ol/li`)
    const flowStrip = page.getByRole("navigation", { name: "Flujo del editor" });
    await expect(flowStrip).toBeVisible();
    await expect(flowStrip.locator('[aria-current="step"]')).toHaveCount(1);

    // C1: el gesto implícito ahora es un hint visible (`role="status"`)
    await expect(page.locator('[role="status"]').filter({ hasText: /Toca un jugador/ })).toHaveCount(1);

    // C2: Probar vs Guardar se distinguen por `aria-describedby` sin cambiar el nombre
    const previewButton = page.getByRole("button", { name: "Probar", exact: true });
    const saveButton = page.getByRole("button", { name: "Guardar", exact: true });
    await expect(previewButton).toHaveAttribute("aria-describedby", "transition-preview-hint");
    await expect(page.locator("#transition-preview-hint")).toHaveText(/en memoria/);
    await expect(saveButton).toHaveAttribute("aria-describedby", "transition-save-hint");
    await expect(page.locator("#transition-save-hint")).toHaveText(/biblioteca/);
    // C5: el nombre accesible del botón Guardar es estable aunque el texto pase a "Guardado ✓"
    await expect(saveButton).toHaveAttribute("aria-label", "Guardar");

    const title = `Transición E2E ${Date.now()}`;
    await titleInput.fill(title);

    // C3: documento sucio → badge de estado; B3: el strip avanza a «Tiro»
    await expect(page.getByText(/●\s*Cambios sin guardar/).first()).toBeVisible();
    await expect(flowStrip.locator('[aria-current="step"]')).toHaveText(/Tiro/);

    // Añadir un segundo paso (filmstrip móvil; el aside está oculto a 375 px)
    await page.getByRole("button", { name: "Añadir paso", exact: true }).first().click();
    await expect(page.getByRole("tab", { name: /Paso 2/ }).first()).toBeVisible();

    // C4: filmstrip con copy de secuencia y reordenamiento «Antes / Después»
    await expect(page.getByText(/Secuencia · 2 pasos/).first()).toBeVisible();
    await expect(page.getByText("Cada paso es una foto de la jugada").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /← Antes/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Después →/ }).first()).toBeVisible();
    // B4: los locators históricos resuelven a 1 elemento (strict mode)
    await expect(page.getByRole("tab", { name: /^Paso 1/ })).toHaveCount(1);
    await expect(page.getByRole("tab", { name: /Paso 2/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Añadir paso", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Probar", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Guardar", exact: true })).toHaveCount(1);

    // Volver al paso 1 y Probar: el preview queda montado con el status visible
    await page.getByRole("tab", { name: /^Paso 1/ }).first().click();
    await page.getByRole("button", { name: "Probar" }).click();
    // B3/C1: durante el preview el strip marca «Prueba» y el hint del canvas desaparece
    await expect(flowStrip.locator('[aria-current="step"]')).toHaveText(/Prueba/);
    await expect(page.locator('[role="status"]').filter({ hasText: /Toca un jugador/ })).toHaveCount(0);
    const status = page.getByText(/Reproduciendo paso \d de \d/);
    await expect(status).toBeVisible();
    await expect(status).toContainText("de 2");
    // El preview termina solo (TWEEN_MS por paso) y vuelve el canvas editable
    await expect(status).toBeHidden({ timeout: 10000 });

    // Guardar → reemplaza la URL por /transiciones/<uuid>
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForURL(/\/transiciones\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await expectNoHorizontalScroll(page);

    // Persistencia: al recargar, el título viene de DB
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Título de la transición")).toHaveValue(title);
    await expect(page.getByRole("tab", { name: /Paso 2/ }).first()).toBeVisible();

    // C3/C5: documento persistido → badge «✓ Guardado» y el botón conserva su nombre
    await expect(page.getByText(/✓\s*Guardado/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar", exact: true })).toBeVisible();
  });

  test("USER en /transiciones es redirigido a /dashboard y la API responde 403", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "Requiere DATABASE_URL (seed SQL real)");
    await login(page, PLAYER_EMAIL);

    await page.goto(`${BASE_URL}/transiciones`);
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    expect(page.url()).toContain("/dashboard");

    // Mismo contexto (cookies del USER) contra la API del editor
    const res = await page.request.get(`${BASE_URL}/api/transitions`);
    expect(res.status()).toBe(403);
  });
});
