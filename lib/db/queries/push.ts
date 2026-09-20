import { db } from "@/lib/db";
import { pushClickEvents, pushSubscriptions } from "@/lib/db/schema";
import { and, eq, lt } from "drizzle-orm";

export type UpsertPushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceType?: string;
  browser?: string;
  os?: string;
};

/**
 * Upsert por (userId, endpoint): si el dispositivo ya existe, reactiva la
 * subscripción (status active) y refresca keys/device info + lastActiveAt.
 */
export async function upsertPushSubscription(userId: string, data: UpsertPushSubscriptionInput) {
  const now = new Date();
  const [row] = await db.insert(pushSubscriptions)
    .values({
      userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      deviceType: data.deviceType ?? 'desktop',
      browser: data.browser,
      os: data.os,
      status: 'active',
      lastActiveAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
      set: {
        p256dh: data.p256dh,
        auth: data.auth,
        deviceType: data.deviceType ?? 'desktop',
        browser: data.browser,
        os: data.os,
        status: 'active',
        lastActiveAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Revoca una subscripción (status → revoked). Retorna null si no existe. */
export async function revokePushSubscription(userId: string, endpoint: string) {
  const [row] = await db.update(pushSubscriptions)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(and(
      eq(pushSubscriptions.userId, userId),
      eq(pushSubscriptions.endpoint, endpoint),
    ))
    .returning();
  return row ?? null;
}

/** Marca una subscripción como expired por endpoint (404/410 del push service). */
export async function markEndpointExpired(endpoint: string) {
  const [row] = await db.update(pushSubscriptions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning();
  return row ?? null;
}

/** Subscripciones activas de un usuario (para dispatch a ese usuario). */
export async function getActiveSubscriptions(userId: string) {
  return await db.query.pushSubscriptions.findMany({
    where: and(
      eq(pushSubscriptions.userId, userId),
      eq(pushSubscriptions.status, 'active'),
    ),
  });
}

/** Todas las subscripciones activas (para broadcast). */
export async function getActiveForBroadcast() {
  return await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.status, 'active'),
  });
}

/**
 * Marca como expired las subscripciones activas sin actividad en >30 días.
 * Retorna cantidad de subscripciones expiradas.
 */
export async function markExpiredSubscriptions(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.update(pushSubscriptions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(and(
      eq(pushSubscriptions.status, 'active'),
      lt(pushSubscriptions.lastActiveAt, cutoff),
    ))
    .returning();
  return rows.length;
}

/** Registra un click en notificación push (CTR analytics). */
export async function logClickEvent(userId: string, endpoint: string, url?: string, eventType?: string) {
  const [row] = await db.insert(pushClickEvents)
    .values({ userId, endpoint, url, eventType })
    .returning();
  return row;
}