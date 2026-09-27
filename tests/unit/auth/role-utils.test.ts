/**
 * Unit tests de role-utils (RBAC jerárquico, feature SUPER_ADMIN).
 * Cubre: ADMIN_ROLES incluye SUPER_ADMIN, isAdminRole/isSuperAdminRole,
 * canAssignRole (solo SUPER_ADMIN actor, nunca target SUPER_ADMIN).
 * @jest-environment node
 */
import {
  ADMIN_ROLES,
  SUPER_ADMIN_ROLES,
  isAdminRole,
  isSuperAdminRole,
  canAssignRole,
} from "@/lib/auth/role-utils";

describe("ADMIN_ROLES / SUPER_ADMIN_ROLES", () => {
  it("ADMIN_ROLES incluye ADMIN y SUPER_ADMIN (jerarquía)", () => {
    expect(ADMIN_ROLES).toEqual(["ADMIN", "SUPER_ADMIN"]);
  });

  it("SUPER_ADMIN_ROLES contiene solo SUPER_ADMIN", () => {
    expect(SUPER_ADMIN_ROLES).toEqual(["SUPER_ADMIN"]);
  });
});

describe("isAdminRole", () => {
  it("true para ADMIN", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
  });

  it("true para SUPER_ADMIN (hereda back-office)", () => {
    expect(isAdminRole("SUPER_ADMIN")).toBe(true);
  });

  it("false para USER y roles desconocidos", () => {
    expect(isAdminRole("USER")).toBe(false);
    expect(isAdminRole("OWNER")).toBe(false);
    expect(isAdminRole("")).toBe(false);
  });
});

describe("isSuperAdminRole", () => {
  it("true solo para SUPER_ADMIN", () => {
    expect(isSuperAdminRole("SUPER_ADMIN")).toBe(true);
    expect(isSuperAdminRole("ADMIN")).toBe(false);
    expect(isSuperAdminRole("USER")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("solo SUPER_ADMIN puede asignar roles", () => {
    expect(canAssignRole("SUPER_ADMIN", "USER")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "USER")).toBe(false);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("USER", "USER")).toBe(false);
  });

  it("nadie puede asignar SUPER_ADMIN vía API (D2)", () => {
    expect(canAssignRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "SUPER_ADMIN")).toBe(false);
  });
});