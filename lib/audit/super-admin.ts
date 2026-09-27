/**
 * Audit helpers dedicados para acciones de Super Admin (rol SUPER_ADMIN).
 * Viven en archivo propio (D4) para mantener lib/audit/helpers.ts < 500 líneas.
 * ActionTypes dedicados (ADMIN_PROMOTED/ADMIN_DEMOTED) hacen el filtro
 * actionType de GET /api/admin/audit-logs trazable (AC-05).
 */
import { createAuditLog } from '@/lib/db/session-audit-queries'
import type { AuditContext } from '@/lib/audit/helpers'

/**
 * Audit: un SUPER_ADMIN promueve USER → ADMIN (ADMIN_PROMOTED).
 * entityId = targetUserId, newValues = {role:'ADMIN'}, metadata = {superAdmin:true}
 */
export async function auditAdminPromoted(
  actorId: string,
  targetUserId: string,
  context: AuditContext = {}
) {
  return await createAuditLog('ADMIN_PROMOTED', 'user', targetUserId, {
    userId: actorId,
    newValues: { role: 'ADMIN' },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { superAdmin: true, ...context.metadata },
  })
}

/**
 * Audit: un SUPER_ADMIN demota ADMIN → USER (ADMIN_DEMOTED).
 * oldValues = {role:'ADMIN'}, newValues = {role:'USER'}, metadata = {superAdmin:true}
 */
export async function auditAdminDemoted(
  actorId: string,
  targetUserId: string,
  context: AuditContext = {}
) {
  return await createAuditLog('ADMIN_DEMOTED', 'user', targetUserId, {
    userId: actorId,
    oldValues: { role: 'ADMIN' },
    newValues: { role: 'USER' },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { superAdmin: true, ...context.metadata },
  })
}