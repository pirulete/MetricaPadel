/**
 * Verificador independiente de agendas (puerto EXACTO de
 * `motor_torneo/verificar.py`).
 *
 * Revisa una agenda contra las 6 reglas duras **sin usar nada del modelo**:
 * si el modelo tiene un error, esto lo delata. Por eso el test estático
 * `purity.test.ts` prohíbe que este archivo importe `model.ts` u
 * `objective.ts`.
 *
 * Los mensajes conservan el texto del Python (contrato del cross-check
 * `scripts/torneo-verify-with-python.py`, §10.3 del technical-design).
 */
import type {
  CourtAssignment,
  Instancia,
  TournamentParams,
  VerificationCode,
  VerificationError,
} from "./types";
import { partidosFase, partidosPotenciales } from "./types";

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * `verificar(inst, bloque_de, cancha_de, params)`.
 *
 * Reglas, en el mismo orden que el original (el orden importa: la regla 1
 * corta el resto, igual que el `if errores: return errores` del Python):
 *
 * 1. cada partido tiene bloque y cancha (`missing`)
 * 2. capacidad, canchas distintas y rango por bloque
 * 3. persona en dos partidos a la vez: previa exacta; en doble categoría
 *    también las rondas de `dobleDuraEn` (camino potencial a la final)
 * 4. disponibilidad de las parejas en la previa
 * 5. precedencias: `b[m] ≥ b[alimentador] + 1 + descansoFinal`
 * 6. fase del bloque (frontera sábado; sin frontera, la previa sigue acotada)
 */
export function verify(
  inst: Instancia,
  bloqueDe: Record<string, number>,
  canchaDe: CourtAssignment,
  params: TournamentParams,
): VerificationError[] {
  const errores: VerificationError[] = [];
  const bloquePorIdx = new Map(inst.bloques.map((bloque) => [bloque.idx, bloque]));
  const sep = 1 + params.descansoFinal;
  const partidos = Object.values(inst.partidos).sort(byId);

  const add = (
    code: VerificationCode,
    message: string,
    extra: Partial<VerificationError> = {},
  ) => errores.push({ code, message, ...extra });

  // 1. cada partido tiene bloque y cancha
  for (const partido of partidos) {
    const mid = partido.id;
    if (!(mid in bloqueDe)) add("missing", `sin bloque: ${mid}`, { matchId: mid });
    if (!(mid in canchaDe)) add("missing", `sin cancha: ${mid}`, { matchId: mid });
  }
  if (errores.length > 0) return errores;

  // 2. capacidad y canchas distintas por bloque
  const porBloque = new Map<number, string[]>();
  for (const [mid, bloque] of Object.entries(bloqueDe)) {
    const lista = porBloque.get(bloque);
    if (lista) lista.push(mid);
    else porBloque.set(bloque, [mid]);
  }
  for (const [bloqueIdx, mids] of [...porBloque.entries()].sort((a, b) => a[0] - b[0])) {
    const cap = bloquePorIdx.get(bloqueIdx)?.capacity ?? 0;
    if (mids.length > cap) {
      add(
        "capacity",
        `capacidad excedida en bloque ${bloqueIdx}: ${mids.length} > ${cap}`,
        { blockIdx: bloqueIdx },
      );
    }
    const canchas = mids.map((mid) => canchaDe[mid]);
    if (new Set(canchas).size !== canchas.length) {
      add("court_collision", `dos partidos en la misma cancha, bloque ${bloqueIdx}`, {
        blockIdx: bloqueIdx,
      });
    }
    for (const mid of mids) {
      const cancha = canchaDe[mid];
      if (!(cancha >= 1 && cancha <= inst.nCanchas)) {
        add("court_range", `cancha invalida ${cancha} en ${mid}`, { matchId: mid, court: cancha });
      }
    }
  }

  // 3. persona en dos partidos a la vez (previa exacta, final potencial)
  const duras = new Set<string>(params.dobleDuraEn);
  for (const personaId of Object.keys(inst.personas).sort()) {
    const persona = inst.personas[personaId];
    const doble = persona.parejas.length > 1;
    const potenciales = partidosPotenciales(inst, personaId).filter((mid) => {
      const partido = inst.partidos[mid];
      if (!partido) return false;
      if (partido.phase === "previa") return true;
      return doble && duras.has(partido.ronda);
    });

    const porBloquePersona = new Map<number, string[]>();
    for (const mid of potenciales) {
      const bloque = bloqueDe[mid];
      const lista = porBloquePersona.get(bloque);
      if (lista) lista.push(mid);
      else porBloquePersona.set(bloque, [mid]);
    }
    for (const [bloqueIdx, mids] of [...porBloquePersona.entries()].sort((a, b) => a[0] - b[0])) {
      if (mids.length > 1) {
        add(
          "person_overlap",
          `persona ${personaId} en dos partidos en bloque ${bloqueIdx}: ${mids.join(", ")}`,
          { blockIdx: bloqueIdx },
        );
      }
    }
  }

  // 4. disponibilidad (previa)
  for (const partido of partidosFase(inst, "previa")) {
    for (const parejaId of partido.parejas ?? []) {
      if (inst.parejas[parejaId]?.bloqueados.has(bloqueDe[partido.id])) {
        add(
          "availability",
          `disponibilidad violada: ${partido.id} en bloque ${bloqueDe[partido.id]} (${parejaId})`,
          { matchId: partido.id, blockIdx: bloqueDe[partido.id] },
        );
      }
    }
  }

  // 5. precedencias
  const partidosDeGrupo = new Map<string, string[]>();
  for (const partido of partidosFase(inst, "previa")) {
    if (partido.grupo === null) continue;
    const lista = partidosDeGrupo.get(partido.grupo);
    if (lista) lista.push(partido.id);
    else partidosDeGrupo.set(partido.grupo, [partido.id]);
  }
  for (const partido of partidosFase(inst, "final")) {
    const feeders = [...partido.alimentadores];
    const cubiertos = new Set<string>();
    for (const alimentador of partido.alimentadores) {
      for (const grupo of inst.partidos[alimentador]?.gruposOrigen ?? []) cubiertos.add(grupo);
    }
    for (const grupo of partido.gruposOrigen) {
      if (!cubiertos.has(grupo)) feeders.push(...(partidosDeGrupo.get(grupo) ?? []));
    }
    for (const feeder of feeders) {
      const bloqueFeeder = bloqueDe[feeder];
      if (bloqueFeeder === undefined) continue;
      if (bloqueDe[partido.id] < bloqueFeeder + sep) {
        add(
          "precedence",
          `precedencia: ${partido.id} (b${bloqueDe[partido.id]}) antes de ${feeder} (b${bloqueFeeder})`,
          { matchId: partido.id, blockIdx: bloqueDe[partido.id] },
        );
      }
    }
  }

  // 6. fase
  if (params.fronteraSabado) {
    for (const partido of partidos) {
      const bloque = bloquePorIdx.get(bloqueDe[partido.id]);
      if (bloque?.phase !== partido.phase) {
        add("phase", `fase incorrecta: ${partido.id} en bloque ${bloqueDe[partido.id]}`, {
          matchId: partido.id,
          blockIdx: bloqueDe[partido.id],
        });
      }
    }
  } else {
    for (const partido of partidosFase(inst, "previa")) {
      const bloque = bloquePorIdx.get(bloqueDe[partido.id]);
      if (bloque?.phase !== "previa") {
        add(
          "phase",
          `previa fuera de bloques de previa: ${partido.id}`,
          { matchId: partido.id, blockIdx: bloqueDe[partido.id] },
        );
      }
    }
  }

  return errores;
}
