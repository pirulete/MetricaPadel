/**
 * Lógica pura de la data migration de ownership (v0.9) — espejo del DO block
 * SQL en drizzle/0011_*.sql. Sin imports server-side: permite unit-testear la
 * reasignación de ownership (AC-02) sin tocar la DB.
 *
 * La migración real ejecuta el SQL; esta función solo computa el plan.
 */

export type OwnershipMigrationAcademy = { id: string; ownerId: string };
export type OwnershipMigrationMembership = {
  id: string;
  academyId: string;
  userId: string;
  role: string;
  status: string;
};

export type OwnershipMigrationPlan = {
  /** academias cuyo owner_id debe apuntar al SUPER_ADMIN */
  academiesToUpdate: string[];
  /** membresías OWNER activas (no SUPER_ADMIN) que pasan a ADMIN */
  membershipsToDemote: string[];
  /** academias donde falta la membresía OWNER del SUPER_ADMIN */
  membershipsToInsert: string[];
};

/**
 * Computa el plan de migración de ownership:
 * 1. ownerId de academias → SUPER_ADMIN (si difiere).
 * 2. Membresías OWNER activas de otros usuarios → ADMIN.
 * 3. Upsert membresía OWNER activa del SUPER_ADMIN en cada academia.
 */
export function buildOwnershipMigrationPlan(input: {
  academies: OwnershipMigrationAcademy[];
  ownerMemberships: OwnershipMigrationMembership[];
  superAdminId: string;
}): OwnershipMigrationPlan {
  const { academies, ownerMemberships, superAdminId } = input;

  const academiesToUpdate = academies
    .filter((a) => a.ownerId !== superAdminId)
    .map((a) => a.id);

  const membershipsToDemote = ownerMemberships
    .filter((m) => m.role === "OWNER" && m.status === "active" && m.userId !== superAdminId)
    .map((m) => m.id);

  const academyIdsWithSaMembership = new Set(
    ownerMemberships.filter((m) => m.userId === superAdminId).map((m) => m.academyId)
  );
  const membershipsToInsert = academies
    .filter((a) => !academyIdsWithSaMembership.has(a.id))
    .map((a) => a.id);

  return { academiesToUpdate, membershipsToDemote, membershipsToInsert };
}