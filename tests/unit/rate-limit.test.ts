/**
 * Unit tests de lib/rate-limit.ts.
 * Cubre: checkPublicRateLimit con opciones custom (windowMs/max), aislamiento
 * por key, reset de ventana, extractIP y constantes de academy invite.
 * @jest-environment node
 */
import {
  ACADEMY_INVITE_MAX,
  ACADEMY_INVITE_WINDOW_MS,
  checkPublicRateLimit,
  extractIP,
} from "@/lib/rate-limit";

describe("checkPublicRateLimit", () => {
  it("permite hasta max requests dentro de la ventana y luego bloquea", () => {
    const key = `test-basic-${Date.now()}`;
    const opts = { windowMs: 60_000, max: 3 };

    const r1 = checkPublicRateLimit(key, opts);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkPublicRateLimit(key, opts);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkPublicRateLimit(key, opts);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = checkPublicRateLimit(key, opts);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("aísla contadores por key", () => {
    const a = checkPublicRateLimit(`key-a-${Date.now()}`, { windowMs: 60_000, max: 1 });
    const b = checkPublicRateLimit(`key-b-${Date.now()}`, { windowMs: 60_000, max: 1 });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("agota el contador de la misma key", () => {
    const key = `key-same-${Date.now()}`;
    expect(checkPublicRateLimit(key, { windowMs: 60_000, max: 1 }).allowed).toBe(true);
    expect(checkPublicRateLimit(key, { windowMs: 60_000, max: 1 }).allowed).toBe(false);
  });

  it("resetea el contador al expirar la ventana", async () => {
    const key = `key-window-${Date.now()}`;
    expect(checkPublicRateLimit(key, { windowMs: 50, max: 1 }).allowed).toBe(true);
    expect(checkPublicRateLimit(key, { windowMs: 50, max: 1 }).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(checkPublicRateLimit(key, { windowMs: 50, max: 1 }).allowed).toBe(true);
  });

  it("usa defaults (max 100, window 60s) cuando no recibe opciones", () => {
    const key = `key-default-${Date.now()}`;
    const r = checkPublicRateLimit(key);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(99);
  });
});

describe("extractIP", () => {
  it("toma el primer valor de x-forwarded-for", () => {
    const req = {
      headers: { get: (name: string) => (name === "x-forwarded-for" ? "1.2.3.4, 5.6.7.8" : null) },
    };
    expect(extractIP(req)).toBe("1.2.3.4");
  });

  it("cae a x-real-ip si no hay x-forwarded-for", () => {
    const req = {
      headers: { get: (name: string) => (name === "x-real-ip" ? "9.9.9.9" : null) },
    };
    expect(extractIP(req)).toBe("9.9.9.9");
  });

  it("retorna unknown sin headers de IP", () => {
    const req = { headers: { get: () => null } };
    expect(extractIP(req)).toBe("unknown");
  });
});

describe("constantes academy invite", () => {
  it("define ventana de 60s", () => {
    expect(ACADEMY_INVITE_WINDOW_MS).toBe(60_000);
  });

  it("define límite (alto en test env para no romper API tests)", () => {
    expect(ACADEMY_INVITE_MAX).toBeGreaterThanOrEqual(10);
  });
});