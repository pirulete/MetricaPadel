/**
 * Lógica pura de Solicitudes de Acceso a Academia (v0.9). Sin imports
 * server-side — unit-testable. Reglas de asignación de roles por academia y
 * validación de payloads de solicitudes.
 */

export type AcademyMembershipRole = "OWNER" | "ADMIN" | "COACH";
export type AcademyActorRole = "SUPER_ADMIN" | AcademyMembershipRole;

/**
 * ¿Puede el actor asignar el rol objetivo en una academia?
 * - SUPER_ADMIN (global): cualquier rol (incluido OWNER).
 * - OWNER/ADMIN de academia: solo ADMIN/COACH (nunca OWNER).
 * - COACH: nunca.
 */
export function canAssignAcademyRole(
  actorRole: AcademyActorRole,
  targetRole: AcademyMembershipRole
): boolean {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "OWNER" || actorRole === "ADMIN") {
    return targetRole === "ADMIN" || targetRole === "COACH";
  }
  return false;
}

export type AcademyRequestPayload = {
  name?: string;
  slug?: string;
  primaryColor?: string;
};

/**
 * Valida invariantes del payload por tipo de solicitud.
 * - join_academy: payload vacío (la academia/rol viven en columnas).
 * - create_academy: name + slug requeridos; primaryColor opcional HEX.
 * Retorna null si válido, mensaje de error si no.
 */
export function validateRequestPayload(
  type: "join_academy" | "create_academy",
  payload: AcademyRequestPayload
): string | null {
  if (type === "join_academy") {
    if (payload && Object.keys(payload).length > 0) {
      return "join_academy no admite payload";
    }
    return null;
  }

  // create_academy
  if (!payload?.name || !payload.name.trim()) return "name es requerido";
  if (!payload?.slug || !/^[a-z0-9-]{3,50}$/.test(payload.slug)) {
    return "slug debe tener formato a-z0-9- (3-50 caracteres)";
  }
  if (payload.primaryColor !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(payload.primaryColor)) {
    return "primaryColor debe ser HEX #RRGGBB";
  }
  return null;
}

/**
 * Payload normalizado para auditoría (sin campos undefined).
 */
export function buildRequestAuditPayload(
  type: "join_academy" | "create_academy",
  payload: AcademyRequestPayload
): Record<string, unknown> {
  if (type === "join_academy") return {};
  return {
    name: payload?.name,
    slug: payload?.slug,
    ...(payload?.primaryColor ? { primaryColor: payload.primaryColor } : {}),
  };
}