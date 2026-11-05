/**
 * Unit tests de los schemas Zod de la agenda de clases (v0.11, C2).
 * @jest-environment node
 */
import {
  agendaHistoryQuerySchema,
  blockCreateSchema,
  blockEnrollmentCreateSchema,
  blockEnrollmentUpdateSchema,
  blockRangeQuerySchema,
  blockUpdateSchema,
  materializeWeekSchema,
  studentAgendaQuerySchema,
  weeklySlotInputSchema,
  weeklySlotUpdateSchema,
} from "@/lib/validations/class-agenda";

const VALID_SLOT = {
  dayOfWeek: 3,
  startTime: "18:00",
  durationMinutes: 60,
  label: "Grupo A",
};

describe("weeklySlotInputSchema", () => {
  it("acepta un slot válido y label opcional/null", () => {
    expect(weeklySlotInputSchema.parse(VALID_SLOT)).toMatchObject(VALID_SLOT);
    expect(weeklySlotInputSchema.parse({ ...VALID_SLOT, label: null }).label).toBeNull();
    expect(weeklySlotInputSchema.parse({ ...VALID_SLOT, label: undefined }).label).toBeUndefined();
  });

  it("dayOfWeek es ISO 1–7", () => {
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, dayOfWeek: 1 }).success).toBe(true);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, dayOfWeek: 7 }).success).toBe(true);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, dayOfWeek: 0 }).success).toBe(false);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, dayOfWeek: 8 }).success).toBe(false);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, dayOfWeek: 2.5 }).success).toBe(false);
  });

  it("startTime exige HH:mm 24h", () => {
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, startTime: "00:00" }).success).toBe(true);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, startTime: "23:59" }).success).toBe(true);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, startTime: "24:00" }).success).toBe(false);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, startTime: "9:00" }).success).toBe(false);
  });

  it("durationMinutes 15–180", () => {
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, durationMinutes: 15 }).success).toBe(true);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, durationMinutes: 180 }).success).toBe(true);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, durationMinutes: 14 }).success).toBe(false);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, durationMinutes: 181 }).success).toBe(false);
  });

  it("label máx 100", () => {
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, label: "a".repeat(100) }).success).toBe(true);
    expect(weeklySlotInputSchema.safeParse({ ...VALID_SLOT, label: "a".repeat(101) }).success).toBe(false);
  });
});

describe("weeklySlotUpdateSchema", () => {
  it("acepta un solo campo", () => {
    expect(weeklySlotUpdateSchema.parse({ label: "Nuevo" })).toEqual({ label: "Nuevo" });
    expect(weeklySlotUpdateSchema.parse({ dayOfWeek: 5 }).dayOfWeek).toBe(5);
  });

  it("rechaza objeto vacío y campos inválidos", () => {
    expect(weeklySlotUpdateSchema.safeParse({}).success).toBe(false);
    expect(weeklySlotUpdateSchema.safeParse({ startTime: "25:00" }).success).toBe(false);
  });
});

describe("materializeWeekSchema", () => {
  it("weekStart es opcional y debe ser fecha real", () => {
    expect(materializeWeekSchema.parse({})).toEqual({});
    expect(materializeWeekSchema.parse({ weekStart: "2026-11-02" }).weekStart).toBe("2026-11-02");
    expect(materializeWeekSchema.safeParse({ weekStart: "2026-02-30" }).success).toBe(false);
    expect(materializeWeekSchema.safeParse({ weekStart: "2026-11-04T18:00" }).success).toBe(false);
  });
});

describe("blockRangeQuerySchema", () => {
  it("from/to opcionales", () => {
    expect(blockRangeQuerySchema.parse({})).toEqual({});
    expect(blockRangeQuerySchema.safeParse({ from: "2026-11-02", to: "2026-11-08" }).success).toBe(true);
  });

  it("rechaza from posterior a to y rangos > 56 días", () => {
    expect(blockRangeQuerySchema.safeParse({ from: "2026-11-08", to: "2026-11-02" }).success).toBe(false);
    expect(blockRangeQuerySchema.safeParse({ from: "2026-11-02", to: "2026-12-28" }).success).toBe(true);
    expect(blockRangeQuerySchema.safeParse({ from: "2026-11-02", to: "2026-12-29" }).success).toBe(false);
  });
});

