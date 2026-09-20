/**
 * Audit Log Helper - Simplifica el registro de acciones
 * Proporciona funciones wrapper para casos comunes
 */

import { createAuditLog } from '@/lib/db/session-audit-queries'

export interface AuditContext {
  userId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

/**
 * Registrar creación de entidad
 */
export async function auditCreate(
  entityName: string,
  entityId: string,
  newValues: Record<string, any>,
  context: AuditContext
) {
  return await createAuditLog('CREATE', entityName, entityId, {
    userId: context.userId,
    newValues,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: context.metadata,
  })
}

/**
 * Registrar actualización de entidad
 */
export async function auditUpdate(
  entityName: string,
  entityId: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>,
  context: AuditContext
) {
  return await createAuditLog('UPDATE', entityName, entityId, {
    userId: context.userId,
    oldValues,
    newValues,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: context.metadata,
  })
}

/**
 * Registrar eliminación de entidad
 */
export async function auditDelete(
  entityName: string,
  entityId: string,
  oldValues: Record<string, any>,
  context: AuditContext
) {
  return await createAuditLog('DELETE', entityName, entityId, {
    userId: context.userId,
    oldValues,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: context.metadata,
  })
}

/**
 * Registrar login exitoso
 */
export async function auditLogin(
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  return await createAuditLog('LOGIN', 'user', userId, {
    userId,
    ipAddress,
    userAgent,
    metadata: { success: true },
  })
}

/**
 * Registrar intento de login fallido
 */
export async function auditLoginFailure(
  email: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
) {
  return await createAuditLog('LOGIN', 'user', email, {
    ipAddress,
    userAgent,
    metadata: { success: false, reason },
  })
}

/**
 * Registrar logout
 */
export async function auditLogout(
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  return await createAuditLog('LOGOUT', 'user', userId, {
    userId,
    ipAddress,
    userAgent,
  })
}

/**
 * Registrar verificación de email
 */
export async function auditVerifyEmail(
  userId: string,
  email: string,
  ipAddress?: string
) {
  return await createAuditLog('VERIFY_EMAIL', 'user', userId, {
    userId,
    newValues: { emailVerifiedAt: new Date().toISOString() },
    ipAddress,
  })
}

/**
 * Registrar cambio de contraseña
 */
export async function auditChangePassword(
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  return await createAuditLog('CHANGE_PASSWORD', 'user', userId, {
    userId,
    ipAddress,
    userAgent,
    metadata: { reason: 'User initiated password change' },
  })
}

/**
 * Registrar reset de contraseña
 */
export async function auditResetPassword(
  userId: string,
  email: string,
  ipAddress?: string
) {
  return await createAuditLog('RESET_PASSWORD', 'user', userId, {
    ipAddress,
    metadata: { email, initiatedBy: 'user' },
  })
}

/**
 * Registrar creación de sesión
 */
export async function auditSessionCreate(
  userId: string,
  sessionId: string,
  ipAddress?: string,
  userAgent?: string
) {
  return await createAuditLog('SESSION_CREATE', 'session', sessionId, {
    userId,
    ipAddress,
    userAgent,
  })
}

/**
 * Registrar eliminación de sesión
 */
export async function auditSessionDelete(
  userId: string,
  sessionId: string,
  reason: string = 'user',
  ipAddress?: string
) {
  return await createAuditLog('SESSION_DELETE', 'session', sessionId, {
    userId,
    ipAddress,
    metadata: { reason },
  })
}

/**
 * Registrar acceso administrativo
 */
export async function auditAdminAction(
  adminUserId: string,
  action: string,
  entityName: string,
  entityId: string,
  changes?: Record<string, any>,
  ipAddress?: string
) {
  return await createAuditLog(action.toUpperCase(), entityName, entityId, {
    userId: adminUserId,
    newValues: changes,
    ipAddress,
    metadata: { adminAction: true },
  })
}

/**
 * Registrar evento de seguridad
 */
export async function auditSecurityEvent(
  userId: string | undefined,
  eventType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  description: string,
  ipAddress?: string
) {
  return await createAuditLog('SECURITY_EVENT', 'system', eventType, {
    userId,
    ipAddress,
    metadata: {
      severity,
      description,
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Extraer IP y User-Agent de NextRequest
 */
export function extractRequestContext(request: Request) {
  const ipAddress = request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const userAgent = request.headers.get('user-agent') || undefined;

  return { ipAddress, userAgent };
}

/**
 * Registrar upload de foto de perfil (AVATAR_UPLOADED)
 */
export async function auditAvatarUploaded(
  userId: string,
  avatarUrl: string,
  context: AuditContext
) {
  return await createAuditLog('AVATAR_UPLOADED', 'user', userId, {
    userId,
    newValues: { avatarUrl },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { profile: true, action: 'avatar_uploaded', ...context.metadata },
  });
}

/**
 * Registrar eliminación de foto de perfil (AVATAR_DELETED)
 */
export async function auditAvatarDeleted(
  userId: string,
  oldAvatarUrl: string | null,
  context: AuditContext
) {
  return await createAuditLog('AVATAR_DELETED', 'user', userId, {
    userId,
    oldValues: { avatarUrl: oldAvatarUrl },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { profile: true, action: 'avatar_deleted', ...context.metadata },
  });
}

/**
 * Registrar aceptación de T&C (TERMS_ACCEPTED)
 */
export async function auditTermsAccepted(
  userId: string,
  termsVersionId: string,
  context: AuditContext,
) {
  return await createAuditLog('TERMS_ACCEPTED', 'terms_versions', termsVersionId, {
    userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { terms: true, action: 'terms_accepted', ...context.metadata },
  });
}

/**
 * Registrar publicación de nueva versión de T&C (TERMS_VERSION_PUBLISHED)
 */
export async function auditTermsVersionPublished(
  adminId: string,
  termsVersionId: string,
  versionNumber: number,
  context: AuditContext,
) {
  return await createAuditLog('TERMS_VERSION_PUBLISHED', 'terms_versions', termsVersionId, {
    userId: adminId,
    newValues: { versionNumber },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { terms: true, action: 'terms_version_published', ...context.metadata },
  });
}

// ─── Push Notifications ───────────────────────────────────────────────────────

/**
 * Registrar creación de suscripción push.
 * metadata: { device_type, browser, os }
 */
export async function auditPushSubscriptionCreated(
  subscriptionId: string,
  data: { endpoint: string; device_type?: string; browser?: string; os?: string },
  context: AuditContext
) {
  return await createAuditLog('PUSH_SUBSCRIPTION_CREATED', 'push_subscriptions', subscriptionId, {
    userId: context.userId,
    newValues: { endpoint: data.endpoint, device_type: data.device_type ?? null, browser: data.browser ?? null, os: data.os ?? null },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { device_type: data.device_type, browser: data.browser, os: data.os },
  })
}

/**
 * Registrar revocación de suscripción push.
 * metadata: { endpoint (truncado), revokedAll }
 */
export async function auditPushSubscriptionRevoked(
  data: { userId: string; endpoint?: string; revokedAll: boolean; count: number },
  context: AuditContext
) {
  return await createAuditLog('PUSH_SUBSCRIPTION_REVOKED', 'push_subscriptions', data.userId, {
    userId: context.userId,
    oldValues: { endpoint: data.endpoint ?? null, revokedAll: data.revokedAll },
    newValues: { revoked: data.count },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { revokedAll: data.revokedAll, count: data.count },
  })
}

/**
 * Registrar envío de push directo a un usuario individual.
 * entityId = targetUserId, newValues = {sentTo, title, body, url}, metadata = {actorRole}
 */
export async function auditPushDirectSent(
  targetUserId: string,
  data: { title: string; body: string; sentTo?: number; url?: string },
  context: AuditContext & { actorRole?: string }
) {
  return await createAuditLog('PUSH_DIRECT_SENT', 'push_subscriptions', targetUserId, {
    userId: context.userId,
    newValues: { sentTo: data.sentTo ?? null, title: data.title, body: data.body, url: data.url ?? null },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { actorRole: context.actorRole ?? null },
  })
}

/**
 * Registrar envío de broadcast push.
 * metadata: { sentTo, failed, title }
 */
export async function auditPushBroadcastSent(
  broadcastId: string,
  data: { sentTo: number; failed: number; title: string },
  context: AuditContext & { actorRole?: string }
) {
  return await createAuditLog('PUSH_BROADCAST_SENT', 'push_broadcasts', broadcastId, {
    userId: context.userId,
    newValues: { sentTo: data.sentTo, failed: data.failed, title: data.title },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { sentTo: data.sentTo, failed: data.failed, actorRole: context.actorRole ?? null },
  })
}

// ─── Notifications — Delete & Categories ─────────────────────────────────────

/**
 * Audit: notification soft-deleted by user (NOTIFICATION_HIDDEN)
 */
export async function auditNotificationHidden(
  notificationId: string,
  userId: string,
  category: string,
  context: AuditContext
) {
  return await createAuditLog('NOTIFICATION_HIDDEN', 'notifications', notificationId, {
    userId,
    newValues: { category, hiddenBy: userId },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: context.metadata,
  })
}

/**
 * Audit: notification hard-deleted by admin (NOTIFICATION_DELETED)
 */
export async function auditNotificationDeleted(
  notificationId: string,
  oldValues: Record<string, any>,
  deletedBy: string,
  context: AuditContext
) {
  return await createAuditLog('NOTIFICATION_DELETED', 'notifications', notificationId, {
    userId: deletedBy,
    oldValues,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: context.metadata,
  })
}

/**
 * Audit: broadcast hard-deleted by admin (BROADCAST_DELETED)
 */
export async function auditBroadcastDeleted(
  broadcastId: string,
  oldValues: Record<string, any>,
  deletedBy: string,
  context: AuditContext
) {
  return await createAuditLog('BROADCAST_DELETED', 'broadcasts', broadcastId, {
    userId: deletedBy,
    oldValues,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: context.metadata,
  })
}
