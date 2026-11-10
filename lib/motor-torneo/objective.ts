/**
 * Bloque de objetivo (puerto de `motor_torneo/modelo.py:212-279`).
 *
 * Se separó de `model.ts` solo por tamaño (technical-design §3): misma
 * secuencia y mismos nombres canónicos de fila (`DIA`, `MX`, `MN`, `SEG`,
 * `FIN`) para que la paridad L3 sea verificable familia por familia.
 */
import type { Instancia, TournamentParams } from "./types";
import { partidosFase, partidosPotenciales, personasDoble } from "./types";
import type { ModelBuilder } from "./model";

/** `modelo.PARAMS` — política del modelo (no dato). */
export const DEFAULT_PARAMS: TournamentParams = {
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
};

/** `blk(mid)` de Python: `Map<col, bloque>` (incluye el bloque 0 como 0.0). */
function blk(builder: ModelBuilder, matchId: string): Map<number, number> {
  const coefs = new Map<number, number>();
  for (const [block, col] of builder.varsDe.get(matchId) ?? []) {
    coefs.set(col, block);
  }
  return coefs;
}

/**
 * Agrega al builder las variables y restricciones del objetivo: días por pareja
 * en la previa, compacidad de grupo (`mx`/`mn`), bloques seguidos (`e`),
 * finales tempranas (`f`). Las variables ya llevan su costo en `addVar`.
 */
export function addObjectiveTerms(
  builder: ModelBuilder,
  inst: Instancia,
  params: TournamentParams = DEFAULT_PARAMS,
): void {
  const p = params;
  const bloquesPorIdx = new Map(inst.bloques.map((bloque) => [bloque.idx, bloque]));
  const previaIdx = inst.bloques
    .filter((bloque) => bloque.phase === "previa")
    .map((bloque) => bloque.idx);

  const diasPrevia = Array.from(
    new Set(previaIdx.map((idx) => bloquesPorIdx.get(idx)?.dayLabel ?? "")),
  ).sort();
  const bloquesDia = new Map<string, number[]>();
  for (const dia of diasPrevia) {
    bloquesDia.set(
      dia,
      previaIdx.filter((idx) => bloquesPorIdx.get(idx)?.dayLabel === dia),
    );
  }
  const bloquesDiaSet = new Map<string, Set<number>>();
  for (const [dia, idxs] of bloquesDia) bloquesDiaSet.set(dia, new Set(idxs));

  // ---- días por pareja en la previa --------------------------------------
  for (const [parejaId, matches] of builder.partidosPareja) {
    for (const dia of diasPrevia) {
      const dv = builder.addVar(`d[${parejaId},${dia}]`, { cost: p.W_DIAS });
      const delDia = bloquesDiaSet.get(dia) ?? new Set<number>();
      for (const mid of matches) {
        const coefs = new Map<number, number>([[dv, -1]]);
        for (const [b, col] of builder.varsDe.get(mid) ?? []) {
          if (delDia.has(b)) coefs.set(col, 1);
        }
        if (coefs.size > 1) {
          builder.addRow(coefs, Number.NEGATIVE_INFINITY, 0, `DIA[${parejaId},${dia},${mid}]`);
        }
      }
      // el costo real es (días - 1); el -1 es constante y se ignora
    }
  }

  // ---- compacidad de cada grupo ------------------------------------------
  const nBloques = inst.bloques.length;
  for (const [grupoId, matches] of builder.partidosDeGrupo) {
    const mx = builder.addVar(`mx[${grupoId}]`, {
      lb: 0,
      ub: nBloques,
      integer: false,
      cost: p.W_COMPACTO,
    });
    const mn = builder.addVar(`mn[${grupoId}]`, {
      lb: 0,
      ub: nBloques,
      integer: false,
      cost: -p.W_COMPACTO,
    });
    for (const mid of matches) {
      const coefsMx = blk(builder, mid);
      coefsMx.set(mx, -1);
      builder.addRow(coefsMx, Number.NEGATIVE_INFINITY, 0, `MX[${grupoId},${mid}]`);

      const coefsMn = blk(builder, mid);
      coefsMn.set(mn, -1);
      builder.addRow(coefsMn, 0, Number.POSITIVE_INFINITY, `MN[${grupoId},${mid}]`);
    }
  }

  // ---- tope blando de bloques seguidos (solo doble categoría) -------------
  const k = p.maxSeguidos;
  for (const persona of personasDoble(inst)) {
    const matches = partidosPotenciales(inst, persona).filter(
      (mid) => inst.partidos[mid].phase === "previa",
    );
    if (matches.length <= k) continue;

    for (const dia of diasPrevia) {
      const delDia = bloquesDia.get(dia) ?? [];
      for (let i = 0; i < delDia.length - k; i++) {
        const ventana = new Set(delDia.slice(i, i + k + 1));
        const e = builder.addVar(`e[${persona},${dia},${i}]`, {
          lb: 0,
          ub: 4,
          integer: false,
          cost: p.W_SEGUIDOS,
        });
        const coefs = new Map<number, number>([[e, -1]]);
        for (const mid of matches) {
          for (const [b, col] of builder.varsDe.get(mid) ?? []) {
            if (ventana.has(b)) coefs.set(col, (coefs.get(col) ?? 0) + 1);
          }
        }
        builder.addRow(coefs, Number.NEGATIVE_INFINITY, k, `SEG[${persona},${dia},${i}]`);
      }
    }
  }

  // ---- finales no demasiado temprano -------------------------------------
  for (const m of partidosFase(inst, "final")) {
    if (m.ronda !== "final") continue;
    const f = builder.addVar(`f[${m.id}]`, {
      lb: 0,
      ub: nBloques,
      integer: false,
      cost: p.W_FINAL_TEMPRANA,
    });
    const coefs = blk(builder, m.id);
    coefs.set(f, 1);
    builder.addRow(coefs, p.bloqueFinalObjetivo, Number.POSITIVE_INFINITY, `FIN[${m.id}]`);
  }
}
