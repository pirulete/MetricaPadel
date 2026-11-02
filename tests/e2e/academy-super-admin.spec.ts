/**
 * E2E — Academias Ownership SUPER_ADMIN + Solicitudes (v0.9).
 * Flujo navegable: SUPER_ADMIN ve nav Academias/Solicitudes → aprueba solicitud
 * join → en Academias asigna rol / transfiere ownership.
 * Requiere servidor http://localhost:3000 + DB. NO ejecutar desde @admin-engineer.
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
const SA_EMAIL = `e2e-sa-academy-${Date.now()}@test.local`;
const COACH_EMAIL = `e2e-coach-req-${Date.now()}@test.local`;
const PASSWORD = "TestPass123!";

let pool: Pool;
let coachId: string;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcryptjs.hash(PASSWORD, 10);

  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Super', 'Admin', $2, 'ACTIVE', 'SUPER_ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'SUPER_ADMIN', email_verified_at = now()`,
    [SA_EMAIL, hash]
  );
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Coach', 'Requester', $2, 'ACTIVE', 'ADMIN', now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE', role = 'ADMIN', email_verified_at = now()`,
    [COACH_EMAIL, hash]
  );
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [COACH_EMAIL]);
  coachId = rows[0].id;

  // Academia activa existente + solicitud join pendiente del coach
  const slug = `e2e-sa-${Date.now()}`;
  const { rows: ac } = await pool.query(
    `INSERT INTO academies (id, owner_id, name, slug, primary_color, status, created_at, updated_at)
     VALUES (gen_random_uuid(), (SELECT id FROM users WHERE email = $1), 'E2E SA Academy', $2, '#3b82f6', 'active', now(), now())
     RETURNING id`,
    [SA_EMAIL, slug]
  );
  await pool.query(
    `INSERT INTO academy_access_requests (id, user_id, type, academy_id, requested_role, payload, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'join_academy', $2, 'COACH', '{}'::jsonb, 'pending', now(), now())`,
    [coachId, ac[0].id]
  );
});

test.afterAll(async () => {
  if (pool) {
    await pool.query(`DELETE FROM academy_access_requests WHERE user_id = $1`, [coachId]);
    await pool.query(
      `DELETE FROM academies WHERE name = 'E2E SA Academy' AND slug LIKE 'e2e-sa-%'`
    );
    await pool.query(`DELETE FROM users WHERE email IN ($1, $2)`, [SA_EMAIL, COACH_EMAIL]);
    await pool.end();
  }
});

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();
  await page.waitForURL(/\/admin|\/dashboard/, { timeout: 15000 });
}

test("SUPER_ADMIN aprueba solicitud y gestiona academias", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, SA_EMAIL);

  // Nav ve Academias y Solicitudes
  await expect(page.getByRole("link", { name: "Academias" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Solicitudes" })).toBeVisible();

  // Solicitudes: aprobar la pendiente del coach
  await page.goto(`${BASE_URL}/admin/platform/solicitudes`);
  await expect(page.getByRole("heading", { name: /solicitudes/i })).toBeVisible();
  const approve = page.getByRole("button", { name: "Aprobar" }).first();
  await expect(approve).toBeVisible({ timeout: 15000 });
  await approve.click();
  await expect(page.getByText(/aprobada/i).first()).toBeVisible({ timeout: 15000 });

  // Academias: tabla visible con acciones
  await page.goto(`${BASE_URL}/admin/platform/academias`);
  await expect(page.getByRole("heading", { name: /academias/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear academia" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Transferir" }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "Roles" }).first()).toBeVisible();
});
