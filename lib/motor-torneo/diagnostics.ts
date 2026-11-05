/**
 * Diagnóstico del motor (puerto de `correr.py::semaforo` + `resumen_calidad`).
 *
 * PURO (AC-05): sin DB, sin Next, sin `Date`. Todo se deriva de la `Instancia`
 * y de la agenda ya asignada (`partido → bloque/cancha`), así que sirve tanto
 * para el pre-check de admisión (`computeSemaforo`) como para el panel de
 * calidad post-solver (`computeDiagnosis`).
 *
 * Semáforo (ρ = partidos / casillas de la fase, SIN extensión):
 * - `rojo`        ρ > 1  (no cabe) · fase con partidos y **0 casillas** (EC-16)
 * - `amarillo`    ρ > 0.85 (sin margen)
 * - `verde`       resto
 *
 * Indicadores de `resumen_calidad`: ocupación por tramo, partidos en extensión,
 * grupos como unidad / mismo día / misma cancha, días por pareja, horario
 * laboral, máximo de bloques seguidos, finales, primer partido de cuadro por
 * categoría, choques de doble categoría y violaciones de disponibilidad.
 */
import { DEFAULT_PARAMS } from "./objective";
import type {
  Bloque,
  CourtAssignment,
  Diagnosis,
  EngineStatus,
  Instancia,
  Semaforo,
  SemaforoColor,
  SemaforoPhase,
  TournamentPhase,
  TournamentParams,
  TramoOccupancy,
  VerificationError,
} from "./types";
import {
  bloquesFase,
  partidosFase,
  partidosPotenciales,
  personasDoble,
} from "./types";

/** Umbral de "sin margen" del semáforo (Python: `rho > 0.85`). */
export const AMBER_OCCUPANCY = 0.85;

/** Días y hora de corte del indicador de horario laboral (Python: Jue/Vie < 19:00). */
const LABOR_DAYS: ReadonlySet<string> = new Set(["Jue", "Vie"]);
const LABOR_CUTOFF = "19:00";

/** Final del cuadro ya agendada (lista de `resumen_calidad`). */
export interface FinalSlot {
  matchId: string;
  category: string;
  dayLabel: string;
  startTime: string;
  /** `null` si el verificador dejó el partido sin cancha. */
  court: number | null;
}

/** Primer partido de cuadro de cada categoría (el más temprano). */
export interface BracketFirstMatch {
  category: string;
  matchId: string;
  dayLabel: string;
  startTime: string;
}

/** Partido de previa agendado en un bloque prohibido por alguna de sus parejas. */
export interface AvailabilityViolation {
  matchId: string;
  blockIdx: number;
  dayLabel: string;
  startTime: string;
  teams: string[];
}

/** `Diagnosis` del contrato + los indicadores que la UI pinta como listas. */
export interface DiagnosisReport extends Diagnosis {
  semaforo: Semaforo;
  scheduledMatches: number;
  finals: FinalSlot[];
  bracketFirstMatch: BracketFirstMatch[];
  availabilityViolations: AvailabilityViolation[];
}

export interface DiagnosisInput {
  status: EngineStatus;
  objective?: number | null;
  mipGap?: number | null;
  timeMs?: number;
  /** Agenda `partido → idx de bloque` (vacía si el solver no dio solución). */
  bloqueDe: Record<string, number>;
  /** `partido → cancha` (1..N). */
  canchaDe?: CourtAssignment;
  /** Política del modelo; solo se usa `dobleDuraEn` para los choques blandos. */
  params?: TournamentParams;
  verificationErrors?: VerificationError[];
}

function sumCapacity(blocks: readonly Bloque[]): number {
  return blocks.reduce((total, bloque) => total + bloque.capacity, 0);
}

function colorFor(matches: number, capacity: number, occupancy: number): SemaforoColor {
  if (capacity === 0) return matches > 0 ? "rojo" : "verde";
  if (occupancy > 1) return "rojo";
  if (occupancy > AMBER_OCCUPANCY) return "amarillo";
  return "verde";
}

