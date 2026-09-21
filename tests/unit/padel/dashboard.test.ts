/**
 * Unit tests de lib/padel/dashboard.ts (métricas puras P01/A01).
 * @jest-environment node
 */
import {
  deriveLevel,
  isClassToday,
  todayLabel,
} from "@/lib/padel/dashboard";

describe("deriveLevel", () => {
  it("mapea ratio a nivel de curso", () => {
    expect(deriveLevel(0.8)).toBe("avanzado");
    expect(deriveLevel(0.75)).toBe("avanzado");
    expect(deriveLevel(0.6)).toBe("intermedio");
    expect(deriveLevel(0.5)).toBe("intermedio");
    expect(deriveLevel(0.3)).toBe("iniciacion");
  });

  it("retorna null sin evaluaciones", () => {
    expect(deriveLevel(null)).toBeNull();
  });
});

describe("isClassToday / todayLabel", () => {
  it("todayLabel devuelve label corto español", () => {
    // 2026-09-20 es domingo → index 6 → "Dom"
    expect(todayLabel(new Date("2026-09-20T12:00:00"))).toBe("Dom");
    // 2026-09-21 es lunes → "Lun"
    expect(todayLabel(new Date("2026-09-21T12:00:00"))).toBe("Lun");
  });

  it("isClassToday true si days incluye hoy", () => {
    expect(isClassToday(["Lun", "Mié"], new Date("2026-09-21T12:00:00"))).toBe(true);
  });

  it("isClassToday false si days no incluye hoy o está vacío", () => {
    expect(isClassToday(["Mar", "Jue"], new Date("2026-09-21T12:00:00"))).toBe(false);
    expect(isClassToday([], new Date("2026-09-21T12:00:00"))).toBe(false);
  });
});