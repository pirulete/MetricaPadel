/**
 * L3 parcial — modelo MILP (`model.ts` + `objective.ts`).
 *
 * 1. Paridad **exacta** de `nVars`/`nConstraints`/`nNonZeros` y de cada familia
 *    de restricción contra `tests/fixtures/torneo/model-stats.json` (seed 7).
 * 2. Estructura sobre una instancia mini: variables `x` solo en bloques
 *    permitidos (frontera sábado on/off), exclusión de bloqueos en modo duro y
 *    `W_DISPONIBILIDAD` en modo relajado, R5 acumulada (coeficientes exactos de
 *    una fila) y costos de los objetivos `d`/`mx`/`mn`/`e`/`f`.
 */
import instanceJson from "../../fixtures/torneo/instance.json";
import statsJson from "../../fixtures/torneo/model-stats.json";
import { buildModel, toCSC } from "@/lib/motor-torneo/model";
import { buildBlocks } from "@/lib/motor-torneo/calendar";
import { DEFAULT_PARAMS } from "@/lib/motor-torneo/objective";
import {
  buildInstance,
  miniInstance,
  objectiveInstance,
  pareja,
  rowCoefs,
} from "./fixtures";
import type {
  Bloque,
  CalendarioTramo,
  Categoria,
  Grupo,
  Instancia,
  Pareja,
  Partido,
  Persona,
} from "@/lib/motor-torneo/types";

const golden = statsJson as unknown as {
  nVars: number;
  nConstraints: number;
  nNonZeros: number;
  familias: Record<string, number>;
};

/** Deliberadamente vacío: cualquier delta real debe justificarse aquí. */
const KNOWN_DELTAS = { nVars: 0, nConstraints: 0, nNonZeros: 0 };

interface ReferenceFixture {
  bloques: Bloque[];
  nCanchas: number;
  categorias: Record<string, Categoria>;
  grupos: Record<string, Grupo>;
  parejas: Record<string, Omit<Pareja, "bloqueados"> & { bloqueados: number[] }>;
  personas: Record<string, Persona>;
  partidos: Partido[];
}

function referenceInstance(): Instancia {
  const raw = instanceJson as unknown as ReferenceFixture;
  return {
    bloques: raw.bloques,
    nCanchas: raw.nCanchas,
    categorias: raw.categorias,
    grupos: raw.grupos,
    parejas: Object.fromEntries(
      Object.entries(raw.parejas).map(([code, p]) => [
        code,
        { ...p, bloqueados: new Set(p.bloqueados) },
      ]),
    ),
    personas: raw.personas,
    partidos: Object.fromEntries(raw.partidos.map((partido) => [partido.id, partido])),
  };
}

function familyCounts(rowNames: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of rowNames) {
    const family = name.slice(0, name.indexOf("["));
    counts[family] = (counts[family] ?? 0) + 1;
  }
  return counts;
}

function costOf(model: ReturnType<typeof buildModel>, name: string): number {
  const col = model.columnByKey.get(name);
  expect(col).toBeDefined();
  return model.cost[col as number];
}

describe("buildModel — L3 exacta (fixture de referencia)", () => {
  it("reproduce nVars/nConstraints/nNonZeros de model-stats.json", () => {
    const { stats } = buildModel(referenceInstance());
    expect(Math.abs(stats.nVars - golden.nVars)).toBeLessThanOrEqual(KNOWN_DELTAS.nVars);
    expect(Math.abs(stats.nConstraints - golden.nConstraints)).toBeLessThanOrEqual(
      KNOWN_DELTAS.nConstraints,
    );
    expect(Math.abs(stats.nNonZeros - golden.nNonZeros)).toBeLessThanOrEqual(
      KNOWN_DELTAS.nNonZeros,
    );
  });

  it("reproduce el conteo de cada familia de restricciones", () => {
    const model = buildModel(referenceInstance());
    expect(familyCounts(model.rowNames)).toEqual(golden.familias);
  });
});

