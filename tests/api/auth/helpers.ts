/**
 * Helpers para API tests de auth (signin).
 * Patrón: tests/api/admin/marketing/helpers.ts (dotenv + Pool + probe de servidor).
 * - insertUser usa SOLO columnas base (sin avatar_url/terms): seguro si la
 *   migración 0001 no está aplicada localmente.
 * - uniqueIp aísla el bucket de rate limit (10 req/IP/ventana en signin).
 */
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
export const HAS_DB = Boolean(process.env.DATABASE_URL);

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida. Los happy-path tests requieren SQL real contra NeonDB.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("neon.tech") ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

let serverProbe: Promise<boolean> | null = null;

/** Verifica (una sola vez) que haya un servidor disponible en BASE_URL. */
export function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/csrf`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

let ipCounter = 0;

/** IP única por request para aislar el bucket de rate limit por test. */
export function uniqueIp(): string {
  ipCounter += 1;
  const t = Date.now();
  return `10.${(t >> 8) % 255}.${t % 255}.${ipCounter}`;
}

/** Inserta usuario ACTIVE con columnas base y retorna su id. */
export async function insertUser(opts: {
  email: string;
  password: string;
  status?: "TEMPORARY" | "ACTIVE";
}): Promise<string> {
  const hash = await bcrypt.hash(opts.password, 10);
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, status)
     VALUES (gen_random_uuid(), $1, 'Test', 'User', $2, $3)
     RETURNING id`,
    [opts.email.toLowerCase(), hash, opts.status ?? "ACTIVE"]
  );
  return rows[0].id;
}

/** Limpieza hermética: usuario + filas LOGIN en audit_logs generadas por el test. */
export async function cleanupTestUser(email: string, userId?: string) {
  const db = getPool();
  await db.query(`DELETE FROM users WHERE email = $1`, [email.toLowerCase()]);
  await db.query(
    `DELETE FROM audit_logs WHERE action_type = 'LOGIN' AND entity_id IN ($1, $2)`,
    [userId ?? "", email.toLowerCase()]
  );
}