function phaseSemaforo(inst: Instancia, phase: TournamentPhase): SemaforoPhase {
  const blocks = bloquesFase(inst, phase);
  const capacity = sumCapacity(blocks.filter((bloque) => !bloque.isExtension));
  const extensionCapacity = sumCapacity(blocks.filter((bloque) => bloque.isExtension));
  const matches = partidosFase(inst, phase).length;
  // EC-16: fase sin casillas ⇒ ρ infinito explícito, nunca NaN/división por 0.
  const occupancy =
    capacity === 0
      ? matches > 0
        ? Number.POSITIVE_INFINITY
        : 0
      : matches / capacity;

  return {
    phase,
    matches,
    capacity,
    occupancy,
    extensionCapacity,
    color: colorFor(matches, capacity, occupancy),
  };
}

/** Semáforo de admisión por fase (pre-check de `POST .../agenda`, EC-01). */
export function computeSemaforo(inst: Instancia): Semaforo {
  return {
    previa: phaseSemaforo(inst, "previa"),
    final: phaseSemaforo(inst, "final"),
  };
}

function blockAt(inst: Instancia, idx: number | undefined): Bloque | null {
  if (idx === undefined) return null;
  return inst.bloques[idx] ?? null;
}

function occupancyByTramo(
  inst: Instancia,
  bloqueDe: Record<string, number>,
): TramoOccupancy[] {
  const tramos = new Map<string, TramoOccupancy>();
  for (const bloque of inst.bloques) {
    const key = `${bloque.dayLabel}|${bloque.phase}|${bloque.isExtension ? "ext" : "base"}`;
    const tramo = tramos.get(key);
    if (tramo) tramo.capacity += bloque.capacity;
    else {
      tramos.set(key, {
        dayLabel: bloque.dayLabel,
        phase: bloque.phase,
        isExtension: bloque.isExtension,
        matches: 0,
        capacity: bloque.capacity,
      });
    }
  }

  for (const blockIdx of Object.values(bloqueDe)) {
    const bloque = blockAt(inst, blockIdx);
    if (!bloque) continue;
    const key = `${bloque.dayLabel}|${bloque.phase}|${bloque.isExtension ? "ext" : "base"}`;
    const tramo = tramos.get(key);
    if (tramo) tramo.matches += 1;
  }

  return [...tramos.values()];
}

/** `choque[p,b]` del modelo (R3b), recuperado de la agenda: extras por bloque. */
function doubleCategoryClashes(
  inst: Instancia,
  bloqueDe: Record<string, number>,
  params: TournamentParams,
): number {
  const duras = new Set<string>(params.dobleDuraEn);
  const blandos = new Set(
    partidosFase(inst, "final")
      .filter((partido) => !duras.has(partido.ronda))
      .map((partido) => partido.id),
  );

  let clashes = 0;
  for (const persona of personasDoble(inst)) {
    const porBloque = new Map<number, number>();
    for (const matchId of partidosPotenciales(inst, persona)) {
      if (!blandos.has(matchId)) continue;
      const blockIdx = bloqueDe[matchId];
      if (blockIdx === undefined) continue;
      porBloque.set(blockIdx, (porBloque.get(blockIdx) ?? 0) + 1);
    }
    for (const count of porBloque.values()) {
      if (count > 1) clashes += count - 1;
    }
  }
  return clashes;
}

function availabilityViolations(
  inst: Instancia,
  bloqueDe: Record<string, number>,
): AvailabilityViolation[] {
  const violations: AvailabilityViolation[] = [];
  for (const partido of partidosFase(inst, "previa")) {
    const blockIdx = bloqueDe[partido.id];
    const bloque = blockAt(inst, blockIdx);
    if (!bloque) continue;
    const teams = (partido.parejas ?? []).filter((pareja) =>
      inst.parejas[pareja]?.bloqueados.has(bloque.idx),
    );
    if (teams.length > 0) {
      violations.push({
        matchId: partido.id,
        blockIdx: bloque.idx,
        dayLabel: bloque.dayLabel,
        startTime: bloque.startTime,
        teams,
      });
    }
  }
  return violations;
}

