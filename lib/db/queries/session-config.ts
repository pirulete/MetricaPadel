import { db } from "@/lib/db";
import { sessionConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Default TTL (minutos) cuando no existe fila en session_config.
 * Se lee en call-time (no module-load) para permitir override por env
 * sin reiniciar y para testabilidad.
 */
function defaultAccessTokenTtl(): number {
  return parseInt(process.env.SESSION_ACCESS_TOKEN_TTL || "15", 10);
}

export interface SessionConfigData {
  accessTokenTtl: number;
}

/**
 * Get session configuration (singleton row).
 * Returns env var default if no row exists. Never throws on missing table:
 * callers wrap in try-catch to degrade gracefully.
 */
export async function getSessionConfig(): Promise<SessionConfigData> {
  const [config] = await db
    .select()
    .from(sessionConfig)
    .limit(1);

  if (!config) {
    return { accessTokenTtl: defaultAccessTokenTtl() };
  }

  return {
    accessTokenTtl: config.accessTokenTtl,
  };
}

/**
 * Update the singleton session config row (upsert).
 */
export async function updateSessionConfig(data: Partial<SessionConfigData>) {
  const existing = await db
    .select({ id: sessionConfig.id })
    .from(sessionConfig)
    .limit(1);

  if (existing.length > 0) {
    return await db
      .update(sessionConfig)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(sessionConfig.id, existing[0].id))
      .returning();
  }

  return await db
    .insert(sessionConfig)
    .values({
      accessTokenTtl: data.accessTokenTtl ?? defaultAccessTokenTtl(),
    })
    .returning();
}