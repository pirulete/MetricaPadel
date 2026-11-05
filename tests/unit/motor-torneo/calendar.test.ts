/**
 * F1a — port de `construir_bloques` (`motor_torneo/instancia.py:37`).
 *
 * Golden esperado: 38 bloques (22 previa + 16 final), 3 de extensión.
 */
import {
  BLOQUE_MIN,
  CALENDARIO,
  assertNoOverlap,
  buildBlocks,
  formatHHmm,
  parseHHmm,
} from "@/lib/motor-torneo/calendar";
import type { CalendarioTramo } from "@/lib/motor-torneo/types";

const COURTS = 8;

describe("buildBlocks — grilla del torneo real", () => {
  const blocks = buildBlocks(CALENDARIO, COURTS);

  it("produce 38 bloques: 22 de previa y 16 de final", () => {
    expect(blocks).toHaveLength(38);
    expect(blocks.filter((b) => b.phase === "previa")).toHaveLength(22);
    expect(blocks.filter((b) => b.phase === "final")).toHaveLength(16);
  });

  it("marca exactamente 3 bloques de extensión (domingo 19:15 en adelante)", () => {
    const extension = blocks.filter((b) => b.isExtension);
    expect(extension.map((b) => b.idx)).toEqual([35, 36, 37]);
    expect(extension.map((b) => b.startTime)).toEqual(["19:15", "20:30", "21:45"]);
  });

  it("ariza idx 0..37 en el orden del calendario", () => {
    expect(blocks.map((b) => b.idx)).toEqual([...Array(38).keys()]);
  });

  it("calcula las horas exactas por tramo", () => {
    expect(blocks[0]).toMatchObject({ dayLabel: "Jue", startTime: "14:00", phase: "previa" });
    expect(blocks[6]).toMatchObject({ dayLabel: "Jue", startTime: "21:30" });
    expect(blocks[7]).toMatchObject({ dayLabel: "Vie", startTime: "14:00" });
    expect(blocks[14]).toMatchObject({ dayLabel: "Sab", startTime: "08:00", phase: "previa" });
    expect(blocks[21]).toMatchObject({ dayLabel: "Sab", startTime: "16:45", phase: "previa" });
    expect(blocks[22]).toMatchObject({ dayLabel: "Sab", startTime: "18:00", phase: "final" });
    expect(blocks[25]).toMatchObject({ dayLabel: "Sab", startTime: "21:45" });
    expect(blocks[26]).toMatchObject({ dayLabel: "Dom", startTime: "08:00", phase: "final" });
    expect(blocks[34]).toMatchObject({ dayLabel: "Dom", startTime: "18:00", isExtension: false });
    expect(blocks[35]).toMatchObject({ dayLabel: "Dom", startTime: "19:15", isExtension: true });
  });

  it("usa el total de canchas como capacidad por defecto", () => {
    expect(blocks.every((b) => b.capacity === COURTS)).toBe(true);
    expect(buildBlocks(CALENDARIO, 5)[0].capacity).toBe(5);
  });

  it("respeta la capacidad especial por bloque", () => {
    const conOverrides = buildBlocks(CALENDARIO, COURTS, { 0: 6, 35: 0 });
    expect(conOverrides[0].capacity).toBe(6);
    expect(conOverrides[35].capacity).toBe(0);
    expect(conOverrides[1].capacity).toBe(COURTS);
  });

  it("rechaza capacidades fuera de rango [0, canchas]", () => {
    expect(() => buildBlocks(CALENDARIO, COURTS, { 3: 9 })).toThrow(/capacidad 9/);
    expect(() => buildBlocks(CALENDARIO, COURTS, { 3: -1 })).toThrow(/capacidad -1/);
    expect(() => buildBlocks(CALENDARIO, COURTS, { 3: 1.5 })).toThrow(/capacidad 1.5/);
  });

  it("rechaza un número de canchas inválido", () => {
    expect(() => buildBlocks(CALENDARIO, -1)).toThrow(/Canchas inválidas/);
    expect(() => buildBlocks(CALENDARIO, 2.5)).toThrow(/Canchas inválidas/);
  });
});

