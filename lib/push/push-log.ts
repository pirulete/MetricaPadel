/**
 * Delivery log de push events (fire-and-forget).
 *
 * El skeleton hace dedup por groupId en `notifications` (checkDuplicateNotification),
 * por lo que este helper queda como hook de tracking para proyectos que quieran
 * persistir un delivery log (tabla push_notification_log). Sin tabla, registra en
 * consola en dev y es no-op en producción.
 */
export async function logPushEvent(
  userId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[Push] event=${eventType} userId=${userId}`, metadata ?? {})
  }
}