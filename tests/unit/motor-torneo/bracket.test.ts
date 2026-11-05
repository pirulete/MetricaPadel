/**
 * Paridad L1 (technical-design §10.2): la estructura que produce `bracket.ts`
 * debe ser **exacta** a `tests/fixtures/torneo/structure.json` (golden generado
 * por `motor_torneo/instancia.py`, seed 7): 155 partidos de previa + 92 de
 * cuadro = 247, mismos códigos, rondas, `gruposOrigen` y `alimentadores`.
 *
 * Además: casos borde de byes (S = 2g exacto y byes > 0), emparejamiento de
 * grupos (3 y 4) y la invariante "dos parejas del mismo grupo no se cruzan en
 * primera ronda".
 */
import instanceJson from "../../fixtures/torneo/instance.json";
import structureJson from "../../fixtures/torneo/structure.json";
import {
  buildBracket,
  deriveStructure,
  groupPairings,
} from "@/lib/motor-torneo/bracket";
import type { Categoria, Grupo, MatchRound, Partido } from "@/lib/motor-torneo/types";

interface GoldenPartido {
  id: string;
  categoria: string;
  phase: "previa" | "final";
  ronda: MatchRound;
  grupo: string | null;
  parejas: string[] | null;
  gruposOrigen: string[];
  alimentadores: string[];
}

const golden = structureJson as unknown as {
  partidos: GoldenPartido[];
  conteos: { matchesPrevia: number; matchesFinal: number; matches: number };
};

const instancia = instanceJson as unknown as {
  categorias: Record<string, Categoria>;
  grupos: Record<string, Grupo>;
};

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const normalize = (partidos: GoldenPartido[]) =>
  partidos
    .map((partido) => ({
      id: partido.id,
      categoria: partido.categoria,
      phase: partido.phase,
      ronda: partido.ronda,
      grupo: partido.grupo,
      parejas: partido.parejas,
      gruposOrigen: partido.gruposOrigen,
      alimentadores: partido.alimentadores,
    }))
    .sort(byId);

const codes = (size: number, prefix = "G") =>
  Array.from({ length: size }, (_, index) => `${prefix}${index + 1}`);

const nextPowerOfTwo = (value: number) => {
  let size = 1;
  while (size < value) size *= 2;
  return size;
};

describe("L1 — estructura exacta contra structure.json (seed 7)", () => {
  const derived = deriveStructure(instancia.categorias, instancia.grupos);

  it("emite 247 partidos (155 previa + 92 cuadro)", () => {
    expect(derived).toHaveLength(247);
    expect(derived.filter((partido) => partido.phase === "previa")).toHaveLength(155);
    expect(derived.filter((partido) => partido.phase === "final")).toHaveLength(92);
    expect(golden.conteos.matches).toBe(247);
    expect(golden.conteos.matchesPrevia).toBe(155);
    expect(golden.conteos.matchesFinal).toBe(92);
  });

  it("coincide byte a byte: id, categoría, fase, ronda, grupo, parejas, gruposOrigen, alimentadores", () => {
    const mine = deriveStructure(instancia.categorias, instancia.grupos) as Partido[];
    expect(normalize(mine)).toEqual(normalize(golden.partidos));
  });

  it("reparte las rondas del cuadro como el prototipo (8vos 36, 4tos 32, semi 16, final 8)", () => {
    const rondas = new Map<string, number>();
    for (const partido of derived) {
      rondas.set(partido.ronda, (rondas.get(partido.ronda) ?? 0) + 1);
    }
    expect(Object.fromEntries(rondas)).toEqual({
      grupo: 155,
      "8vos": 36,
      "4tos": 32,
      semi: 16,
      final: 8,
    });
  });

  it("cada grupo juega 3 o 4 partidos y cada pareja exactamente 2", () => {
    const partidosPorGrupo = new Map<string, string[]>();
    for (const partido of derived) {
      if (partido.phase !== "previa") continue;
      const grupo = partido.grupo as string;
      partidosPorGrupo.set(grupo, [...(partidosPorGrupo.get(grupo) ?? []), partido.id]);
    }
    expect(partidosPorGrupo.size).toBe(50);

    for (const [grupoCode, partidos] of partidosPorGrupo) {
      const grupo = instancia.grupos[grupoCode];
      expect(partidos).toHaveLength(grupo.tam);
      const apariciones = new Map<string, number>();
      for (const partido of derived) {
        if (partido.phase !== "previa" || partido.grupo !== grupoCode) continue;
        for (const pareja of partido.parejas ?? []) {
          apariciones.set(pareja, (apariciones.get(pareja) ?? 0) + 1);
        }
      }
      expect([...apariciones.keys()].sort()).toEqual([...grupo.parejas].sort());
      expect([...apariciones.values()]).toEqual(new Array(grupo.tam).fill(2));
    }
  });

  it("los alimentadores son acíclicos y apuntan a partidos existentes", () => {
    const ids = new Set(derived.map((partido) => partido.id));
    for (const partido of derived) {
      for (const feeder of partido.alimentadores) {
        expect(ids.has(feeder)).toBe(true);
        // El alimentador siempre es de una ronda anterior del mismo cuadro.
        const previo = golden.partidos.find((candidate) => candidate.id === feeder);
        expect(previo?.categoria).toBe(partido.categoria);
        expect(previo?.alimentadores.every((id) => id !== partido.id)).toBe(true);
      }
    }
  });
});

