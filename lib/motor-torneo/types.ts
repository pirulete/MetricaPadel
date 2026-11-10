/**
 * Contratos del motor de agenda de torneos (módulo PURO).
 *
 * Puerto de las dataclasses de `motor_torneo/instancia.py` + los tipos de
 * `motor_torneo/modelo.py` y `verificar.py`. Sin clases (technical-design §11):
 * las "utilidades de Instancia" se exponen como funciones puras al final del
 * archivo.
 *
 * Regla de pureza (AC-05): este módulo no importa `lib/db`, `next/*`,
 * `server-only`, `react` ni `node:fs`. Cero `Date` (P-5/EC-17): los bloques son
 * `dayLabel` + `startTime` strings.
 *
 * Nombres de campo: los de `lib/db/queries/torneos/instance.ts` (camelCase,
 * espejo del schema). El equivalente Python va en el doc de cada tipo.
 */

/** Fase del torneo (`tournament_phase` en DB). */
export type TournamentPhase = "previa" | "final";

/** Ronda (`tournament_match_round` en DB; `16vos` es DV-2 del technical-design). */
export type MatchRound =
  | "grupo"
  | "16vos"
  | "8vos"
  | "4tos"
  | "semi"
  | "final";

// ---------------------------------------------------------------------------
// Instancia (instancia.py)
// ---------------------------------------------------------------------------

/** `instancia.Bloque`: casilla de 75 min con su capacidad de canchas. */
export interface Bloque {
  idx: number;
  dayLabel: string;
  /** Hora de inicio `HH:mm`. */
  startTime: string;
  phase: TournamentPhase;
  isExtension: boolean;
  /** Canchas disponibles en este bloque (`cap`). */
  capacity: number;
}

/** Tramo del calendario: `(dia, hora_inicio, cantidad_bloques, fase, extension)`. */
export interface CalendarioTramo {
  dayLabel: string;
  startTime: string;
  blocks: number;
  phase: TournamentPhase;
  isExtension: boolean;
}

/** `instancia.Categoria` (`inst.categorias[cat]`). */
export interface Categoria {
  /** `H` | `M`. */
  sex: string;
  /** `null` cuando el import no informa nivel. */
  level: number | null;
  /** Códigos de grupo, en `sortOrder`. */
  grupos: string[];
}

/** `instancia.Grupo` (`inst.grupos[gid]`). */
export interface Grupo {
  categoria: string;
  /** Códigos de pareja, en `sortOrder`. */
  parejas: string[];
  /** `tam`: 3 o 4 (el tipo abierto viene de `tournament_groups.size`). */
  tam: number;
}

/** `instancia.Pareja`. */
export interface Pareja {
  id: string;
  categoria: string;
  grupo: string;
  /** Documentos de las 2 personas (`tuple` en Python). */
  personas: string[];
  /** Bloques de previa prohibidos (vacío = sin restricciones). */
  bloqueados: Set<number>;
}

/** `instancia.Persona` (`inst.personas[pid]`). */
export interface Persona {
  sexo: string | null;
  /** Parejas en las que juega (>1 ⇒ doble categoría). */
  parejas: string[];
}

/** `instancia.Partido`. */
export interface Partido {
  id: string;
  categoria: string;
  phase: TournamentPhase;
  ronda: MatchRound;
  /** Solo previa; `null` en el cuadro. */
  grupo: string | null;
  /** Solo previa (en el cuadro se resuelve por `alimentadores`). */
  parejas: string[] | null;
  /** Grupos cuyas parejas podrían jugar este partido (ordenado). */
  gruposOrigen: string[];
  /** Partidos que deben terminar antes (solo final). */
  alimentadores: string[];
}

/** `instancia.Instancia`: entrada completa del motor. */
export interface Instancia {
  /** Ordenados por `idx` (0..N-1). */
  bloques: Bloque[];
  nCanchas: number;
  /** Claves = códigos de categoría, en `sortOrder`. */
  categorias: Record<string, Categoria>;
  /** Claves = códigos de grupo (`3ra-G1`), en `sortOrder`. */
  grupos: Record<string, Grupo>;
  /** Claves = códigos de pareja (`3ra-G1-A`), en `sortOrder`. */
  parejas: Record<string, Pareja>;
  /** Claves = documento de persona (`P001`). */
  personas: Record<string, Persona>;
  /** Claves = código de partido (`3ra-G1-P1`). */
  partidos: Record<string, Partido>;
  /** Semilla de origen (solo fixtures/debug; ausente en la instancia de DB). */
  seed?: number;
}

// ---------------------------------------------------------------------------
// Parámetros del modelo (modelo.PARAMS)
// ---------------------------------------------------------------------------

/**
 * Política del modelo. `W_*` conservan el nombre Python porque son contrato de
 * la fixture L3 (technical-design §4.2: `params` guarda `W_*` tal cual).
 */
export interface TournamentParams {
  /** `frontera_sabado`: previa solo en bloques de previa, final solo en final. */
  fronteraSabado: boolean;
  /** `descanso_final`: bloques libres entre rondas de una categoría. */
  descansoFinal: number;
  /** `max_seguidos`: tope blando de bloques consecutivos (previa). */
  maxSeguidos: number;
  /** `bloque_final_objetivo`: las finales no antes de este bloque. */
  bloqueFinalObjetivo: number;
  /** `disponibilidad_dura`: `false` = modo relajado BR-04. */
  disponibilidadDura: boolean;
  /** `doble_dura_en`: rondas donde el choque de doble categoría es duro. */
  dobleDuraEn: MatchRound[];
  W_EXTENSION: number;
  W_DISPONIBILIDAD: number;
  W_DOBLE_BLANDO: number;
  W_DIAS: number;
  W_FINAL_TEMPRANA: number;
  W_COMPACTO: number;
  W_SEGUIDOS: number;
  W_TEMPRANO: number;
  /** `tiempo_max` (segundos) — el clamp real de ms vive en `lib/torneos/limits.ts`. */
  tiempoMax: number;
  /** `gap`: `mip_rel_gap`. */
  gap: number;
}

