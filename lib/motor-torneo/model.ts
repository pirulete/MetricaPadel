/**
 * Constructor del modelo MILP (puerto de `Modelo._construir`,
 * `motor_torneo/modelo.py:72`).
 *
 * Sin clases (§11): un objeto plano (`ModelBuilder`) + funciones. El objetivo
 * (días, compacidad, seguidos y finales tempranas) vive en `objective.ts`
 * porque el bloque excede el tamaño razonable de este archivo.
 *
 * Fidelidad (technical-design §3.1):
 * - P-1: R5 en formulación acumulada con `sep = 1 + descansoFinal` y el `break`
 *   de redundancia.
 * - P-2: R3 en previa se aplica por PAREJA (`partidosPareja`), y R3 de doble
 *   categoría sobre el camino potencial (duro en previa + `dobleDuraEn`,
 *   blando con variable de choque en el resto).
 * - P-3: iteración determinista (`sort` por id/código), nunca `Object.keys` de
 *   dominio confiando en su orden.
 * - Los coeficientes 0 se conservan como entradas de matriz (Python usa dicts y
 *   `nNonZeros = len(rows)`); la paridad L3 depende de ello.
 */
import type {
  Instancia,
  MilpModel,
  MilpModelStats,
  TournamentParams,
} from "./types";
import { partidosFase, partidosPotenciales, personasDoble } from "./types";
import { DEFAULT_PARAMS, addObjectiveTerms } from "./objective";

/** `x[m,b]` → variable de decisión (columna + bloque). */
export interface XVarEntry {
  matchId: string;
  block: number;
  col: number;
}

export interface VarOptions {
  lb?: number;
  ub?: number;
  /** `true` = entera/binaria (default, como `_nueva_var`); `false` = continua. */
  integer?: boolean;
  cost?: number;
}

/**
 * Objeto plano mutable que acumula columnas (variables) y filas
 * (restricciones) en tripletas 0-based. Equivale a los arrays internos de
 * `Modelo._nueva_var` / `Modelo._restriccion`.
 */
export interface ModelBuilder {
  colNames: string[];
  lb: number[];
  ub: number[];
  /** `1` = entera, `0` = continua. */
  integrality: number[];
  cost: number[];
  rows: number[];
  cols: number[];
  vals: number[];
  rowLo: number[];
  rowHi: number[];
  rowNames: string[];
  columnByKey: Map<string, number>;
  /** `partido → [(bloque, col)]`, orden de creación (como `Modelo.vars_de`). */
  varsDe: Map<string, Array<[number, number]>>;
  /** `pareja → [partido de previa]` (como `Modelo.partidos_pareja`). */
  partidosPareja: Map<string, string[]>;
  /** `grupo → [partido de previa]`. */
  partidosDeGrupo: Map<string, string[]>;
  addVar(name: string, options?: VarOptions): number;
  addRow(
    coefs: ReadonlyMap<number, number>,
    lo: number,
    hi: number,
    name: string,
  ): void;
}

/** Modelo construido + acceso directo a las variables de asignación. */
export interface BuiltModel extends MilpModel {
  xVars: XVarEntry[];
}

/** `Modelo._nueva_var`: alta de columna con bounds/integralidad/costo. */
export function createBuilder(): ModelBuilder {
  const builder: ModelBuilder = {
    colNames: [],
    lb: [],
    ub: [],
    integrality: [],
    cost: [],
    rows: [],
    cols: [],
    vals: [],
    rowLo: [],
    rowHi: [],
    rowNames: [],
    columnByKey: new Map(),
    varsDe: new Map(),
    partidosPareja: new Map(),
    partidosDeGrupo: new Map(),

    addVar(name, options = {}) {
      const { lb = 0, ub = 1, integer = true, cost = 0 } = options;
      const col = builder.colNames.length;
      builder.colNames.push(name);
      builder.lb.push(lb);
      builder.ub.push(ub);
      builder.integrality.push(integer ? 1 : 0);
      builder.cost.push(cost);
      builder.columnByKey.set(name, col);
      return col;
    },

    addRow(coefs, lo, hi, name) {
      const row = builder.rowLo.length;
      for (const [col, val] of coefs) {
        builder.rows.push(row);
        builder.cols.push(col);
        builder.vals.push(val);
      }
      builder.rowLo.push(lo);
      builder.rowHi.push(hi);
      builder.rowNames.push(name);
    },
  };
  return builder;
}

/** Matriz dispersa CSC 0-based lista para HiGHS. */
export interface CscMatrix {
  format: "csc";
  numRows: number;
  numCols: number;
  starts: Int32Array;
  indices: Int32Array;
  values: Float64Array;
}