function groupIndicators(
  inst: Instancia,
  previa: readonly Instancia["partidos"][string][],
  bloqueDe: Record<string, number>,
  canchaDe: CourtAssignment,
) {
  const blocksByGroup = new Map<string, number[]>();
  const courtsByGroup = new Map<string, Set<number>>();

  for (const partido of previa) {
    if (partido.grupo === null) continue;
    const blockIdx = bloqueDe[partido.id];
    if (blockIdx === undefined) continue;
    blocksByGroup.set(partido.grupo, [
      ...(blocksByGroup.get(partido.grupo) ?? []),
      blockIdx,
    ]);
    const court = canchaDe[partido.id];
    if (court !== undefined) {
      const courts = courtsByGroup.get(partido.grupo) ?? new Set<number>();
      courts.add(court);
      courtsByGroup.set(partido.grupo, courts);
    }
  }

  let comoUnidad = 0;
  let mismoDia = 0;
  for (const [groupCode, blocks] of blocksByGroup) {
    const tam = inst.grupos[groupCode]?.tam ?? 3;
    const span = Math.max(...blocks) - Math.min(...blocks);
    const days = new Set(
      blocks.map((blockIdx) => blockAt(inst, blockIdx)?.dayLabel ?? ""),
    );
    if (days.size === 1) {
      mismoDia += 1;
      if (span <= (tam === 3 ? 2 : 1)) comoUnidad += 1;
    }
  }

  let mismaCancha = 0;
  for (const courts of courtsByGroup.values()) {
    if (courts.size === 1) mismaCancha += 1;
  }

  const total = blocksByGroup.size;
  return {
    gruposComoUnidad: { count: comoUnidad, total },
    gruposMismoDia: { count: mismoDia, total },
    gruposMismaCancha: { count: mismaCancha, total },
  };
}

function pairDayIndicators(
  inst: Instancia,
  previa: readonly Instancia["partidos"][string][],
  bloqueDe: Record<string, number>,
) {
  const daysByPair = new Map<string, Set<string>>();
  for (const partido of previa) {
    const bloque = blockAt(inst, bloqueDe[partido.id]);
    if (!bloque) continue;
    for (const pareja of partido.parejas ?? []) {
      const days = daysByPair.get(pareja) ?? new Set<string>();
      days.add(bloque.dayLabel);
      daysByPair.set(pareja, days);
    }
  }

  let unDia = 0;
  let dosDias = 0;
  for (const days of daysByPair.values()) {
    if (days.size === 1) unDia += 1;
    else if (days.size === 2) dosDias += 1;
  }

  return {
    parejasUnDia: { count: unDia, total: daysByPair.size },
    parejasDosDias: dosDias,
  };
}

function maxConsecutiveBlocks(
  inst: Instancia,
  bloqueDe: Record<string, number>,
): number {
  // Python arranca `best = 1` por persona ⇒ el indicador nunca baja de 1.
  let maxSeg = 1;
  for (const persona of Object.keys(inst.personas)) {
    const blocks = partidosPotenciales(inst, persona)
      .filter(
        (matchId) =>
          inst.partidos[matchId]?.phase === "previa" &&
          bloqueDe[matchId] !== undefined,
      )
      .map((matchId) => bloqueDe[matchId])
      .sort((a, b) => a - b);

    let run = 1;
    let best = 1;
    for (let i = 1; i < blocks.length; i += 1) {
      const prev = blockAt(inst, blocks[i - 1]);
      const curr = blockAt(inst, blocks[i]);
      if (blocks[i] === blocks[i - 1] + 1 && prev?.dayLabel === curr?.dayLabel) {
        run += 1;
      } else {
        run = 1;
      }
      best = Math.max(best, run);
    }
    maxSeg = Math.max(maxSeg, best);
  }
  return maxSeg;
}

