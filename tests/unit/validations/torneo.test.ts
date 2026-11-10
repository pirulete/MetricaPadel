/**
 * Unit tests de los schemas de request del módulo Torneos (M1) y del clamp del
 * presupuesto de solve (AC-09).
 * (Sin docblock `@jest-environment`: el env `node` ya viene de jest.config.js y
 * el docblock rompe la cobertura `perTest` de Stryker — ver app-notes.md chunk 1.)
 */
import { generateAgendaSchema, runQuerySchema } from "@/lib/validations/torneos";
import {
  DEFAULT_MAX_TIME_LIMIT_MS,
  MIN_TIME_LIMIT_MS,
  clampTimeLimit,
  resolveMaxTimeLimitMs,
} from "@/lib/torneos/limits";

describe("generateAgendaSchema", () => {
  it("happy: acepta el body completo", () => {
    expect(
      generateAgendaSchema.parse({ timeLimitMs: 90_000, mipRelGap: 0.05, force: true }),
    ).toEqual({ timeLimitMs: 90_000, mipRelGap: 0.05, force: true });
  });

  it("defaults: body vacío ⇒ todo opcional (solver usa sus defaults)", () => {
    expect(generateAgendaSchema.parse({})).toEqual({});
  });

  it("acepta mipRelGap en los bordes 0 y 1", () => {
    expect(generateAgendaSchema.parse({ mipRelGap: 0 }).mipRelGap).toBe(0);
    expect(generateAgendaSchema.parse({ mipRelGap: 1 }).mipRelGap).toBe(1);
  });

  it("rechaza mipRelGap fuera de 0..1", () => {
    expect(generateAgendaSchema.safeParse({ mipRelGap: 1.5 }).success).toBe(false);
    expect(generateAgendaSchema.safeParse({ mipRelGap: -0.1 }).success).toBe(false);
  });

  it("rechaza tipos inválidos", () => {
    expect(generateAgendaSchema.safeParse({ timeLimitMs: "90000" }).success).toBe(false);
    expect(generateAgendaSchema.safeParse({ mipRelGap: "0.1" }).success).toBe(false);
    expect(generateAgendaSchema.safeParse({ force: "true" }).success).toBe(false);
    expect(generateAgendaSchema.safeParse({ timeLimitMs: Infinity }).success).toBe(false);
  });

  it("no impone rango a timeLimitMs: el recorte es server-side (AC-09)", () => {
    expect(generateAgendaSchema.parse({ timeLimitMs: -5 }).timeLimitMs).toBe(-5);
    expect(generateAgendaSchema.parse({ timeLimitMs: 10_000_000 }).timeLimitMs).toBe(
      10_000_000,
    );
  });
});

describe("runQuerySchema", () => {
  it("happy: ?include=slots", () => {
    expect(runQuerySchema.parse({ include: "slots" })).toEqual({ include: "slots" });
  });

  it("defaults: sin query ⇒ resumen sin slots", () => {
    expect(runQuerySchema.parse({})).toEqual({});
    expect(runQuerySchema.parse({ include: undefined }).include).toBeUndefined();
  });

  it("rechaza valores de include distintos de slots", () => {
    expect(runQuerySchema.safeParse({ include: "runs" }).success).toBe(false);
    expect(runQuerySchema.safeParse({ include: "SLOTS" }).success).toBe(false);
    expect(runQuerySchema.safeParse({ include: "" }).success).toBe(false);
  });
});

describe("clampTimeLimit", () => {
  const original = process.env.TOURNAMENT_MAX_TIME_LIMIT_MS;

  afterEach(() => {
    if (original === undefined) delete process.env.TOURNAMENT_MAX_TIME_LIMIT_MS;
    else process.env.TOURNAMENT_MAX_TIME_LIMIT_MS = original;
  });

  it("ausente ⇒ techo completo (240 s)", () => {
    expect(clampTimeLimit()).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(clampTimeLimit(null)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
  });

  it("recorta el suelo a 30 s", () => {
    expect(clampTimeLimit(1_000)).toBe(MIN_TIME_LIMIT_MS);
    expect(clampTimeLimit(-5)).toBe(MIN_TIME_LIMIT_MS);
  });

  it("recorta el techo a 240 s", () => {
    expect(clampTimeLimit(10_000_000)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    expect(clampTimeLimit(240_001)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
  });

  it("respeta el valor pedido dentro de rango", () => {
    expect(clampTimeLimit(45_500)).toBe(45_500);
  });

  it("env TOURNAMENT_MAX_TIME_LIMIT_MS baja el techo efectivo", () => {
    process.env.TOURNAMENT_MAX_TIME_LIMIT_MS = "60000";
    expect(resolveMaxTimeLimitMs()).toBe(60_000);
    expect(clampTimeLimit(undefined, resolveMaxTimeLimitMs())).toBe(60_000);
    expect(clampTimeLimit(120_000)).toBe(60_000);
  });

  it("env no numérica, 0 o negativa ⇒ default 240 s (nunca 0)", () => {
    for (const raw of ["abc", "0", "-1", ""]) {
      expect(resolveMaxTimeLimitMs(raw)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
    }
    expect(resolveMaxTimeLimitMs(null)).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
  });

  it("env por encima del techo absoluto se recorta a 240 s", () => {
    expect(resolveMaxTimeLimitMs("900000")).toBe(DEFAULT_MAX_TIME_LIMIT_MS);
  });

  it("env por debajo del suelo se eleva a 30 s", () => {
    expect(resolveMaxTimeLimitMs("1000")).toBe(MIN_TIME_LIMIT_MS);
  });

  it("un techo explícito menor al valor pedido también recorta", () => {
    expect(clampTimeLimit(100_000, 60_000)).toBe(60_000);
    expect(clampTimeLimit(10_000, 60_000)).toBe(MIN_TIME_LIMIT_MS);
  });
});
