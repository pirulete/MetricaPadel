/**
 * E2E — Torneos: motor de agenda (AC-06/AC-08/AC-11).
 *
 * (a) Happy-path navegable en viewport móvil 375×812: login ADMIN → `/torneos` →
 *     "Importar torneo" → pegar el JSON de `tests/fixtures/torneo/mini.json`
 *     (nombre único por corrida) → Importar → la card aparece en la lista →
 *     "Ver detalle" → "Generar agenda" → espera estado terminal (`succeeded`)
 *     con polling hasta 90 s → grilla con celdas de partido + panel de
 *     diagnóstico (badge `succeeded`, semáforo, verificación sin errores).
 * (b) `USER` en `/torneos` → redirigido a `/dashboard` (guard de página) y
 *     `POST /api/torneos` → `403` (guard de API).
 *
 * Seed SQL real (patrón de `transition-editor.spec.ts`): el ADMIN se inserta
 * ACTIVE para no depender del flujo de registro. Hermético: nombre de torneo y
 * emails únicos por `Date.now()`, y `afterAll` borra torneos (cascade) +
 * audit_logs + usuarios.
 *
 * El run se despacha fire-and-forget desde el route; el worker del propio
 * servidor lo reclama. Requiere servidor en http://localhost:3000 + DATABASE_URL
 * + TOURNAMENT_WORKER_SECRET en el entorno del servidor.
 */
import { test, expect, type Page } from "@playwright/test";
import bcryptjs from "bcryptjs";
import { BASE_URL, getPool, serverUp } from "../api/auth/helpers";
import miniFixture from "../fixtures/torneo/mini.json";

const STAMP = Date.now();
const ADMIN_EMAIL = `e2e-torneo-admin-${STAMP}@test.local`;
const PLAYER_EMAIL = `e2e-torneo-player-${STAMP}@test.local`;
const PASSWORD = "TestPass123!";
const TOURNAMENT_NAME = `Mini torneo E2E ${STAMP}`;
const VIEWPORT = { width: 375, height: 812 };

const HAS_DB = Boolean(process.env.DATABASE_URL);

/** Mismo fixture que el API test, con nombre único para no colisionar. */
const FIXTURE_JSON = JSON.stringify({
  ...miniFixture,
  meta: { ...miniFixture.meta, name: TOURNAMENT_NAME },
});

