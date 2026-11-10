/**
 * Cuadro final de una categoría — puerto EXACTO de `motor_torneo/instancia.py`:
 * `_partidos_grupo` (:128) y `_construir_cuadro` (:138).
 *
 * Fidelidad no negociable (technical-design §10.2 · paridad L1 «exacta»):
 * - `S` = potencia de 2 ≥ 2g, `byes = S - 2g`.
 * - Entrantes `E` = primeros de grupo y después segundos, en orden de grupo.
 * - Los primeros `byes` entrantes tienen pase libre (se emparejan con `None`).
 * - Sin byes el cuadro se re-empareja: 1ro de Gi vs 2do de G((i+g/2)%g).
 * - Los nodos resueltos por pase libre NO emiten partido, pero el índice `k`
 *   del código sí los cuenta ⇒ `2da-8vos-5` empieza en 5 con 4 byes.
 * - `gruposOrigen` se acumula de los alimentadores; `alimentadores` respeta el
 *   orden de los lados. Todo se ordena por código (P-3: cero `Object.keys`
 *   para decidir el orden del cuadro).
 */
import type { Categoria, Grupo, MatchRound, Partido } from "./types";

/** Partido del cuadro derivado (`tournament_matches` de fase final). */
export interface CuadroMatch {
  /** `{categoria}-{ronda}-{k}` (`3ra-8vos-5`). */
  code: string;
  round: MatchRound;
  /** Grupos cuyas parejas podrían jugar este partido (ordenado). */
  sourceGroups: string[];
  /** Partidos que deben terminar antes (orden de los lados). */
  feeders: string[];
  /** Pases libres del cuadro de la categoría (`S - 2g`); constante por cuadro. */
  byes: number;
}

/** Entrante al cuadro: `(grupo, 1|2)` — posición final en el grupo. */
interface Entrante {
  group: string;
  rank: 1 | 2;
}

/** Lado de un nodo del árbol: un entrante (o `null` = pase libre) o un nodo hijo. */
type Lado =
  | { kind: "entrante"; entrante: Entrante | null }
  | { kind: "nodo"; nodo: Nodo };

interface Nodo {
  lados: Lado[];
  /** Código del partido del nodo (`partido` en Python). */
  partido?: string;
  gruposOrigen?: string[];
  /** Lado que "es" el nodo cuando avanzó con pase libre (`resuelto` en Python). */
  resuelto?: Lado;
}

/** Nombre de ronda según la cantidad de nodos del nivel (`nombres` en Python). */
const NOMBRES_RONDA: Record<number, MatchRound> = {
  16: "16vos",
  8: "8vos",
  4: "4tos",
  2: "semi",
  1: "final",
};

/**
 * `_partidos_grupo`: enfrentamientos de la liguilla de un grupo, por índice.
 * 3 parejas → todos contra todos; 4 parejas → ciclo A-B, B-C, C-D, D-A (cada
 * pareja juega exactamente dos partidos).
 */
export function groupPairings(size: number): Array<[number, number]> {
  if (size === 3) return [[0, 1], [0, 2], [1, 2]];
  if (size === 4) return [[0, 1], [1, 2], [2, 3], [3, 0]];
  throw new Error(`Tamaño de grupo inválido (${size}): se espera 3 o 4`);
}

/**
 * `_construir_cuadro`: partidos de fase final de una categoría. Determinista:
 * solo depende del orden de `groupCodes`.
 */
