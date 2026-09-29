/**
 * Unit tests del rol SUPER_ADMIN (Fase A — @db-engineer).
 * Cubre: (1) enum user_role con 3 valores, (2) helpers de auditoría
 * dedicados en lib/audit/super-admin.ts (actionTypes ADMIN_PROMOTED,
 * ADMIN_DEMOTED).
 * @jest-environment node
 */
jest.mock("@/lib/db/session-audit-queries", () => ({
  createAuditLog: jest.fn(),
}));

jest.mock("@/lib/db", () => {
  const makeChain = (queue: any[][]) => {
    const c: any = {};
    c.then = (resolve: (v: any) => void) => resolve(queue.shift() ?? []);
    c.from = jest.fn(() => c);
    c.leftJoin = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.offset = jest.fn(() => c);
    c.set = jest.fn(() => c);
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  const dbQueue: any[][] = [];
  return {
    db: {
      select: jest.fn(() => makeChain(dbQueue)),
      update: jest.fn(() => makeChain(dbQueue)),
      transaction: jest.fn(async (cb: any) => cb({})),
    },
    __dbQueue: dbQueue,
  };
});

import { userRoleEnum } from "@/lib/db/schema";
import { createAuditLog } from "@/lib/db/session-audit-queries";
import {
  auditAdminPromoted,
  auditAdminDemoted,
} from "@/lib/audit/super-admin";
import { getPlatformMetrics } from "@/lib/db/queries/padel/super-admin";

const mockCreateAuditLog = createAuditLog as jest.Mock;
const mockedDb = jest.requireMock("@/lib/db") as any;
const dbQueue = mockedDb.__dbQueue as any[][];

const context = {
  userId: "u1",
  ipAddress: "1.2.3.4",
  userAgent: "test-agent",
  metadata: { extra: true },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateAuditLog.mockResolvedValue({});
});

describe("userRoleEnum", () => {
  it("tiene exactamente 3 valores: USER, ADMIN, SUPER_ADMIN", () => {
    expect(userRoleEnum.enumValues).toEqual(["USER", "ADMIN", "SUPER_ADMIN"]);
    expect(userRoleEnum.enumValues).toHaveLength(3);
    expect(userRoleEnum.enumValues).toContain("SUPER_ADMIN");
  });
});

describe("auditAdminPromoted", () => {
  it("registra ADMIN_PROMOTED con entity user, newValues {role:ADMIN} y metadata superAdmin", async () => {
    await auditAdminPromoted("u1", "u2", context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "ADMIN_PROMOTED",
      "user",
      "u2",
      expect.objectContaining({
        userId: "u1",
        newValues: { role: "ADMIN" },
        ipAddress: "1.2.3.4",
        userAgent: "test-agent",
        metadata: expect.objectContaining({ superAdmin: true, extra: true }),
      })
    );
  });

  it("funciona sin context (defaults vacíos)", async () => {
    await auditAdminPromoted("u1", "u2");

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "ADMIN_PROMOTED",
      "user",
      "u2",
      expect.objectContaining({
        userId: "u1",
        metadata: { superAdmin: true },
      })
    );
  });
});

describe("auditAdminDemoted", () => {
  it("registra ADMIN_DEMOTED con oldValues {role:ADMIN} y newValues {role:USER}", async () => {
    await auditAdminDemoted("u1", "u2", context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "ADMIN_DEMOTED",
      "user",
      "u2",
      expect.objectContaining({
        userId: "u1",
        oldValues: { role: "ADMIN" },
        newValues: { role: "USER" },
        metadata: expect.objectContaining({ superAdmin: true }),
      })
    );
  });
});

describe("getPlatformMetrics", () => {
  beforeEach(() => {
    dbQueue.length = 0;
  });

  it("retorna stats existentes + rubrics + actividad reciente + breakdown de academias", async () => {
    // Orden de queries: users, academies, evaluations, courses (getPlatformStats),
    // rubrics, auditLogs (recentActivity), academies (breakdown).
    dbQueue.push([{ total: 10, active: 8, admins: 3, superAdmins: 1 }]);
    dbQueue.push([{ total: 2, active: 2 }]);
    dbQueue.push([{ total: 5, published: 4 }]);
    dbQueue.push([{ total: 3, active: 2 }]);
    dbQueue.push([{ total: 7, personal: 5, institutional: 2 }]);
    dbQueue.push([
      {
        id: "log1",
        userId: "u1",
        actionType: "EVALUATION_PUBLISHED",
        entityName: "evaluation",
        entityId: "e1",
        createdAt: new Date("2026-09-28T10:00:00Z"),
        userEmail: "coach@test.com",
        userFirstName: "Ana",
        userLastName: "López",
      },
    ]);
    dbQueue.push([
      {
        id: "a1",
        name: "Academia Norte",
        slug: "norte",
        status: "active",
        ownerId: "u1",
        ownerEmail: "owner@test.com",
        ownerFirstName: "Pepe",
        ownerLastName: "García",
        memberCount: 4,
        evaluationCount: 3,
      },
    ]);

    const result = await getPlatformMetrics();

    expect(result.users).toEqual({ total: 10, active: 8, admins: 3, superAdmins: 1 });
    expect(result.academies).toEqual({ total: 2, active: 2 });
    expect(result.evaluations).toEqual({ total: 5, published: 4 });
    expect(result.courses).toEqual({ total: 3, active: 2 });
    expect(result.rubrics).toEqual({ total: 7, personal: 5, institutional: 2 });
    expect(result.recentActivity).toHaveLength(1);
    expect(result.recentActivity[0].actionType).toBe("EVALUATION_PUBLISHED");
    expect(result.recentActivity[0].userFirstName).toBe("Ana");
    expect(result.academyBreakdown).toHaveLength(1);
    expect(result.academyBreakdown[0].memberCount).toBe(4);
    expect(result.academyBreakdown[0].evaluationCount).toBe(3);
  });

  it("retorna arrays vacíos cuando no hay actividad ni academias", async () => {
    dbQueue.push([{ total: 0, active: 0, admins: 0, superAdmins: 0 }]);
    dbQueue.push([{ total: 0, active: 0 }]);
    dbQueue.push([{ total: 0, published: 0 }]);
    dbQueue.push([{ total: 0, active: 0 }]);
    dbQueue.push([{ total: 0, personal: 0, institutional: 0 }]);
    dbQueue.push([]);
    dbQueue.push([]);

    const result = await getPlatformMetrics();

    expect(result.rubrics.total).toBe(0);
    expect(result.recentActivity).toEqual([]);
    expect(result.academyBreakdown).toEqual([]);
  });
});