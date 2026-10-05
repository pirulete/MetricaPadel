/**
 * Audit Helpers — Academia v0.9 (Ownership SUPER_ADMIN + Solicitudes de Acceso).
 *
 * helpers.ts ya tiene 579 líneas y NO se toca (D10 del technical-design). Estos
 * helpers importan `createAuditLog` + `AuditContext` de helpers.ts y cubren los
 * eventos nuevos de la feature:
 *   REQUEST_CREATED / REQUEST_APPROVED / REQUEST_REJECTED (academy_access_requests)
 *   OWNERSHIP_TRANSFERRED / ACADEMY_RESTORED (academies)
 *   MEMBER_ROLE_ASSIGNED (academy_memberships)
 *
 * OJO con transacciones: `createAuditLog` usa el handle global `db`, NO el
 * cliente tx (ver comentario en `auditPairEvaluationPublished`, helpers.ts
 * 552-557). Los endpoints deben llamar estos helpers FUERA de la tx o, si el
 * insert autoritativo ocurre dentro de la tx (ej: approve join/create), hacer
 * el insert de auditoría con el tx client y espejar el payload aquí para
 * consistencia de API.
 */
import { createAuditLog } from '@/lib/db/session-audit-queries'
import type { AuditContext } from './helpers'

/**
 * Audit: solicitud de acceso creada (REQUEST_CREATED).
 * entityId = requestId, newValues = {userId, type, academyId, requestedRole, payload}
 */
export async function auditAccessRequestCreated(
  requestId: string,
  data: {
    userId: string
    type: string
    academyId?: string | null
    requestedRole: string
    payload?: Record<string, unknown>
  },
  context: AuditContext
) {
  return await createAuditLog('REQUEST_CREATED', 'academy_access_requests', requestId, {
    userId: context.userId ?? data.userId,
    newValues: {
      userId: data.userId,
      type: data.type,
      academyId: data.academyId ?? null,
      requestedRole: data.requestedRole,
      payload: data.payload ?? {},
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { academy: true, action: 'access_request_created', ...context.metadata },
  })
}

/**
 * Audit: solicitud de acceso aprobada (REQUEST_APPROVED).
 * entityId = requestId, newValues = {userId, type, academyId, requestedRole, reviewedBy, status}
 */
export async function auditAccessRequestApproved(
  requestId: string,
  data: {
    userId: string
    type: string
    academyId?: string | null
    requestedRole: string
    reviewedBy: string
  },
  context: AuditContext
) {
  return await createAuditLog('REQUEST_APPROVED', 'academy_access_requests', requestId, {
    userId: context.userId ?? data.reviewedBy,
    newValues: {
      userId: data.userId,
      type: data.type,
      academyId: data.academyId ?? null,
      requestedRole: data.requestedRole,
      reviewedBy: data.reviewedBy,
      status: 'approved',
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { academy: true, action: 'access_request_approved', ...context.metadata },
  })
}

/**
 * Audit: solicitud de acceso rechazada (REQUEST_REJECTED).
 * entityId = requestId, newValues = {userId, type, academyId, requestedRole, reviewedBy, status}
 */
export async function auditAccessRequestRejected(
  requestId: string,
  data: {
    userId: string
    type: string
    academyId?: string | null
    requestedRole: string
    reviewedBy: string
  },
  context: AuditContext
) {
  return await createAuditLog('REQUEST_REJECTED', 'academy_access_requests', requestId, {
    userId: context.userId ?? data.reviewedBy,
    newValues: {
      userId: data.userId,
      type: data.type,
      academyId: data.academyId ?? null,
      requestedRole: data.requestedRole,
      reviewedBy: data.reviewedBy,
      status: 'rejected',
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { academy: true, action: 'access_request_rejected', ...context.metadata },
  })
}

/**
 * Audit: ownership de academia transferido (OWNERSHIP_TRANSFERRED).
 * entityId = academyId, newValues = {academyId, previousOwnerId, newOwnerId}
 */
export async function auditOwnershipTransferred(
  academyId: string,
  data: { previousOwnerId: string; newOwnerId: string },
  context: AuditContext
) {
  return await createAuditLog('OWNERSHIP_TRANSFERRED', 'academies', academyId, {
    userId: context.userId,
    newValues: { academyId, previousOwnerId: data.previousOwnerId, newOwnerId: data.newOwnerId },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { academy: true, action: 'ownership_transferred', ...context.metadata },
  })
}

/**
 * Audit: academia restaurada (ACADEMY_RESTORED) — soft, status=active.
 * entityId = academyId, oldValues = estado previo (status=archived).
 */
export async function auditAcademyRestored(
  academyId: string,
  oldValues: Record<string, any>,
  context: AuditContext
) {
  return await createAuditLog('ACADEMY_RESTORED', 'academies', academyId, {
    userId: context.userId,
    oldValues,
    newValues: { status: 'active' },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { academy: true, action: 'academy_restored', ...context.metadata },
  })
}

/**
 * Audit: rol de miembro asignado (MEMBER_ROLE_ASSIGNED).
 * entityId = membershipId, newValues = {academyId, userId, role, previousRole?}
 */
export async function auditMemberRoleAssigned(
  academyId: string,
  memberId: string,
  data: { userId: string; role: string; previousRole?: string },
  context: AuditContext
) {
  return await createAuditLog('MEMBER_ROLE_ASSIGNED', 'academy_memberships', memberId, {
    userId: context.userId,
    newValues: { academyId, userId: data.userId, role: data.role, previousRole: data.previousRole },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { academy: true, action: 'member_role_assigned', ...context.metadata },
  })
}