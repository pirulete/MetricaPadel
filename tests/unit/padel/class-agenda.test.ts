/**
 * Unit tests de la lógica pura de la agenda de clases (v0.11, C2).
 * @jest-environment node
 */
import {
  addMinutes,
  buildMaterializationPlan,
  buildWeekInfo,
  canEditTiming,
  computeAttendanceAggregates,
  formatBlockDateTime,
  isValidDateStr,
  isValidTime,
  mondayOf,
  resolveCapacityRemaining,
  todayInTimeZone,
  validateAssignment,
} from "@/lib/padel/class-agenda";

describe("isValidDateStr", () => {
  it("acepta fechas de calendario reales", () => {
    expect(isValidDateStr("2026-11-04")).toBe(true);
    expect(isValidDateStr("2024-02-29")).toBe(true);
  });

  it("rechaza fechas inexistentes y formatos inválidos", () => {
    expect(isValidDateStr("2025-02-29")).toBe(false);
    expect(isValidDateStr("2026-02-30")).toBe(false);
    expect(isValidDateStr("2026-13-01")).toBe(false);
    expect(isValidDateStr("2026-11-4")).toBe(false);
    expect(isValidDateStr("04-11-2026")).toBe(false);
    expect(isValidDateStr("")).toBe(false);
  });
});

describe("isValidTime", () => {
  it("acepta HH:mm 24h", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("18:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
  });

  it("rechaza fuera de rango o sin ceros", () => {
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("9:00")).toBe(false);
    expect(isValidTime("12:60")).toBe(false);
    expect(isValidTime("1200")).toBe(false);
  });
});

describe("addMinutes", () => {
  it("suma dentro del día", () => {
    expect(addMinutes("18:00", 60)).toBe("19:00");
    expect(addMinutes("09:15", 30)).toBe("09:45");
  });

  it("hace wrap de 24 h en ambos sentidos", () => {
    expect(addMinutes("23:30", 45)).toBe("00:15");
    expect(addMinutes("00:10", -70)).toBe("23:00");
    expect(addMinutes("10:00", 1440)).toBe("10:00");
    expect(addMinutes("10:00", -1440)).toBe("10:00");
  });

  it("lanza TypeError con hora inválida", () => {
    expect(() => addMinutes("25:00", 10)).toThrow(TypeError);
  });
});

describe("mondayOf", () => {
  it("normaliza cualquier día de la semana al lunes ISO", () => {
    expect(mondayOf("2026-11-04")).toBe("2026-11-02"); // miércoles
    expect(mondayOf("2026-11-02")).toBe("2026-11-02"); // lunes ya es lunes
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // domingo = ISO 7
  });

  it("cruza la frontera de año", () => {
    expect(mondayOf("2026-01-01")).toBe("2025-12-29"); // jueves
  });

  it("lanza TypeError con fecha inválida", () => {
    expect(() => mondayOf("2026-13-01")).toThrow(TypeError);
  });
});

describe("buildWeekInfo", () => {
  it("devuelve 7 fechas lun→dom y el rango", () => {
    const week = buildWeekInfo("2026-11-04");
    expect(week.weekStart).toBe("2026-11-02");
    expect(week.weekEnd).toBe("2026-11-08");
    expect(week.dates).toHaveLength(7);
    expect(week.dates[0]).toBe("2026-11-02");
    expect(week.dates[6]).toBe("2026-11-08");
  });

  it("calcula la semana ISO en la frontera de año", () => {
    const week = buildWeekInfo("2026-01-01");
    expect(week.weekStart).toBe("2025-12-29");
    expect(week.weekEnd).toBe("2026-01-04");
    expect(week.weekNumber).toBe(1);
    expect(buildWeekInfo("2025-12-29").weekNumber).toBe(1);
    expect(buildWeekInfo("2026-11-02").weekNumber).toBe(45);
  });
});

describe("buildMaterializationPlan", () => {
  const slots = [
    { id: "s1", dayOfWeek: 1, startTime: "18:00", durationMinutes: 60, label: "Grupo A" },
    { id: "s2", dayOfWeek: 3, startTime: "20:00", durationMinutes: 90 },
    { id: "s3", dayOfWeek: 2, startTime: "10:00", durationMinutes: 60, isActive: false },
  ];

  it("materializa solo los slots activos en su día de la semana", () => {
    const plan = buildMaterializationPlan(slots, "2026-11-04");
    expect(plan.candidates).toEqual([
      {
        weeklySlotId: "s1",
        blockDate: "2026-11-02",
        startTime: "18:00",
        durationMinutes: 60,
        label: "Grupo A",
      },
      {
        weeklySlotId: "s2",
        blockDate: "2026-11-04",
        startTime: "20:00",
        durationMinutes: 90,
        label: null,
      },
    ]);
    expect(plan.skippedInactive).toBe(1);
    expect(plan.skippedExisting).toBe(0);
  });

  it("es idempotente: los keys existentes se saltan", () => {
    const first = buildMaterializationPlan(slots, "2026-11-02");
    const existingKeys = first.candidates.map((c) => `${c.weeklySlotId}:${c.blockDate}`);
    const second = buildMaterializationPlan(slots, "2026-11-02", existingKeys);
    expect(second.candidates).toHaveLength(0);
    expect(second.skippedExisting).toBe(2);
  });

  it("ignora dayOfWeek fuera de 1..7 y listas vacías", () => {
    const plan = buildMaterializationPlan(
      [{ id: "bad", dayOfWeek: 8, startTime: "10:00", durationMinutes: 60 }],
      "2026-11-02",
    );
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedInactive).toBe(1);
    expect(buildMaterializationPlan([], "2026-11-02")).toEqual({
      candidates: [],
      skippedExisting: 0,
      skippedInactive: 0,
    });
  });
});

