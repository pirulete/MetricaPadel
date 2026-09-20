/**
 * Unit tests de queries de session_config con db mockeado.
 * Cubre: getSessionConfig (fila existente / default env / sin fila) y
 * updateSessionConfig (update existente / upsert insert).
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = () => {
    const c: Record<string, jest.Mock> = {} as any;
    c.from = jest.fn(() => c);
    c.where = jest.fn(() => c);
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
      select: jest.fn(() => selectChain),
      insert: jest.fn(() => insertChain),
      update: jest.fn(() => updateChain),
    },
  };
});

import { db } from "@/lib/db";
import { getSessionConfig, updateSessionConfig } from "@/lib/db/queries/session-config";

type Chain = Record<string, jest.Mock>;

const selectChain = (db.select as jest.Mock)() as Chain;
const insertChain = (db.insert as jest.Mock)() as Chain;
const updateChain = (db.update as jest.Mock)() as Chain;

function resetChain(c: Chain) {
  for (const m of ["from", "where", "limit", "values", "set"]) {
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
  delete process.env.SESSION_ACCESS_TOKEN_TTL;
});

describe("getSessionConfig", () => {
  it("retorna la fila de session_config si existe", async () => {
    selectChain.limit.mockResolvedValue([{ id: "c1", accessTokenTtl: 30 }]);
    const result = await getSessionConfig();
    expect(result.accessTokenTtl).toBe(30);
  });

  it("retorna default 15 si no hay fila", async () => {
    selectChain.limit.mockResolvedValue([]);
    const result = await getSessionConfig();
    expect(result.accessTokenTtl).toBe(15);
  });

  it("usa SESSION_ACCESS_TOKEN_TTL como fallback si no hay fila", async () => {
    process.env.SESSION_ACCESS_TOKEN_TTL = "45";
    selectChain.limit.mockResolvedValue([]);
    const result = await getSessionConfig();
    expect(result.accessTokenTtl).toBe(45);
  });
});

describe("updateSessionConfig", () => {
  it("actualiza la fila existente", async () => {
    selectChain.limit.mockResolvedValue([{ id: "c1" }]);
    const row = { id: "c1", accessTokenTtl: 60 };
    updateChain.returning.mockResolvedValue([row]);
    const result = await updateSessionConfig({ accessTokenTtl: 60 });
    expect(result).toEqual([row]);
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("hace upsert insert si no existe fila", async () => {
    selectChain.limit.mockResolvedValue([]);
    const row = { id: "c1", accessTokenTtl: 30 };
    insertChain.returning.mockResolvedValue([row]);
    const result = await updateSessionConfig({ accessTokenTtl: 30 });
    expect(result).toEqual([row]);
    expect(db.insert).toHaveBeenCalled();
  });
});