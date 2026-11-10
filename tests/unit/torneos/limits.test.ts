/**
 * F3b — límites del módulo Torneos (`lib/torneos/limits.ts`).
 *
 * El clamp es la única autoridad del presupuesto de solve (AC-09): un
 * `timeLimitMs` del body nunca supera el techo, y una env ausente/ inválida
 * cae al default de 240 s (nunca a 0).
 */
import {
  DEFAULT_MAX_TIME_LIMIT_MS,
  MIN_TIME_LIMIT_MS,
  REAPER_MAX_DISPATCH_ATTEMPTS,
  REAPER_WORKER_CRASH_TIMEOUT_MS,
  REAPER_WORKER_MAX_DURATION_MS,
  clampTimeLimit,
  resolveMaxTimeLimitMs,
} from "@/lib/torneos/limits";

describe("resolveMaxTimeLimitMs — techo desde el entorno", () => {
  it("env ausente o vacía ⇒ 240 s", () => {
    expect(resolveMaxTimeLimitMs(undefined)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(resolveMaxTimeLimitMs(null)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(resolveMaxTimeLimitMs("")).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
  });

  it("env no numérica, cero o negativa ⇒ 240 s", () => {
    expect(resolveMaxTimeLimitMs("abc")).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(resolveMaxTimeLimitMs(Number.NaN)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(resolveMaxTimeLimitMs(0)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(resolveMaxTimeLimitMs(-5_000)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(resolveMaxTimeLimitMs(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_MAX_TIME_LIMIT_MS,
    );
  });

  it("env válida dentro del rango se respeta", () => {
    expect(resolveMaxTimeLimitMs("60000")).toBe(60_000);
    expect(resolveMaxTimeLimitMs(120_000)).toBe(120_000);
  });

  it("env por encima del techo se recorta a 240 s y por debajo del suelo a 30 s", () => {
    expect(resolveMaxTimeLimitMs("999999")).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(resolveMaxTimeLimitMs("1000")).toBe(MIN_TIME_LIMIT_MS);
  });

  it("sin argumento lee la env actual (ausente en Jest ⇒ 240 s)", () => {
    const previous = process.env.TOURNAMENT_MAX_TIME_LIMIT_MS;
    delete process.env.TOURNAMENT_MAX_TIME_LIMIT_MS;
    try {
      expect(resolveMaxTimeLimitMs()).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    } finally {
      if (previous !== undefined) {
        process.env.TOURNAMENT_MAX_TIME_LIMIT_MS = previous;
      }
    }
  });
});

describe("clampTimeLimit — presupuesto de solve", () => {
  it("sin pedido explícito ⇒ techo completo", () => {
    expect(clampTimeLimit()).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(clampTimeLimit(null)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(clampTimeLimit(undefined, 120_000)).toBe(120_000);
  });

  it("valores límite: suelo y techo exactos", () => {
    expect(clampTimeLimit(MIN_TIME_LIMIT_MS)).toBe(MIN_TIME_LIMIT_MS);
    expect(clampTimeLimit(DEFAULT_MAX_TIME_LIMIT_MS)).toBe(
      DEFAULT_MAX_TIME_LIMIT_MS,
    );
  });

  it("fuera de rango se recorta (el body nunca bypassa el techo)", () => {
    expect(clampTimeLimit(1)).toBe(MIN_TIME_LIMIT_MS);
    expect(clampTimeLimit(-1)).toBe(MIN_TIME_LIMIT_MS);
    expect(clampTimeLimit(10 * DEFAULT_MAX_TIME_LIMIT_MS)).toBe(
      DEFAULT_MAX_TIME_LIMIT_MS,
    );
  });

  it("NaN / Infinity ⇒ techo completo, nunca 0", () => {
    expect(clampTimeLimit(Number.NaN)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(clampTimeLimit(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_MAX_TIME_LIMIT_MS,
    );
  });

  it("redondea fracciones y respeta un techo custom clampeado", () => {
    expect(clampTimeLimit(60_000.7)).toBe(60_001);
    expect(clampTimeLimit(200_000, 90_000)).toBe(90_000);
    expect(clampTimeLimit(50_000, 1)).toBe(MIN_TIME_LIMIT_MS);
    expect(clampTimeLimit(50_000, 10 * DEFAULT_MAX_TIME_LIMIT_MS)).toBe(50_000);
  });
});

describe("constantes del ciclo del run", () => {
  it("reaper queda dentro de lo documentado", () => {
    expect(REAPER_MAX_DISPATCH_ATTEMPTS).toBe(2);
    expect(REAPER_WORKER_CRASH_TIMEOUT_MS).toBe(
      REAPER_WORKER_MAX_DURATION_MS + 60_000,
    );
  });
});