// ---------------------------------------------------------------------------
// Modelo MILP y solver (modelo.Modelo / highs)
// ---------------------------------------------------------------------------

export interface MilpModelStats {
  nVars: number;
  nConstraints: number;
  nNonZeros: number;
}

/**
 * MILP en forma dispersa (tripletas 0-based, lista para `toCSC()`).
 * Sin clase: un objeto plano + `buildModel()` (§11).
 */
export interface MilpModel {
  colNames: string[];
  rowNames: string[];
  lb: number[];
  ub: number[];
  /** `1` = entera (binaria), `0` = continua. */
  integrality: number[];
  cost: number[];
  /** Tripletas `(rows[k], cols[k], vals[k])`. */
  rows: number[];
  cols: number[];
  vals: number[];
  rowLo: number[];
  rowHi: number[];
  /** `x[m,b]` / `d[pj,d]` / `e[per,d,i]` → índice de columna. */
  columnByKey: Map<string, number>;
  stats: MilpModelStats;
}

export type EngineStatus =
  | "optimal"
  | "feasible_time_limit"
  | "infeasible"
  | "unbounded"
  | "error";

/** Resultado del solver: `assignment` es `matchId → bloque`. */
export interface SolveResult {
  status: EngineStatus;
  objective: number | null;
  mipGap: number | null;
  timeMs: number;
  assignment: Record<string, number>;
  message: string;
}

/** `matchId → cancha (1..N)` (post-proceso voraz). */
export type CourtAssignment = Record<string, number>;

// ---------------------------------------------------------------------------
// Verificación (verificar.py)
// ---------------------------------------------------------------------------

export type VerificationCode =
  | "missing"
  | "capacity"
  | "court_collision"
  | "court_range"
  | "person_overlap"
  | "availability"
  | "precedence"
  | "phase";

export interface VerificationError {
  code: VerificationCode;
  message: string;
  matchId?: string;
  blockIdx?: number;
  court?: number;
}

// ---------------------------------------------------------------------------
// Diagnóstico (correr.semaforo + correr.resumen_calidad)
// ---------------------------------------------------------------------------

export type SemaforoColor = "verde" | "amarillo" | "rojo";

/** ρ = partidos / casillas de la fase (sin extensión). */
export interface SemaforoPhase {
  phase: TournamentPhase;
  matches: number;
  capacity: number;
  occupancy: number;
  extensionCapacity: number;
  color: SemaforoColor;
}

export interface Semaforo {
  previa: SemaforoPhase;
  final: SemaforoPhase;
}

export interface TramoOccupancy {
  dayLabel: string;
  phase: TournamentPhase;
  isExtension: boolean;
  matches: number;
  capacity: number;
}

/** Los 6 indicadores de `resumen_calidad` + ocupación por tramo. */
export interface Diagnosis {
  status: EngineStatus;
  objective: number | null;
  mipGap: number | null;
  timeMs: number;
  extensionMatches: number;
  occupancyByTramo: TramoOccupancy[];
  /** `enteros` / total de grupos. */
  gruposComoUnidad: { count: number; total: number };
  gruposMismoDia: { count: number; total: number };
  gruposMismaCancha: { count: number; total: number };
  parejasUnDia: { count: number; total: number };
  parejasDosDias: number;
  maxBloquesSeguidos: number;
  partidosHorarioLaboral: number;
  doubleCategoryClashes: number;
  verificationErrors: VerificationError[];
}

// ---------------------------------------------------------------------------
// Utilidades de Instancia (métodos de la dataclass en Python)
// ---------------------------------------------------------------------------

/** `Instancia.bloques_fase`. */
export function bloquesFase(inst: Instancia, phase: TournamentPhase): Bloque[] {
  return inst.bloques.filter((bloque) => bloque.phase === phase);
}

/** `Instancia.partidos_fase`. Orden determinista por `id` (P-3). */
export function partidosFase(inst: Instancia, phase: TournamentPhase): Partido[] {
  return Object.values(inst.partidos)
    .filter((partido) => partido.phase === phase)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** `Instancia.personas_doble`: personas con más de una pareja. */
export function personasDoble(inst: Instancia): string[] {
  return Object.keys(inst.personas)
    .filter((personaId) => inst.personas[personaId].parejas.length > 1)
    .sort();
}

/**
 * `Instancia.partidos_potenciales`: partidos donde la persona juega (previa) o
 * podría jugar (final) según los grupos de sus parejas.
 */
export function partidosPotenciales(
  inst: Instancia,
  personaId: string,
): string[] {
  const persona = inst.personas[personaId];
  if (!persona) return [];
  const misParejas = new Set(persona.parejas);
  const misGrupos = new Set(
    persona.parejas
      .map((parejaId) => inst.parejas[parejaId]?.grupo)
      .filter((grupo): grupo is string => Boolean(grupo)),
  );

  return Object.values(inst.partidos)
    .filter((partido) => {
      if (partido.phase === "previa") {
        return (partido.parejas ?? []).some((parejaId) => misParejas.has(parejaId));
      }
      return partido.gruposOrigen.some((grupo) => misGrupos.has(grupo));
    })
    .map((partido) => partido.id)
    .sort();
}
