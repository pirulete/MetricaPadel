/**
 * Unit tests del guard compuesto SUPER_ADMIN-or-AcademyRole (v0.9).
 * Cubre: sessionGate (401/403 LOCKED/TEMPORARY), path SUPER_ADMIN (404 si la
 * academia no existe, permite archivadas), path no-SA (delega en guardAcademyRole:
 * 404 anti-IDOR sin membresía, 403 rol insuficiente) y los 3 wrappers.
 * @jest-environment node
 */
jest.mock("@/lib/db", () => ({
  db: {
    query: {
      academyMemberships: {
        findFirst: jest.fn(),
      },
      academies: {
        findFirst: jest.fn(),
      },
    },
  },
}));

import { db } from "@/lib/db";
import {
  guardSuperAdminOrAcademyCoach,
  guardSuperAdminOrAcademyAdmin,
  guardSuperAdminOrAcademyOwner,
} from "@/lib/auth/academy-guard";

const mockMembershipFindFirst = (db.query.academyMemberships.findFirst as unknown) as jest.Mock;
const mockAcademyFindFirst = (db.query.academies.findFirst as unknown) as jest.Mock;

const session = (role: string, status = "ACTIVE") => ({
  user: { id: "u1", status, role },
});

const membership = (role: string, academyStatus = "active") => ({
  id: "m1",
  academyId: "academy-1",
  userId: "u1",
  role,
  invitedBy: null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  academy: {
    id: "academy-1",
    ownerId: "u1",
    name: "Academia Test",
    slug: "academia-test",
    logoUrl: null,
    primaryColor: "#3b82f6",
    status: academyStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

const academyRow = (status = "active") => ({
  id: "academy-1",
  ownerId: "u1",
  name: "Academia Test",
  slug: "academia-test",
  logoUrl: null,
  primaryColor: "#3b82f6",
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("guardSuperAdminOrAcademyOwner — sessionGate primero", () => {
  it("401 si no hay sesión", async () => {
    const res = await guardSuperAdminOrAcademyOwner(null, "academy-1");
    expect(res?.status).toBe(401);
  });

  it("403 si el usuario está LOCKED (incluso SUPER_ADMIN)", async () => {
    const res = await guardSuperAdminOrAcademyOwner(session("SUPER_ADMIN", "LOCKED"), "academy-1");
    expect(res?.status).toBe(403);
    expect(mockAcademyFindFirst).not.toHaveBeenCalled();
  });

  it("403 si el usuario está TEMPORARY (incluso SUPER_ADMIN)", async () => {
    const res = await guardSuperAdminOrAcademyOwner(session("SUPER_ADMIN", "TEMPORARY"), "academy-1");
    expect(res?.status).toBe(403);
    expect(mockAcademyFindFirst).not.toHaveBeenCalled();
  });
});

describe("guardSuperAdminOrAcademyOwner — path SUPER_ADMIN", () => {
  it("null si SUPER_ADMIN+ACTIVE y la academia existe", async () => {
    mockAcademyFindFirst.mockResolvedValue(academyRow());
    const res = await guardSuperAdminOrAcademyOwner(session("SUPER_ADMIN"), "academy-1");
    expect(res).toBeNull();
    expect(mockAcademyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
  });

  it("404 si SUPER_ADMIN y la academia NO existe (anti-IDOR, no 403)", async () => {
    mockAcademyFindFirst.mockResolvedValue(null);
    const res = await guardSuperAdminOrAcademyOwner(session("SUPER_ADMIN"), "academy-inexistente");
    expect(res?.status).toBe(404);
  });

  it("null si SUPER_ADMIN y la academia está ARCHIVADA (visibilidad plataforma, D4)", async () => {
    mockAcademyFindFirst.mockResolvedValue(academyRow("archived"));
    const res = await guardSuperAdminOrAcademyOwner(session("SUPER_ADMIN"), "academy-1");
    expect(res).toBeNull();
  });

  it("no consulta membresía en el path SUPER_ADMIN", async () => {
    mockAcademyFindFirst.mockResolvedValue(academyRow());
    await guardSuperAdminOrAcademyOwner(session("SUPER_ADMIN"), "academy-1");
    expect(mockMembershipFindFirst).not.toHaveBeenCalled();
  });
});

describe("guardSuperAdminOrAcademyOwner — path no-SA (delega en guardAcademyRole)", () => {
  it("404 si no hay membresía (anti-IDOR, no 403)", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    const res = await guardSuperAdminOrAcademyOwner(session("USER"), "academy-ajena");
    expect(res?.status).toBe(404);
  });

  it("404 si la academia está archivada para no-SA", async () => {
    mockMembershipFindFirst.mockResolvedValue(membership("OWNER", "archived"));
    const res = await guardSuperAdminOrAcademyOwner(session("USER"), "academy-1");
    expect(res?.status).toBe(404);
  });

  it("403 si el rol es COACH (no OWNER)", async () => {
    mockMembershipFindFirst.mockResolvedValue(membership("COACH"));
    const res = await guardSuperAdminOrAcademyOwner(session("USER"), "academy-1");
    expect(res?.status).toBe(403);
  });

  it("403 si el rol es ADMIN (no OWNER)", async () => {
    mockMembershipFindFirst.mockResolvedValue(membership("ADMIN"));
    const res = await guardSuperAdminOrAcademyOwner(session("USER"), "academy-1");
    expect(res?.status).toBe(403);
  });

  it("null si el rol es OWNER", async () => {
    mockMembershipFindFirst.mockResolvedValue(membership("OWNER"));
    const res = await guardSuperAdminOrAcademyOwner(session("USER"), "academy-1");
    expect(res).toBeNull();
  });

  it("no consulta academias en el path no-SA", async () => {
    mockMembershipFindFirst.mockResolvedValue(membership("OWNER"));
    await guardSuperAdminOrAcademyOwner(session("USER"), "academy-1");
    expect(mockAcademyFindFirst).not.toHaveBeenCalled();
  });
});

describe("guardSuperAdminOrAcademyAdmin", () => {
  it("null para SUPER_ADMIN con academia existente", async () => {
    mockAcademyFindFirst.mockResolvedValue(academyRow());
    const res = await guardSuperAdminOrAcademyAdmin(session("SUPER_ADMIN"), "academy-1");
    expect(res).toBeNull();
  });

  it("403 para no-SA con rol COACH", async () => {
    mockMembershipFindFirst.mockResolvedValue(membership("COACH"));
    const res = await guardSuperAdminOrAcademyAdmin(session("USER"), "academy-1");
    expect(res?.status).toBe(403);
  });

  it("null para no-SA con rol ADMIN", async () => {
    mockMembershipFindFirst.mockResolvedValue(membership("ADMIN"));
    const res = await guardSuperAdminOrAcademyAdmin(session("USER"), "academy-1");
    expect(res).toBeNull();
  });
});

describe("guardSuperAdminOrAcademyCoach", () => {
  it("null para SUPER_ADMIN con academia existente", async () => {
    mockAcademyFindFirst.mockResolvedValue(academyRow());
    const res = await guardSuperAdminOrAcademyCoach(session("SUPER_ADMIN"), "academy-1");
    expect(res).toBeNull();
  });

  it("404 para SUPER_ADMIN con academia inexistente", async () => {
    mockAcademyFindFirst.mockResolvedValue(null);
    const res = await guardSuperAdminOrAcademyCoach(session("SUPER_ADMIN"), "academy-inexistente");
    expect(res?.status).toBe(404);
  });

  it("null para no-SA con rol COACH", async () => {
    mockMembershipFindFirst.mockResolvedValue(membership("COACH"));
    const res = await guardSuperAdminOrAcademyCoach(session("USER"), "academy-1");
    expect(res).toBeNull();
  });
});