async function seedUser(email: string, role: "ADMIN" | "USER") {
  const hash = await bcryptjs.hash(PASSWORD, 10);
  await getPool().query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'E2E', 'Torneo', $2, 'ACTIVE', $3, now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = $3, email_verified_at = now()`,
    [email, hash, role]
  );
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin|\/dashboard/, { timeout: 15000 });
}

test.beforeAll(async () => {
  if (!HAS_DB) return;
  await seedUser(ADMIN_EMAIL, "ADMIN");
  await seedUser(PLAYER_EMAIL, "USER");
});

test.afterAll(async () => {
  if (!HAS_DB) return;
  const pool = getPool();
  const emails = [ADMIN_EMAIL, PLAYER_EMAIL];
  await pool.query(
    `DELETE FROM tournaments WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails]
  );
  await pool.query(
    `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails]
  );
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
});

test.describe("Torneos — flujo de agenda (E2E)", () => {
  test.describe.configure({ timeout: 180_000 });

  if (!HAS_DB) {
    test.skip("Requiere DATABASE_URL (seed SQL real)", () => {});
    return;
  }

  test("import → generar agenda → grilla + diagnóstico a 375×812 (AC-06/AC-08/AC-11)", async ({
    page,
  }) => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    await page.setViewportSize(VIEWPORT);

    await login(page, ADMIN_EMAIL);
    await page.goto(`${BASE_URL}/torneos`);
    await expect(page.getByRole("heading", { name: "Torneos" })).toBeVisible();

    // --- import del fixture (mismo JSON canónico que el API test) -----------
    await page.getByRole("button", { name: "Importar torneo" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("#torneo-json").fill(FIXTURE_JSON);
    await dialog.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // --- la card del torneo aparece en la lista ------------------------------
    const card = page.locator('[data-slot="card"]').filter({ hasText: TOURNAMENT_NAME });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("Borrador");

    await card.getByRole("link", { name: "Ver detalle" }).click();
    await page.waitForURL(/\/torneos\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: TOURNAMENT_NAME })).toBeVisible();

    // --- generar agenda: 202 + polling hasta estado terminal ----------------
    await page.getByRole("button", { name: "Generar agenda del torneo" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Agenda generada en/ })).toBeVisible({
      timeout: 90_000,
    });

    // --- panel de diagnóstico ----------------------------------------------
    await expect(page.getByRole("heading", { name: "Diagnóstico del run" })).toBeVisible();
    await expect(page.getByText("succeeded", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Semáforo de ocupación" })).toBeVisible();
    await expect(page.getByText(/^(Verde|Amarillo \(sin margen\)|Rojo \(infactible\))$/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verificación independiente" })).toBeVisible();

    // --- grilla: celdas de partido con tooltip de código + ocupación --------
    await expect(page.getByRole("heading", { name: "Agenda propuesta" })).toBeVisible();
    const grid = page.locator('table:has(caption:text("Agenda propuesta"))');
    await expect(grid).toBeVisible();
    expect(await grid.locator("td[title]").count()).toBeGreaterThan(0);
    await expect(grid.getByRole("rowheader", { name: "Ocup." })).toBeVisible();
    await expect(page.getByText("Categorías:").first()).toBeVisible();

    // --- AC-11: viewport móvil aplicado y grilla con scroll propio ----------
    // BUG-01 (F5c) corregido: el wrapper usa `w-0 min-w-full` para no aportar su
    // ancho intrínseco a la cadena de flex items (`min-width: auto`), así el
    // documento queda acotado al viewport y el desborde vive solo dentro del
    // contenedor `overflow-x: auto`.
    const layout = await page.evaluate(() => {
      const wrapper = document.querySelector("table")?.parentElement;
      const table = document.querySelector("table");
      return {
        viewport: document.documentElement.clientWidth,
        doc: document.documentElement.scrollWidth,
        gridOverflowX: wrapper ? getComputedStyle(wrapper).overflowX : "missing",
        wrapperWidth: wrapper ? wrapper.getBoundingClientRect().width : 0,
        tableWidth: table ? table.getBoundingClientRect().width : 0,
      };
    });
    expect(layout.viewport).toBe(VIEWPORT.width);
    expect(layout.gridOverflowX).toBe("auto");
    expect(layout.doc).toBeLessThanOrEqual(VIEWPORT.width);
    // La tabla conserva su ancho natural (> viewport) dentro del scroll.
    expect(layout.tableWidth).toBeGreaterThan(layout.wrapperWidth);

    // El torneo pasó a `agenda_draft` con slots persistidos (SQL real).
    const { rows } = await getPool().query<{ status: string; slots: number }>(
      `SELECT t.status,
              (SELECT count(*)::int FROM tournament_agenda_slots s
                 JOIN tournament_runs r ON r.id = s.run_id
                WHERE r.tournament_id = t.id) AS slots
         FROM tournaments t
        WHERE t.name = $1`,
      [TOURNAMENT_NAME]
    );
    expect(rows[0]?.status).toBe("agenda_draft");
    expect(rows[0]?.slots ?? 0).toBeGreaterThan(0);
  });

  test("USER no accede a /torneos ni a la API (guard 403)", async ({ page }) => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
    await login(page, PLAYER_EMAIL);

    await page.goto(`${BASE_URL}/torneos`);
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const status = await page.evaluate(async () => {
      const res = await fetch("/api/torneos", { cache: "no-store" });
      return res.status;
    });
    expect(status).toBe(403);
  });
});
