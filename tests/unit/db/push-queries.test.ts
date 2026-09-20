/**
 * Unit tests de queries de push subscriptions con db mockeado.
 * Cubre: upsertPushSubscription (insert + onConflictDoUpdate), revokePushSubscription,
 * getActiveSubscriptions, getActiveForBroadcast, markExpiredSubscriptions,
 * logClickEvent.
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = () => {
    const c: Record<string, jest.Mock> = {} as any;
    c.from = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.values = jest.fn(() => c);
    c.set = jest.fn(() => c);
    c.onConflictDoUpdate = jest.fn(() => c);
    c.returning = jest.fn(async () => []);
    return c;
  };

  const insertChain = makeChain();
  const updateChain = makeChain();

  return {
    db: {
      query: {
        pushSubscriptions: { findMany: jest.fn() },
      },
      insert: jest.fn(() => insertChain),
      update: jest.fn(() => updateChain),
    },
  };
});

import { db } from "@/lib/db";
import {
  upsertPushSubscription,
  revokePushSubscription,
  getActiveSubscriptions,
  getActiveForBroadcast,
  markExpiredSubscriptions,
  markEndpointExpired,
  logClickEvent,
} from "@/lib/db/queries/push";

type Chain = Record<string, jest.Mock>;

const insertChain = (db.insert as jest.Mock)() as Chain;
const updateChain = (db.update as jest.Mock)() as Chain;

function resetChain(c: Chain) {
  for (const m of ["from", "where", "values", "set", "onConflictDoUpdate"]) {
    (c[m] as jest.Mock).mockImplementation(() => c);
  }
  c.returning.mockImplementation(async () => []);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetChain(insertChain);
  resetChain(updateChain);
  (db.insert as jest.Mock).mockImplementation(() => insertChain);
  (db.update as jest.Mock).mockImplementation(() => updateChain);
});

const baseSub = {
  id: "s1",
  userId: "u1",
  endpoint: "https://push.example.com/abc",
  p256dh: "p256",
  auth: "auth",
  deviceType: "desktop",
  browser: "Chrome",
  os: "macOS",
  status: "active",
  lastActiveAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("upsertPushSubscription", () => {
  it("inserta una subscripción nueva con status active y lastActiveAt", async () => {
    insertChain.returning.mockResolvedValue([baseSub]);
    const values: any[] = [];
    (insertChain.values as jest.Mock).mockImplementation((v: any) => {
      values.push(v);
      return insertChain;
    });

    const result = await upsertPushSubscription("u1", {
      endpoint: baseSub.endpoint,
      p256dh: "p256",
      auth: "auth",
      browser: "Chrome",
      os: "macOS",
    });

    expect(result).toEqual(baseSub);
    expect(values[0].status).toBe("active");
    expect(values[0].deviceType).toBe("desktop");
    expect(values[0].lastActiveAt).toBeInstanceOf(Date);
  });

  it("aplica onConflictDoUpdate por (userId, endpoint) en conflicto", async () => {
    insertChain.returning.mockResolvedValue([baseSub]);

    await upsertPushSubscription("u1", {
      endpoint: baseSub.endpoint,
      p256dh: "p256",
      auth: "auth",
    });

    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
    const args = (insertChain.onConflictDoUpdate as jest.Mock).mock.calls[0][0];
    expect(args.target).toHaveLength(2);
    expect(args.set.status).toBe("active");
  });
});

describe("revokePushSubscription", () => {
  it("setea status revoked y retorna la fila", async () => {
    const revoked = { ...baseSub, status: "revoked" };
    updateChain.returning.mockResolvedValue([revoked]);
    expect(await revokePushSubscription("u1", baseSub.endpoint)).toEqual(revoked);
  });

  it("retorna null si la subscripción no existe", async () => {
    updateChain.returning.mockResolvedValue([]);
    expect(await revokePushSubscription("u1", "https://nope")).toBeNull();
  });
});

describe("markEndpointExpired", () => {
  it("setea status expired por endpoint y retorna la fila", async () => {
    const expired = { ...baseSub, status: "expired" };
    updateChain.returning.mockResolvedValue([expired]);
    expect(await markEndpointExpired(baseSub.endpoint)).toEqual(expired);
  });

  it("retorna null si el endpoint no existe", async () => {
    updateChain.returning.mockResolvedValue([]);
    expect(await markEndpointExpired("https://nope")).toBeNull();
  });
});

describe("getActiveSubscriptions", () => {
  it("retorna solo subscripciones activas del usuario", async () => {
    (db.query.pushSubscriptions.findMany as jest.Mock).mockResolvedValue([baseSub]);
    const result = await getActiveSubscriptions("u1");
    expect(result).toHaveLength(1);
    const args = (db.query.pushSubscriptions.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toBeDefined();
  });
});

describe("getActiveForBroadcast", () => {
  it("retorna todas las subscripciones activas", async () => {
    (db.query.pushSubscriptions.findMany as jest.Mock).mockResolvedValue([baseSub, { ...baseSub, id: "s2" }]);
    const result = await getActiveForBroadcast();
    expect(result).toHaveLength(2);
  });
});

describe("markExpiredSubscriptions", () => {
  it("retorna cantidad de subscripciones expiradas (>30d sin actividad)", async () => {
    updateChain.returning.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    expect(await markExpiredSubscriptions()).toBe(2);
    expect(db.update).toHaveBeenCalled();
  });

  it("retorna 0 si no hay subscripciones inactivas", async () => {
    updateChain.returning.mockResolvedValue([]);
    expect(await markExpiredSubscriptions()).toBe(0);
  });
});

describe("logClickEvent", () => {
  it("inserta un click event con url y eventType", async () => {
    const row = { id: "c1", userId: "u1", endpoint: "https://push.example.com/abc", url: "/dashboard", eventType: "click", clickedAt: new Date() };
    insertChain.returning.mockResolvedValue([row]);
    const values: any[] = [];
    (insertChain.values as jest.Mock).mockImplementation((v: any) => {
      values.push(v);
      return insertChain;
    });

    const result = await logClickEvent("u1", row.endpoint, "/dashboard", "click");

    expect(result).toEqual(row);
    expect(values[0].url).toBe("/dashboard");
    expect(values[0].eventType).toBe("click");
  });
});