describe("groupPairings — liguilla del grupo", () => {
  it("3 parejas: todos contra todos", () => {
    expect(groupPairings(3)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it("4 parejas: ciclo A-B, B-C, C-D, D-A", () => {
    expect(groupPairings(4)).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ]);
  });

  it("rechaza tamaños distintos de 3/4", () => {
    expect(() => groupPairings(2)).toThrow(/3 o 4/);
    expect(() => groupPairings(5)).toThrow(/3 o 4/);
  });
});

describe("buildBracket — byes y emparejamiento", () => {
  it("S = 2g exacto no genera byes y arranca en la ronda superior", () => {
    for (const g of [2, 4, 8]) {
      const bracket = buildBracket("X", codes(g));
      expect(bracket.every((match) => match.byes === 0)).toBe(true);
      expect(bracket.reduce((total) => total + 1, 0)).toBe(2 * g - 1);
      const primeraRonda = bracket.filter((match) => match.feeders.length === 0);
      expect(primeraRonda).toHaveLength(g);
    }
  });

  it("con byes: total = 2g-1 y los códigos de la 1ª ronda arrancan después de los pases libres", () => {
    for (const g of [3, 5, 6, 7, 12, 16]) {
      const size = nextPowerOfTwo(2 * g);
      const byes = size - 2 * g;
      const grupoCodes = codes(g);
      const bracket = buildBracket("X", grupoCodes);

      expect(bracket).toHaveLength(2 * g - 1);
      expect(bracket[0].byes).toBe(byes);

      // Nivel 0: S/2 nodos, `byes` de ellos son pases libres ⇒ (2g - byes)/2 partidos.
      const primeraRonda = bracket.filter((match) => match.round === bracket[0].round);
      expect(primeraRonda).toHaveLength(g - byes / 2);
      expect(primeraRonda[0].code).toBe(`X-${bracket[0].round}-${byes + 1}`);
    }
  });

  it("ninguna primera ronda cruza dos parejas del mismo grupo (g 2..12)", () => {
    for (let g = 2; g <= 12; g++) {
      const bracket = buildBracket("X", codes(g));
      for (const match of bracket) {
        if (match.feeders.length > 0) continue;
        expect(match.sourceGroups).toHaveLength(2);
        expect(match.sourceGroups[0]).not.toBe(match.sourceGroups[1]);
      }
    }
  });

  it("el cuadro de 8 grupos son 15 partidos y la final absorbe todos los grupos", () => {
    const bracket = buildBracket("3ra", ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]);
    expect(bracket).toHaveLength(15);
    const final = bracket[bracket.length - 1];
    expect(final.round).toBe("final");
    expect(final.code).toBe("3ra-final-1");
    expect(final.feeders).toEqual(["3ra-semi-1", "3ra-semi-2"]);
    expect(final.sourceGroups).toHaveLength(8);
  });

  it("exige al menos un grupo", () => {
    expect(() => buildBracket("X", [])).toThrow(/sin grupos/);
  });

  it("rechaza más de 16 grupos (el enum de rondas llega hasta 16vos, DV-2)", () => {
    expect(() => buildBracket("X", codes(17))).toThrow(/16vos/);
  });

  it("códigos únicos dentro de la categoría", () => {
    const bracket = buildBracket("5ta", codes(7));
    expect(new Set(bracket.map((match) => match.code)).size).toBe(bracket.length);
  });
});
