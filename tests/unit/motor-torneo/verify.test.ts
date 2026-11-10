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
import { miniInstance } from "./fixtures";
import type {
  CalendarioTramo,
  Categoria,
  CourtAssignment,
  Grupo,
  Instancia,
  Pareja,
  Partido,
  Persona,
  TournamentParams,
} from "@/lib/motor-torneo/types";

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

// ---------------------------------------------------------------------------
// Mutation hardening 3c: escenarios mínimo-cambiantes por regla dura
// ---------------------------------------------------------------------------

/** 6 bloques de previa (idx 0..5), sin bloques de final. */
const TRAMOS_PREVIA: CalendarioTramo[] = [
  { dayLabel: "Jue", startTime: "14:00", blocks: 6, phase: "previa", isExtension: false },
];

/** `fronteraSabado: false` ⇒ la regla 6 sólo acota los partidos de previa. */
const PARAMS_PREVIA: TournamentParams = { ...DEFAULT_PARAMS, fronteraSabado: false };

/** `dobleDuraEn` con la ronda `final` para poder colisionar finales. */
const PARAMS_DOBLE_FINAL: TournamentParams = {
  ...PARAMS_PREVIA,
  dobleDuraEn: ["final"],
};

const CATS_1: Record<string, Categoria> = {
  C1: { sex: "H", level: 1, grupos: ["C1-G1"] },
};
const GRUPOS_1: Record<string, Grupo> = {
  "C1-G1": { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
};
const PERSONS_1: Record<string, [string, string]> = {
  A: ["P1", "P2"],
  B: ["P3", "P4"],
  C: ["P5", "P6"],
};

function buildInstance(
  categorias: Record<string, Categoria>,
  grupos: Record<string, Grupo>,
  persons: Record<string, [string, string]>,
  tramos: CalendarioTramo[],
  courts = 2,
): Instancia {
  const parejas: Record<string, Pareja> = {};
  for (const [groupCode, grupo] of Object.entries(grupos)) {
    for (const parejaId of grupo.parejas) {
      const pair = persons[parejaId];
      if (!pair) throw new Error(`sin personas para ${parejaId}`);
      parejas[parejaId] = {
        id: parejaId,
        categoria: grupo.categoria,
        grupo: groupCode,
        personas: [...pair],
        bloqueados: new Set<number>(),
      };
    }
  }
  const personas: Record<string, Persona> = {};
  for (const pareja of Object.values(parejas)) {
    for (const documentId of pareja.personas) {
      (personas[documentId] ??= { sexo: null, parejas: [] }).parejas.push(pareja.id);
    }
  }
  const partidos = Object.fromEntries(
    deriveStructure(categorias, grupos).map((partido) => [partido.id, partido]),
  ) as Record<string, Partido>;
  return {
    bloques: buildBlocks(tramos, courts),
    nCanchas: courts,
    categorias,
    grupos,
    parejas,
    personas,
    partidos,
  };
}

/** Invierte el orden de inserción de un record (para observar los `sort`). */
function reversed<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).reverse()) as Record<string, T>;
}

