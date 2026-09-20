/**
 * Unit tests de los audit helpers portados (avatar + terms).
 * Verifica que auditAvatarUploaded/Deleted y auditTermsAccepted/VersionPublished
 * delegan en createAuditLog con actionType, entity y metadata correctos.
 * @jest-environment node
 */
jest.mock("@/lib/db/session-audit-queries", () => ({
  createAuditLog: jest.fn(),
}));

import { createAuditLog } from "@/lib/db/session-audit-queries";
import {
  auditAvatarUploaded,
  auditAvatarDeleted,
  auditTermsAccepted,
  auditTermsVersionPublished,
  auditPushSubscriptionCreated,
  auditPushSubscriptionRevoked,
  auditPushDirectSent,
  auditPushBroadcastSent,
  auditNotificationHidden,
  auditNotificationDeleted,
  auditBroadcastDeleted,
} from "@/lib/audit/helpers";

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

describe("auditAvatarUploaded", () => {
  it("registra AVATAR_UPLOADED con newValues.avatarUrl y metadata de profile", async () => {
    await auditAvatarUploaded("u1", "https://cdn.example.com/a.jpg", context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "AVATAR_UPLOADED",
      "user",
      "u1",
      expect.objectContaining({
        userId: "u1",
        newValues: { avatarUrl: "https://cdn.example.com/a.jpg" },
        ipAddress: "1.2.3.4",
        userAgent: "test-agent",
        metadata: expect.objectContaining({ profile: true, action: "avatar_uploaded", extra: true }),
      }),
    );
  });
});

describe("auditAvatarDeleted", () => {
  it("registra AVATAR_DELETED con oldValues.avatarUrl", async () => {
    await auditAvatarDeleted("u1", "https://cdn.example.com/old.jpg", context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "AVATAR_DELETED",
      "user",
      "u1",
      expect.objectContaining({
        userId: "u1",
        oldValues: { avatarUrl: "https://cdn.example.com/old.jpg" },
        metadata: expect.objectContaining({ profile: true, action: "avatar_deleted" }),
      }),
    );
  });

  it("tolera oldAvatarUrl null (idempotente)", async () => {
    await auditAvatarDeleted("u1", null, context);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "AVATAR_DELETED",
      "user",
      "u1",
      expect.objectContaining({ oldValues: { avatarUrl: null } }),
    );
  });
});

describe("auditTermsAccepted", () => {
  it("registra TERMS_ACCEPTED contra la versión de T&C", async () => {
    await auditTermsAccepted("u1", "tv-1", context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "TERMS_ACCEPTED",
      "terms_versions",
      "tv-1",
      expect.objectContaining({
        userId: "u1",
        metadata: expect.objectContaining({ terms: true, action: "terms_accepted" }),
      }),
    );
  });
});

describe("auditTermsVersionPublished", () => {
  it("registra TERMS_VERSION_PUBLISHED con versionNumber en newValues", async () => {
    await auditTermsVersionPublished("admin-1", "tv-2", 3, context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "TERMS_VERSION_PUBLISHED",
      "terms_versions",
      "tv-2",
      expect.objectContaining({
        userId: "admin-1",
        newValues: { versionNumber: 3 },
        metadata: expect.objectContaining({ terms: true, action: "terms_version_published" }),
      }),
    );
  });
});

describe("auditPushSubscriptionCreated", () => {
  it("registra PUSH_SUBSCRIPTION_CREATED con endpoint y device metadata", async () => {
    await auditPushSubscriptionCreated("sub-1", { endpoint: "https://push.example.com/e", device_type: "mobile", browser: "Chrome", os: "Android" }, context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "PUSH_SUBSCRIPTION_CREATED",
      "push_subscriptions",
      "sub-1",
      expect.objectContaining({
        userId: "u1",
        newValues: { endpoint: "https://push.example.com/e", device_type: "mobile", browser: "Chrome", os: "Android" },
        metadata: expect.objectContaining({ device_type: "mobile", browser: "Chrome", os: "Android" }),
      }),
    );
  });

  it("tolera device/browser/os ausentes (null-safe)", async () => {
    await auditPushSubscriptionCreated("sub-2", { endpoint: "https://push.example.com/e2" }, context);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "PUSH_SUBSCRIPTION_CREATED",
      "push_subscriptions",
      "sub-2",
      expect.objectContaining({
        newValues: { endpoint: "https://push.example.com/e2", device_type: null, browser: null, os: null },
      }),
    );
  });
});

describe("auditPushSubscriptionRevoked", () => {
  it("registra PUSH_SUBSCRIPTION_REVOKED con count y revokedAll", async () => {
    await auditPushSubscriptionRevoked({ userId: "u1", revokedAll: true, count: 3 }, context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "PUSH_SUBSCRIPTION_REVOKED",
      "push_subscriptions",
      "u1",
      expect.objectContaining({
        userId: "u1",
        oldValues: { endpoint: null, revokedAll: true },
        newValues: { revoked: 3 },
        metadata: expect.objectContaining({ revokedAll: true, count: 3 }),
      }),
    );
  });
});

describe("auditPushDirectSent", () => {
  it("registra PUSH_DIRECT_SENT contra el usuario destino", async () => {
    await auditPushDirectSent("target-1", { title: "Clase mañana", body: "No olvides", sentTo: 1, url: "/dashboard" }, { ...context, actorRole: "ADMIN" });

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "PUSH_DIRECT_SENT",
      "push_subscriptions",
      "target-1",
      expect.objectContaining({
        userId: "u1",
        newValues: { sentTo: 1, title: "Clase mañana", body: "No olvides", url: "/dashboard" },
        metadata: expect.objectContaining({ actorRole: "ADMIN" }),
      }),
    );
  });
});

describe("auditPushBroadcastSent", () => {
  it("registra PUSH_BROADCAST_SENT con sentTo/failed", async () => {
    await auditPushBroadcastSent("bc-1", { sentTo: 120, failed: 2, title: "Promo" }, context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "PUSH_BROADCAST_SENT",
      "push_broadcasts",
      "bc-1",
      expect.objectContaining({
        userId: "u1",
        newValues: { sentTo: 120, failed: 2, title: "Promo" },
        metadata: expect.objectContaining({ sentTo: 120, failed: 2 }),
      }),
    );
  });
});

describe("auditNotificationHidden", () => {
  it("registra NOTIFICATION_HIDDEN con category y hiddenBy", async () => {
    await auditNotificationHidden("n-1", "u1", "commercial", context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "NOTIFICATION_HIDDEN",
      "notifications",
      "n-1",
      expect.objectContaining({
        userId: "u1",
        newValues: { category: "commercial", hiddenBy: "u1" },
      }),
    );
  });
});

describe("auditNotificationDeleted", () => {
  it("registra NOTIFICATION_DELETED con oldValues y deletedBy", async () => {
    await auditNotificationDeleted("n-2", { title: "Old" }, "admin-1", context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "NOTIFICATION_DELETED",
      "notifications",
      "n-2",
      expect.objectContaining({
        userId: "admin-1",
        oldValues: { title: "Old" },
      }),
    );
  });
});

describe("auditBroadcastDeleted", () => {
  it("registra BROADCAST_DELETED con oldValues y deletedBy", async () => {
    await auditBroadcastDeleted("bc-2", { title: "Old broadcast" }, "admin-1", context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      "BROADCAST_DELETED",
      "broadcasts",
      "bc-2",
      expect.objectContaining({
        userId: "admin-1",
        oldValues: { title: "Old broadcast" },
      }),
    );
  });
});