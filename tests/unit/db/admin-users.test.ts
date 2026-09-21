/**
 * Unit tests de queries admin-users (padel) con db mockeado.
 * Cubre: createActiveUser (hash, ACTIVE, USER, email lowercase), listPlayers
 * (solo role USER, search ILIKE).
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const dbQueue: any[][] = [];
  const valuesLog: any[] = [];
  const makeChain = (queue: any[][]) => {
    const c: any = {};
    c.then = (resolve: (v: any) => void) => resolve(queue.shift() ?? []);
    c.from = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.values = jest.fn((v: any) => {
      valuesLog.push(v);
      return c;
    });
    c.set = jest.fn(() => c);
    c.returning = jest.fn(async () => queue.shift() ?? []);
    return c;
  };

  return {
    db: {
      insert: jest.fn(() => makeChain(dbQueue)),
      select: jest.fn(() => makeChain(dbQueue)),
      update: jest.fn(() => makeChain(dbQueue)),
    },
    __dbQueue: dbQueue,
    __valuesLog: valuesLog,
  };
});

jest.mock("bcryptjs", () => ({
  hash: jest.fn(async () => "hashed-password"),
}));

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createActiveUser, listPlayers, lockPlayer, unlockPlayer, updatePlayer } from "@/lib/db/queries/padel/admin-users";
import { promoteUser } from "@/lib/db/queries/padel/promote";

const mocked = jest.requireMock("@/lib/db") as any;
const dbQueue = mocked.__dbQueue as any[][];
const valuesLog = mocked.__valuesLog as any[];

const player = {
  id: "u1",
  email: "ana@example.com",
  firstName: "Ana",
  lastName: "Pérez",
  status: "ACTIVE",
};

beforeEach(() => {
  jest.clearAllMocks();
  dbQueue.length = 0;
  valuesLog.length = 0;
});

describe("createActiveUser", () => {
  it("crea usuario ACTIVE con role USER, email lowercase y password hasheado", async () => {
    dbQueue.push([{ ...player, role: "USER", passwordHash: "hashed-password" }]);

    const result = await createActiveUser({
      email: "Ana@Example.com",
      firstName: "Ana",
      lastName: "Pérez",
      password: "secret123",
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("secret123", 10);
    expect(valuesLog[0].email).toBe("ana@example.com");
    expect(valuesLog[0].status).toBe("ACTIVE");
    expect(valuesLog[0].role).toBe("USER");
    expect(valuesLog[0].passwordHash).toBe("hashed-password");
    expect(result).toEqual({ ...player, role: "USER", passwordHash: "hashed-password" });
  });
});

describe("listPlayers", () => {
  it("lista solo usuarios role USER", async () => {
    dbQueue.push([player]);
    const result = await listPlayers();
    expect(result).toEqual([player]);
    expect(db.select).toHaveBeenCalled();
  });

  it("aplica search ILIKE cuando se pasa", async () => {
    dbQueue.push([]);
    await listPlayers("ana");
    expect(db.select).toHaveBeenCalled();
  });
});

describe("promoteUser", () => {
  it("promueve USER a ADMIN y retorna el usuario", async () => {
    dbQueue.push([{ ...player, role: "ADMIN" }]);

    const result = await promoteUser("u1");

    expect(result).toEqual({ ...player, role: "ADMIN" });
    expect(db.update).toHaveBeenCalled();
  });

  it("retorna null si el usuario no existe o ya es ADMIN", async () => {
    dbQueue.push([]);

    const result = await promoteUser("u1");

    expect(result).toBeNull();
  });
});

describe("updatePlayer", () => {
  it("actualiza firstName/lastName/phone y retorna el usuario", async () => {
    dbQueue.push([{ ...player, firstName: "Ana María", phone: "+34600111222" }]);

    const result = await updatePlayer("u1", {
      firstName: "Ana María",
      lastName: "Pérez",
      phone: "+34600111222",
    });

    expect(result?.firstName).toBe("Ana María");
    expect(result?.phone).toBe("+34600111222");
    expect(db.update).toHaveBeenCalled();
  });

  it("retorna null si el target no existe o no es role USER (anti-IDOR)", async () => {
    dbQueue.push([]);

    const result = await updatePlayer("u1", { firstName: "X" });

    expect(result).toBeNull();
  });
});

describe("lockPlayer", () => {
  it("bloquea (status=LOCKED) y retorna el usuario", async () => {
    dbQueue.push([{ ...player, status: "LOCKED" }]);

    const result = await lockPlayer("u1");

    expect(result?.status).toBe("LOCKED");
    expect(db.update).toHaveBeenCalled();
  });

  it("retorna null si el target no existe o es ADMIN", async () => {
    dbQueue.push([]);

    const result = await lockPlayer("u1");

    expect(result).toBeNull();
  });
});

describe("unlockPlayer", () => {
  it("desbloquea (status=ACTIVE) y retorna el usuario", async () => {
    dbQueue.push([{ ...player, status: "ACTIVE" }]);

    const result = await unlockPlayer("u1");

    expect(result?.status).toBe("ACTIVE");
    expect(db.update).toHaveBeenCalled();
  });

  it("retorna null si el target no existe o es ADMIN", async () => {
    dbQueue.push([]);

    const result = await unlockPlayer("u1");

    expect(result).toBeNull();
  });
});