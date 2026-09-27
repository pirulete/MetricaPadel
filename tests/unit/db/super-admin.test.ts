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

import { userRoleEnum } from "@/lib/db/schema";
import { createAuditLog } from "@/lib/db/session-audit-queries";
import {
  auditAdminPromoted,
  auditAdminDemoted,
} from "@/lib/audit/super-admin";

const mockCreateAuditLog = createAuditLog as jest.Mock;

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