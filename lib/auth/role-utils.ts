export const ADMIN_ROLES = ['ADMIN'] as const
export type AdminRole = typeof ADMIN_ROLES[number]

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as AdminRole)
}

export function canAccessModule(role: string, _module: string): boolean {
  if (role === 'ADMIN') return true
  return false
}

export function canDeleteUser(role: string): boolean {
  return role === 'ADMIN'
}

export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'ADMIN') return ['USER', 'ADMIN'].includes(targetRole)
  return false
}