describe("buildModel — variables x en la instancia mini", () => {
  it("con frontera sábado, previa solo en bloques de previa y final solo en final", () => {
    const model = buildModel(miniInstance());
    expect(model.xVars.filter((v) => v.matchId === "C1-final-1").map((v) => v.block)).toEqual([
      4, 5,
    ]);
    expect(model.xVars.filter((v) => v.matchId === "C1-G1-P1").map((v) => v.block)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(model.xVars).toHaveLength(14);
  });

  it("sin frontera sábado, la final puede caer en cualquier bloque", () => {
    const model = buildModel(miniInstance(), { ...DEFAULT_PARAMS, fronteraSabado: false });
    expect(model.xVars.filter((v) => v.matchId === "C1-final-1").map((v) => v.block)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(model.xVars).toHaveLength(18);
  });

  it("disponibilidad dura elimina la variable; relajada le pone W_DISPONIBILIDAD", () => {
    const hard = buildModel(miniInstance({ A: [0] }));
    expect(hard.xVars.some((v) => v.matchId === "C1-G1-P1" && v.block === 0)).toBe(false);
    expect(hard.xVars).toHaveLength(12);

    const relaxed = buildModel(miniInstance({ A: [0] }), {
      ...DEFAULT_PARAMS,
      disponibilidadDura: false,
    });
    expect(relaxed.xVars).toHaveLength(14);
    expect(costOf(relaxed, "x[C1-G1-P1,0]")).toBe(DEFAULT_PARAMS.W_DISPONIBILIDAD);
    expect(costOf(relaxed, "x[C1-G1-P3,0]")).toBe(0);
  });
});

describe("buildModel — R5 acumulada", () => {
  it("coeficientes exactos en t=4 y corte por redundancia en t=5 (sep=2)", () => {
    const model = buildModel(miniInstance());
    expect(
      rowCoefs(model, "R5[C1-final-1<-C1-G1-P1,4]"),
    ).toEqual({
      "x[C1-final-1,4]": 1,
      "x[C1-G1-P1,0]": -1,
      "x[C1-G1-P1,1]": -1,
      "x[C1-G1-P1,2]": -1,
    });
    expect(model.rowNames).not.toContain("R5[C1-final-1<-C1-G1-P1,5]");
    expect(familyCounts(model.rowNames)).toMatchObject({ R1: 4, R2: 6, R3: 12, R5: 3 });
  });
});

describe("buildModel — costos del objetivo", () => {
  it("d/mx/mn/f usan los W_* de DEFAULT_PARAMS", () => {
    const model = buildModel(miniInstance());
    expect(costOf(model, "d[A,Jue]")).toBe(DEFAULT_PARAMS.W_DIAS);
    expect(costOf(model, "mx[C1-G1]")).toBe(DEFAULT_PARAMS.W_COMPACTO);
    expect(costOf(model, "mn[C1-G1]")).toBe(-DEFAULT_PARAMS.W_COMPACTO);
    expect(costOf(model, "f[C1-final-1]")).toBe(DEFAULT_PARAMS.W_FINAL_TEMPRANA);
  });

  it("crea e[persona,día,ventana] solo para doble categoría con > maxSeguidos", () => {
    const model = buildModel(objectiveInstance());
    expect(costOf(model, "e[P1,Jue,0]")).toBe(DEFAULT_PARAMS.W_SEGUIDOS);
    expect(model.colNames.filter((name) => name.startsWith("e["))).toEqual(["e[P1,Jue,0]"]);
  });
});

// ---------------------------------------------------------------------------
// Triaje de mutantes 3a: orden determinista (P-3), costos por bloque, R3b y
// casos defensivos del builder.
// ---------------------------------------------------------------------------

describe("buildModel — orden determinista (P-3)", () => {
  /** Partidos insertados en M, Z, A: el orden de inserción NO es el orden por id ni su reverso. */
  function orderingInstance(): Instancia {
    const tramos: CalendarioTramo[] = [
      { dayLabel: "Sab", startTime: "08:00", blocks: 2, phase: "previa", isExtension: false },
    ];
    const partidos = ["M", "Z", "A"].map(
      (id): Partido => ({
        id,
        categoria: "C1",
        phase: "previa",
        ronda: "grupo",
        grupo: null,
        parejas: [id],
        gruposOrigen: [],
        alimentadores: [],
      }),
    );
    return {
      bloques: buildBlocks(tramos, 2),
      nCanchas: 2,
      categorias: { C1: { sex: "H", level: 1, grupos: [] } },
      grupos: {},
      parejas: {
        A: pareja("A", ["P1", "P2"], "", "C1"),
        M: pareja("M", ["P3", "P4"], "", "C1"),
        Z: pareja("Z", ["P5", "P6"], "", "C1"),
      },
      personas: {},
      partidos: Object.fromEntries(partidos.map((partido) => [partido.id, partido])),
    };
  }

  it("ordena los partidos por id antes de crear las variables x", () => {
    const model = buildModel(orderingInstance());
    expect(model.colNames.slice(0, 6)).toEqual([
      "x[A,0]",
      "x[A,1]",
      "x[M,0]",
      "x[M,1]",
      "x[Z,0]",
      "x[Z,1]",
    ]);
  });
});

describe("buildModel — costo por bloque (extensión y final temprana)", () => {
  /** Previa base 0-1, previa extensión 2, final 3. */
  function miniExtraInstance(): Instancia {
    const categorias: Record<string, Categoria> = {
      C1: { sex: "H", level: 1, grupos: ["C1-G1"] },
    };
    const grupos: Record<string, Grupo> = {
      "C1-G1": { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
    };
    const parejas: Record<string, Pareja> = {
      A: pareja("A", ["P1", "P2"], "C1-G1", "C1"),
      B: pareja("B", ["P3", "P4"], "C1-G1", "C1"),
      C: pareja("C", ["P5", "P6"], "C1-G1", "C1"),
    };
    const tramos: CalendarioTramo[] = [
      { dayLabel: "Jue", startTime: "14:00", blocks: 2, phase: "previa", isExtension: false },
      { dayLabel: "Jue", startTime: "17:30", blocks: 1, phase: "previa", isExtension: true },
      { dayLabel: "Sab", startTime: "08:00", blocks: 1, phase: "final", isExtension: false },
    ];
    return buildInstance(categorias, grupos, parejas, tramos);
  }

  it("un bloque de extensión suma W_EXTENSION y el base no", () => {
    const model = buildModel(miniExtraInstance());
    expect(costOf(model, "x[C1-G1-P1,2]")).toBe(DEFAULT_PARAMS.W_EXTENSION);
    expect(costOf(model, "x[C1-G1-P1,0]")).toBe(0);
  });

  it("la final paga W_TEMPRANO por índice de bloque y la previa nada", () => {
    const model = buildModel(miniInstance());
    expect(costOf(model, "x[C1-final-1,4]")).toBe(DEFAULT_PARAMS.W_TEMPRANO * 4);
    expect(costOf(model, "x[C1-final-1,5]")).toBe(DEFAULT_PARAMS.W_TEMPRANO * 5);
    expect(costOf(model, "x[C1-G1-P1,2]")).toBe(0);
  });
});

describe("buildModel — R3b (doble categoría blanda)", () => {
  /** P1 es doble (A en G1, D en G2); solo hay 1 final blanda (4tos) y 1 dura (8vos). */
  function singleBlandoInstance(): Instancia {
    const tramos: CalendarioTramo[] = [
      { dayLabel: "Jue", startTime: "14:00", blocks: 2, phase: "previa", isExtension: false },
      { dayLabel: "Dom", startTime: "10:00", blocks: 2, phase: "final", isExtension: false },
    ];
    return {
      bloques: buildBlocks(tramos, 2),
      nCanchas: 2,
      categorias: { C1: { sex: "H", level: 1, grupos: [] } },
      grupos: {},
      parejas: {
        A: pareja("A", ["P1", "P2"], "G1", "C1"),
        B: pareja("B", ["P3", "P4"], "G1", "C1"),
        D: pareja("D", ["P1", "P5"], "G2", "C1"),
        E: pareja("E", ["P6", "P7"], "G2", "C1"),
      },
      personas: {
        P1: { sexo: null, parejas: ["A", "D"] },
        P2: { sexo: null, parejas: ["A"] },
        P3: { sexo: null, parejas: ["B"] },
        P4: { sexo: null, parejas: ["B"] },
        P5: { sexo: null, parejas: ["D"] },
        P6: { sexo: null, parejas: ["E"] },
        P7: { sexo: null, parejas: ["E"] },
      },
      partidos: {
        A1: {
          id: "A1",
          categoria: "C1",
          phase: "previa",
          ronda: "grupo",
          grupo: "G1",
          parejas: ["A", "B"],
          gruposOrigen: ["G1"],
          alimentadores: [],
        },
        B1: {
          id: "B1",
          categoria: "C1",
          phase: "previa",
          ronda: "grupo",
          grupo: "G2",
          parejas: ["D", "E"],
          gruposOrigen: ["G2"],
          alimentadores: [],
        },
        F1: {
          id: "F1",
          categoria: "C1",
          phase: "final",
          ronda: "4tos",
          grupo: null,
          parejas: null,
          gruposOrigen: ["G1", "G2"],
          alimentadores: [],
        },
        F2: {
          id: "F2",
          categoria: "C1",
          phase: "final",
          ronda: "8vos",
          grupo: null,
          parejas: null,
          gruposOrigen: ["G1", "G2"],
          alimentadores: [],
        },
      },
    };
  }

  it("solo crea choque en bloques con ≥2 finales blandas potenciales", () => {
    const model = buildModel(objectiveInstance());
    const choques = model.colNames.filter((name) => name.startsWith("choque["));
    expect(choques).toEqual(["choque[P1,4]", "choque[P1,5]"]);

    const col = model.columnByKey.get("choque[P1,4]") as number;
    expect(model.cost[col]).toBe(DEFAULT_PARAMS.W_DOBLE_BLANDO);
    expect(model.integrality[col]).toBe(0);
    expect(model.ub[col]).toBe(3);

    const coefs = rowCoefs(model, "R3b[P1,4]");
    expect(coefs["choque[P1,4]"]).toBe(-1);
    expect(Object.values(coefs).filter((valor) => valor === 1)).toHaveLength(3);
  });

  it("un bloque con una sola final blanda potencial no genera choque", () => {
    const model = buildModel(singleBlandoInstance());
    expect(model.colNames.filter((name) => name.startsWith("choque["))).toEqual([]);
  });
});

describe("buildModel — casos defensivos", () => {
  it("ignora parejas que no existen al leer los bloqueos", () => {
    const inst = miniInstance();
    inst.partidos["C1-G1-P1"].parejas = ["GHOST", "A"];
    expect(() => buildModel(inst)).not.toThrow();
    expect(
      buildModel(inst).xVars.filter((v) => v.matchId === "C1-G1-P1"),
    ).toHaveLength(4);
  });

  it("un feeder sin variables (todo bloqueado) no rompe R5", () => {
    expect(() => buildModel(miniInstance({ A: [0, 1, 2, 3] }))).not.toThrow();
  });
});

describe("toCSC", () => {
  it("transpone las tripletas a formato CSC con starts acumulados", () => {
    const model = buildModel(miniInstance());
    const csc = toCSC(model);

    expect(csc.format).toBe("csc");
    expect(csc.numRows).toBe(model.rowLo.length);
    expect(csc.numCols).toBe(model.colNames.length);
    expect(csc.starts).toHaveLength(model.colNames.length + 1);
    expect(csc.starts[model.colNames.length]).toBe(model.rows.length);
    expect(csc.indices).toHaveLength(model.rows.length);
    expect(csc.values).toHaveLength(model.vals.length);

    const col = model.columnByKey.get("x[C1-G1-P1,0]") as number;
    const filas = Array.from(csc.indices.slice(csc.starts[col], csc.starts[col + 1]));
    expect(filas).toContain(model.rowNames.indexOf("R1[C1-G1-P1]"));
  });
});

describe("buildModel — determinismo ante el orden de inserción", () => {
  it("reordenar inst.partidos no cambia el orden de xVars ni el de R1", () => {
    const normal = miniInstance();
    const invertida: Instancia = {
      ...normal,
      partidos: Object.fromEntries(Object.entries(normal.partidos).reverse()),
    };

    const a = buildModel(normal);
    const b = buildModel(invertida);

    const claves = (m: typeof a) => m.xVars.map((v) => `${v.matchId},${v.block}`);
    expect(claves(b)).toEqual(claves(a));

    const r1 = (m: typeof a) => m.rowNames.filter((n) => n.startsWith("R1["));
    expect(r1(b)).toEqual(r1(a));
    // y ambos en orden de id, que es lo que byId garantiza
    expect(r1(a)).toEqual([...r1(a)].sort());
  });
});
