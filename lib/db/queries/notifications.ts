import { db } from "@/lib/db";
import { notificationPreferences, notifications } from "@/lib/db/schema";
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from "@/lib/db/schema";
import { and, count, eq, gte, inArray, isNull, lt } from "drizzle-orm";

export type NotificationListOptions = {
  category?: NotificationCategory;
  unread?: boolean;
  limit?: number;
  cursor?: string;
};

export type NotificationListResult = {
  items: Array<typeof notifications.$inferSelect>;
  nextCursor: string | null;
};

/**
 * Lista paginada por cursor (createdAt desc) del inbox del usuario.
 * Siempre excluye notificaciones soft-deleted (deletedAt IS NULL).
 */
export async function getNotificationsByUserId(
  userId: string,
  opts: NotificationListOptions = {},
): Promise<NotificationListResult> {
  const limit = Math.min(opts.limit ?? 20, 50);

  const conditions = [
    eq(notifications.userId, userId),
    isNull(notifications.deletedAt),
  ];
  if (opts.category) conditions.push(eq(notifications.category, opts.category));
  if (opts.unread) conditions.push(eq(notifications.read, 0));
  if (opts.cursor) conditions.push(lt(notifications.createdAt, new Date(opts.cursor)));

  const items = await db.query.notifications.findMany({
    where: and(...conditions),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: limit + 1,
  });

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore && pageItems.length > 0
    ? pageItems[pageItems.length - 1].createdAt.toISOString()
    : null;

  return { items: pageItems, nextCursor };
}

/** Count de no leídas (read = 0, excluye soft-deleted). */
export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db.select({ count: count() })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.read, 0),
      isNull(notifications.deletedAt),
    ));
  return row?.count ?? 0;
}

/** Marca una notificación como leída (scoped al userId). */
export async function markAsRead(userId: string, notificationId: string) {
  const [row] = await db.update(notifications)
    .set({ read: 1 })
    .where(and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId),
    ))
    .returning();
  return row ?? null;
}

/** Marca todas las no leídas del usuario como leídas. Retorna cantidad. */
export async function markAllAsRead(userId: string): Promise<number> {
  const rows = await db.update(notifications)
    .set({ read: 1 })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.read, 0),
      isNull(notifications.deletedAt),
    ))
    .returning();
  return rows.length;
}

/**
 * Setea el estado read (1/0) de un conjunto de notificaciones scoped al userId.
 * Excluye soft-deleted. Retorna cantidad actualizada.
 */
export async function setNotificationsRead(userId: string, ids: string[], read: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db.update(notifications)
    .set({ read: read ? 1 : 0 })
    .where(and(
      eq(notifications.userId, userId),
      inArray(notifications.id, ids),
      isNull(notifications.deletedAt),
    ))
    .returning();
  return rows.length;
}

/** Soft delete: setea deletedAt (nunca DELETE físico). */
export async function softDeleteNotification(userId: string, notificationId: string) {
  const [row] = await db.update(notifications)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId),
    ))
    .returning();
  return row ?? null;
}

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  body?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  groupId?: string;
  category?: NotificationCategory;
  metadata?: Record<string, unknown>;
};

/** Crea una notificación en el inbox (inbox-first). Defaults: priority P2, category system. */
export async function createNotification(data: CreateNotificationInput) {
  const [row] = await db.insert(notifications).values({
    userId: data.userId,
    type: data.type,
    priority: data.priority ?? 'P2',
    title: data.title,
    body: data.body,
    ctaUrl: data.ctaUrl,
    ctaLabel: data.ctaLabel,
    groupId: data.groupId,
    category: data.category ?? 'system',
    metadata: data.metadata,
  }).returning();
  return row;
}

/**
 * Dedup por groupId dentro de ventana de 1h. Retorna true si ya existe una
 * notificación con el mismo (userId, groupId) creada en la última hora.
 * Sin groupId retorna false (no aplica dedup).
 */
export async function checkDuplicateNotification(userId: string, groupId: string): Promise<boolean> {
  if (!groupId) return false;

  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db.select({ id: notifications.id })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.groupId, groupId),
      gte(notifications.createdAt, cutoff),
    ))
    .limit(1);

  return !!row;
}

// ─── Preferencias (canal/categoría) ──────────────────────────────────────────

/** Preferencias del usuario (todas las filas; default enabled=true si no existe). */
export async function getNotificationPreferences(userId: string) {
  return await db.query.notificationPreferences.findMany({
    where: eq(notificationPreferences.userId, userId),
  });
}

/** Upsert por UNIQUE (userId, channel, category). */
export async function upsertNotificationPreference(
  userId: string,
  data: { channel: NotificationChannel; category: NotificationCategory; enabled: boolean },
) {
  const [row] = await db.insert(notificationPreferences)
    .values({
      userId,
      channel: data.channel,
      category: data.category,
      enabled: data.enabled,
    })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.userId,
        notificationPreferences.channel,
        notificationPreferences.category,
      ],
      set: { enabled: data.enabled },
    })
    .returning();
  return row;
}