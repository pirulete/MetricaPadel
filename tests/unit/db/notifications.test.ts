/**
 * Unit tests de queries de notifications (inbox) con db mockeado.
 * Cubre: getNotificationsByUserId (paginación cursor), getUnreadCount,
 * markAsRead, markAllAsRead, softDeleteNotification, createNotification,
 * checkDuplicateNotification (dedup 1h).
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = () => {
    const c: Record<string, jest.Mock> = {} as any;
    c.from = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.values = jest.fn(() => c);
    c.set = jest.fn(() => c);
    c.returning = jest.fn(async () => []);
    return c;
  };

  const selectChain = makeChain();
  const insertChain = makeChain();
  const updateChain = makeChain();

  return {
    db: {
      query: {
        notifications: { findMany: jest.fn() },
      },
      select: jest.fn(() => selectChain),
      insert: jest.fn(() => insertChain),
      update: jest.fn(() => updateChain),
    },
  };
});

import { db } from "@/lib/db";
import {
  getNotificationsByUserId,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  softDeleteNotification,
  createNotification,
  checkDuplicateNotification,
} from "@/lib/db/queries/notifications";

type Chain = Record<string, jest.Mock>;

const selectChain = (db.select as jest.Mock)() as Chain;
const insertChain = (db.insert as jest.Mock)() as Chain;
const updateChain = (db.update as jest.Mock)() as Chain;

function resetChain(c: Chain) {
  for (const m of ["from", "where", "orderBy", "limit", "values", "set"]) {
    (c[m] as jest.Mock).mockImplementation(() => c);
  }
  c.returning.mockImplementation(async () => []);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetChain(selectChain);
  resetChain(insertChain);
  resetChain(updateChain);
  (db.select as jest.Mock).mockImplementation(() => selectChain);
  (db.insert as jest.Mock).mockImplementation(() => insertChain);
  (db.update as jest.Mock).mockImplementation(() => updateChain);
});

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
};

describe("getNotificationsByUserId", () => {
  it("retorna items y nextCursor cuando hay más páginas (limit+1)", async () => {
    const items = [
      { ...baseNotification, id: "n1", createdAt: new Date("2026-09-16T10:00:00Z") },
      { ...baseNotification, id: "n2", createdAt: new Date("2026-09-16T09:00:00Z") },
      { ...baseNotification, id: "n3", createdAt: new Date("2026-09-16T08:00:00Z") },
    ];
    (db.query.notifications.findMany as jest.Mock).mockResolvedValue(items);

    const result = await getNotificationsByUserId("u1", { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("n1");
    expect(result.nextCursor).toBe("2026-09-16T09:00:00.000Z");
  });

  it("retorna nextCursor null cuando no hay más páginas", async () => {
    (db.query.notifications.findMany as jest.Mock).mockResolvedValue([baseNotification]);

    const result = await getNotificationsByUserId("u1", { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("pasa filtros category/unread/cursor al where", async () => {
    (db.query.notifications.findMany as jest.Mock).mockResolvedValue([]);

    await getNotificationsByUserId("u1", {
      category: "billing",
      unread: true,
      cursor: "2026-09-16T09:00:00.000Z",
      limit: 10,
    });

    const args = (db.query.notifications.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toBeDefined();
    expect(args.limit).toBe(11);
  });

  it("limita a 50 items máximo", async () => {
    (db.query.notifications.findMany as jest.Mock).mockResolvedValue([]);

    await getNotificationsByUserId("u1", { limit: 999 });

    const args = (db.query.notifications.findMany as jest.Mock).mock.calls[0][0];
    expect(args.limit).toBe(51);
  });
});

describe("getUnreadCount", () => {
  it("retorna el count de no leídas", async () => {
    selectChain.where.mockResolvedValue([{ count: 3 }]);
    expect(await getUnreadCount("u1")).toBe(3);
  });

  it("retorna 0 si no hay filas", async () => {
    selectChain.where.mockResolvedValue([]);
    expect(await getUnreadCount("u1")).toBe(0);
  });
});

describe("markAsRead", () => {
  it("actualiza read=1 y retorna la fila", async () => {
    const row = { ...baseNotification, read: 1 };
    updateChain.returning.mockResolvedValue([row]);
    expect(await markAsRead("u1", "n1")).toEqual(row);
    expect(db.update).toHaveBeenCalled();
  });

  it("retorna null si la notificación no existe", async () => {
    updateChain.returning.mockResolvedValue([]);
    expect(await markAsRead("u1", "nope")).toBeNull();
  });
});

describe("markAllAsRead", () => {
  it("retorna cantidad de filas actualizadas", async () => {
    updateChain.returning.mockResolvedValue([{ id: "n1" }, { id: "n2" }]);
    expect(await markAllAsRead("u1")).toBe(2);
  });
});

describe("softDeleteNotification", () => {
  it("setea deletedAt y retorna la fila", async () => {
    const row = { ...baseNotification, deletedAt: new Date() };
    updateChain.returning.mockResolvedValue([row]);
    expect(await softDeleteNotification("u1", "n1")).toEqual(row);
  });

  it("retorna null si no existe", async () => {
    updateChain.returning.mockResolvedValue([]);
    expect(await softDeleteNotification("u1", "nope")).toBeNull();
  });
});

describe("createNotification", () => {
  it("inserta con defaults priority P2 y category system", async () => {
    const row = { ...baseNotification };
    insertChain.returning.mockResolvedValue([row]);
    const values: any[] = [];
    (insertChain.values as jest.Mock).mockImplementation((v: any) => {
      values.push(v);
      return insertChain;
    });

    const result = await createNotification({ userId: "u1", type: "info", title: "Hola" });

    expect(result).toEqual(row);
    expect(values[0].priority).toBe("P2");
    expect(values[0].category).toBe("system");
  });

  it("respeta priority/category/groupId/metadata explícitos", async () => {
    insertChain.returning.mockResolvedValue([baseNotification]);
    const values: any[] = [];
    (insertChain.values as jest.Mock).mockImplementation((v: any) => {
      values.push(v);
      return insertChain;
    });

    await createNotification({
      userId: "u1",
      type: "action",
      priority: "P1",
      title: "Urgente",
      groupId: "g1",
      category: "billing",
      metadata: { amount: 10 },
    });

    expect(values[0].priority).toBe("P1");
    expect(values[0].category).toBe("billing");
    expect(values[0].groupId).toBe("g1");
    expect(values[0].metadata).toEqual({ amount: 10 });
  });
});

describe("checkDuplicateNotification", () => {
  it("retorna true si existe notificación con mismo groupId en la última hora", async () => {
    selectChain.limit.mockResolvedValue([{ id: "n1" }]);
    expect(await checkDuplicateNotification("u1", "g1")).toBe(true);
  });

  it("retorna false si no existe duplicado", async () => {
    selectChain.limit.mockResolvedValue([]);
    expect(await checkDuplicateNotification("u1", "g1")).toBe(false);
  });

  it("retorna false sin groupId (no aplica dedup)", async () => {
    expect(await checkDuplicateNotification("u1", "")).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });
});