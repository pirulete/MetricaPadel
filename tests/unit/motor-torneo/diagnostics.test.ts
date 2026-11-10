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

// ---------------------------------------------------------------------------
// Triaje de mutantes 3a: bordes del semáforo, agregación por tramo, choques de
// doble categoría, indicadores de grupo/pareja, rachas y cuadro final.
// Todos los fixtures son manuales para fijar exactamente bloques y agenda.
// ---------------------------------------------------------------------------

function mkBloque(
  idx: number,
  dayLabel: string,
  startTime: string,
  phase: TournamentPhase,
  isExtension = false,
  capacity = 2,
): Bloque {
  return { idx, dayLabel, startTime, phase, isExtension, capacity };
}

function mkPartido(
  id: string,
  phase: TournamentPhase,
  ronda: MatchRound,
  extra: Partial<Partido> = {},
): Partido {
  return {
    id,
    categoria: "C1",
    phase,
    ronda,
    grupo: null,
    parejas: null,
    gruposOrigen: [],
    alimentadores: [],
    ...extra,
  };
}

function mkPareja(
  id: string,
  grupo: string,
  personas: string[],
  bloqueados: number[] = [],
): Pareja {
  return { id, categoria: "C1", grupo, personas, bloqueados: new Set(bloqueados) };
}

function mkPersonas(parejas: Record<string, Pareja>): Record<string, Persona> {
  const personas: Record<string, Persona> = {};
  for (const [code, p] of Object.entries(parejas)) {
    for (const person of p.personas) {
      personas[person] ??= { sexo: null, parejas: [] };
      personas[person].parejas.push(code);
    }
  }
  return personas;
}

function mkInstancia(input: {
  bloques: Bloque[];
  partidos?: Partido[];
  parejas?: Record<string, Pareja>;
  personas?: Record<string, Persona>;
  grupos?: Record<string, Grupo>;
  categorias?: Record<string, Categoria>;
  canchas?: number;
}): Instancia {
  return {
    bloques: input.bloques,
    nCanchas: input.canchas ?? 2,
    categorias: input.categorias ?? { C1: { sex: "H", level: 1, grupos: [] } },
    grupos: input.grupos ?? {},
    parejas: input.parejas ?? {},
    personas: input.personas ?? {},
    partidos: Object.fromEntries((input.partidos ?? []).map((p) => [p.id, p])),
  };
}

/** Dos grupos de previa (G1, G2) con 3 parejas cada uno. */
function groupFixture(tamG1 = 3): Instancia {
  const parejas: Record<string, Pareja> = {
    A: mkPareja("A", "G1", ["P1", "P2"]),
    B: mkPareja("B", "G1", ["P3", "P4"]),
    C: mkPareja("C", "G1", ["P5", "P6"]),
    D: mkPareja("D", "G2", ["P7", "P8"]),
    E: mkPareja("E", "G2", ["P9", "P10"]),
    F: mkPareja("F", "G2", ["P11", "P12"]),
  };
  return mkInstancia({
    bloques: [
      mkBloque(0, "Jue", "14:00", "previa"),
      mkBloque(1, "Jue", "15:15", "previa"),
      mkBloque(2, "Jue", "16:30", "previa"),
      mkBloque(3, "Jue", "17:45", "previa"),
      mkBloque(4, "Sab", "08:00", "previa"),
      mkBloque(5, "Dom", "10:00", "final"),
    ],
    partidos: [
      mkPartido("C1-A1", "previa", "grupo", { grupo: "G1", parejas: ["A", "B"], gruposOrigen: ["G1"] }),
      mkPartido("C1-A2", "previa", "grupo", { grupo: "G1", parejas: ["A", "C"], gruposOrigen: ["G1"] }),
      mkPartido("C1-A3", "previa", "grupo", { grupo: "G1", parejas: ["B", "C"], gruposOrigen: ["G1"] }),
      mkPartido("C1-B1", "previa", "grupo", { grupo: "G2", parejas: ["D", "E"], gruposOrigen: ["G2"] }),
      mkPartido("C1-B2", "previa", "grupo", { grupo: "G2", parejas: ["D", "F"], gruposOrigen: ["G2"] }),
    ],
    parejas,
    personas: mkPersonas(parejas),
    grupos: {
      G1: { categoria: "C1", parejas: ["A", "B", "C"], tam: tamG1 },
      G2: { categoria: "C1", parejas: ["D", "E", "F"], tam: 3 },
    },
  });
}

