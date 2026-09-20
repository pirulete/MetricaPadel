/**
 * Unit tests del engine de notificaciones (capa de negocio sobre queries).
 * Cubre: dedup por groupId en createNotification, delegación de list/mark-read/
 * soft-delete/checkDuplicate.
 * @jest-environment node
 */
jest.mock("@/lib/db/queries/notifications", () => ({
  createNotification: jest.fn(),
  getNotificationsByUserId: jest.fn(),
  getUnreadCount: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  softDeleteNotification: jest.fn(),
  checkDuplicateNotification: jest.fn(),
}));

import {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  softDelete,
  checkDuplicateNotification,
} from "@/lib/notifications/engine";
import * as queries from "@/lib/db/queries/notifications";

const mocked = queries as jest.Mocked<typeof queries>;

const baseNotification = {
  id: "n1",
  userId: "u1",
  type: "info",
  priority: "P2",
  title: "Hola",
  body: null,
  ctaUrl: null,
  ctaLabel: null,
  read: 0,
  groupId: null,
  category: "system",
  deletedAt: null,
  metadata: null,
  createdAt: new Date("2026-09-16T10:00:00Z"),
} as const;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createNotification", () => {
  it("crea sin dedup cuando no hay groupId", async () => {
    mocked.createNotification.mockResolvedValue(baseNotification);

    const result = await createNotification({ userId: "u1", type: "info", title: "Hola" });

    expect(result).toEqual(baseNotification);
    expect(mocked.checkDuplicateNotification).not.toHaveBeenCalled();
    expect(mocked.createNotification).toHaveBeenCalledWith({ userId: "u1", type: "info", title: "Hola" });
  });

  it("aplica dedup por groupId y crea si no hay duplicado", async () => {
    mocked.checkDuplicateNotification.mockResolvedValue(false);
    mocked.createNotification.mockResolvedValue(baseNotification);

    const result = await createNotification({ userId: "u1", type: "info", title: "Hola", groupId: "g1" });

    expect(result).toEqual(baseNotification);
    expect(mocked.checkDuplicateNotification).toHaveBeenCalledWith("u1", "g1");
    expect(mocked.createNotification).toHaveBeenCalledTimes(1);
  });

  it("retorna null y NO crea si existe duplicado (mismo groupId en ventana 1h)", async () => {
    mocked.checkDuplicateNotification.mockResolvedValue(true);

    const result = await createNotification({ userId: "u1", type: "info", title: "Hola", groupId: "g1" });

    expect(result).toBeNull();
    expect(mocked.createNotification).not.toHaveBeenCalled();
  });
});

describe("getNotifications", () => {
  it("delega en getNotificationsByUserId con opciones", async () => {
    mocked.getNotificationsByUserId.mockResolvedValue({ items: [baseNotification], nextCursor: null });

    const result = await getNotifications("u1", { limit: 5, unread: true });

    expect(result.items).toHaveLength(1);
    expect(mocked.getNotificationsByUserId).toHaveBeenCalledWith("u1", { limit: 5, unread: true });
  });

  it("usa defaults cuando no se pasan opciones", async () => {
    mocked.getNotificationsByUserId.mockResolvedValue({ items: [], nextCursor: null });

    await getNotifications("u1");

    expect(mocked.getNotificationsByUserId).toHaveBeenCalledWith("u1", {});
  });
});

describe("markAsRead / markAllAsRead / softDelete", () => {
  it("delega markAsRead scoped al userId", async () => {
    mocked.markAsRead.mockResolvedValue(baseNotification);

    await markAsRead("u1", "n1");

    expect(mocked.markAsRead).toHaveBeenCalledWith("u1", "n1");
  });

  it("delega markAllAsRead y retorna cantidad", async () => {
    mocked.markAllAsRead.mockResolvedValue(2);

    expect(await markAllAsRead("u1")).toBe(2);
  });

  it("delega softDelete", async () => {
    mocked.softDeleteNotification.mockResolvedValue(baseNotification);

    await softDelete("u1", "n1");

    expect(mocked.softDeleteNotification).toHaveBeenCalledWith("u1", "n1");
  });
});

describe("checkDuplicateNotification", () => {
  it("delega en la query de dedup", async () => {
    mocked.checkDuplicateNotification.mockResolvedValue(true);

    expect(await checkDuplicateNotification("u1", "g1")).toBe(true);
    expect(mocked.checkDuplicateNotification).toHaveBeenCalledWith("u1", "g1");
  });
});