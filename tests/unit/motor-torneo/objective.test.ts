/**
 * Triaje de mutantes 3f — bloque objetivo (`objective.ts`).
 *
 * Cubre las ramas que `model.test.ts` no ejercita: valores canónicos de
 * `DEFAULT_PARAMS`, unicidad y orden de `d[pareja,día]`, fallback de `dayLabel`,
 * integralidad de `mx`/`mn`/`e`/`f`, signo de los coeficientes de `MN`/`SEG` y
 * la condición de corte `matches.length <= maxSeguidos`.
 */
import { buildModel } from "@/lib/motor-torneo/model";
import { DEFAULT_PARAMS } from "@/lib/motor-torneo/objective";
import {
  buildInstance,
  miniInstance,
  objectiveInstance,
  pareja,
  rowCoefs,
} from "./fixtures";
import type {
  CalendarioTramo,
  Categoria,
  Grupo,
  Instancia,
  Pareja,
} from "@/lib/motor-torneo/types";

type Model = ReturnType<typeof buildModel>;

/** 2 grupos y P1 doble (A en G1, D en G2) ⇒ 4 partidos de previa potenciales. */

/**
 * P1 juega en 3 parejas del mismo grupo ⇒ 3 partidos de previa potenciales
 * (= maxSeguidos), más 1 final potencial (4 en total).
 */
function tripleInstance(): Instancia {
  const categorias: Record<string, Categoria> = {
    C1: { sex: "H", level: 1, grupos: ["C1-G1"] },
  };
  const grupos: Record<string, Grupo> = {
    "C1-G1": { categoria: "C1", parejas: ["A", "B", "C"], tam: 3 },
  };
  const parejas: Record<string, Pareja> = {
    A: pareja("A", ["P1", "P2"], "C1-G1", "C1"),
    B: pareja("B", ["P1", "P3"], "C1-G1", "C1"),
    C: pareja("C", ["P1", "P4"], "C1-G1", "C1"),
  };
  const tramos: CalendarioTramo[] = [
    { dayLabel: "Jue", startTime: "14:00", blocks: 4, phase: "previa", isExtension: false },
    { dayLabel: "Dom", startTime: "08:00", blocks: 2, phase: "final", isExtension: false },
  ];
  return buildInstance(categorias, grupos, parejas, tramos);
}

/** Dos días de previa insertados a propósito en orden NO alfabético. */
function twoDaysInstance(): Instancia {
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
    { dayLabel: "Sab", startTime: "08:00", blocks: 2, phase: "previa", isExtension: false },
    { dayLabel: "Jue", startTime: "14:00", blocks: 2, phase: "previa", isExtension: false },
  ];
  return buildInstance(categorias, grupos, parejas, tramos);
}

function colOf(model: Model, name: string): number {
  const col = model.columnByKey.get(name);
  expect(col).toBeDefined();
  return col as number;
}

const eCols = (model: Model): string[] => model.colNames.filter((name) => name.startsWith("e["));

describe("objective — DEFAULT_PARAMS canónicos", () => {
  it("conserva exactamente la política del modelo", () => {
    expect(DEFAULT_PARAMS).toEqual({
      fronteraSabado: true,
      descansoFinal: 1,
      maxSeguidos: 3,
      bloqueFinalObjetivo: 33,
      disponibilidadDura: true,
      dobleDuraEn: ["8vos"],
      W_EXTENSION: 1000,
      W_DISPONIBILIDAD: 500,
      W_DOBLE_BLANDO: 60,
      W_DIAS: 40,
      W_FINAL_TEMPRANA: 30,
      W_COMPACTO: 25,
      W_SEGUIDOS: 15,
      W_TEMPRANO: 1,
      tiempoMax: 120,
      gap: 0.01,
    });
  });
});

describe("objective — días por pareja en la previa", () => {
  it("crea una única variable d por pareja y día, ordenada alfabéticamente", () => {
    const model = buildModel(twoDaysInstance());
    expect(model.colNames.filter((name) => name.startsWith("d[A,"))).toEqual([
      "d[A,Jue]",
      "d[A,Sab]",
    ]);
  });

  it("usa '' cuando el bloque de previa no informa dayLabel", () => {
    const inst = miniInstance();
    inst.bloques = inst.bloques.map((bloque) =>
      bloque.phase === "previa"
        ? { ...bloque, dayLabel: undefined as unknown as string }
        : bloque,
    );
    const model = buildModel(inst);
    expect(model.colNames).toContain("d[A,]");
  });
});

describe("objective — compacidad de grupo", () => {
  it("mx/mn son continuas y MN descuenta el bloque con coeficiente -1", () => {
    const model = buildModel(miniInstance());
    expect(model.integrality[colOf(model, "mx[C1-G1]")]).toBe(0);
    expect(model.integrality[colOf(model, "mn[C1-G1]")]).toBe(0);
    expect(rowCoefs(model, "MN[C1-G1,C1-G1-P1]")["mn[C1-G1]"]).toBe(-1);
  });
});

describe("objective — tope blando de bloques seguidos", () => {
  it("SEG usa e con coeficiente -1 y suma 1 por partido de previa", () => {
    const inst = objectiveInstance();
    const model = buildModel(inst);
    const coefs = rowCoefs(model, "SEG[P1,Jue,0]");

    expect(coefs["e[P1,Jue,0]"]).toBe(-1);
    expect(model.integrality[colOf(model, "e[P1,Jue,0]")]).toBe(0);

    const xs = Object.entries(coefs).filter(([name]) => name.startsWith("x["));
    expect(xs.length).toBeGreaterThan(0);
    for (const [name, value] of xs) {
      const matchId = /^x\[(.+),\d+\]$/.exec(name)?.[1] ?? "";
      expect(value).toBe(1);
      expect(inst.partidos[matchId]?.phase).toBe("previa");
    }
  });

  it("no crea e[] cuando los partidos de previa son <= maxSeguidos", () => {
    const model = buildModel(tripleInstance());
    expect(eCols(model)).toEqual([]);
  });
});

describe("objective — finales no demasiado temprano", () => {
  it("f es continua y su costo es W_FINAL_TEMPRANA", () => {
    const model = buildModel(miniInstance());
    const col = colOf(model, "f[C1-final-1]");
    expect(model.integrality[col]).toBe(0);
    expect(model.cost[col]).toBe(DEFAULT_PARAMS.W_FINAL_TEMPRANA);
  });
});