describe("computeSemaforo — bordes de color", () => {
  it("fase con 0 casillas y 0 partidos ⇒ verde y occupancy 0 (no NaN)", () => {
    const inst = mkInstancia({ bloques: [mkBloque(0, "Dom", "10:00", "final")] });
    const semaforo = computeSemaforo(inst);
    expect(semaforo.previa).toEqual({
      phase: "previa",
      matches: 0,
      capacity: 0,
      occupancy: 0,
      extensionCapacity: 0,
      color: "verde",
    });
    expect(semaforo.final.occupancy).toBe(0);
  });

  it("fase con casillas y 0 partidos ⇒ occupancy 0", () => {
    const inst = mkInstancia({
      bloques: [mkBloque(0, "Sab", "08:00", "previa"), mkBloque(1, "Dom", "10:00", "final")],
    });
    expect(computeSemaforo(inst).previa.occupancy).toBe(0);
  });

  it("ρ exactamente 0.85 ⇒ verde (el umbral es estricto)", () => {
    const tramos: CalendarioTramo[] = [
      { dayLabel: "Sab", startTime: "08:00", blocks: 10, phase: "previa", isExtension: false },
    ];
    const semaforo = computeSemaforo(tidx(tramos, 2, 17, 0));
    expect(semaforo.previa.occupancy).toBeCloseTo(0.85, 10);
    expect(semaforo.previa.color).toBe("verde");
  });

  it("ρ exactamente 1 ⇒ amarillo (no rojo)", () => {
    const tramos: CalendarioTramo[] = [
      { dayLabel: "Sab", startTime: "08:00", blocks: 4, phase: "previa", isExtension: false },
    ];
    const semaforo = computeSemaforo(tidx(tramos, 3, 12, 0));
    expect(semaforo.previa.occupancy).toBe(1);
    expect(semaforo.previa.color).toBe("amarillo");
  });
});

describe("computeDiagnosis — ocupación por tramo", () => {
  it("agrega capacidad y partidos por (día, fase, extensión)", () => {
    const tramos: CalendarioTramo[] = [
      { dayLabel: "Jue", startTime: "14:00", blocks: 2, phase: "previa", isExtension: false },
      { dayLabel: "Sab", startTime: "08:00", blocks: 1, phase: "previa", isExtension: true },
      { dayLabel: "Dom", startTime: "10:00", blocks: 1, phase: "final", isExtension: false },
    ];
    const inst = tidx(tramos, 2, 2, 0);
    const report = computeDiagnosis(inst, {
      status: "optimal",
      bloqueDe: { P0: 0, P1: 1 },
    });

    expect(report.occupancyByTramo).toHaveLength(3);
    expect(report.occupancyByTramo[0]).toEqual({
      dayLabel: "Jue",
      phase: "previa",
      isExtension: false,
      matches: 2,
      capacity: 4,
    });
    expect(report.occupancyByTramo[1]).toMatchObject({ matches: 0, capacity: 2 });
    expect(report.occupancyByTramo[2]).toMatchObject({ matches: 0, capacity: 2 });
  });
});