function finalsAndFirstBracket(
  inst: Instancia,
  finalPhase: readonly Instancia["partidos"][string][],
  bloqueDe: Record<string, number>,
  canchaDe: CourtAssignment,
) {
  const finals: FinalSlot[] = [];
  for (const partido of finalPhase) {
    if (partido.ronda !== "final") continue;
    const bloque = blockAt(inst, bloqueDe[partido.id]);
    if (!bloque) continue;
    finals.push({
      matchId: partido.id,
      category: partido.categoria,
      dayLabel: bloque.dayLabel,
      startTime: bloque.startTime,
      court: canchaDe[partido.id] ?? null,
    });
  }
  finals.sort((a, b) => (bloqueDe[a.matchId] ?? 0) - (bloqueDe[b.matchId] ?? 0));

  // Orden de categorías = orden de inserción del record (sortOrder de DB, P-3).
  const first: BracketFirstMatch[] = [];
  for (const category of Object.keys(inst.categorias)) {
    let best: { matchId: string; blockIdx: number } | null = null;
    for (const partido of finalPhase) {
      if (partido.categoria !== category) continue;
      const blockIdx = bloqueDe[partido.id];
      if (blockIdx === undefined) continue;
      if (best === null || blockIdx < best.blockIdx) {
        best = { matchId: partido.id, blockIdx };
      }
    }
    if (best === null) continue;
    const bloque = blockAt(inst, best.blockIdx);
    if (!bloque) continue;
    first.push({
      category,
      matchId: best.matchId,
      dayLabel: bloque.dayLabel,
      startTime: bloque.startTime,
    });
  }

  return { finals, bracketFirstMatch: first };
}

/**
 * Diagnóstico completo post-solver (`resumen_calidad`). No lanza con agendas
 * parciales: los partidos sin bloque se omiten de los indicadores.
 */
export function computeDiagnosis(
  inst: Instancia,
  input: DiagnosisInput,
): DiagnosisReport {
  const params = input.params ?? DEFAULT_PARAMS;
  const canchaDe = input.canchaDe ?? {};
  const previa = partidosFase(inst, "previa");
  const finalPhase = partidosFase(inst, "final");
  const scheduledMatches = Object.values(inst.partidos).filter(
    (partido) => input.bloqueDe[partido.id] !== undefined,
  ).length;

  const extensionMatches = Object.values(input.bloqueDe).filter(
    (blockIdx) => blockAt(inst, blockIdx)?.isExtension === true,
  ).length;

  const partidosHorarioLaboral = previa.filter((partido) => {
    const bloque = blockAt(inst, input.bloqueDe[partido.id]);
    return (
      bloque !== null &&
      LABOR_DAYS.has(bloque.dayLabel) &&
      bloque.startTime < LABOR_CUTOFF
    );
  }).length;

  const { finals, bracketFirstMatch } = finalsAndFirstBracket(
    inst,
    finalPhase,
    input.bloqueDe,
    canchaDe,
  );

  return {
    status: input.status,
    objective: input.objective ?? null,
    mipGap: input.mipGap ?? null,
    timeMs: input.timeMs ?? 0,
    extensionMatches,
    occupancyByTramo: occupancyByTramo(inst, input.bloqueDe),
    ...groupIndicators(inst, previa, input.bloqueDe, canchaDe),
    ...pairDayIndicators(inst, previa, input.bloqueDe),
    maxBloquesSeguidos: maxConsecutiveBlocks(inst, input.bloqueDe),
    partidosHorarioLaboral,
    doubleCategoryClashes: doubleCategoryClashes(inst, input.bloqueDe, params),
    verificationErrors: input.verificationErrors ?? [],
    semaforo: computeSemaforo(inst),
    scheduledMatches,
    finals,
    bracketFirstMatch,
    availabilityViolations: availabilityViolations(inst, input.bloqueDe),
  };
}
