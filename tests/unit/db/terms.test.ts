/**
 * Unit tests de queries de Terms & Conditions con db mockeado.
 * Cubre: requiresTermsAcceptance (true/false/graceful), acceptTermsVersion,
 * createTermsVersion, publishTermsVersion, getTermsVersionsWithCounts.
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = () => {
    const c: Record<string, jest.Mock> = {} as any;
    c.from = jest.fn(() => c);
    c.innerJoin = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.groupBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.offset = jest.fn(() => c);
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
        termsVersions: { findFirst: jest.fn(), findMany: jest.fn() },
        userTermsAcceptance: { findFirst: jest.fn() },
      },
      select: jest.fn(() => selectChain),
      insert: jest.fn(() => insertChain),
      update: jest.fn(() => updateChain),
      transaction: jest.fn(async (cb: any) => cb({
        update: jest.fn(() => updateChain),
      })),
    },
  };
});

import { db } from "@/lib/db";
import {
  requiresTermsAcceptance,
  hasUserAcceptedCurrentTerms,
  acceptTermsVersion,
  createTermsVersion,
  publishTermsVersion,
  getTermsVersionsWithCounts,
} from "@/lib/db/queries/terms";

type Chain = Record<string, jest.Mock>;

const selectChain = (db.select as jest.Mock)() as Chain;
const insertChain = (db.insert as jest.Mock)() as Chain;
const updateChain = (db.update as jest.Mock)() as Chain;

function resetChain(c: Chain) {
  for (const m of ["from", "innerJoin", "where", "orderBy", "groupBy", "limit", "offset", "values", "set"]) {
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

describe("requiresTermsAcceptance", () => {
  it("retorna false si no hay versión current", async () => {
    (db.query.termsVersions.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await requiresTermsAcceptance("u1")).toBe(false);
  });

  it("retorna true si el usuario ACTIVE no ha aceptado la versión current", async () => {
    (db.query.termsVersions.findFirst as jest.Mock).mockResolvedValue({ id: "v1", isCurrent: 1 });
    (db.query.userTermsAcceptance.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await requiresTermsAcceptance("u1")).toBe(true);
  });

  it("retorna false si el usuario ya aceptó la versión current", async () => {
    (db.query.termsVersions.findFirst as jest.Mock).mockResolvedValue({ id: "v1", isCurrent: 1 });
    (db.query.userTermsAcceptance.findFirst as jest.Mock).mockResolvedValue({ id: "a1" });
    expect(await requiresTermsAcceptance("u1")).toBe(false);
  });

  it("graceful degradation: retorna false si la query falla (tabla no migrada)", async () => {
    (db.query.termsVersions.findFirst as jest.Mock).mockRejectedValue(new Error("relation does not exist"));
    expect(await requiresTermsAcceptance("u1")).toBe(false);
  });
});

describe("hasUserAcceptedCurrentTerms", () => {
  it("retorna true si no hay versión current (nada que aceptar)", async () => {
    (db.query.termsVersions.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await hasUserAcceptedCurrentTerms("u1")).toBe(true);
  });

  it("retorna true si el usuario aceptó la versión current", async () => {
    (db.query.termsVersions.findFirst as jest.Mock).mockResolvedValue({ id: "v1", isCurrent: 1 });
    (db.query.userTermsAcceptance.findFirst as jest.Mock).mockResolvedValue({ id: "a1" });
    expect(await hasUserAcceptedCurrentTerms("u1")).toBe(true);
  });

  it("retorna false si hay versión current pero el usuario no aceptó", async () => {
    (db.query.termsVersions.findFirst as jest.Mock).mockResolvedValue({ id: "v1", isCurrent: 1 });
    (db.query.userTermsAcceptance.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await hasUserAcceptedCurrentTerms("u1")).toBe(false);
  });
});

describe("acceptTermsVersion", () => {
  it("retorna la aceptación existente sin insertar duplicado", async () => {
    const existing = { id: "a1", userId: "u1", termsVersionId: "v1" };
    (db.query.userTermsAcceptance.findFirst as jest.Mock).mockResolvedValue(existing);
    const result = await acceptTermsVersion("u1", "v1");
    expect(result).toEqual(existing);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserta una nueva aceptación si no existe", async () => {
    (db.query.userTermsAcceptance.findFirst as jest.Mock).mockResolvedValue(undefined);
    const row = { id: "a1", userId: "u1", termsVersionId: "v1" };
    insertChain.returning.mockResolvedValue([row]);
    const result = await acceptTermsVersion("u1", "v1", "1.2.3.4", "UA");
    expect(result).toEqual(row);
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("createTermsVersion", () => {
  it("asigna versionNumber = max + 1", async () => {
    selectChain.from.mockResolvedValue([{ max: 3 }]);
    const row = { id: "v1", versionNumber: 4 };
    insertChain.returning.mockResolvedValue([row]);
    const values: any[] = [];
    (insertChain.values as jest.Mock).mockImplementation((v: any) => {
      values.push(v);
      return insertChain;
    });
    const result = await createTermsVersion({ title: "T", content: "C", createdBy: "u1" });
    expect(result).toEqual(row);
    expect(values[0].versionNumber).toBe(4);
  });
});

describe("publishTermsVersion", () => {
  it("desmarca current previo y publica la versión", async () => {
    const published = { id: "v2", isCurrent: 1, publishedAt: new Date() };
    updateChain.returning.mockResolvedValue([published]);
    const result = await publishTermsVersion("v2");
    expect(result).toEqual(published);
    expect(db.transaction).toHaveBeenCalled();
  });
});

describe("getTermsVersionsWithCounts", () => {
  it("adjunta acceptanceCount por versión", async () => {
    (db.query.termsVersions.findMany as jest.Mock).mockResolvedValue([
      { id: "v1", versionNumber: 2, creator: { firstName: "A", lastName: "B" } },
      { id: "v2", versionNumber: 1, creator: null },
    ]);
    selectChain.groupBy.mockResolvedValue([
      { termsVersionId: "v1", count: 5 },
    ]);
    const result = await getTermsVersionsWithCounts();
    expect(result[0].acceptanceCount).toBe(5);
    expect(result[1].acceptanceCount).toBe(0);
  });
});