describe("assertNoOverlap — EC-09", () => {
  it("acepta el calendario real", () => {
    expect(() => assertNoOverlap(CALENDARIO)).not.toThrow();
  });

  it("acepta tramos contiguos del mismo día (sin hueco ni solape)", () => {
    const contiguos: CalendarioTramo[] = [
      { dayLabel: "Sab", startTime: "08:00", blocks: 2, phase: "previa", isExtension: false },
      { dayLabel: "Sab", startTime: "10:30", blocks: 2, phase: "final", isExtension: false },
    ];
    expect(() => assertNoOverlap(contiguos)).not.toThrow();
  });

  it("detecta solape en el mismo día", () => {
    const solapados: CalendarioTramo[] = [
      { dayLabel: "Dom", startTime: "08:00", blocks: 9, phase: "final", isExtension: false },
      { dayLabel: "Dom", startTime: "18:00", blocks: 2, phase: "final", isExtension: true },
    ];
    expect(() => assertNoOverlap(solapados)).toThrow(/Solape en Dom/);
  });

  it("no compara días distintos", () => {
    const distintos: CalendarioTramo[] = [
      { dayLabel: "Jue", startTime: "14:00", blocks: 7, phase: "previa", isExtension: false },
      { dayLabel: "Vie", startTime: "14:00", blocks: 7, phase: "previa", isExtension: false },
    ];
    expect(() => assertNoOverlap(distintos)).not.toThrow();
  });

  it("rechaza bloques negativos o no enteros", () => {
    expect(() =>
      assertNoOverlap([
        { dayLabel: "Jue", startTime: "14:00", blocks: -1, phase: "previa", isExtension: false },
      ]),
    ).toThrow(/bloques inválidos/);
    expect(() =>
      assertNoOverlap([
        { dayLabel: "Jue", startTime: "14:00", blocks: 1.5, phase: "previa", isExtension: false },
      ]),
    ).toThrow(/bloques inválidos/);
  });

  it("se ejecuta antes de construir (buildBlocks propaga el error)", () => {
    const solapados: CalendarioTramo[] = [
      { dayLabel: "Sab", startTime: "08:00", blocks: 8, phase: "previa", isExtension: false },
      { dayLabel: "Sab", startTime: "18:00", blocks: 4, phase: "final", isExtension: false },
      { dayLabel: "Sab", startTime: "20:00", blocks: 1, phase: "final", isExtension: true },
    ];
    expect(() => buildBlocks(solapados, COURTS)).toThrow(/Solape en Sab/);
  });
});

describe("aritmética de horas (sin Date, EC-17)", () => {
  it("BLOQUE_MIN es 75 y el paso entre bloques coincide", () => {
    expect(BLOQUE_MIN).toBe(75);
    const blocks = buildBlocks(CALENDARIO, COURTS);
    for (const day of ["Jue", "Vie", "Sab", "Dom"]) {
      const delDia = blocks.filter((b) => b.dayLabel === day);
      for (let i = 1; i < delDia.length; i++) {
        expect(parseHHmm(delDia[i].startTime) - parseHHmm(delDia[i - 1].startTime)).toBe(BLOQUE_MIN);
      }
    }
  });

  it("parseHHmm / formatHHmm hacen round-trip", () => {
    expect(parseHHmm("19:15")).toBe(19 * 60 + 15);
    expect(parseHHmm("00:00")).toBe(0);
    expect(formatHHmm(19 * 60 + 15)).toBe("19:15");
    expect(formatHHmm(8 * 60)).toBe("08:00");
    expect(formatHHmm(75)).toBe("01:15");
  });

  it("rechaza horas inválidas", () => {
    expect(() => parseHHmm("24:00")).toThrow(/Hora inválida/);
    expect(() => parseHHmm("7:30")).toThrow(/Hora inválida/);
    expect(() => parseHHmm("08:60")).toThrow(/Hora inválida/);
    expect(() => parseHHmm("ocho")).toThrow(/Hora inválida/);
  });

  it("permite un calendario custom (mini para los happy-path de API)", () => {
    const mini: CalendarioTramo[] = [
      { dayLabel: "Sab", startTime: "09:00", blocks: 3, phase: "previa", isExtension: false },
    ];
    const blocks = buildBlocks(mini, 2);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.startTime)).toEqual(["09:00", "10:15", "11:30"]);
    expect(blocks.every((b) => b.capacity === 2 && b.phase === "previa")).toBe(true);
  });
});
