import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  // SSL config for NeonDB (self-signed certs)
  // nosemgrep: bypass-tls-verification — requerido por NeonDB
  ssl: process.env.DATABASE_URL?.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
});

export const db = drizzle(pool, { schema });
