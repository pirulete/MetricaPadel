import { defineConfig } from "drizzle-kit";
import * as dotenv from 'dotenv';

// Forzamos la lectura de las variables de entorno locales
dotenv.config({ path: '.env.local' });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: './drizzle',
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