describe("blockCreateSchema", () => {
  const valid = { blockDate: "2026-11-04", startTime: "18:00", durationMinutes: 60 };

  it("acepta bloque válido con campos opcionales", () => {
    expect(blockCreateSchema.parse(valid)).toMatchObject(valid);
    expect(
      blockCreateSchema.parse({ ...valid, maxCapacity: 4, weeklySlotId: null, label: null }),
    ).toMatchObject({ maxCapacity: 4, weeklySlotId: null });
  });

  it("rechaza fecha inválida, maxCapacity 0 y uuid inválido", () => {
    expect(blockCreateSchema.safeParse({ ...valid, blockDate: "2026-02-30" }).success).toBe(false);
    expect(blockCreateSchema.safeParse({ ...valid, maxCapacity: 0 }).success).toBe(false);
    expect(blockCreateSchema.safeParse({ ...valid, weeklySlotId: "no-uuid" }).success).toBe(false);
    expect(blockCreateSchema.safeParse({ ...valid, startTime: undefined }).success).toBe(false);
  });
});

describe("blockUpdateSchema", () => {
  it("acepta status y campos parciales", () => {
    expect(blockUpdateSchema.parse({ status: "cancelled" })).toEqual({ status: "cancelled" });
    expect(blockUpdateSchema.parse({ startTime: "19:30", durationMinutes: 90 })).toMatchObject({
      startTime: "19:30",
      durationMinutes: 90,
    });
  });

  it("rechaza objeto vacío, status desconocido y hora inválida", () => {
    expect(blockUpdateSchema.safeParse({}).success).toBe(false);
    expect(blockUpdateSchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(blockUpdateSchema.safeParse({ startTime: "25:00" }).success).toBe(false);
  });
});

describe("blockEnrollmentCreateSchema", () => {
  const uuid = "00000000-0000-0000-0000-000000000001";

  it("acepta 1..50 uuids", () => {
    expect(blockEnrollmentCreateSchema.parse({ studentIds: [uuid] }).studentIds).toHaveLength(1);
    expect(
      blockEnrollmentCreateSchema.safeParse({ studentIds: Array(50).fill(uuid) }).success,
    ).toBe(true);
  });

  it("rechaza vacío, >50 y no-uuid", () => {
    expect(blockEnrollmentCreateSchema.safeParse({ studentIds: [] }).success).toBe(false);
    expect(
      blockEnrollmentCreateSchema.safeParse({ studentIds: Array(51).fill(uuid) }).success,
    ).toBe(false);
    expect(blockEnrollmentCreateSchema.safeParse({ studentIds: ["no-uuid"] }).success).toBe(false);
  });
});

describe("blockEnrollmentUpdateSchema", () => {
  it("acepta asistencia tri-estado y notes", () => {
    expect(blockEnrollmentUpdateSchema.parse({ attended: null })).toEqual({ attended: null });
    expect(blockEnrollmentUpdateSchema.parse({ attended: true, notes: null })).toMatchObject({
      attended: true,
      notes: null,
    });
  });

  it("attended es requerido y notes máx 500", () => {
    expect(blockEnrollmentUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      blockEnrollmentUpdateSchema.safeParse({ attended: true, notes: "a".repeat(500) }).success,
    ).toBe(true);
    expect(
      blockEnrollmentUpdateSchema.safeParse({ attended: true, notes: "a".repeat(501) }).success,
    ).toBe(false);
  });
});

describe("studentAgendaQuerySchema", () => {
  it("limit default 5 y coerción desde query string", () => {
    expect(studentAgendaQuerySchema.parse({})).toEqual({ limit: 5 });
    expect(studentAgendaQuerySchema.parse({ limit: "10" }).limit).toBe(10);
  });

  it("rechaza límites fuera de rango y courseId no-uuid", () => {
    expect(studentAgendaQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(studentAgendaQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(studentAgendaQuerySchema.safeParse({ courseId: "abc" }).success).toBe(false);
  });
});

describe("agendaHistoryQuerySchema — cursor (B2)", () => {
  it("acepta YYYY-MM-DDTHH:mm", () => {
    expect(agendaHistoryQuerySchema.parse({ cursor: "2026-11-04T18:00" }).cursor).toBe(
      "2026-11-04T18:00",
    );
  });

  it("rechaza ISO completo, solo fecha y fechas imposibles", () => {
    expect(agendaHistoryQuerySchema.safeParse({ cursor: "2026-11-04T18:00:00.000Z" }).success).toBe(
      false,
    );
    expect(agendaHistoryQuerySchema.safeParse({ cursor: "2026-11-04" }).success).toBe(false);
    expect(agendaHistoryQuerySchema.safeParse({ cursor: "2026-02-30T18:00" }).success).toBe(false);
    expect(agendaHistoryQuerySchema.safeParse({ cursor: "2026-11-04T25:00" }).success).toBe(false);
  });

  it("cursor opcional, limit coercible y courseId uuid", () => {
    expect(agendaHistoryQuerySchema.parse({})).toEqual({});
    expect(agendaHistoryQuerySchema.parse({ limit: "20" }).limit).toBe(20);
    expect(
      agendaHistoryQuerySchema.safeParse({ courseId: "00000000-0000-0000-0000-000000000001" })
        .success,
    ).toBe(true);
  });
});
