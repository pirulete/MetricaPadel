/**
 * Unit tests de queries de academias (SPEC-EPIC-01) con db mockeado.
 * Cubre: createAcademy (transacción + OWNER), listUserAcademies, inviteMember
 * (TEMPORARY + pending + 409), acceptMembership, removeMember (último OWNER),
 * listInstitutionalRubrics, resolveAcademyForEvaluation.
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
  createAcademy,
  listUserAcademies,
  inviteMember,
  acceptMembership,
  removeMember,
  listInstitutionalRubrics,
  resolveAcademyForEvaluation,
} from "@/lib/db/queries/padel/academies";

const mocked = jest.requireMock("@/lib/db") as any;
const txQueue = mocked.__txQueue as any[][];
const dbQueue = mocked.__dbQueue as any[][];
const tx = mocked.__tx as any;
const valuesCalls = mocked.__valuesCalls as any[];

const academy = {
  id: "a1",
  ownerId: "coach1",
  name: "Academia Norte",
  slug: "academia-norte",
  logoUrl: null,
  primaryColor: "#3b82f6",
  status: "active",
  createdAt: new Date("2026-09-26T10:00:00Z"),
  updatedAt: new Date("2026-09-26T10:00:00Z"),
};

const membership = {
  id: "m1",
  academyId: "a1",
  userId: "coach1",
  role: "OWNER",
  invitedBy: null,
  status: "active",
  createdAt: new Date("2026-09-26T10:00:00Z"),
  updatedAt: new Date("2026-09-26T10:00:00Z"),
};

const user = {
  id: "u1",
  email: "profesor@academia.com",
  firstName: null,
  lastName: null,
  passwordHash: "hash",
  status: "TEMPORARY",
  role: "USER",
  createdAt: new Date("2026-09-26T10:00:00Z"),
  updatedAt: new Date("2026-09-26T10:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  txQueue.length = 0;
  dbQueue.length = 0;
  valuesCalls.length = 0;
});

describe("createAcademy", () => {
  it("inserta academia + membresía OWNER activa en transacción", async () => {
    txQueue.push([academy], []); // insert academy returning, insert membership

    const result = await createAcademy({
      ownerId: "coach1",
      name: "Academia Norte",
      slug: "academia-norte",
      primaryColor: "#3b82f6",
    });

    expect(db.transaction).toHaveBeenCalled();
    expect(result).toEqual(academy);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    // La membresía OWNER se inserta con status active.
    expect(valuesCalls[1]).toMatchObject({ academyId: "a1", userId: "coach1", role: "OWNER", status: "active" });
  });

  it("usa color default si no se pasa primaryColor", async () => {
    txQueue.push([academy], []);
    await createAcademy({ ownerId: "coach1", name: "Academia Norte", slug: "academia-norte" });
    expect(valuesCalls[0].primaryColor).toBe("#3b82f6");
  });
});

describe("listUserAcademies", () => {
  it("lista academias del usuario con rol y memberCount", async () => {
    const rows = [{ ...academy, role: "OWNER", memberCount: 3 }];
    dbQueue.push(rows);

    const result = await listUserAcademies("coach1");

    expect(result).toEqual(rows);
    expect(db.select).toHaveBeenCalled();
  });
});

describe("inviteMember", () => {
  it("crea usuario TEMPORARY + membresía pending cuando el email no existe", async () => {
    (tx.query.users.findFirst as jest.Mock).mockResolvedValue(undefined);
    (tx.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(undefined);
    txQueue.push([user], [{ ...membership, role: "COACH", status: "pending" }]); // insert user, insert membership

    const result = await inviteMember("a1", "profesor@academia.com", "coach1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.membership.status).toBe("pending");
      expect(result.membership.role).toBe("COACH");
      expect(result.user.status).toBe("TEMPORARY");
    }
    // El email se normaliza a minúsculas.
    expect(valuesCalls[0].email).toBe("profesor@academia.com");
    expect(valuesCalls[0].status).toBe("TEMPORARY");
  });

  it("reutiliza usuario existente (no crea otro)", async () => {
    (tx.query.users.findFirst as jest.Mock).mockResolvedValue({ ...user, status: "ACTIVE" });
    (tx.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(undefined);
    txQueue.push([{ ...membership, role: "COACH", status: "pending" }]);

    const result = await inviteMember("a1", "profesor@academia.com", "coach1");

    expect(result.ok).toBe(true);
    expect(tx.insert).toHaveBeenCalledTimes(1); // solo membership, no user
  });

  it("retorna already_member si ya existe membresía (cualquier status)", async () => {
    (tx.query.users.findFirst as jest.Mock).mockResolvedValue(user);
    (tx.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(membership);

    const result = await inviteMember("a1", "profesor@academia.com", "coach1");

    expect(result).toEqual({ ok: false, reason: "already_member" });
  });
});

describe("acceptMembership", () => {
  it("marca active una membresía pending", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue({ ...membership, role: "COACH", status: "pending" });
    dbQueue.push([{ ...membership, status: "active" }]);

    const result = await acceptMembership("u1", "a1");

    expect(result?.status).toBe("active");
  });

  it("es idempotente si ya está active (no hace update)", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(membership);

    const result = await acceptMembership("u1", "a1");

    expect(result?.status).toBe("active");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("retorna null si la membresía fue removida", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue({ ...membership, status: "removed" });

    expect(await acceptMembership("u1", "a1")).toBeNull();
  });
});

describe("removeMember", () => {
  it("retorna last_owner si el target es el único OWNER activo", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue({ ...membership, role: "OWNER" });
    dbQueue.push([{ count: 1 }]);

    const result = await removeMember("a1", "coach1");

    expect(result).toEqual({ ok: false, reason: "last_owner" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("remueve (soft) si hay más de un OWNER activo", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue({ ...membership, role: "OWNER" });
    dbQueue.push([{ count: 2 }]);
    dbQueue.push([{ ...membership, status: "removed" }]);

    const result = await removeMember("a1", "coach1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.membership.status).toBe("removed");
  });

  it("retorna not_found si no existe membresía", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await removeMember("a1", "u99")).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("listInstitutionalRubrics", () => {
  it("lista rúbricas con criteriaCount", async () => {
    const rows = [{ id: "r1", title: "Saque", category: "tecnica_basica", status: "draft", scope: "institutional", criteriaCount: 2 }];
    dbQueue.push(rows);

    const result = await listInstitutionalRubrics("a1");

    expect(result).toEqual(rows);
    expect(db.select).toHaveBeenCalled();
  });
});

describe("resolveAcademyForEvaluation", () => {
  it("usa rubric.academyId si la rúbrica es institucional", async () => {
    (db.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);

    const result = await resolveAcademyForEvaluation({ academyId: "a1" }, "coach1");

    expect(result).toEqual(academy);
    expect(db.query.academyMemberships.findFirst).not.toHaveBeenCalled();
  });

  it("cae a la primera membresía activa del teacher si no hay academyId", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue({ ...membership, academy });

    const result = await resolveAcademyForEvaluation({ academyId: null }, "coach1");

    expect(result).toEqual(academy);
  });

  it("retorna null si no hay academia activa", async () => {
    (db.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await resolveAcademyForEvaluation({ academyId: null }, "coach1")).toBeNull();
  });
});