describe("resolveCapacityRemaining / validateAssignment", () => {
  it("null = sin tope; nunca negativo", () => {
    expect(resolveCapacityRemaining(null, 5)).toBeNull();
    expect(resolveCapacityRemaining(10, 3)).toBe(7);
    expect(resolveCapacityRemaining(10, 10)).toBe(0);
    expect(resolveCapacityRemaining(10, 12)).toBe(0);
  });

  it("acepta si caben todos (all-or-nothing)", () => {
    expect(validateAssignment({ maxCapacity: null, currentCount: 20, requested: 5 })).toEqual({
      ok: true,
    });
    expect(validateAssignment({ maxCapacity: 10, currentCount: 7, requested: 3 })).toEqual({
      ok: true,
    });
    expect(validateAssignment({ maxCapacity: 10, currentCount: 7, requested: 0 })).toEqual({
      ok: true,
    });
  });

  it("rechaza por 1 de más con los cupos restantes", () => {
    expect(validateAssignment({ maxCapacity: 10, currentCount: 7, requested: 4 })).toEqual({
      ok: false,
      code: "AGENDA_CAPACITY",
      remaining: 3,
    });
  });
});

describe("computeAttendanceAggregates", () => {
  it("vacío ⇒ ceros y rate null", () => {
    expect(computeAttendanceAggregates([])).toEqual({
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      attended: 0,
      missed: 0,
      total: 0,
      attendanceRate: null,
    });
  });

  it("cuenta estados y tri-estado de asistencia", () => {
    const result = computeAttendanceAggregates([
      { status: "scheduled", attended: null },
      { status: "completed", attended: true },
      { status: "completed", attended: false },
      { status: "completed", attended: null },
      { status: "cancelled", attended: null },
    ]);
    expect(result).toEqual({
      scheduled: 1,
      completed: 3,
      cancelled: 1,
      attended: 1,
      missed: 1,
      total: 5,
      attendanceRate: 0.5,
    });
  });

  it("rate con 3 decimales y null si no hay asistencias marcadas", () => {
    const rated = computeAttendanceAggregates([
      { status: "completed", attended: true },
      { status: "completed", attended: true },
      { status: "completed", attended: false },
    ]);
    expect(rated.attendanceRate).toBe(0.667);

    const pending = computeAttendanceAggregates([
      { status: "scheduled", attended: null },
      { status: "cancelled", attended: null },
    ]);
    expect(pending.attendanceRate).toBeNull();
  });
});

describe("canEditTiming (EC-02)", () => {
  it("bloque pasado ⇒ false; hoy y futuro ⇒ true", () => {
    const today = "2026-11-04";
    expect(canEditTiming({ blockDate: "2026-11-03", status: "scheduled" }, today)).toBe(false);
    expect(canEditTiming({ blockDate: "2026-11-04", status: "scheduled" }, today)).toBe(true);
    expect(canEditTiming({ blockDate: "2026-12-01", status: "scheduled" }, today)).toBe(true);
  });
});

describe("todayInTimeZone (D18)", () => {
  // 02:30 UTC del 4 nov = 23:30 del 3 nov en Buenos Aires (UTC-3)
  const now = new Date("2026-11-04T02:30:00.000Z");

  it("UTC devuelve la fecha UTC", () => {
    expect(todayInTimeZone("UTC", now)).toBe("2026-11-04");
  });

  it("Buenos Aires va un día atrás en el cambio de día", () => {
    expect(todayInTimeZone("America/Argentina/Buenos_Aires", now)).toBe("2026-11-03");
    expect(
      todayInTimeZone("America/Argentina/Buenos_Aires", new Date("2026-11-04T12:00:00.000Z")),
    ).toBe("2026-11-04");
  });

  it("zona inválida ⇒ fallback UTC", () => {
    expect(todayInTimeZone("Mars/Olympus", now)).toBe("2026-11-04");
    expect(todayInTimeZone("", now)).toBe("2026-11-04");
  });
});

describe("formatBlockDateTime", () => {
  it("formatea día/mes con labels y sin ceros a la izquierda", () => {
    expect(formatBlockDateTime("2026-11-03", "18:00")).toBe("mar 3 nov · 18:00");
    expect(formatBlockDateTime("2026-11-08", "09:00")).toBe("dom 8 nov · 09:00");
  });

  it("ante una fecha inválida devuelve el par crudo", () => {
    expect(formatBlockDateTime("2026-13-01", "18:00")).toBe("2026-13-01 · 18:00");
  });
});
