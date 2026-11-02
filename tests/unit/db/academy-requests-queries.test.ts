/**
 * Unit tests de queries de solicitudes de acceso a academia (v0.9) con db
 * mockeado. Cubre: createAccessRequest (23505 → duplicate_pending),
 * listAccessRequests (joins), getAccessRequestById, approveJoinRequest (tx:
 * not_found/already_reviewed/academy_archived/already_member/happy),
 * approveCreateRequest (tx: slug_exists/happy), rejectRequest.
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
      academyAccessRequests: { findFirst: jest.fn() },
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
        academyAccessRequests: { findFirst: jest.fn() },
      },
      select: jest.fn(() => makeChain(dbQueue)),
      insert: jest.fn(() => makeChain(dbQueue)),
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
  createAccessRequest,
  listAccessRequests,
  getAccessRequestById,
  approveJoinRequest,
  approveCreateRequest,
  rejectRequest,
} from "@/lib/db/queries/padel/academy-requests";

const mocked = jest.requireMock("@/lib/db") as any;
const txQueue = mocked.__txQueue as any[][];
const dbQueue = mocked.__dbQueue as any[][];
const tx = mocked.__tx as any;
const valuesCalls = mocked.__valuesCalls as any[];

const request = {
  id: "req1",
  userId: "u1",
  type: "join_academy",
  academyId: "a1",
  requestedRole: "COACH",
  payload: {},
  status: "pending",
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date("2026-10-03T10:00:00Z"),
  updatedAt: new Date("2026-10-03T10:00:00Z"),
};

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
  userId: "u1",
  role: "COACH",
  invitedBy: "sa1",
  status: "active",
  createdAt: new Date("2026-10-03T10:00:00Z"),
  updatedAt: new Date("2026-10-03T10:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  txQueue.length = 0;
  dbQueue.length = 0;
  valuesCalls.length = 0;
});

describe("createAccessRequest", () => {
  it("inserta solicitud pending y retorna ok", async () => {
    dbQueue.push([request]);

    const result = await createAccessRequest({
      userId: "u1",
      type: "join_academy",
      academyId: "a1",
      requestedRole: "COACH",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.id).toBe("req1");
    expect(valuesCalls[0]).toMatchObject({ userId: "u1", type: "join_academy", academyId: "a1", status: "pending" });
  });

  it("mapea 23505 → duplicate_pending", async () => {
    const err: any = new Error("duplicate key");
    err.code = "23505";
    (db.insert as jest.Mock).mockReturnValueOnce({
      values: jest.fn(() => ({ returning: jest.fn(async () => { throw err; }) })),
    });

    const result = await createAccessRequest({
      userId: "u1",
      type: "create_academy",
      requestedRole: "OWNER",
      payload: { name: "Nueva", slug: "nueva" },
    });

    expect(result).toEqual({ ok: false, reason: "duplicate_pending" });
  });

  it("mapea 23505 en error.cause → duplicate_pending", async () => {
    const err: any = new Error("duplicate key");
    err.cause = { code: "23505" };
    (db.insert as jest.Mock).mockReturnValueOnce({
      values: jest.fn(() => ({ returning: jest.fn(async () => { throw err; }) })),
    });

    const result = await createAccessRequest({
      userId: "u1",
      type: "create_academy",
      requestedRole: "OWNER",
    });

    expect(result).toEqual({ ok: false, reason: "duplicate_pending" });
  });

  it("re-lanza errores que no son 23505", async () => {
    const err: any = new Error("boom");
    err.code = "42P01";
    (db.insert as jest.Mock).mockReturnValueOnce({
      values: jest.fn(() => ({ returning: jest.fn(async () => { throw err; }) })),
    });

    await expect(createAccessRequest({ userId: "u1", type: "join_academy", academyId: "a1", requestedRole: "COACH" }))
      .rejects.toThrow("boom");
  });
});

describe("listAccessRequests", () => {
  it("lista con joins a requester y academia", async () => {
    const rows = [{ ...request, requesterEmail: "coach@x.com", academyName: "Academia Norte" }];
    dbQueue.push(rows);

    const result = await listAccessRequests({ status: "pending" });

    expect(result).toEqual(rows);
    expect(db.select).toHaveBeenCalled();
  });

  it("sin filtros no agrega where", async () => {
    dbQueue.push([]);
    await listAccessRequests();
    expect(db.select).toHaveBeenCalled();
  });
});

describe("getAccessRequestById", () => {
  it("retorna detalle con requester + academy", async () => {
    const row = { ...request, requesterEmail: "coach@x.com", academyName: "Academia Norte", academySlug: "academia-norte" };
    dbQueue.push([row]);

    const result = await getAccessRequestById("req1");

    expect(result).toEqual(row);
  });

  it("retorna null si no existe", async () => {
    dbQueue.push([]);
    expect(await getAccessRequestById("nope")).toBeNull();
  });
});

describe("approveJoinRequest", () => {
  it("aprueba join: inserta membresía activa + marca request approved", async () => {
    (tx.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue(request);
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);
    (tx.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(undefined);
    txQueue.push([membership], [{ ...request, status: "approved", reviewedBy: "sa1" }]);

    const result = await approveJoinRequest("req1", "sa1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.membership.role).toBe("COACH");
      expect(result.membership.status).toBe("active");
      expect(result.request.status).toBe("approved");
    }
    expect(valuesCalls[0]).toMatchObject({ academyId: "a1", userId: "u1", role: "COACH", status: "active", invitedBy: "sa1" });
  });

  it("retorna not_found si la solicitud no existe", async () => {
    (tx.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await approveJoinRequest("nope", "sa1")).toEqual({ ok: false, reason: "not_found" });
  });

  it("retorna already_reviewed si no está pending", async () => {
    (tx.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue({ ...request, status: "approved" });

    expect(await approveJoinRequest("req1", "sa1")).toEqual({ ok: false, reason: "already_reviewed" });
  });

  it("retorna academy_archived si la academia no está activa", async () => {
    (tx.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue(request);
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue({ ...academy, status: "archived" });

    expect(await approveJoinRequest("req1", "sa1")).toEqual({ ok: false, reason: "academy_archived" });
  });

  it("retorna already_member si el usuario ya es miembro activo", async () => {
    (tx.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue(request);
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);
    (tx.query.academyMemberships.findFirst as jest.Mock).mockResolvedValue(membership);

    expect(await approveJoinRequest("req1", "sa1")).toEqual({ ok: false, reason: "already_member" });
  });
});

describe("approveCreateRequest", () => {
  const createRequest = {
    ...request,
    type: "create_academy",
    academyId: null,
    requestedRole: "OWNER",
    payload: { name: "Nueva Academia", slug: "nueva-academia", primaryColor: "#ff0000" },
  };

  it("aprueba create: inserta academia + membresía OWNER + marca approved", async () => {
    (tx.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue(createRequest);
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(undefined);
    // insert academia (returning), insert membresía (sin returning → consume []), update request (returning)
    txQueue.push(
      [{ ...academy, ownerId: "u1" }],
      [],
      [{ ...createRequest, status: "approved", reviewedBy: "sa1" }],
    );

    const result = await approveCreateRequest("req2", "sa1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.academy.ownerId).toBe("u1");
      expect(result.request.status).toBe("approved");
    }
    // insert academia (ownerId=requester) + membresía OWNER activa
    expect(valuesCalls[0]).toMatchObject({ ownerId: "u1", name: "Nueva Academia", slug: "nueva-academia", primaryColor: "#ff0000" });
    expect(valuesCalls[1]).toMatchObject({ academyId: "a1", userId: "u1", role: "OWNER", status: "active" });
  });

  it("retorna slug_exists si el slug colisiona al aprobar", async () => {
    (tx.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue(createRequest);
    (tx.query.academies.findFirst as jest.Mock).mockResolvedValue(academy);

    expect(await approveCreateRequest("req2", "sa1")).toEqual({ ok: false, reason: "slug_exists" });
  });

  it("retorna already_reviewed si no está pending", async () => {
    (tx.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue({ ...createRequest, status: "rejected" });

    expect(await approveCreateRequest("req2", "sa1")).toEqual({ ok: false, reason: "already_reviewed" });
  });
});

describe("rejectRequest", () => {
  it("rechaza una solicitud pending", async () => {
    (db.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue(request);
    dbQueue.push([{ ...request, status: "rejected", reviewedBy: "sa1" }]);

    const result = await rejectRequest("req1", "sa1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.status).toBe("rejected");
  });

  it("retorna not_found si no existe", async () => {
    (db.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue(undefined);

    expect(await rejectRequest("nope", "sa1")).toEqual({ ok: false, reason: "not_found" });
  });

  it("retorna already_reviewed si ya fue revisada", async () => {
    (db.query.academyAccessRequests.findFirst as jest.Mock).mockResolvedValue({ ...request, status: "approved" });

    expect(await rejectRequest("req1", "sa1")).toEqual({ ok: false, reason: "already_reviewed" });
    expect(db.update).not.toHaveBeenCalled();
  });
});