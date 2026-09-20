/**
 * Motor de notificaciones (inbox-first).
 *
 * Capa de negocio sobre `lib/db/queries/notifications`: aplica dedup por groupId
 * al crear y expone la API de inbox (list, mark-read, soft-delete).
 * NO envía push — push es un canal de delivery aparte (`lib/push/sender.ts`).
 */
import {
  createNotification as dbCreateNotification,
  getNotificationsByUserId,
  markAsRead as dbMarkAsRead,
  markAllAsRead as dbMarkAllAsRead,
  softDeleteNotification as dbSoftDeleteNotification,
  checkDuplicateNotification as dbCheckDuplicateNotification,
} from '@/lib/db/queries/notifications';
import type { NotificationCategory, NotificationPriority, NotificationType } from '@/lib/db/schema';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  priority?: NotificationPriority;
  groupId?: string;
  category?: NotificationCategory;
  metadata?: Record<string, unknown>;
}

export type NotificationListOptions = {
  category?: NotificationCategory;
  unread?: boolean;
  limit?: number;
  cursor?: string;
};

/**
 * Crea una notificación en el inbox. Si `groupId` está presente, aplica dedup
 * (ventana 1h): retorna null si ya existe una notificación con el mismo
 * (userId, groupId) — eventos repetidos no duplican el inbox.
 */
export async function createNotification(input: CreateNotificationInput) {
  if (input.groupId) {
    const duplicate = await dbCheckDuplicateNotification(input.userId, input.groupId);
    if (duplicate) return null;
  }
  return dbCreateNotification(input);
}

/** Lista paginada del inbox (excluye soft-deleted). */
export function getNotifications(userId: string, options: NotificationListOptions = {}) {
  return getNotificationsByUserId(userId, options);
}

/** Marca una notificación como leída (scoped al userId). */
export function markAsRead(userId: string, notificationId: string) {
  return dbMarkAsRead(userId, notificationId);
}

/** Marca todas las no leídas como leídas. Retorna cantidad. */
export function markAllAsRead(userId: string) {
  return dbMarkAllAsRead(userId);
}

/** Soft delete (setea deletedAt, nunca DELETE físico). */
export function softDelete(userId: string, notificationId: string) {
  return dbSoftDeleteNotification(userId, notificationId);
}

/** Dedup por groupId dentro de ventana 1h. */
export function checkDuplicateNotification(userId: string, groupId: string) {
  return dbCheckDuplicateNotification(userId, groupId);
}