describe("verify — missing (orden y payload)", () => {
  it("ordena los `missing` por id y expone matchId", () => {
    const reversedInst: Instancia = { ...inst, partidos: reversed(inst.partidos) };
    const bloques: Record<string, number | undefined> = { ...BLOQUES };
    delete bloques["C1-G1-P1"];
    delete bloques["C1-final-1"];
    expect(verify(reversedInst, bloques as Record<string, number>, CANCHAS, DEFAULT_PARAMS)).toEqual([
      { code: "missing", message: "sin bloque: C1-G1-P1", matchId: "C1-G1-P1" },
      { code: "missing", message: "sin bloque: C1-final-1", matchId: "C1-final-1" },
    ]);
  });

  it("expone matchId en el `missing` de cancha", () => {
    const canchas: Record<string, number | undefined> = { ...CANCHAS };
    delete canchas["C1-final-1"];
    expect(
      verify(inst, BLOQUES, canchas as CourtAssignment, DEFAULT_PARAMS),
    ).toEqual([{ code: "missing", message: "sin cancha: C1-final-1", matchId: "C1-final-1" }]);
  });

  it("ordena por id con el orden de inserción desordenado (no monótono)", () => {
    // [P1, final-1, P3, P2]: un comparador constante (−1 o «a después de b»)
    // deja de producir el orden ascendente esperado.
    const orden = ["C1-G1-P1", "C1-final-1", "C1-G1-P3", "C1-G1-P2"];
    const mezclada: Instancia = {
      ...inst,
      partidos: Object.fromEntries(orden.map((id) => [id, inst.partidos[id]])),
    };
    const bloques = { ...BLOQUES };
    delete bloques["C1-G1-P1"];
    delete bloques["C1-final-1"];
    expect(
      verify(mezclada, bloques as Record<string, number>, CANCHAS, DEFAULT_PARAMS).map(
        (error) => error.message,
      ),
    ).toEqual(["sin bloque: C1-G1-P1", "sin bloque: C1-final-1"]);
  });

  it("ordena por id aunque los `missing` lleguen en orden descendente", () => {
    const orden = ["C1-final-1", "C1-G1-P3", "C1-G1-P1", "C1-G1-P2"];
    const mezclada: Instancia = {
      ...inst,
      partidos: Object.fromEntries(orden.map((id) => [id, inst.partidos[id]])),
    };
    const bloques = { ...BLOQUES };
    delete bloques["C1-G1-P1"];
    delete bloques["C1-final-1"];
    expect(
      verify(mezclada, bloques as Record<string, number>, CANCHAS, DEFAULT_PARAMS).map(
        (error) => error.message,
      ),
    ).toEqual(["sin bloque: C1-G1-P1", "sin bloque: C1-final-1"]);
  });
});

describe("verify — capacidad y canchas (mensajes exactos)", () => {
  it("capacity: recorre los bloques ordenados y reporta el mensaje exacto", () => {
    const instCapacidad: Instancia = {
      ...buildInstance(CATS_1, GRUPOS_1, PERSONS_1, TRAMOS_PREVIA, 1),
      nCanchas: 2,
    };
    const bloques = { "C1-G1-P1": 2, "C1-G1-P2": 2, "C1-G1-P3": 1, "C1-final-1": 1 };
    const canchas: CourtAssignment = {
      "C1-G1-P1": 1,
      "C1-G1-P2": 2,
      "C1-G1-P3": 1,
      "C1-final-1": 2,
    };
    const errors = verify(instCapacidad, bloques, canchas, PARAMS_PREVIA).filter(
      (error) => error.code === "capacity",
    );
    expect(errors).toEqual([
      { code: "capacity", message: "capacidad excedida en bloque 1: 2 > 1", blockIdx: 1 },
      { code: "capacity", message: "capacidad excedida en bloque 2: 2 > 1", blockIdx: 2 },
    ]);
  });

  it("court_collision: mensaje y blockIdx", () => {
    const bloques = { ...BLOQUES, "C1-G1-P1": 0, "C1-G1-P2": 0 };
    const canchas: CourtAssignment = { ...CANCHAS, "C1-G1-P1": 1, "C1-G1-P2": 1 };
    const errors = verify(inst, bloques, canchas, DEFAULT_PARAMS).filter(
      (error) => error.code === "court_collision",
    );
    expect(errors).toEqual([
      { code: "court_collision", message: "dos partidos en la misma cancha, bloque 0", blockIdx: 0 },
    ]);
  });

  it("court_range: reporta cancha, matchId y mensaje (0 inválida, nCanchas válida)", () => {
    const cero = verify(inst, BLOQUES, { ...CANCHAS, "C1-G1-P1": 0 }, DEFAULT_PARAMS).filter(
      (error) => error.code === "court_range",
    );
    expect(cero).toEqual([
      {
        code: "court_range",
        message: "cancha invalida 0 en C1-G1-P1",
        matchId: "C1-G1-P1",
        court: 0,
      },
    ]);

    const borde = verify(inst, BLOQUES, { ...CANCHAS, "C1-G1-P1": 2 }, DEFAULT_PARAMS).filter(
      (error) => error.code === "court_range",
    );
    expect(borde).toEqual([]);
  });
});

