/**
 * Unit tests de guards SUPER_ADMIN (feature super-admin-role).
 * Cubre: jerarquía (SUPER_ADMIN pasa guardAdmin), guardSuperAdmin
 * (solo SUPER_ADMIN+ACTIVE), protección de lock (SUPER_ADMIN no bloqueable),
 * y canAssignRole (solo SUPER_ADMIN actor, nunca target SUPER_ADMIN).
 * @jest-environment node
 */
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));
jest.mock("@/lib/db/queries/padel", () => ({
  getPlayerById: jest.fn(),
  lockPlayer: jest.fn(),
  unlockPlayer: jest.fn(),
  updatePlayer: jest.fn(),
}));
jest.mock("@/lib/db/queries/auth", () => ({
  getUserById: jest.fn(),
}));
jest.mock("@/lib/audit/helpers", () => ({
  auditUpdate: jest.fn(),
  extractRequestContext: jest.fn(() => ({ ipAddress: "1.2.3.4" })),
}));

import { guardAdmin, guardSuperAdmin } from "@/lib/auth/admin-guard";
import { canAssignRole } from "@/lib/auth/role-utils";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/queries/auth";
import { DELETE } from "@/app/api/admin/users/[id]/route";

const mockAuth = auth as jest.Mock;
const mockGetUserById = getUserById as jest.Mock;

const session = (role: string, status = "ACTIVE") => ({
  user: { id: "11111111-1111-4111-8111-111111111111", role, status, email: "actor@test.com" },
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("guardAdmin — jerarquía (D1)", () => {
  it("401 si no hay sesión", () => {
    const res = guardAdmin(null);
    expect(res?.status).toBe(401);
  });

  it("null para ADMIN+ACTIVE (retrocompatibilidad)", () => {
    expect(guardAdmin(session("ADMIN"))).toBeNull();
  });

  it("null para SUPER_ADMIN+ACTIVE (hereda back-office)", () => {
    expect(guardAdmin(session("SUPER_ADMIN"))).toBeNull();
  });

  it("403 para USER", () => {
    expect(guardAdmin(session("USER"))?.status).toBe(403);
  });

  it("403 para SUPER_ADMIN LOCKED (nunca permitir LOCKED)", () => {
    expect(guardAdmin(session("SUPER_ADMIN", "LOCKED"))?.status).toBe(403);
  });

  it("403 para SUPER_ADMIN TEMPORARY", () => {
    expect(guardAdmin(session("SUPER_ADMIN", "TEMPORARY"))?.status).toBe(403);
  });
});

describe("guardSuperAdmin", () => {
  it("401 si no hay sesión", async () => {
    const res = await guardSuperAdmin(null);
    expect(res?.status).toBe(401);
  });

  it("null para SUPER_ADMIN+ACTIVE", async () => {
    expect(await guardSuperAdmin(session("SUPER_ADMIN"))).toBeNull();
  });

  it("403 para ADMIN (no es SUPER_ADMIN)", async () => {
    expect((await guardSuperAdmin(session("ADMIN")))?.status).toBe(403);
  });

  it("403 para USER", async () => {
    expect((await guardSuperAdmin(session("USER")))?.status).toBe(403);
  });

  it("403 para SUPER_ADMIN LOCKED", async () => {
    expect((await guardSuperAdmin(session("SUPER_ADMIN", "LOCKED")))?.status).toBe(403);
  });

  it("403 para SUPER_ADMIN TEMPORARY", async () => {
    expect((await guardSuperAdmin(session("SUPER_ADMIN", "TEMPORARY")))?.status).toBe(403);
  });
});

describe("Lock endpoint — protección SUPER_ADMIN (AC-03)", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(session("SUPER_ADMIN"));
  });

  it("403 si el target es SUPER_ADMIN (isAdminRole en DELETE)", async () => {
    mockGetUserById.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    const res = await DELETE({} as any, { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });

    expect(res.status).toBe(403);
    expect(mockGetUserById).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });

  it("403 si el target es ADMIN (comportamiento previo intacto)", async () => {
    mockGetUserById.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "ADMIN",
      status: "ACTIVE",
    });

    const res = await DELETE({} as any, { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });

    expect(res.status).toBe(403);
  });
});

describe("canAssignRole — restricción de asignación (D2)", () => {
  it("solo SUPER_ADMIN puede asignar USER/ADMIN", () => {
    expect(canAssignRole("SUPER_ADMIN", "USER")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
  });

  it("nadie puede asignar SUPER_ADMIN vía API", () => {
    expect(canAssignRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "SUPER_ADMIN")).toBe(false);
  });
});