/** Dos grupos + finales blandas (4tos/semi) y una dura (8vos); P1 es doble. */
function dobleFixture(): Instancia {
  const parejas: Record<string, Pareja> = {
    A: mkPareja("A", "G1", ["P1", "P2"]),
    B: mkPareja("B", "G1", ["P3", "P4"]),
    C: mkPareja("C", "G1", ["P5", "P6"]),
    D: mkPareja("D", "G2", ["P1", "P7"]),
    E: mkPareja("E", "G2", ["P8", "P9"]),
    F: mkPareja("F", "G2", ["P10", "P11"]),
  };
  return mkInstancia({
    bloques: [
      mkBloque(0, "Jue", "14:00", "previa"),
      mkBloque(1, "Jue", "15:15", "previa"),
      mkBloque(2, "Jue", "16:30", "previa"),
      mkBloque(3, "Jue", "17:45", "previa"),
      mkBloque(4, "Sab", "08:00", "previa"),
      mkBloque(5, "Dom", "10:00", "final"),
      mkBloque(6, "Dom", "11:15", "final"),
    ],
    partidos: [
      mkPartido("C1-A1", "previa", "grupo", { grupo: "G1", parejas: ["A", "B"], gruposOrigen: ["G1"] }),
      mkPartido("C1-A2", "previa", "grupo", { grupo: "G1", parejas: ["A", "C"], gruposOrigen: ["G1"] }),
      mkPartido("C1-B1", "previa", "grupo", { grupo: "G2", parejas: ["D", "E"], gruposOrigen: ["G2"] }),
      mkPartido("C1-B2", "previa", "grupo", { grupo: "G2", parejas: ["D", "F"], gruposOrigen: ["G2"] }),
      mkPartido("C1-4tos-1", "final", "4tos", { gruposOrigen: ["G1", "G2"] }),
      mkPartido("C1-4tos-2", "final", "4tos", { gruposOrigen: ["G1", "G2"] }),
      mkPartido("C1-semifinal-1", "final", "semi", { gruposOrigen: ["G1", "G2"] }),
      mkPartido("C1-8vos-1", "final", "8vos", { gruposOrigen: ["G1", "G2"] }),
    ],
    parejas,
    personas: mkPersonas(parejas),
    grupos: {
      G1: { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
      G2: { categoria: "C1", parejas: ["D", "E", "F"], tam: 3 },
    },
  });
}

describe("computeDiagnosis — choques de doble categoría", () => {
  it("2 finales blandas en el mismo bloque ⇒ 1 choque", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-4tos-1": 5, "C1-4tos-2": 5 },
    });
    expect(report.doubleCategoryClashes).toBe(1);
  });

  it("3 finales blandas en el mismo bloque ⇒ 2 choques", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-4tos-1": 5, "C1-4tos-2": 5, "C1-semifinal-1": 5 },
    });
    expect(report.doubleCategoryClashes).toBe(2);
  });

  it("las finales duras (8vos) no son choques blandos", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-8vos-1": 5, "C1-4tos-1": 5 },
    });
    expect(report.doubleCategoryClashes).toBe(0);
  });

  it("partidos potenciales sin bloque no generan choques", () => {
    const report = computeDiagnosis(dobleFixture(), { status: "optimal", bloqueDe: {} });
    expect(report.doubleCategoryClashes).toBe(0);
  });
});

