/**
 * Triaje de mutantes 3f — utilidades de `Instancia` (`types.ts`).
 *
 * Cubre el orden determinista de `partidosFase` / `personasDoble` /
 * `partidosPotenciales`, el filtro por fase y las ramas defensivas
 * (`persona` inexistente y `parejas: null` en previa).
 */
import {
  bloquesFase,
  partidosFase,
  partidosPotenciales,
  personasDoble,
} from "@/lib/motor-torneo/types";
import type {
  Bloque,
  Instancia,
  Partido,
  TournamentPhase,
} from "@/lib/motor-torneo/types";

function partido(
  id: string,
  phase: TournamentPhase,
  extra: Partial<Partido> = {},
): Partido {
  return {
    id,
    categoria: "C1",
    phase,
    ronda: phase === "previa" ? "grupo" : "final",
    grupo: phase === "previa" ? "C1-G1" : null,
    parejas: phase === "previa" ? [] : null,
    gruposOrigen: [],
    alimentadores: [],
    ...extra,
  };
}

function makeInst(overrides: Partial<Instancia> = {}): Instancia {
  return {
    bloques: [],
    nCanchas: 2,
    categorias: {},
    grupos: {},
    parejas: {},
    personas: {},
    partidos: {},
    ...overrides,
  };
}

function bloque(idx: number, phase: TournamentPhase): Bloque {
  return {
    idx,
    dayLabel: "Jue",
    startTime: "14:00",
    phase,
    isExtension: false,
    capacity: 2,
  };
}

describe("bloquesFase", () => {
  it("filtra por fase conservando el orden de idx", () => {
    const inst = makeInst({
      bloques: [bloque(0, "previa"), bloque(1, "final"), bloque(2, "previa")],
    });
    expect(bloquesFase(inst, "previa").map((b) => b.idx)).toEqual([0, 2]);
    expect(bloquesFase(inst, "final").map((b) => b.idx)).toEqual([1]);
  });
});

describe("partidosFase", () => {
  it("filtra por fase y ordena por id sin depender del orden de inserción", () => {
    const inst = makeInst({
      partidos: {
        z: partido("Z", "previa", { parejas: ["Z"] }),
        m: partido("M", "previa", { parejas: ["M"] }),
        a: partido("A", "previa", { parejas: ["A"] }),
        f: partido("B", "final", { gruposOrigen: ["C1-G1"] }),
      },
    });

    expect(partidosFase(inst, "previa").map((p) => p.id)).toEqual(["A", "M", "Z"]);
    expect(partidosFase(inst, "final").map((p) => p.id)).toEqual(["B"]);
  });

  it("mantiene el orden de inserción cuando dos partidos comparten id", () => {
    const inst = makeInst({
      partidos: {
        segundo: partido("A", "previa", { parejas: ["B"] }),
        primero: partido("A", "previa", { parejas: ["A"] }),
      },
    });

    expect(partidosFase(inst, "previa").map((p) => p.parejas?.[0])).toEqual(["B", "A"]);
  });
});

describe("personasDoble", () => {
  it("devuelve solo personas con >1 pareja, ordenadas por documento", () => {
    const inst = makeInst({
      personas: {
        P2: { sexo: null, parejas: ["A", "B"] },
        P1: { sexo: null, parejas: ["A", "C"] },
        P3: { sexo: null, parejas: ["A"] },
      },
    });

    expect(personasDoble(inst)).toEqual(["P1", "P2"]);
  });
});

describe("partidosPotenciales", () => {
  it("devuelve vacío para una persona inexistente", () => {
    expect(partidosPotenciales(makeInst(), "GHOST")).toEqual([]);
  });

  it("combina previa por pareja y final por grupo, ordenado por id", () => {
    const inst = makeInst({
      personas: { P1: { sexo: null, parejas: ["A"] } },
      parejas: {
        A: { id: "A", categoria: "C1", grupo: "C1-G1", personas: ["P1", "P2"], bloqueados: new Set() },
        B: { id: "B", categoria: "C1", grupo: "C1-G1", personas: ["P3", "P4"], bloqueados: new Set() },
      },
      partidos: {
        z: partido("z", "previa", { parejas: ["B"] }),
        b: partido("b", "final", { gruposOrigen: ["C1-G1"] }),
        a: partido("a", "previa", { parejas: ["A"] }),
      },
    });

    expect(partidosPotenciales(inst, "P1")).toEqual(["a", "b"]);
  });

  it("una previa sin parejas (null) nunca matchea", () => {
    const inst = makeInst({
      personas: { P1: { sexo: null, parejas: ["A"] } },
      parejas: {
        A: { id: "A", categoria: "C1", grupo: "C1-G1", personas: ["P1", "P2"], bloqueados: new Set() },
      },
      partidos: {
        sinParejas: partido("sinParejas", "previa", { parejas: null }),
      },
    });

    expect(partidosPotenciales(inst, "P1")).toEqual([]);
  });
});
