/**
 * Unit tests de transferOwnership / assignMemberRole / restoreAcademy (v0.9)
 * con db mockeado. Cubre: self-transfer 400, target inexistente 404, target no
 * miembro 404, happy path tx, last_owner, already_active.
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const valuesCalls: any[] = [];
  const makeChain = (queue: any[][]) => {
    const c: any = {};
    c.then = (resolve: (v: any) => void) => resolve(queue.shift() ?? []);
    c.from = jest.fn(() => c);
    c.innerJoin = jest.fn(() => c);
    c.leftJoin = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.groupBy = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.values = jest.fn((v: any) => {
      valuesCalls.push(v);
      return c;
    });
    c.set = jest.fn(() => c);
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  const txQueue: any[][] = [];
  const tx = {
    insert: jest.fn(() => makeChain(txQueue)),
    update: jest.fn(() => makeChain(txQueue)),
    delete: jest.fn(() => makeChain(txQueue)),
    select: jest.fn(() => makeChain(txQueue)),
    query: {
      users: { findFirst: jest.fn() },
      academies: { findFirst: jest.fn() },
      academyMemberships: { findFirst: jest.fn() },
    },
  };

  const dbQueue: any[][] = [];
  return {
    db: {
      transaction: jest.fn(async (cb: any) => cb(tx)),
      query: {
        academyMemberships: { findFirst: jest.fn() },
        academies: { findFirst: jest.fn() },
        users: { findFirst: jest.fn() },
      },
      select: jest.fn(() => makeChain(dbQueue)),
      update: jest.fn(() => makeChain(dbQueue)),
    },
    __txQueue: txQueue,
    __dbQueue: dbQueue,
    __tx: tx,
    __valuesCalls: valuesCalls,
  };
});

import { db } from "@/lib/db";
import {
  transferOwnership,
  assignMemberRole,
  restoreAcademy,
} from "@/lib/db/queries/padel/academies";

const mocked = jest.requireMock("@/lib/db") as any;
const txQueue = mocked.__txQueue as any[][];
const dbQueue = mocked.__dbQueue as any[][];
const tx = mocked.__tx as any;

const academy = {
  id: "a1",
  ownerId: "sa1",
  name: "Academia Norte",
  slug: "academia-norte",
  logoUrl: null,
  primaryColor: "#3b82f6",
  status: "active",
  createdAt: new Date("2026-10-03T10:00:00Z"),
  updatedAt: new Date("2026-10-03T10:00:00Z"),
};

const membership = {
  id: "m1",
  academyId: "a1",
  userId: "coach1",
  role: "OWNER",
  invitedBy: null,
  status: "active",
  createdAt: new Date("2026-10-03T10:00:00Z"),
  updatedAt: new Date("2026-10-03T10:00:00Z"),
};

const user = {
  id: "coach1",
  email: "coach@x.com",
  firstName: null,
  lastName: null,
  passwordHash: "hash",
  status: "ACTIVE",
  role: "ADMIN",
  createdAt: new Date("2026-10-03T10:00:00Z"),
  updatedAt: new Date("2026-10-03T10:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  txQueue.length = 0;
  dbQueue.length = 0;
});

describe("transferOwnership", () => {
  it("transfiere: target → OWNER, previo → ADMIN, ownerId → target", async () => {
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);
    (tx.query.users.findFirst as jest.Mock).mockResolvedValue(user);
    (tx.query.academyMemberships.findFirst as jest.Mock)
      .mockResolvedValueOnce({ ...membership, userId: "coach1", role: "COACH" }) // target membership
      .mockResolvedValueOnce({ ...membership, userId: "sa1", role: "OWNER" }); // previous OWNER membership
    txQueue.push(
      [{ ...membership, userId: "coach1", role: "OWNER" }], // update target → OWNER
      [{ ...membership, userId: "sa1", role: "ADMIN" }], // update previo → ADMIN
      [{ ...academy, ownerId: "coach1" }], // update academy
    );

    const result = await transferOwnership("a1", "coach1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.academy.ownerId).toBe("coach1");
      expect(result.newOwner).toEqual({ userId: "coach1", role: "OWNER" });
      expect(result.previousOwner).toEqual({ userId: "sa1", role: "ADMIN" });
    }
  });

  it("retorna target_not_found si la academia no existe", async () => {
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await transferOwnership("nope", "coach1")).toEqual({ ok: false, reason: "target_not_found" });
  });

  it("retorna target_not_found si el target user no existe (404)", async () => {
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);
    (tx.query.users.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await transferOwnership("a1", "ghost")).toEqual({ ok: false, reason: "target_not_found" });
  });

  it("retorna self_transfer si target === owner actual (400)", async () => {
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);
    (tx.query.users.findFirst as jest.Mock).mockResolvedValue({ ...user, id: "sa1" });

    expect(await transferOwnership("a1", "sa1")).toEqual({ ok: false, reason: "self_transfer" });
  });

  it("retorna target_not_member si el target no es miembro activo (404)", async () => {
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);
    (tx.query.users.findFirst as jest.Mock).mockResolvedValue(user);
    (tx.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await transferOwnership("a1", "coach1")).toEqual({ ok: false, reason: "target_not_member" });
  });
});

describe("assignMemberRole", () => {
  it("asigna rol a miembro activo", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue({ ...membership, role: "COACH" });
    dbQueue.push([{ ...membership, role: "ADMIN" }]);

    const result = await assignMemberRole("a1", "coach1", "ADMIN");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.membership.role).toBe("ADMIN");
  });

  it("retorna not_found si no hay membresía activa", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await assignMemberRole("a1", "ghost", "COACH")).toEqual({ ok: false, reason: "not_found" });
  });

  it("retorna last_owner si se demueve al único OWNER activo", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue({ ...membership, role: "OWNER" });
    dbQueue.push([{ count: 1 }]);

    const result = await assignMemberRole("a1", "sa1", "ADMIN");

    expect(result).toEqual({ ok: false, reason: "last_owner" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("permite demover OWNER si hay más de uno activo", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue({ ...membership, role: "OWNER" });
    dbQueue.push([{ count: 2 }]);
    dbQueue.push([{ ...membership, role: "ADMIN" }]);

    const result = await assignMemberRole("a1", "sa1", "ADMIN");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.membership.role).toBe("ADMIN");
  });
});

describe("restoreAcademy", () => {
  it("restaura academia archivada → active", async () => {
    (db.query.academies.findFirst as jest.Mock).mockResolvedValue({ ...academy, status: "archived" });
    dbQueue.push([{ ...academy, status: "active" }]);

    const result = await restoreAcademy("a1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.academy.status).toBe("active");
  });

  it("retorna already_active si ya está activa", async () => {
    (db.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);

    expect(await restoreAcademy("a1")).toEqual({ ok: false, reason: "already_active" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("retorna not_found si no existe", async () => {
    (db.query.academies.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await restoreAcademy("nope")).toEqual({ ok: false, reason: "not_found" });
  });
});