/** Convierte las tripletas del modelo a CSC (`scipy.coo_matrix(...).tocsr()`, transpuesto). */
export function toCSC(model: MilpModel): CscMatrix {
  const numCols = model.colNames.length;
  const numRows = model.rowLo.length;
  const counts = new Int32Array(numCols + 1);
  for (const col of model.cols) counts[col + 1] += 1;
  for (let j = 0; j < numCols; j++) counts[j + 1] += counts[j];

  const starts = Int32Array.from(counts);
  const cursor = Int32Array.from(counts.subarray(0, numCols));
  const indices = new Int32Array(model.rows.length);
  const values = new Float64Array(model.vals.length);

  for (let k = 0; k < model.cols.length; k++) {
    const col = model.cols[k];
    const pos = cursor[col]++;
    indices[pos] = model.rows[k];
    values[pos] = model.vals[k];
  }

  return { format: "csc", numRows, numCols, starts, indices, values };
}

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * `buildModel(inst, params)` — puerto de `Modelo._construir`.
 * R1 (exactly-one), R2 (capacidad), R3/R3b (persona/doble), R5 (precedencias)
 * y delega el bloque de objetivo a `addObjectiveTerms`.
 */
export function buildModel(
  inst: Instancia,
  params: TournamentParams = DEFAULT_PARAMS,
): BuiltModel {
  const p = params;
  const builder = createBuilder();
  const xVars: XVarEntry[] = [];

  const bloques = new Map(inst.bloques.map((bloque) => [bloque.idx, bloque]));
  const idxFase = {
    previa: inst.bloques.filter((b) => b.phase === "previa").map((b) => b.idx),
    final: inst.bloques.filter((b) => b.phase === "final").map((b) => b.idx),
  };
  const todos = inst.bloques.map((b) => b.idx);

  // ---- variables x[m,b] ---------------------------------------------------
  const partidos = Object.values(inst.partidos).sort(byId);
  for (const m of partidos) {
    const permitidos = p.fronteraSabado
      ? idxFase[m.phase]
      : m.phase === "final"
        ? todos
        : idxFase.previa;

    const prohibidos = new Set<number>();
    if (m.phase === "previa") {
      for (const parejaId of m.parejas ?? []) {
        for (const bloque of inst.parejas[parejaId]?.bloqueados ?? []) {
          prohibidos.add(bloque);
        }
      }
    }

    for (const b of permitidos) {
      const bloque = bloques.get(b);
      let costo = 0;
      if (bloque?.isExtension) costo += p.W_EXTENSION;
      if (m.phase === "final") costo += p.W_TEMPRANO * b;
      if (prohibidos.has(b)) {
        if (p.disponibilidadDura) continue; // restricción 4 dura: la variable no existe
        costo += p.W_DISPONIBILIDAD; // modo BR-04
      }

      const col = builder.addVar(`x[${m.id},${b}]`, { cost: costo });
      builder.varsDe.set(m.id, [...(builder.varsDe.get(m.id) ?? []), [b, col]]);
      xVars.push({ matchId: m.id, block: b, col });
    }
  }

  // ---- R1: cada partido en exactamente una casilla ------------------------
  for (const [mid, lista] of builder.varsDe) {
    const coefs = new Map<number, number>();
    for (const [, col] of lista) coefs.set(col, 1);
    builder.addRow(coefs, 1, 1, `R1[${mid}]`);
  }

  // ---- R2: capacidad por bloque (canchas) --------------------------------
  const porBloque = new Map<number, number[]>();
  for (const { block, col } of xVars) {
    porBloque.set(block, [...(porBloque.get(block) ?? []), col]);
  }
  for (const [b, cols] of porBloque) {
    const coefs = new Map<number, number>();
    for (const col of cols) coefs.set(col, 1);
    builder.addRow(coefs, 0, bloques.get(b)?.capacity ?? 0, `R2[${b}]`);
  }

  // ---- R3: una persona no está en dos partidos del mismo bloque ----------
  const agregarR3 = (partidosDePersona: string[], etiqueta: string): void => {
    const porB = new Map<number, number[]>();
    for (const mid of partidosDePersona) {
      for (const [b, col] of builder.varsDe.get(mid) ?? []) {
        porB.set(b, [...(porB.get(b) ?? []), col]);
      }
    }
    for (const [b, cols] of porB) {
      if (cols.length > 1) {
        const coefs = new Map<number, number>();
        for (const col of cols) coefs.set(col, 1);
        builder.addRow(coefs, 0, 1, `R3[${etiqueta},${b}]`);
      }
    }
  };

  for (const m of partidosFase(inst, "previa")) {
    for (const parejaId of m.parejas ?? []) {
      builder.partidosPareja.set(parejaId, [
        ...(builder.partidosPareja.get(parejaId) ?? []),
        m.id,
      ]);
    }
  }
  for (const [parejaId, mids] of builder.partidosPareja) {
    agregarR3(mids, parejaId);
  }

  // Doble categoría: duro en previa + `dobleDuraEn`, blando en el resto.
  const dobles = personasDoble(inst);
  const duras = new Set<TournamentParams["dobleDuraEn"][number]>(p.dobleDuraEn);
  for (const persona of dobles) {
    const potenciales = partidosPotenciales(inst, persona);
    agregarR3(
      potenciales.filter((mid) => {
        const partido = inst.partidos[mid];
        return partido.phase === "previa" || duras.has(partido.ronda);
      }),
      persona,
    );

    const blandos = potenciales.filter((mid) => {
      const partido = inst.partidos[mid];
      return partido.phase === "final" && !duras.has(partido.ronda);
    });
    const porB = new Map<number, number[]>();
    for (const mid of blandos) {
      for (const [b, col] of builder.varsDe.get(mid) ?? []) {
        porB.set(b, [...(porB.get(b) ?? []), col]);
      }
    }
    for (const [b, cols] of porB) {
      if (cols.length <= 1) continue;
      const choque = builder.addVar(`choque[${persona},${b}]`, {
        lb: 0,
        ub: cols.length,
        integer: false,
        cost: p.W_DOBLE_BLANDO,
      });
      const coefs = new Map<number, number>();
      for (const col of cols) coefs.set(col, 1);
      coefs.set(choque, -1);
      builder.addRow(coefs, Number.NEGATIVE_INFINITY, 1, `R3b[${persona},${b}]`);
    }
  }

  // ---- R5: precedencias del cuadro (formulación acumulada, P-1) -----------
  for (const m of partidosFase(inst, "previa")) {
    if (m.grupo === null) continue;
    builder.partidosDeGrupo.set(m.grupo, [
      ...(builder.partidosDeGrupo.get(m.grupo) ?? []),
      m.id,
    ]);
  }

  const sep = 1 + p.descansoFinal;
  for (const m of partidosFase(inst, "final")) {
    const feeders = [...m.alimentadores];
    const cubiertos = new Set<string>();
    for (const alimentador of m.alimentadores) {
      for (const grupo of inst.partidos[alimentador]?.gruposOrigen ?? []) {
        cubiertos.add(grupo);
      }
    }
    for (const grupo of m.gruposOrigen) {
      if (cubiertos.has(grupo)) continue;
      feeders.push(...(builder.partidosDeGrupo.get(grupo) ?? []));
    }

    const vm = [...(builder.varsDe.get(m.id) ?? [])].sort((a, b) => a[0] - b[0]);
    for (const feeder of feeders) {
      const vf = [...(builder.varsDe.get(feeder) ?? [])].sort((a, b) => a[0] - b[0]);
      if (vf.length === 0) continue;
      const maxF = vf[vf.length - 1][0];
      for (const [t] of vm) {
        if (t - sep >= maxF) break; // de aquí en adelante la restricción es redundante
        const coefs = new Map<number, number>();
        for (const [b, col] of vm) {
          if (b <= t) coefs.set(col, 1);
        }
        for (const [b, col] of vf) {
          if (b <= t - sep) coefs.set(col, (coefs.get(col) ?? 0) - 1);
        }
        builder.addRow(coefs, Number.NEGATIVE_INFINITY, 0, `R5[${m.id}<-${feeder},${t}]`);
      }
    }
  }

  // ---- Objetivo (objective.ts) -------------------------------------------
  addObjectiveTerms(builder, inst, p);

  const stats: MilpModelStats = {
    nVars: builder.colNames.length,
    nConstraints: builder.rowLo.length,
    nNonZeros: builder.rows.length,
  };

  return {
    colNames: builder.colNames,
    rowNames: builder.rowNames,
    lb: builder.lb,
    ub: builder.ub,
    integrality: builder.integrality,
    cost: builder.cost,
    rows: builder.rows,
    cols: builder.cols,
    vals: builder.vals,
    rowLo: builder.rowLo,
    rowHi: builder.rowHi,
    columnByKey: builder.columnByKey,
    stats,
    xVars,
  };
}
