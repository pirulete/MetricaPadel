/**
 * Lógica pura de Super Admin (sin imports server-side, unit-testable).
 * Invariante de plataforma: siempre debe existir ≥1 SUPER_ADMIN activo (D5).
 */

/**
 * Valida que no se esté demotando al último SUPER_ADMIN activo.
 * Retorna mensaje de error si count <= 1, null si es seguro.
 */
export function assertNotLastSuperAdmin(activeCount: number): string | null {
  if (activeCount <= 1) {
    return "No puedes demotar al último SUPER_ADMIN activo";
  }
  return null;
}