describe("computeDiagnosis — maxBloquesSeguidos", () => {
  it("detecta 3 bloques seguidos del mismo día", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1, "C1-B1": 2 },
    });
    expect(report.maxBloquesSeguidos).toBe(3);
  });

  it("una final potencial agendada no alarga la racha de previa", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1, "C1-4tos-1": 2 },
    });
    expect(report.maxBloquesSeguidos).toBe(2);
  });

  it("corta la racha al cambiar de día aunque los idx sean contiguos", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 3, "C1-A2": 4 },
    });
    expect(report.maxBloquesSeguidos).toBe(1);
  });

  it("ordena los bloques antes de medir la racha", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 1, "C1-A2": 0 },
    });
    expect(report.maxBloquesSeguidos).toBe(2);
  });

  it("no cuenta bloques no consecutivos del mismo día como racha", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 2 },
    });
    expect(report.maxBloquesSeguidos).toBe(1);
  });

  it("reinicia la racha después de un corte", () => {
    const report = computeDiagnosis(rachaFixture(), {
      status: "optimal",
      bloqueDe: { M1: 0, M2: 1, M3: 3, M4: 4 },
    });
    expect(report.maxBloquesSeguidos).toBe(2);
  });

  it("ignora los partidos potenciales sin bloque al medir la racha", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-B1": 1 },
    });
    expect(report.maxBloquesSeguidos).toBe(2);
  });

  it("un partido potencial de previa SIN bloque, insertado entre dos asignados, no parte la racha", () => {
    // MX va en el medio del orden de inserción y NO tiene bloque en `bloqueDe`:
    // el filtro debe EXCLUIRLO (no mapear `undefined` al centro de la racha).
    const parejas: Record<string, Pareja> = {
      A: mkPareja("A", "G1", ["P1", "P2"]),
      B: mkPareja("B", "G1", ["P1", "P3"]),
    };
    const inst = mkInstancia({
      bloques: [
        mkBloque(0, "Jue", "14:00", "previa"),
        mkBloque(1, "Jue", "15:15", "previa"),
      ],
      parejas,
      personas: mkPersonas(parejas),
      partidos: [
        mkPartido("M1", "previa", "grupo", { parejas: ["A", "B"], grupo: "G1" }),
        mkPartido("MX", "previa", "grupo", { parejas: ["A", "B"], grupo: "G1" }),
        mkPartido("M2", "previa", "grupo", { parejas: ["A", "B"], grupo: "G1" }),
      ],
    });
    const report = computeDiagnosis(inst, {
      status: "optimal",
      bloqueDe: { M1: 0, M2: 1 },
    });
    expect(report.maxBloquesSeguidos).toBe(2);
  });
});

/** 4 partidos de previa con la misma persona (P1) en los bloques Jue 0-4. */
function rachaFixture(): Instancia {
  const parejas: Record<string, Pareja> = {
    A: mkPareja("A", "G1", ["P1", "P2"]),
    B: mkPareja("B", "G1", ["P1", "P3"]),
    C: mkPareja("C", "G1", ["P1", "P4"]),
    D: mkPareja("D", "G1", ["P1", "P5"]),
  };
  return mkInstancia({
    bloques: [
      mkBloque(0, "Jue", "14:00", "previa"),
      mkBloque(1, "Jue", "15:15", "previa"),
      mkBloque(2, "Jue", "16:30", "previa"),
      mkBloque(3, "Jue", "17:45", "previa"),
      mkBloque(4, "Jue", "19:00", "previa"),
    ],
    partidos: [
      mkPartido("M1", "previa", "grupo", { parejas: ["A", "B"] }),
      mkPartido("M2", "previa", "grupo", { parejas: ["A", "C"] }),
      mkPartido("M3", "previa", "grupo", { parejas: ["B", "D"] }),
      mkPartido("M4", "previa", "grupo", { parejas: ["C", "D"] }),
    ],
    parejas,
    personas: mkPersonas(parejas),
  });
}

