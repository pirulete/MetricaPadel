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
import { buildModel } from "@/lib/motor-torneo/model";
import { buildBlocks } from "@/lib/motor-torneo/calendar";
import { deriveStructure } from "@/lib/motor-torneo/bracket";
import { DEFAULT_PARAMS } from "@/lib/motor-torneo/objective";
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

const MINI_TRAMOS: CalendarioTramo[] = [
  { dayLabel: "Jue", startTime: "14:00", blocks: 2, phase: "previa", isExtension: false },
  { dayLabel: "Sab", startTime: "08:00", blocks: 2, phase: "previa", isExtension: false },
  { dayLabel: "Jue", startTime: "19:00", blocks: 2, phase: "final", isExtension: false },
];

function pareja(
  id: string,
  personas: string[],
  grupo: string,
  categoria: string,
  bloqueados: number[] = [],
): Pareja {
  return { id, categoria, grupo, personas, bloqueados: new Set(bloqueados) };
}

function buildInstance(
  categorias: Record<string, Categoria>,
  grupos: Record<string, Grupo>,
  parejas: Record<string, Pareja>,
  tramos: CalendarioTramo[] = MINI_TRAMOS,
  courts = 2,
): Instancia {
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
    bloques: buildBlocks(tramos, courts),
    nCanchas: courts,
    categorias,
    grupos,
    parejas,
    personas,
    partidos,
  };
}

/** 1 categoría, 1 grupo de 3 parejas ⇒ 3 partidos de previa + 1 final. */
function miniInstance(blocked: Record<string, number[]> = {}): Instancia {
  const categorias: Record<string, Categoria> = {
    C1: { sex: "H", level: 1, grupos: ["C1-G1"] },
  };
  const grupos: Record<string, Grupo> = {
    "C1-G1": { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
  };
  const parejas: Record<string, Pareja> = {
    A: pareja("A", ["P1", "P2"], "C1-G1", "C1", blocked.A),
    B: pareja("B", ["P3", "P4"], "C1-G1", "C1", blocked.B),
    C: pareja("C", ["P5", "P6"], "C1-G1", "C1", blocked.C),
  };
  return buildInstance(categorias, grupos, parejas);
}

/** 2 grupos en la misma categoría y una persona en parejas de ambos (doble). */
function objectiveInstance(): Instancia {
  const categorias: Record<string, Categoria> = {
    C1: { sex: "H", level: 1, grupos: ["C1-G1", "C1-G2"] },
  };
  const grupos: Record<string, Grupo> = {
    "C1-G1": { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
    "C1-G2": { categoria: "C1", parejas: ["D", "E", "F"], tam: 3 },
  };
  const parejas: Record<string, Pareja> = {
    A: pareja("A", ["P1", "P2"], "C1-G1", "C1"),
    B: pareja("B", ["P3", "P4"], "C1-G1", "C1"),
    C: pareja("C", ["P5", "P6"], "C1-G1", "C1"),
    D: pareja("D", ["P1", "P7"], "C1-G2", "C1"),
    E: pareja("E", ["P8", "P9"], "C1-G2", "C1"),
    F: pareja("F", ["P10", "P11"], "C1-G2", "C1"),
  };
  const tramos: CalendarioTramo[] = [
    { dayLabel: "Jue", startTime: "14:00", blocks: 4, phase: "previa", isExtension: false },
    { dayLabel: "Dom", startTime: "08:00", blocks: 2, phase: "final", isExtension: false },
  ];
  return buildInstance(categorias, grupos, parejas, tramos);
}

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

function rowCoefs(model: ReturnType<typeof buildModel>, rowName: string) {
  const row = model.rowNames.indexOf(rowName);
  expect(row).toBeGreaterThanOrEqual(0);
  const coefs: Record<string, number> = {};
  for (let k = 0; k < model.rows.length; k += 1) {
    if (model.rows[k] === row) coefs[model.colNames[model.cols[k]]] = model.vals[k];
  }
  return coefs;
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