describe("verify — personas (doble categoría y orden)", () => {
  const CATS_DOBLE: Record<string, Categoria> = {
    C1: { sex: "H", level: 1, grupos: ["C1-G1"] },
    C2: { sex: "H", level: 2, grupos: ["C2-G1"] },
  };
  const GRUPOS_DOBLE: Record<string, Grupo> = {
    "C1-G1": { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
    "C2-G1": { categoria: "C2", parejas: ["D", "E", "F"], tam: 3 },
  };
  /** `P0` juega en `A` (C1) y en `D` (C2): doble categoría. */
  const PERSONS_DOBLE: Record<string, [string, string]> = {
    A: ["P0", "P1"],
    B: ["P2", "P3"],
    C: ["P4", "P5"],
    D: ["P0", "P9"],
    E: ["P6", "P7"],
    F: ["P8", "P10"],
  };

  it("person_overlap: ordena personas y bloques y reporta el mensaje exacto", () => {
    const base = buildInstance(CATS_DOBLE, GRUPOS_DOBLE, PERSONS_DOBLE, TRAMOS_PREVIA);
    const doble: Instancia = { ...base, personas: reversed(base.personas) };
    const bloques: Record<string, number> = {
      "C1-G1-P1": 2,
      "C1-G1-P2": 2,
      "C1-G1-P3": 2,
      "C2-G1-P1": 0,
      "C2-G1-P2": 0,
      "C2-G1-P3": 0,
      "C1-final-1": 3,
      "C2-final-1": 4,
    };
    const canchas: CourtAssignment = Object.fromEntries(
      Object.keys(bloques).map((id, index) => [id, (index % 2) + 1]),
    );
    const messages = verify(doble, bloques, canchas, PARAMS_DOBLE_FINAL)
      .filter((error) => error.code === "person_overlap")
      .map((error) => error.message);
    expect(messages).toEqual([
      "persona P0 en dos partidos en bloque 0: C2-G1-P1, C2-G1-P2",
      "persona P0 en dos partidos en bloque 2: C1-G1-P1, C1-G1-P2",
      "persona P1 en dos partidos en bloque 2: C1-G1-P1, C1-G1-P2",
      "persona P10 en dos partidos en bloque 0: C2-G1-P2, C2-G1-P3",
      "persona P2 en dos partidos en bloque 2: C1-G1-P1, C1-G1-P3",
      "persona P3 en dos partidos en bloque 2: C1-G1-P1, C1-G1-P3",
      "persona P4 en dos partidos en bloque 2: C1-G1-P2, C1-G1-P3",
      "persona P5 en dos partidos en bloque 2: C1-G1-P2, C1-G1-P3",
      "persona P6 en dos partidos en bloque 0: C2-G1-P1, C2-G1-P3",
      "persona P7 en dos partidos en bloque 0: C2-G1-P1, C2-G1-P3",
      "persona P8 en dos partidos en bloque 0: C2-G1-P2, C2-G1-P3",
      "persona P9 en dos partidos en bloque 0: C2-G1-P1, C2-G1-P2",
    ]);
  });

  it("person_overlap: en doble categoría alcanza las rondas duras de final", () => {
    const doble = buildInstance(CATS_DOBLE, GRUPOS_DOBLE, PERSONS_DOBLE, TRAMOS_PREVIA);
    const bloques: Record<string, number> = {
      "C1-G1-P1": 0,
      "C1-G1-P2": 1,
      "C1-G1-P3": 4,
      "C2-G1-P1": 2,
      "C2-G1-P2": 3,
      "C2-G1-P3": 4,
      "C1-final-1": 5,
      "C2-final-1": 5,
    };
    const canchas: CourtAssignment = {
      "C1-G1-P1": 1,
      "C1-G1-P2": 1,
      "C1-G1-P3": 1,
      "C2-G1-P1": 1,
      "C2-G1-P2": 1,
      "C2-G1-P3": 2,
      "C1-final-1": 1,
      "C2-final-1": 2,
    };
    expect(
      verify(doble, bloques, canchas, PARAMS_DOBLE_FINAL).filter(
        (error) => error.code === "person_overlap",
      ),
    ).toEqual([
      {
        code: "person_overlap",
        message: "persona P0 en dos partidos en bloque 5: C1-final-1, C2-final-1",
        blockIdx: 5,
      },
    ]);
  });

  it("person_overlap: una persona de una sola pareja no colisiona con su final", () => {
    const bloques = { ...BLOQUES, "C1-G1-P1": 0, "C1-final-1": 0 };
    const errors = verify(inst, bloques, CANCHAS, PARAMS_DOBLE_FINAL).filter(
      (error) => error.code === "person_overlap",
    );
    expect(errors).toEqual([]);
  });
});

describe("verify — disponibilidad", () => {
  it("availability: mensaje, matchId y blockIdx exactos", () => {
    const withBlocked = miniInstance({ A: [0] });
    const errors = verify(withBlocked, BLOQUES, CANCHAS, DEFAULT_PARAMS).filter(
      (error) => error.code === "availability",
    );
    expect(errors).toEqual([
      {
        code: "availability",
        message: "disponibilidad violada: C1-G1-P1 en bloque 0 (A)",
        matchId: "C1-G1-P1",
        blockIdx: 0,
      },
    ]);
  });

  it("no revienta si la pareja del partido no está en inst.parejas", () => {
    const sinParejas: Instancia = { ...inst, parejas: {} };
    expect(() => verify(sinParejas, BLOQUES, CANCHAS, DEFAULT_PARAMS)).not.toThrow();
    expect(
      verify(sinParejas, BLOQUES, CANCHAS, DEFAULT_PARAMS).filter(
        (error) => error.code === "availability",
      ),
    ).toEqual([]);
  });
});

describe("verify — precedencias", () => {
  const CATS_G2: Record<string, Categoria> = {
    C1: { sex: "H", level: 1, grupos: ["C1-G1", "C1-G2"] },
  };
  const GRUPOS_G2: Record<string, Grupo> = {
    "C1-G1": { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
    "C1-G2": { categoria: "C1", parejas: ["D", "E", "F"], tam: 3 },
  };
  const PERSONS_G2: Record<string, [string, string]> = {
    A: ["P1", "P2"],
    B: ["P3", "P4"],
    C: ["P5", "P6"],
    D: ["P7", "P8"],
    E: ["P9", "P10"],
    F: ["P11", "P12"],
  };

  it("precedence: respeta alimentadores y reporta el mensaje exacto", () => {
    const dosGrupos = buildInstance(CATS_G2, GRUPOS_G2, PERSONS_G2, TRAMOS_PREVIA);
    const bloques: Record<string, number> = {
      "C1-G1-P1": 0,
      "C1-G1-P2": 0,
      "C1-G1-P3": 0,
      "C1-G2-P1": 1,
      "C1-G2-P2": 1,
      "C1-G2-P3": 1,
      "C1-semi-1": 3,
      "C1-semi-2": 3,
      "C1-final-1": 4,
    };
    const canchas: CourtAssignment = Object.fromEntries(
      Object.keys(bloques).map((id, index) => [id, (index % 2) + 1]),
    );
    const errors = verify(dosGrupos, bloques, canchas, PARAMS_PREVIA).filter(
      (error) => error.code === "precedence",
    );
    expect(errors).toEqual([
      {
        code: "precedence",
        message: "precedencia: C1-final-1 (b4) antes de C1-semi-1 (b3)",
        matchId: "C1-final-1",
        blockIdx: 4,
      },
      {
        code: "precedence",
        message: "precedencia: C1-final-1 (b4) antes de C1-semi-2 (b3)",
        matchId: "C1-final-1",
        blockIdx: 4,
      },
    ]);
  });

  it("precedence: con alimentadores no se duplican los partidos de grupo", () => {
    // La semi cubre C1-G1; sólo C1-G2 debe expandirse. Si `cubiertos` no se
    // llena, se añaden también los partidos de C1-G1 (3 errores en vez de 2).
    const manual: Instancia = {
      bloques: buildBlocks(TRAMOS_PREVIA, 2),
      nCanchas: 2,
      categorias: {},
      grupos: {},
      parejas: {},
      personas: {},
      partidos: {
        "C1-final-1": {
          id: "C1-final-1",
          categoria: "C1",
          phase: "final",
          ronda: "final",
          grupo: null,
          parejas: [],
          gruposOrigen: ["C1-G1", "C1-G2"],
          alimentadores: ["C1-semi-1"],
        },
        "C1-semi-1": {
          id: "C1-semi-1",
          categoria: "C1",
          phase: "final",
          ronda: "semi",
          grupo: null,
          parejas: [],
          gruposOrigen: ["C1-G1"],
          alimentadores: [],
        },
        "C1-G1-P1": {
          id: "C1-G1-P1",
          categoria: "C1",
          phase: "previa",
          ronda: "grupo",
          grupo: "C1-G1",
          parejas: [],
          gruposOrigen: ["C1-G1"],
          alimentadores: [],
        },
        "C1-G2-P1": {
          id: "C1-G2-P1",
          categoria: "C1",
          phase: "previa",
          ronda: "grupo",
          grupo: "C1-G2",
          parejas: [],
          gruposOrigen: ["C1-G2"],
          alimentadores: [],
        },
      },
    };
    const bloques: Record<string, number> = {
      "C1-final-1": 0,
      "C1-semi-1": 2,
      "C1-G1-P1": 0,
      "C1-G2-P1": 0,
    };
    const canchas: CourtAssignment = Object.fromEntries(
      Object.keys(bloques).map((id, index) => [id, (index % 2) + 1]),
    );
    const mensajes = verify(manual, bloques, canchas, PARAMS_PREVIA)
      .filter((error) => error.code === "precedence")
      .map((error) => error.message);
    expect(mensajes).toEqual([
      "precedencia: C1-final-1 (b0) antes de C1-semi-1 (b2)",
      "precedencia: C1-final-1 (b0) antes de C1-G2-P1 (b0)",
    ]);
  });

  it("precedence: expande los partidos de los gruposOrigen sin alimentadores", () => {
    const dosGrupos = buildInstance(CATS_G2, GRUPOS_G2, PERSONS_G2, TRAMOS_PREVIA);
    const sinSemis: Instancia = {
      ...dosGrupos,
      partidos: Object.fromEntries(
        Object.entries(dosGrupos.partidos).filter(([id]) => !id.includes("semi")),
      ),
    };
    const bloques: Record<string, number> = {
      "C1-G1-P1": 1,
      "C1-G1-P2": 1,
      "C1-G1-P3": 1,
      "C1-G2-P1": 2,
      "C1-G2-P2": 2,
      "C1-G2-P3": 2,
      "C1-final-1": 0,
    };
    const canchas: CourtAssignment = Object.fromEntries(
      Object.keys(bloques).map((id, index) => [id, (index % 2) + 1]),
    );
    const messages = verify(sinSemis, bloques, canchas, PARAMS_PREVIA)
      .filter((error) => error.code === "precedence")
      .map((error) => error.message);
    expect(messages).toEqual([
      "precedencia: C1-final-1 (b0) antes de C1-G1-P1 (b1)",
      "precedencia: C1-final-1 (b0) antes de C1-G1-P2 (b1)",
      "precedencia: C1-final-1 (b0) antes de C1-G1-P3 (b1)",
      "precedencia: C1-final-1 (b0) antes de C1-G2-P1 (b2)",
      "precedencia: C1-final-1 (b0) antes de C1-G2-P2 (b2)",
      "precedencia: C1-final-1 (b0) antes de C1-G2-P3 (b2)",
    ]);
  });
});

describe("verify — fase (ambas ramas de fronteraSabado)", () => {
  it("frontera sabado: mensaje y blockIdx de la final fuera de fase", () => {
    const bloques = { ...BLOQUES, "C1-final-1": 0, "C1-G1-P1": 1, "C1-G1-P2": 2 };
    const errors = verify(inst, bloques, CANCHAS, DEFAULT_PARAMS).filter(
      (error) => error.code === "phase",
    );
    expect(errors).toEqual([
      {
        code: "phase",
        message: "fase incorrecta: C1-final-1 en bloque 0",
        matchId: "C1-final-1",
        blockIdx: 0,
      },
    ]);
  });

  it("sin frontera: acota la previa y reporta el mensaje exacto", () => {
    const okPhase = verify(inst, BLOQUES, CANCHAS, PARAMS_PREVIA).filter(
      (error) => error.code === "phase",
    );
    expect(okPhase).toEqual([]);

    const fuera = verify(inst, { ...BLOQUES, "C1-G1-P1": 4 }, CANCHAS, PARAMS_PREVIA).filter(
      (error) => error.code === "phase",
    );
    expect(fuera).toEqual([
      {
        code: "phase",
        message: "previa fuera de bloques de previa: C1-G1-P1",
        matchId: "C1-G1-P1",
        blockIdx: 4,
      },
    ]);
  });
});
