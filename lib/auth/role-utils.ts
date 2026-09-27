/**
 * Utilidades de roles (RBAC). Jerarquía: SUPER_ADMIN ≥ ADMIN ≥ USER.
 * - ADMIN_ROLES: "puede operar como admin" (hereda todo el back-office).
 * - SUPER_ADMIN_ROLES: "puede operar como super admin" (exclusivo de plataforma).
 * SUPER_ADMIN nunca es asignable vía API (D2) — solo seed/DB manual.
 */
export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const
export const SUPER_ADMIN_ROLES = ['SUPER_ADMIN'] as const
export type AdminRole = typeof ADMIN_ROLES[number]
export type SuperAdminRole = typeof SUPER_ADMIN_ROLES[number]

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as AdminRole)
}

export function isSuperAdminRole(role: string): boolean {
  return role === 'SUPER_ADMIN'
}

/**
 * Solo un SUPER_ADMIN puede asignar roles, y nunca puede asignar SUPER_ADMIN
 * vía API (target ∈ ['USER', 'ADMIN']). Un ADMIN ya no puede promover (AC-01).
 */
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'SUPER_ADMIN') return ['USER', 'ADMIN'].includes(targetRole)
  return false
}