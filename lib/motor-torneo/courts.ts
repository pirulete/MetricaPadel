/**
 * Asignación de canchas (puerto de `asignar_canchas`, `motor_torneo/modelo.py:315`).
 *
 * Post-proceso al motor: las canchas son intercambiables para el objetivo, así
 * que un voraz estabiliza la agenda (un grupo repite cancha en bloques
 * consecutivos; la final hereda la cancha de un alimentador).
 *
 * No es una restricción del modelo: si el voraz deja un partido sin cancha (por
 * capacidad ya violada), el verificador lo reporta — aquí no se lanza.
 */
import type { CourtAssignment, Instancia } from "./types";

/**
 * `asignar_canchas(inst, bloque_de)` → `partido → cancha (1..N)`.
 *
 * Por bloque, en orden ascendente:
 * 1. la previa intenta la cancha que el grupo usó en el bloque anterior;
 * 2. la final intenta la cancha de su primer alimentador libre;
 * 3. lo que no consigue preferencia toma la primera cancha libre (`pop(0)`).
 */
export function assignCourts(
  inst: Instancia,
  bloqueDe: Record<string, number>,
): CourtAssignment {
  const porBloque = new Map<number, string[]>();
  for (const [mid, bloque] of Object.entries(bloqueDe)) {
    const lista = porBloque.get(bloque);
    if (lista) lista.push(mid);
    else porBloque.set(bloque, [mid]);
  }

  const cancha: CourtAssignment = {};
  /** `(grupo, bloque)` → cancha, para la repetición de la previa. */
  const canchaGrupoPrevio = new Map<string, number>();

  for (const bloque of [...porBloque.keys()].sort((a, b) => a - b)) {
    const mids = [...(porBloque.get(bloque) ?? [])].sort();
    const libres = Array.from({ length: inst.nCanchas }, (_, i) => i + 1);
    const pendientes: string[] = [];

    for (const mid of mids) {
      const partido = inst.partidos[mid];
      let preferida: number | undefined;

      if (partido?.phase === "previa") {
        preferida = canchaGrupoPrevio.get(`${partido.grupo}@${bloque - 1}`);
      } else {
        for (const alimentador of partido?.alimentadores ?? []) {
          const heredada = cancha[alimentador];
          if (heredada !== undefined && libres.includes(heredada)) {
            preferida = heredada;
            break;
          }
        }
      }

      if (preferida !== undefined && libres.includes(preferida)) {
        cancha[mid] = preferida;
        libres.splice(libres.indexOf(preferida), 1);
      } else {
        pendientes.push(mid);
      }
    }

    for (const mid of pendientes) {
      const libre = libres.shift();
      if (libre === undefined) continue; // agenda ya inválida: lo reporta verify()
      cancha[mid] = libre;
    }

    for (const mid of mids) {
      const partido = inst.partidos[mid];
      if (partido?.phase === "previa" && cancha[mid] !== undefined) {
        canchaGrupoPrevio.set(`${partido.grupo}@${bloque}`, cancha[mid]);
      }
    }
  }

  return cancha;
}
