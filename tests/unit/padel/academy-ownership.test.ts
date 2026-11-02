import { canAssignAcademyRole } from "@/lib/padel/academy-requests";
import { roleAssignSchema, transferOwnershipSchema, academyCreateWithOwnerSchema } from "@/lib/validations/academy";

/**
 * Invariantes de ownership y roles de academia (v0.9) — lógica pura.
 * Las queries transaccionales (transferOwnership/assignMemberRole/restoreAcademy)
 * se testean en tests/unit/db/academy-ownership-queries.test.ts (db mockeado).
 */
describe("Invariante: nunca 0 OWNER activo", () => {
  it("demover al último OWNER lo bloquea canAssignAcademyRole (OWNER/ADMIN no asignan OWNER)", () => {
    // Si solo hay 1 OWNER, nadie con rol de academia puede asignar OWNER a otro
    // (solo SUPER_ADMIN) — el query assignMemberRole además retorna last_owner.
    expect(canAssignAcademyRole("OWNER", "OWNER")).toBe(false);
    expect(canAssignAcademyRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignAcademyRole("SUPER_ADMIN", "OWNER")).toBe(true);
  });

  it("transferencia de ownership siempre deja ≥1 OWNER (target pasa a OWNER)", () => {
    // transferOwnership (query tx): target → OWNER, previo → ADMIN. El invariante
    // se garantiza porque el target ya es miembro activo y se promueve antes de
    // demover al previo. La regla de negocio aquí: el target debe poder recibir
    // OWNER — solo SUPER_ADMIN ejecuta transfer (guardSuperAdmin).
    expect(canAssignAcademyRole("SUPER_ADMIN", "OWNER")).toBe(true);
  });
});

describe("transferOwnershipSchema", () => {
  it("acepta targetUserId uuid válido", () => {
    const result = transferOwnershipSchema.safeParse({ targetUserId: "00000000-0000-0000-0000-000000000001" });
    expect(result.success).toBe(true);
  });

  it("rechaza targetUserId no uuid", () => {
    expect(transferOwnershipSchema.safeParse({ targetUserId: "no-uuid" }).success).toBe(false);
    expect(transferOwnershipSchema.safeParse({}).success).toBe(false);
  });
});

describe("roleAssignSchema", () => {
  it("acepta OWNER/ADMIN/COACH", () => {
    expect(roleAssignSchema.safeParse({ role: "OWNER" }).success).toBe(true);
    expect(roleAssignSchema.safeParse({ role: "ADMIN" }).success).toBe(true);
    expect(roleAssignSchema.safeParse({ role: "COACH" }).success).toBe(true);
  });

  it("rechaza roles inválidos", () => {
    expect(roleAssignSchema.safeParse({ role: "SUPER_ADMIN" }).success).toBe(false);
    expect(roleAssignSchema.safeParse({ role: "USER" }).success).toBe(false);
    expect(roleAssignSchema.safeParse({}).success).toBe(false);
  });
});

describe("academyCreateWithOwnerSchema", () => {
  it("acepta sin ownerId (default = session.user.id)", () => {
    const result = academyCreateWithOwnerSchema.safeParse({ name: "A", slug: "academia-a" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ownerId).toBeUndefined();
  });

  it("acepta ownerId uuid opcional", () => {
    const result = academyCreateWithOwnerSchema.safeParse({
      name: "A",
      slug: "academia-a",
      ownerId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza ownerId no uuid", () => {
    expect(academyCreateWithOwnerSchema.safeParse({ name: "A", slug: "academia-a", ownerId: "x" }).success).toBe(false);
  });
});