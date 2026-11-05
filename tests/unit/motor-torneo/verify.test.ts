/**
 * Verificador independiente (`verify.ts`, puerto de `verificar.py`).
 *
 * Una agenda válida ⇒ 0 errores. Cada regla dura dispara con una agenda mutada
 * de la instancia mini: missing, capacity, court_collision/court_range,
 * person_overlap, availability, precedence y phase.
 */
import { buildBlocks } from "@/lib/motor-torneo/calendar";
import { deriveStructure } from "@/lib/motor-torneo/bracket";
import { DEFAULT_PARAMS } from "@/lib/motor-torneo/objective";
import { verify } from "@/lib/motor-torneo/verify";
import type {
  CalendarioTramo,
  Categoria,
  CourtAssignment,
  Grupo,
  Instancia,
  Pareja,
  Persona,
} from "@/lib/motor-torneo/types";

const TRAMOS: CalendarioTramo[] = [
  { dayLabel: "Jue", startTime: "14:00", blocks: 2, phase: "previa", isExtension: false },
  { dayLabel: "Sab", startTime: "08:00", blocks: 2, phase: "previa", isExtension: false },
  { dayLabel: "Jue", startTime: "19:00", blocks: 2, phase: "final", isExtension: false },
];

function miniInstance(blocked: Record<string, number[]> = {}): Instancia {
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
    deriveStructure(categorias, grupos).map((partido) => [partido.id, partido]),
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

const inst = miniInstance();

/** Agenda válida: previa en bloques distintos (sep=2 respetado) y final en 4. */
const BLOQUES: Record<string, number> = {
  "C1-G1-P1": 0,
  "C1-G1-P2": 1,
  "C1-G1-P3": 2,
  "C1-final-1": 4,
};
const CANCHAS: CourtAssignment = {
  "C1-G1-P1": 1,
  "C1-G1-P2": 2,
  "C1-G1-P3": 1,
  "C1-final-1": 2,
};

function codesOf(errors: ReturnType<typeof verify>): string[] {
  return errors.map((error) => error.code);
}

describe("verify — agenda válida", () => {
  it("devuelve 0 errores", () => {
    expect(verify(inst, BLOQUES, CANCHAS, DEFAULT_PARAMS)).toEqual([]);
  });
});

describe("verify — reglas duras", () => {
  it("missing: partido sin bloque", () => {
    const bloques: Record<string, number | undefined> = { ...BLOQUES };
    delete bloques["C1-G1-P1"];
    const errors = verify(inst, bloques as Record<string, number>, CANCHAS, DEFAULT_PARAMS);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "missing", message: "sin bloque: C1-G1-P1" }),
    );
  });

  it("missing: partido sin cancha", () => {
    const canchas: Record<string, number | undefined> = { ...CANCHAS };
    delete canchas["C1-final-1"];
    const errors = verify(
      inst,
      BLOQUES,
      canchas as CourtAssignment,
      DEFAULT_PARAMS,
    );
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "missing", message: "sin cancha: C1-final-1" }),
    );
  });

  it("capacity: 3 partidos en un bloque de 2 canchas", () => {
    const bloques = { ...BLOQUES, "C1-G1-P1": 0, "C1-G1-P2": 0, "C1-G1-P3": 0 };
    const errors = verify(inst, bloques, CANCHAS, DEFAULT_PARAMS);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "capacity", blockIdx: 0 }),
    );
  });

  it("court_collision: dos partidos en la misma cancha del bloque", () => {
    const bloques = { ...BLOQUES, "C1-G1-P1": 0, "C1-G1-P2": 0 };
    const canchas = { ...CANCHAS, "C1-G1-P1": 1, "C1-G1-P2": 1 };
    const errors = verify(inst, bloques, canchas, DEFAULT_PARAMS);
    expect(codesOf(errors)).toContain("court_collision");
  });

  it("court_range: cancha fuera de 1..nCanchas", () => {
    const canchas = { ...CANCHAS, "C1-G1-P1": 5 };
    const errors = verify(inst, BLOQUES, canchas, DEFAULT_PARAMS);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "court_range", court: 5 }),
    );
  });

  it("person_overlap: una persona en dos partidos del mismo bloque", () => {
    const bloques = { ...BLOQUES, "C1-G1-P1": 0, "C1-G1-P2": 0 };
    const canchas = { ...CANCHAS, "C1-G1-P1": 1, "C1-G1-P2": 2 };
    const errors = verify(inst, bloques, canchas, DEFAULT_PARAMS);
    expect(errors.length).toBeGreaterThan(0);
    expect(codesOf(errors).every((code) => code === "person_overlap")).toBe(true);
  });

  it("availability: previa en un bloque bloqueado por una de sus parejas", () => {
    const withBlocked = miniInstance({ A: [0] });
    const errors = verify(withBlocked, BLOQUES, CANCHAS, DEFAULT_PARAMS);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "availability", matchId: "C1-G1-P1", blockIdx: 0 }),
    );
  });

  it("precedence: la final no respeta 1 + descansoFinal sobre un alimentador", () => {
    const bloques = { ...BLOQUES, "C1-G1-P3": 3 };
    const errors = verify(inst, bloques, CANCHAS, DEFAULT_PARAMS);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "precedence", matchId: "C1-final-1" }),
    );
  });

  it("phase: final agendada en un bloque de previa", () => {
    const bloques = { ...BLOQUES, "C1-final-1": 0, "C1-G1-P1": 1, "C1-G1-P2": 2 };
    const errors = verify(inst, bloques, CANCHAS, DEFAULT_PARAMS);
    expect(codesOf(errors)).toContain("phase");
  });
});
