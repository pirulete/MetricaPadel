/**
 * Diagnóstico (`diagnostics.ts`): semáforo de admisión y los indicadores de
 * `resumen_calidad` sobre una instancia sintética con agenda conocida.
 *
 * Cubre: rojo/amarillo/verde, ρ>1, fase con 0 casillas (EC-16, nunca NaN),
 * extensión fuera de la capacidad base y los 6 indicadores sin NaN.
 */
import { buildBlocks } from "@/lib/motor-torneo/calendar";
import { deriveStructure } from "@/lib/motor-torneo/bracket";
import { computeDiagnosis, computeSemaforo } from "@/lib/motor-torneo/diagnostics";
import type {
  Bloque,
  CalendarioTramo,
  Categoria,
  CourtAssignment,
  Grupo,
  Instancia,
  MatchRound,
  Pareja,
  Partido,
  Persona,
  TournamentPhase,
} from "@/lib/motor-torneo/types";

function partido(id: string, phase: TournamentPhase, ronda: MatchRound): Partido {
  return {
    id,
    categoria: "C1",
    phase,
    ronda,
    grupo: null,
    parejas: null,
    gruposOrigen: [],
    alimentadores: [],
  };
}

function syntheticInstance(
  bloques: Bloque[],
  previaMatches: number,
  finalMatches: number,
  courts = 2,
): Instancia {
  const partidos: Record<string, Partido> = {};
  for (let i = 0; i < previaMatches; i += 1) {
    partidos[`P${i}`] = partido(`P${i}`, "previa", "grupo");
  }
  for (let i = 0; i < finalMatches; i += 1) {
    partidos[`F${i}`] = partido(`F${i}`, "final", "final");
  }
  return {
    bloques,
    nCanchas: courts,
    categorias: { C1: { sex: "H", level: 1, grupos: [] } },
    grupos: {},
    parejas: {},
    personas: {},
    partidos,
  };
}

function tidx(tramos: CalendarioTramo[], courts: number, previa: number, final: number) {
  return syntheticInstance(buildBlocks(tramos, courts), previa, final, courts);
}

describe("computeSemaforo", () => {
  const unBloque = (phase: TournamentPhase, isExtension = false): CalendarioTramo[] => [
    { dayLabel: "Sab", startTime: "08:00", blocks: 1, phase, isExtension },
  ];

  it("rojo si ρ > 1 (no cabe)", () => {
    const semaforo = computeSemaforo(tidx(unBloque("previa"), 2, 3, 0));
    expect(semaforo.previa.occupancy).toBeCloseTo(1.5);
    expect(semaforo.previa.color).toBe("rojo");
  });

  it("amarillo si 0.85 < ρ ≤ 1", () => {
    const semaforo = computeSemaforo(tidx(unBloque("previa"), 10, 9, 0));
    expect(semaforo.previa.occupancy).toBeCloseTo(0.9);
    expect(semaforo.previa.color).toBe("amarillo");
  });

  it("verde si ρ ≤ 0.85", () => {
    const semaforo = computeSemaforo(tidx(unBloque("previa"), 10, 5, 0));
    expect(semaforo.previa.color).toBe("verde");
  });

  it("EC-16: fase con partidos y 0 casillas ⇒ rojo e Infinity (nunca NaN)", () => {
    const semaforo = computeSemaforo(tidx(unBloque("final"), 2, 2, 0));
    expect(semaforo.previa.capacity).toBe(0);
    expect(semaforo.previa.color).toBe("rojo");
    expect(semaforo.previa.occupancy).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(semaforo.previa.occupancy)).toBe(false);
    expect(semaforo.final.color).toBe("verde");
    expect(semaforo.final.occupancy).toBe(0);
  });

  it("la extensión no cuenta en la capacidad base", () => {
    const tramos: CalendarioTramo[] = [
      { dayLabel: "Sab", startTime: "08:00", blocks: 1, phase: "previa", isExtension: false },
      { dayLabel: "Sab", startTime: "10:00", blocks: 1, phase: "previa", isExtension: true },
    ];
    const semaforo = computeSemaforo(tidx(tramos, 4, 4, 0));
    expect(semaforo.previa.capacity).toBe(4);
    expect(semaforo.previa.extensionCapacity).toBe(4);
    expect(semaforo.previa.color).toBe("amarillo");
  });
});

const TRAMOS: CalendarioTramo[] = [
  { dayLabel: "Jue", startTime: "14:00", blocks: 1, phase: "previa", isExtension: false },
  { dayLabel: "Jue", startTime: "19:00", blocks: 1, phase: "previa", isExtension: false },
  { dayLabel: "Sab", startTime: "08:00", blocks: 1, phase: "previa", isExtension: true },
  { dayLabel: "Dom", startTime: "10:00", blocks: 1, phase: "final", isExtension: false },
  { dayLabel: "Dom", startTime: "19:15", blocks: 1, phase: "final", isExtension: true },
];