describe("computeDiagnosis — indicadores de grupo", () => {
  it("grupo como unidad: mismo día y span ≤ 2 (tam 3)", () => {
    const report = computeDiagnosis(groupFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1, "C1-A3": 2 },
      canchaDe: { "C1-A1": 1, "C1-A2": 1, "C1-A3": 1 },
    });
    expect(report.gruposMismoDia).toEqual({ count: 1, total: 1 });
    expect(report.gruposComoUnidad).toEqual({ count: 1, total: 1 });
    expect(report.gruposMismaCancha).toEqual({ count: 1, total: 1 });
  });

  it("no es unidad si el span supera 2 bloques", () => {
    const report = computeDiagnosis(groupFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1, "C1-A3": 3 },
    });
    expect(report.gruposMismoDia).toEqual({ count: 1, total: 1 });
    expect(report.gruposComoUnidad).toEqual({ count: 0, total: 1 });
  });

  it("mismoDia exige el mismo dayLabel aunque los idx sean contiguos", () => {
    const report = computeDiagnosis(groupFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 3, "C1-A2": 4 },
    });
    expect(report.gruposMismoDia).toEqual({ count: 0, total: 1 });
    expect(report.gruposComoUnidad).toEqual({ count: 0, total: 1 });
  });

  it("tam 4 exige span ≤ 1", () => {
    const report = computeDiagnosis(groupFixture(4), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1, "C1-A3": 2 },
    });
    expect(report.gruposMismoDia).toEqual({ count: 1, total: 1 });
    expect(report.gruposComoUnidad).toEqual({ count: 0, total: 1 });
  });

  it("sin cancha asignada no cuenta como misma cancha", () => {
    const report = computeDiagnosis(groupFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1, "C1-A3": 2 },
    });
    expect(report.gruposMismaCancha).toEqual({ count: 0, total: 1 });
  });

  it("omite los partidos del grupo sin bloque asignado", () => {
    const report = computeDiagnosis(groupFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0 },
    });
    expect(report.gruposMismoDia).toEqual({ count: 1, total: 1 });
    expect(report.gruposComoUnidad).toEqual({ count: 1, total: 1 });
  });

  it("un grupo desconocido usa tam 3 por defecto", () => {
    const inst = groupFixture();
    for (const id of ["C1-A1", "C1-A2", "C1-A3"]) inst.partidos[id].grupo = "GHOST";
    const report = computeDiagnosis(inst, {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1, "C1-A3": 2 },
    });
    expect(report.gruposComoUnidad).toEqual({ count: 1, total: 1 });
  });

  it("mide el span entre bloques aunque no incluya el bloque 0", () => {
    const report = computeDiagnosis(groupFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 1, "C1-A2": 2 },
    });
    expect(report.gruposMismoDia).toEqual({ count: 1, total: 1 });
    expect(report.gruposComoUnidad).toEqual({ count: 1, total: 1 });
  });

  it("dos canchas distintas no cuentan como misma cancha", () => {
    const report = computeDiagnosis(groupFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1 },
      canchaDe: { "C1-A1": 1, "C1-A2": 2 },
    });
    expect(report.gruposMismaCancha).toEqual({ count: 0, total: 1 });
  });
});

describe("computeDiagnosis — días por pareja", () => {
  it("una pareja en 3 días no cuenta como 2 días", () => {
    const inst = groupFixture();
    // A y B juegan A1 (Jue), A2 (Sab) y A3 (Dom) ⇒ 3 días.
    inst.partidos["C1-A1"].parejas = ["A", "B"];
    inst.partidos["C1-A2"].parejas = ["A", "B"];
    inst.partidos["C1-A3"].parejas = ["A", "B"];
    // C juega B1 (Jue) y B2 (Sab) ⇒ 2 días; D (Jue) y E (Sab) ⇒ 1 día.
    inst.partidos["C1-B1"].parejas = ["C", "D"];
    inst.partidos["C1-B2"].parejas = ["C", "E"];
    const report = computeDiagnosis(inst, {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 4, "C1-A3": 5, "C1-B1": 0, "C1-B2": 4 },
    });
    expect(report.parejasUnDia).toEqual({ count: 2, total: 5 });
    expect(report.parejasDosDias).toBe(1);
  });
});

