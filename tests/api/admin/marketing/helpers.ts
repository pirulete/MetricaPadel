/**
 * Helpers para API tests admin del Marketing CMS.
 * Requiere DATABASE_URL (NeonDB) y un servidor en PLAYWRIGHT_BASE_URL (default localhost:3000).
 * - createUser/deleteUser: SQL real (bcrypt + pg) para crear sesiones ADMIN/USER.
 * - signIn: flujo NextAuth (csrf + callback credentials) para obtener cookie de sesión.
 * - cleanupMarketing: borra filas de marketing con prefijo de slug (hermético por test).
 */
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";

for (const envFile of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(p)) loadEnv({ path: p, override: false });
}

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida. Los happy-path tests requieren SQL real contra NeonDB.");
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon.tech") ? { rejectUnauthorized: false } : false,
  });
}

export async function createUser(opts: { role: "USER" | "ADMIN"; email: string; password: string }) {
  const pool = getPool();
  const hash = await bcrypt.hash(opts.password, 10);
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status, role, email_verified_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Test', 'User', $2, 'ACTIVE', $3, now(), now(), now())
     ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE', password_hash = $2`,
    [opts.email, hash, opts.role]
  );
}

export async function deleteUserByEmail(email: string) {
  const pool = getPool();
  await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
}

/** Borra filas de marketing cuyo slug/name tenga el prefijo (por test, hermético). */
export async function cleanupMarketing(prefix: string) {
  const pool = getPool();
  const like = `${prefix}%`;
  await pool.query(
    `DELETE FROM marketing_sections WHERE page_id IN (SELECT id FROM marketing_pages WHERE slug LIKE $1)`,
    [like]
  );
  await pool.query(`DELETE FROM marketing_pages WHERE slug LIKE $1`, [like]);
  await pool.query(`DELETE FROM marketing_posts WHERE slug LIKE $1`, [like]);
  await pool.query(`DELETE FROM marketing_products WHERE slug LIKE $1`, [like]);
  await pool.query(`DELETE FROM marketing_categories WHERE slug LIKE $1`, [like]);
}

/** Autentica un context de Playwright contra Auth.js (flujo csrf + callback credentials). */
export async function signIn(ctx: APIRequestContext, email: string, password: string) {
  // In development, CSRF check is skipped — try to get token, but don't fail if 404
  let csrfToken = "";
  const csrfRes = await ctx.get("/api/auth/csrf");
  if (csrfRes.ok()) {
    const body = await csrfRes.json();
    csrfToken = body.csrfToken || "";
  }
  const res = await ctx.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password, redirect: "false" },
  });
  if (!res.ok() && res.status() !== 302) {
    throw new Error(`Sign-in falló (${res.status()}) para ${email}`);
  }
}

/** Crea un context autenticado como el usuario indicado. */
export async function createAuthedContext(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
  await signIn(ctx, email, password);
  return ctx;
}

export async function createAdminContext(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await createAuthedContext(email, password);
  const session = await ctx.get("/api/auth/session");
  if (!session.ok()) throw new Error("Sesión no válida");
  return ctx;
}

export async function uuid(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT gen_random_uuid() AS id");
  return rows[0].id as string;
}