function agendaInstance(blocked: Record<string, number[]> = {}): Instancia {
  const categorias: Record<string, Categoria> = {
    C1: { sex: "H", level: 1, grupos: ["C1-G1"] },
  };
  const grupos: Record<string, Grupo> = {
    "C1-G1": { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
  };
  const parejas: Record<string, Pareja> = {
    A: { id: "A", categoria: "C1", grupo: "C1-G1", personas: ["P1", "P2"], bloqueados: new Set(blocked.A) },
    B: { id: "B", categoria: "C1", grupo: "C1-G1", personas: ["P3", "P4"], bloqueados: new Set(blocked.B) },
    C: { id: "C", categoria: "C1", grupo: "C1-G1", personas: ["P5", "P6"], bloqueados: new Set(blocked.C) },
  };
  const personas: Record<string, Persona> = {};
  for (const [code, p] of Object.entries(parejas)) {
    for (const person of p.personas) {
      personas[person] ??= { sexo: null, parejas: [] };
      personas[person].parejas.push(code);
    }
  }
  const partidos = Object.fromEntries(
    deriveStructure(categorias, grupos).map((match) => [match.id, match]),
  );
  return {
    bloques: buildBlocks(TRAMOS, 2),
    nCanchas: 2,
    categorias,
    grupos,
    parejas,
    personas,
    partidos,
  };
}

/** P1→Jue 14:00, P2→Jue 19:00, P3→Sab (ext), final→Dom 10:00. */
const BLOQUE_DE: Record<string, number> = {
  "C1-G1-P1": 0,
  "C1-G1-P2": 1,
  "C1-G1-P3": 2,
  "C1-final-1": 3,
};
const CANCHA_DE: CourtAssignment = {
  "C1-G1-P1": 1,
  "C1-G1-P2": 2,
  "C1-G1-P3": 1,
  "C1-final-1": 2,
};

describe("computeDiagnosis — indicadores", () => {
  const inst = agendaInstance();
  const report = computeDiagnosis(inst, {
    status: "optimal",
    objective: 100,
    mipGap: 0,
    timeMs: 1234,
    bloqueDe: BLOQUE_DE,
    canchaDe: CANCHA_DE,
  });

  it("semáforo por fase (extensión aparte)", () => {
    expect(report.semaforo.previa).toMatchObject({
      matches: 3,
      capacity: 4,
      extensionCapacity: 2,
      color: "verde",
    });
    expect(report.semaforo.final).toMatchObject({ matches: 1, capacity: 2, color: "verde" });
  });

  it("ocupación por tramo, extensión y horario laboral", () => {
    expect(report.scheduledMatches).toBe(4);
    expect(report.extensionMatches).toBe(1);
    expect(report.partidosHorarioLaboral).toBe(1);
    const baseJue = report.occupancyByTramo.find(
      (tramo) => tramo.dayLabel === "Jue" && !tramo.isExtension,
    );
    expect(baseJue).toMatchObject({ matches: 2, capacity: 4 });
    expect(report.occupancyByTramo).toHaveLength(4);
  });

  it("indicadores de grupos y parejas", () => {
    expect(report.gruposMismoDia).toEqual({ count: 0, total: 1 });
    expect(report.gruposComoUnidad).toEqual({ count: 0, total: 1 });
    expect(report.gruposMismaCancha).toEqual({ count: 0, total: 1 });
    expect(report.parejasUnDia).toEqual({ count: 1, total: 3 });
    expect(report.parejasDosDias).toBe(2);
    expect(report.maxBloquesSeguidos).toBe(2);
    expect(report.doubleCategoryClashes).toBe(0);
  });

  it("finales y primer partido de cuadro", () => {
    expect(report.finals).toEqual([
      { matchId: "C1-final-1", category: "C1", dayLabel: "Dom", startTime: "10:00", court: 2 },
    ]);
    expect(report.bracketFirstMatch).toEqual([
      { category: "C1", matchId: "C1-final-1", dayLabel: "Dom", startTime: "10:00" },
    ]);
  });

  it("ningún indicador numérico es NaN", () => {
    const numeros = [
      report.extensionMatches,
      report.maxBloquesSeguidos,
      report.partidosHorarioLaboral,
      report.doubleCategoryClashes,
      report.scheduledMatches,
      report.gruposComoUnidad.count,
      report.gruposMismoDia.count,
      report.gruposMismaCancha.count,
      report.parejasUnDia.count,
      report.parejasDosDias,
    ];
    for (const valor of numeros) expect(Number.isNaN(valor)).toBe(false);
  });

  it("detecta una violación de disponibilidad", () => {
    const blocked = agendaInstance({ A: [0] });
    const reportBlocked = computeDiagnosis(blocked, {
      status: "optimal",
      bloqueDe: BLOQUE_DE,
      canchaDe: CANCHA_DE,
    });
    expect(reportBlocked.availabilityViolations).toEqual([
      expect.objectContaining({ matchId: "C1-G1-P1", blockIdx: 0, teams: ["A"] }),
    ]);
  });
});
