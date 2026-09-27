/**
 * Unit tests de los academy guards (SPEC-EPIC-01, Fase B).
 * Cubre: getAcademyMembership, guardAcademyOwner, guardAcademyAdmin,
 * guardAcademyCoach — sesión (401/403), anti-IDOR (404) y jerarquía de roles.
 * @jest-environment node
 */
jest.mock("@/lib/db", () => ({
  db: {
    query: {
      academyMemberships: {
        findFirst: jest.fn(),
      },
    },
  },
}));

import { db } from "@/lib/db";
import {
  getAcademyMembership,
  guardAcademyCoach,
  guardAcademyAdmin,
  guardAcademyOwner,
} from "@/lib/auth/academy-guard";

const mockFindFirst = (db.query.academyMemberships.findFirst as unknown) as jest.Mock;

const activeSession = {
  user: { id: "u1", status: "ACTIVE", role: "USER" },
};

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getAcademyMembership", () => {
  it("retorna membership + academyStatus cuando la membresía está activa", async () => {
    mockFindFirst.mockResolvedValue(membership("COACH"));

    const result = await getAcademyMembership("u1", "academy-1");

    expect(result).not.toBeNull();
    expect(result!.membership.role).toBe("COACH");
    expect(result!.academyStatus).toBe("active");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
        with: { academy: true },
      })
    );
  });

  it("retorna null si no existe membresía (anti-IDOR)", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getAcademyMembership("u1", "academy-ajena");

    expect(result).toBeNull();
  });

  it("retorna null si la academia está archivada", async () => {
    mockFindFirst.mockResolvedValue(membership("OWNER", "archived"));

    const result = await getAcademyMembership("u1", "academy-1");

    expect(result).toBeNull();
  });
});

describe("guardAcademyOwner", () => {
  it("401 si no hay sesión", async () => {
    const res = await guardAcademyOwner(null, "academy-1");
    expect(res?.status).toBe(401);
  });

  it("403 si el usuario está LOCKED", async () => {
    const res = await guardAcademyOwner({ user: { id: "u1", status: "LOCKED" } }, "academy-1");
    expect(res?.status).toBe(403);
  });

  it("403 si el usuario está TEMPORARY", async () => {
    const res = await guardAcademyOwner({ user: { id: "u1", status: "TEMPORARY" } }, "academy-1");
    expect(res?.status).toBe(403);
  });

  it("404 si no hay membresía (anti-IDOR, no 403)", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await guardAcademyOwner(activeSession, "academy-ajena");
    expect(res?.status).toBe(404);
  });

  it("404 si la academia está archivada (anti-IDOR, no 403)", async () => {
    mockFindFirst.mockResolvedValue(membership("OWNER", "archived"));
    const res = await guardAcademyOwner(activeSession, "academy-1");
    expect(res?.status).toBe(404);
  });

  it("403 si el rol es COACH (no OWNER)", async () => {
    mockFindFirst.mockResolvedValue(membership("COACH"));
    const res = await guardAcademyOwner(activeSession, "academy-1");
    expect(res?.status).toBe(403);
  });

  it("403 si el rol es ADMIN (no OWNER)", async () => {
    mockFindFirst.mockResolvedValue(membership("ADMIN"));
    const res = await guardAcademyOwner(activeSession, "academy-1");
    expect(res?.status).toBe(403);
  });

  it("null si el rol es OWNER", async () => {
    mockFindFirst.mockResolvedValue(membership("OWNER"));
    const res = await guardAcademyOwner(activeSession, "academy-1");
    expect(res).toBeNull();
  });
});

describe("guardAcademyAdmin", () => {
  it("401 si no hay sesión", async () => {
    const res = await guardAcademyAdmin(null, "academy-1");
    expect(res?.status).toBe(401);
  });

  it("404 si no hay membresía (anti-IDOR)", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await guardAcademyAdmin(activeSession, "academy-ajena");
    expect(res?.status).toBe(404);
  });

  it("403 si el rol es COACH", async () => {
    mockFindFirst.mockResolvedValue(membership("COACH"));
    const res = await guardAcademyAdmin(activeSession, "academy-1");
    expect(res?.status).toBe(403);
  });

  it("null si el rol es ADMIN", async () => {
    mockFindFirst.mockResolvedValue(membership("ADMIN"));
    const res = await guardAcademyAdmin(activeSession, "academy-1");
    expect(res).toBeNull();
  });

  it("null si el rol es OWNER (jerarquía: OWNER ≥ ADMIN)", async () => {
    mockFindFirst.mockResolvedValue(membership("OWNER"));
    const res = await guardAcademyAdmin(activeSession, "academy-1");
    expect(res).toBeNull();
  });
});

describe("guardAcademyCoach", () => {
  it("401 si no hay sesión", async () => {
    const res = await guardAcademyCoach(null, "academy-1");
    expect(res?.status).toBe(401);
  });

  it("404 si no hay membresía (anti-IDOR)", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await guardAcademyCoach(activeSession, "academy-ajena");
    expect(res?.status).toBe(404);
  });

  it("404 si la academia está archivada", async () => {
    mockFindFirst.mockResolvedValue(membership("COACH", "archived"));
    const res = await guardAcademyCoach(activeSession, "academy-1");
    expect(res?.status).toBe(404);
  });

  it("null si el rol es COACH", async () => {
    mockFindFirst.mockResolvedValue(membership("COACH"));
    const res = await guardAcademyCoach(activeSession, "academy-1");
    expect(res).toBeNull();
  });

  it("null si el rol es ADMIN", async () => {
    mockFindFirst.mockResolvedValue(membership("ADMIN"));
    const res = await guardAcademyCoach(activeSession, "academy-1");
    expect(res).toBeNull();
  });

  it("null si el rol es OWNER", async () => {
    mockFindFirst.mockResolvedValue(membership("OWNER"));
    const res = await guardAcademyCoach(activeSession, "academy-1");
    expect(res).toBeNull();
  });
});