export function buildBracket(
  catCode: string,
  groupCodes: readonly string[],
): CuadroMatch[] {
  const g = groupCodes.length;
  if (g === 0) {
    throw new Error(`Categoría ${catCode} sin grupos: no se puede construir el cuadro`);
  }

  // Cuadro = potencia de 2 >= 2*g, con pases libres.
  let S = 1;
  while (S < 2 * g) S *= 2;
  const byes = S - 2 * g;

  // Entrantes ordenados: primeros de grupo, luego segundos.
  const E: Entrante[] = [
    ...groupCodes.map((group): Entrante => ({ group, rank: 1 })),
    ...groupCodes.map((group): Entrante => ({ group, rank: 2 })),
  ];

  // Posiciones del cuadro: los primeros `byes` entrantes tienen pase libre.
  const posiciones: Array<Entrante | null> = [];
  for (let i = 0; i < byes; i++) posiciones.push(E[i], null);

  let resto: Entrante[];
  if (byes === 0) {
    // Emparejar 1ro del grupo i con 2do del grupo (i + g//2) % g.
    resto = [];
    for (let i = 0; i < g; i++) {
      resto.push(E[i], E[g + ((i + Math.floor(g / 2)) % g)]);
    }
  } else {
    // Evitar que dos parejas del mismo grupo se crucen en primera ronda.
    // Con g >= 2 el orden de `E` ya lo impide; el swap es defensa del original.
    resto = E.slice(byes);
    for (let k = 0; k < resto.length - 1; k += 2) {
      if (resto[k].group === resto[k + 1].group && k + 2 < resto.length) {
        const swapped = resto[k + 1];
        resto[k + 1] = resto[k + 2];
        resto[k + 2] = swapped;
      }
    }
  }
  posiciones.push(...resto);

  // Nodos del nivel 0: S/2 slots.
  let nivel: Nodo[] = [];
  for (let s = 0; s < S / 2; s++) {
    const a = posiciones[2 * s] ?? null;
    const b = posiciones[2 * s + 1] ?? null;
    nivel.push({
      lados: [
        { kind: "entrante", entrante: a },
        { kind: "entrante", entrante: b },
      ],
    });
  }

  const partidos: CuadroMatch[] = [];
  let nNodos = S / 2;

  for (;;) {
    const ronda = NOMBRES_RONDA[nNodos];
    if (!ronda) {
      throw new Error(
        `Categoría ${catCode}: ${nNodos} nodos en una ronda no soportada (máximo 16vos)`,
      );
    }

    for (let k = 0; k < nivel.length; k++) {
      const nodo = nivel[k];
      const reales = nodo.lados.filter((lado) => {
        if (lado.kind === "nodo") return true;
        return lado.entrante !== null;
      });

      if (reales.length === 1) {
        // Pase libre: el nodo "es" ese lado (no emite partido).
        nodo.resuelto = reales[0];
        continue;
      }
      if (reales.length === 0) {
        throw new Error(`Categoría ${catCode}: nodo sin lados en la ronda ${ronda}`);
      }

      const code = `${catCode}-${ronda}-${k + 1}`;
      const grupos = new Set<string>();
      const feeders: string[] = [];

      for (const lado of reales) {
        if (lado.kind === "entrante") {
          if (lado.entrante) grupos.add(lado.entrante.group);
          continue;
        }
        for (const grupo of lado.nodo.gruposOrigen ?? []) grupos.add(grupo);
        if (lado.nodo.partido) feeders.push(lado.nodo.partido);
      }

      const sourceGroups = [...grupos].sort();
      nodo.partido = code;
      nodo.gruposOrigen = sourceGroups;
      partidos.push({ code, round: ronda, sourceGroups, feeders, byes });
    }

    if (nNodos === 1) break;

    // Construir el nivel siguiente agrupando nodos de a 2.
    const siguiente: Nodo[] = [];
    for (let k = 0; k < nNodos; k += 2) {
      const lados: Lado[] = [];
      for (const nodo of [nivel[k], nivel[k + 1]]) {
        if (nodo.partido) lados.push({ kind: "nodo", nodo });
        else if (nodo.resuelto) lados.push(nodo.resuelto);
      }
      siguiente.push({ lados });
    }
    nivel = siguiente;
    nNodos /= 2;
  }

  return partidos;
}

/**
 * `deriveStructure`: estructura deportiva completa (previa + final) de una
 * instancia. Orden de salida: por categoría, previa de cada grupo en orden de
 * `Categoria.grupos`, y después el cuadro de esa categoría por nivel.
 *
 * No recibe el mapa de parejas: `Grupo.parejas` ya trae los códigos en orden
 * (`sortOrder`), que es lo único que la estructura necesita (P-3).
 */
export function deriveStructure(
  categorias: Record<string, Categoria>,
  grupos: Record<string, Grupo>,
): Partido[] {
  const partidos: Partido[] = [];

  for (const [catCode, categoria] of Object.entries(categorias)) {
    for (const grupoCode of categoria.grupos) {
      const grupo = grupos[grupoCode];
      if (!grupo) {
        throw new Error(`Grupo ${grupoCode} no existe en la instancia`);
      }

      groupPairings(grupo.parejas.length).forEach(([i, j], index) => {
        partidos.push({
          id: `${grupoCode}-P${index + 1}`,
          categoria: catCode,
          phase: "previa",
          ronda: "grupo",
          grupo: grupoCode,
          parejas: [grupo.parejas[i], grupo.parejas[j]],
          gruposOrigen: [grupoCode],
          alimentadores: [],
        });
      });
    }

    for (const cuadro of buildBracket(catCode, categoria.grupos)) {
      partidos.push({
        id: cuadro.code,
        categoria: catCode,
        phase: "final",
        ronda: cuadro.round,
        grupo: null,
        parejas: null,
        gruposOrigen: cuadro.sourceGroups,
        alimentadores: cuadro.feeders,
      });
    }
  }

  return partidos;
}