/** Cuadro de 2 categorías: 4tos y final por categoría. */
function cuadroFixture(): Instancia {
  return mkInstancia({
    bloques: [
      mkBloque(0, "Dom", "10:00", "final"),
      mkBloque(1, "Dom", "11:15", "final"),
      mkBloque(2, "Dom", "12:30", "final"),
    ],
    partidos: [
      mkPartido("C1-4tos-1", "final", "4tos", { categoria: "C1", gruposOrigen: ["G1"] }),
      mkPartido("C1-final-1", "final", "final", { categoria: "C1", gruposOrigen: ["G1"] }),
      mkPartido("C2-4tos-1", "final", "4tos", { categoria: "C2", gruposOrigen: ["G2"] }),
      mkPartido("C2-final-1", "final", "final", { categoria: "C2", gruposOrigen: ["G2"] }),
    ],
    categorias: {
      C1: { sex: "H", level: 1, grupos: ["G1"] },
      C2: { sex: "H", level: 1, grupos: ["G2"] },
    },
  });
}

describe("computeDiagnosis — finales y primer partido de cuadro", () => {
  it("solo lista las finales (ronda final), ordenadas por bloque", () => {
    const report = computeDiagnosis(cuadroFixture(), {
      status: "optimal",
      bloqueDe: { "C1-final-1": 2, "C2-final-1": 0, "C1-4tos-1": 1, "C2-4tos-1": 1 },
      canchaDe: { "C1-final-1": 1, "C2-final-1": 2 },
    });
    expect(report.finals).toEqual([
      { matchId: "C2-final-1", category: "C2", dayLabel: "Dom", startTime: "10:00", court: 2 },
      { matchId: "C1-final-1", category: "C1", dayLabel: "Dom", startTime: "12:30", court: 1 },
    ]);
  });

  it("el primer partido de cuadro es el del bloque más temprano", () => {
    const report = computeDiagnosis(cuadroFixture(), {
      status: "optimal",
      bloqueDe: { "C1-4tos-1": 2, "C1-final-1": 0, "C2-4tos-1": 0, "C2-final-1": 1 },
    });
    expect(report.bracketFirstMatch).toEqual([
      { category: "C1", matchId: "C1-final-1", dayLabel: "Dom", startTime: "10:00" },
      { category: "C2", matchId: "C2-4tos-1", dayLabel: "Dom", startTime: "10:00" },
    ]);
  });

  it("en empate de bloque gana el primero en el orden determinista", () => {
    const report = computeDiagnosis(cuadroFixture(), {
      status: "optimal",
      bloqueDe: { "C1-4tos-1": 1, "C1-final-1": 1, "C2-4tos-1": 1, "C2-final-1": 1 },
    });
    expect(report.bracketFirstMatch.map((item) => item.matchId)).toEqual([
      "C1-4tos-1",
      "C2-4tos-1",
    ]);
  });

  it("un partido de cuadro sin bloque no es candidato", () => {
    const report = computeDiagnosis(cuadroFixture(), {
      status: "optimal",
      bloqueDe: { "C1-final-1": 1, "C2-final-1": 1 },
    });
    expect(report.bracketFirstMatch.map((item) => item.matchId)).toEqual([
      "C1-final-1",
      "C2-final-1",
    ]);
  });

  it("ordena las finales por bloque con 4 categorías", () => {
    const inst = mkInstancia({
      bloques: [
        mkBloque(0, "Dom", "10:00", "final"),
        mkBloque(1, "Dom", "11:15", "final"),
        mkBloque(2, "Dom", "12:30", "final"),
        mkBloque(3, "Dom", "13:45", "final"),
      ],
      partidos: [
        mkPartido("C1-final-1", "final", "final", { categoria: "C1" }),
        mkPartido("C2-final-1", "final", "final", { categoria: "C2" }),
        mkPartido("C3-final-1", "final", "final", { categoria: "C3" }),
        mkPartido("C4-final-1", "final", "final", { categoria: "C4" }),
      ],
      categorias: {
        C1: { sex: "H", level: 1, grupos: [] },
        C2: { sex: "H", level: 1, grupos: [] },
        C3: { sex: "H", level: 1, grupos: [] },
        C4: { sex: "H", level: 1, grupos: [] },
      },
    });
    const report = computeDiagnosis(inst, {
      status: "optimal",
      bloqueDe: {
        "C1-final-1": 3,
        "C2-final-1": 0,
        "C3-final-1": 1,
        "C4-final-1": 2,
      },
    });
    expect(report.finals.map((item) => item.matchId)).toEqual([
      "C2-final-1",
      "C3-final-1",
      "C4-final-1",
      "C1-final-1",
    ]);
  });
});

