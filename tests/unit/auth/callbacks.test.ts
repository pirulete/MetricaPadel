/**
 * Unit tests de los callbacks jwt/session de auth.ts (port streetmove-sync-port).
 * Cubre: avatarUrl null-safe en login inicial y refresh, requiresTermsAcceptance
 * graceful (ACTIVE true/false, no-ACTIVE, error → false), session shape.
 * @jest-environment node
 */
jest.mock("next-auth", () => {
  const nextAuth = jest.fn(() => ({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  }));
  return { __esModule: true, default: nextAuth };
});

jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

jest.mock("@auth/core", () => ({
  skipCSRFCheck: undefined,
}));

jest.mock("@/lib/db", () => {
  const makeChain = () => {
    const c: Record<string, jest.Mock> = {} as any;
    c.set = jest.fn(() => c);
    c.where = jest.fn(() => c);
    return c;
  };
  const updateChain = makeChain();
  return {
    db: {
      query: {
        users: { findFirst: jest.fn() },
        sessions: { findFirst: jest.fn() },
      },
      update: jest.fn(() => updateChain),
    },
  };
});

jest.mock("@/lib/db/queries/terms", () => ({
  requiresTermsAcceptance: jest.fn(),
}));

import { db } from "@/lib/db";
import { requiresTermsAcceptance } from "@/lib/db/queries/terms";
import { authConfig } from "@/auth";

const jwtCallback = authConfig.callbacks!.jwt! as unknown as (params: any) => Promise<any>;
const sessionCallback = authConfig.callbacks!.session! as unknown as (params: any) => Promise<any>;

const mockRequiresTerms = requiresTermsAcceptance as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("jwt callback — login inicial (user presente)", () => {
  it("propaga avatarUrl del user al token", async () => {
    const token: Record<string, unknown> = {};
    const user = {
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "ACTIVE",
      role: "USER",
      avatarUrl: "https://cdn.example.com/a.jpg",
      sessionToken: "tok-1",
    };

    const result = await jwtCallback({ token, user, account: null, profile: null, isNewUser: false });

    expect(result.avatarUrl).toBe("https://cdn.example.com/a.jpg");
    expect(result.id).toBe("u1");
  });

  it("avatarUrl null-safe: user sin avatar → null", async () => {
    const token: Record<string, unknown> = {};
    const user = {
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "ACTIVE",
      role: "USER",
      sessionToken: "tok-1",
    };

    const result = await jwtCallback({ token, user, account: null, profile: null, isNewUser: false });

    expect(result.avatarUrl).toBeNull();
  });
});

describe("jwt callback — refresh (token.id presente)", () => {
  it("actualiza avatarUrl desde freshUser", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "ACTIVE",
      role: "USER",
      avatarUrl: "https://cdn.example.com/new.jpg",
    });
    (db.query.sessions.findFirst as jest.Mock).mockResolvedValue({ id: "s1" });
    mockRequiresTerms.mockResolvedValue(false);

    const token: Record<string, unknown> = { id: "u1", sessionToken: "tok-1" };
    const result = await jwtCallback({ token, user: undefined, account: null, profile: null, isNewUser: false });

    expect(result.avatarUrl).toBe("https://cdn.example.com/new.jpg");
  });

  it("ACTIVE + requiere aceptar T&C → requiresTermsAcceptance = true", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "ACTIVE",
      role: "USER",
    });
    (db.query.sessions.findFirst as jest.Mock).mockResolvedValue({ id: "s1" });
    mockRequiresTerms.mockResolvedValue(true);

    const token: Record<string, unknown> = { id: "u1", sessionToken: "tok-1" };
    const result = await jwtCallback({ token, user: undefined, account: null, profile: null, isNewUser: false });

    expect(result.requiresTermsAcceptance).toBe(true);
  });

  it("ACTIVE + ya aceptó T&C → requiresTermsAcceptance = false", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "ACTIVE",
      role: "USER",
    });
    (db.query.sessions.findFirst as jest.Mock).mockResolvedValue({ id: "s1" });
    mockRequiresTerms.mockResolvedValue(false);

    const token: Record<string, unknown> = { id: "u1", sessionToken: "tok-1" };
    const result = await jwtCallback({ token, user: undefined, account: null, profile: null, isNewUser: false });

    expect(result.requiresTermsAcceptance).toBe(false);
  });

  it("graceful: error en requiresTermsAcceptance (tabla no migrada) → false, no rompe login", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "ACTIVE",
      role: "USER",
    });
    (db.query.sessions.findFirst as jest.Mock).mockResolvedValue({ id: "s1" });
    mockRequiresTerms.mockRejectedValue(new Error("relation does not exist"));

    const token: Record<string, unknown> = { id: "u1", sessionToken: "tok-1" };
    const result = await jwtCallback({ token, user: undefined, account: null, profile: null, isNewUser: false });

    expect(result.requiresTermsAcceptance).toBe(false);
  });

  it("usuario no ACTIVE (TEMPORARY) → requiresTermsAcceptance = false sin llamar query", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "TEMPORARY",
      role: "USER",
    });
    (db.query.sessions.findFirst as jest.Mock).mockResolvedValue({ id: "s1" });

    const token: Record<string, unknown> = { id: "u1", sessionToken: "tok-1" };
    const result = await jwtCallback({ token, user: undefined, account: null, profile: null, isNewUser: false });

    expect(result.requiresTermsAcceptance).toBe(false);
    expect(mockRequiresTerms).not.toHaveBeenCalled();
  });

  it("freshUser null → requiresTermsAcceptance = false", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);

    const token: Record<string, unknown> = { id: "u1", sessionToken: "tok-1" };
    const result = await jwtCallback({ token, user: undefined, account: null, profile: null, isNewUser: false });

    expect(result.requiresTermsAcceptance).toBe(false);
  });
});

describe("session callback", () => {
  it("mapea avatarUrl y requiresTermsAcceptance desde el token", async () => {
    const session = { user: {} } as any;
    const token: Record<string, unknown> = {
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "ACTIVE",
      role: "USER",
      avatarUrl: "https://cdn.example.com/a.jpg",
      requiresTermsAcceptance: true,
    };

    const result = await sessionCallback({ session, token, user: undefined, newSession: false, trigger: "update" });

    expect(result.user.avatarUrl).toBe("https://cdn.example.com/a.jpg");
    expect(result.user.requiresTermsAcceptance).toBe(true);
  });

  it("defaults retrocompatibles: sin avatar ni flag → null y false", async () => {
    const session = { user: {} } as any;
    const token: Record<string, unknown> = {
      id: "u1",
      email: "a@b.cl",
      firstName: "Ana",
      lastName: "Pérez",
      status: "ACTIVE",
      role: "USER",
    };

    const result = await sessionCallback({ session, token, user: undefined, newSession: false, trigger: "update" });

    expect(result.user.avatarUrl).toBeNull();
    expect(result.user.requiresTermsAcceptance).toBe(false);
  });
});