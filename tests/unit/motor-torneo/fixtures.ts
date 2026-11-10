/**
 * Fixtures compartidos por los tests del motor de torneos.
 *
 * Antes vivían copiados en `model.test.ts`, `objective.test.ts` y
 * `verify.test.ts`; una sola fuente evita que un cambio de `Instancia` obligue
 * a tocar tres copias (y que se desincronicen en silencio).
 */
import { buildBlocks } from "@/lib/motor-torneo/calendar";
import { deriveStructure } from "@/lib/motor-torneo/bracket";
import type { BuiltModel } from "@/lib/motor-torneo/model";
import type {
  CalendarioTramo,
  Categoria,
  Grupo,
  Instancia,
  Pareja,
  Persona,
} from "@/lib/motor-torneo/types";

export const MINI_TRAMOS: CalendarioTramo[] = [
  { dayLabel: "Jue", startTime: "14:00", blocks: 2, phase: "previa", isExtension: false },
  { dayLabel: "Sab", startTime: "08:00", blocks: 2, phase: "previa", isExtension: false },
  { dayLabel: "Jue", startTime: "19:00", blocks: 2, phase: "final", isExtension: false },
];

export function pareja(
  id: string,
  personas: string[],
  grupo: string,
  categoria: string,
  bloqueados: number[] = [],
): Pareja {
  return { id, categoria, grupo, personas, bloqueados: new Set(bloqueados) };
}

export function buildInstance(
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
export function miniInstance(blocked: Record<string, number[]> = {}): Instancia {
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
export function objectiveInstance(): Instancia {
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

/** Coeficientes no nulos de una fila del modelo (`R5[...]`, `SEG[...]`, ...). */
export function rowCoefs(model: BuiltModel, rowName: string): Record<string, number> {
  const row = model.rowNames.indexOf(rowName);
  expect(row).toBeGreaterThanOrEqual(0);
  const coefs: Record<string, number> = {};
  for (let k = 0; k < model.rows.length; k += 1) {
    if (model.rows[k] === row) coefs[model.colNames[model.cols[k]]] = model.vals[k];
  }
  return coefs;
}