/** 4 partidos de previa en bloques con horario laboral, límite y otro día. */
function laboralFixture(): Instancia {
  return mkInstancia({
    bloques: [
      mkBloque(0, "Jue", "14:00", "previa"),
      mkBloque(1, "Jue", "19:00", "previa"),
      mkBloque(2, "Sab", "10:00", "previa"),
      mkBloque(3, "Vie", "18:00", "previa"),
    ],
    partidos: [
      mkPartido("M0", "previa", "grupo"),
      mkPartido("M1", "previa", "grupo"),
      mkPartido("M2", "previa", "grupo"),
      mkPartido("M3", "previa", "grupo"),
    ],
  });
}

describe("computeDiagnosis — partidos agendados, extensión y horario laboral", () => {
  it("cuenta solo los partidos con bloque asignado", () => {
    const report = computeDiagnosis(dobleFixture(), {
      status: "optimal",
      bloqueDe: { "C1-A1": 0, "C1-A2": 1 },
    });
    expect(report.scheduledMatches).toBe(2);
  });

  it("cuenta los partidos en bloques de extensión", () => {
    const inst = mkInstancia({
      bloques: [
        mkBloque(0, "Sab", "08:00", "previa"),
        mkBloque(1, "Sab", "09:15", "previa", true),
      ],
      partidos: [mkPartido("M1", "previa", "grupo")],
    });
    const report = computeDiagnosis(inst, { status: "optimal", bloqueDe: { M1: 1 } });
    expect(report.extensionMatches).toBe(1);
  });

  it("horario laboral: Jue/Vie estrictamente antes de las 19:00", () => {
    const report = computeDiagnosis(laboralFixture(), {
      status: "optimal",
      bloqueDe: { M0: 0, M1: 1, M2: 2, M3: 3 },
    });
    expect(report.partidosHorarioLaboral).toBe(2);
  });

  it("un partido sin bloque no cuenta como laboral (no lanza)", () => {
    const report = computeDiagnosis(laboralFixture(), {
      status: "optimal",
      bloqueDe: { M0: 0, M1: 1 },
    });
    expect(report.partidosHorarioLaboral).toBe(1);
  });
});

describe("computeDiagnosis — tramo de extensión con el mismo día y fase que la base", () => {
  it("base y extensión del mismo día/fase son tramos SEPARADOS (clave ext/base)", () => {
    const parejas: Record<string, Pareja> = {
      A: mkPareja("A", "G1", ["P1", "P2"]),
    };
    const inst = mkInstancia({
      bloques: [
        mkBloque(0, "Dom", "08:00", "final"),
        mkBloque(1, "Dom", "19:15", "final", true),
      ],
      parejas,
      personas: mkPersonas(parejas),
      partidos: [
        mkPartido("F1", "final", "final"),
        mkPartido("F2", "final", "final"),
      ],
    });
    const report = computeDiagnosis(inst, {
      status: "optimal",
      bloqueDe: { F1: 0, F2: 1 },
    });

    expect(report.occupancyByTramo).toHaveLength(2);
    const base = report.occupancyByTramo.find((t) => !t.isExtension);
    const ext = report.occupancyByTramo.find((t) => t.isExtension);
    expect(base).toMatchObject({ dayLabel: "Dom", phase: "final", matches: 1 });
    expect(ext).toMatchObject({ dayLabel: "Dom", phase: "final", matches: 1 });
    expect(report.extensionMatches).toBe(1);
  });
});
