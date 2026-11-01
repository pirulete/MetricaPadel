/**
 * Modelo de datos del spike de cancha (transición de puzzle tipo PadelChess).
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO: sin imports de `konva`, `react` ni `server-only`, sin "use client".
 * Testeable en Jest con `testEnvironment: node`.
 *
 * Convención de unidades: el escenario se expresa SIEMPRE en metros de cancha
 * (eje X 0..COURT_WIDTH_M, eje Y 0..COURT_DEPTH_M). La conversión a píxeles vive
 * en `geometry.ts` para que el escenario completo sea serializable a JSON (AC-07).
 */

/** Ancho de la cancha de referencia en metros (eje X). */
export const COURT_WIDTH_M = 20;

/** Fondo de la cancha de referencia en metros (eje Y). */
export const COURT_DEPTH_M = 10;

/** Punto en unidades de cancha (metros), nunca píxeles. */
export type CourtPoint = { x: number; y: number };

/** Identificador de los 4 jugadores del escenario demo. */
export type PlayerId = "A" | "B" | "C" | "D";

/** Posición de cada jugador en un paso. */
export type PlayerPositions = Record<PlayerId, CourtPoint>;

/** Trayectoria del tiro de un paso (quién golpea y desde/hacia dónde). */
export type Trajectory = { player: PlayerId; from: CourtPoint; to: CourtPoint };

/** Paso del puzzle: data plana y serializable (sin clases ni refs). */
export type Paso = {
  /** Índice 1-based legible (1, 2, 3...). */
  id: number;
  /** Texto alternativo del paso para la región `aria-live`. */
  label: string;
  /** Posiciones de los 4 jugadores en este paso. */
  positions: PlayerPositions;
  /** Tiro a dibujar en este paso; `null` si el paso no traza trayectoria. */
  trajectory: Trajectory | null;
};

/** Escenario completo: paso inicial + lista ordenada de pasos. */
export type CourtScenario = {
  id: string;
  title: string;
  /** Índice (0-based) del paso con el que se monta la escena. */
  initialStepIndex: number;
  steps: Paso[];
};

/** Viewport del contenedor (CSS px) + ratio de píxeles del dispositivo. */
export type CourtViewport = { width: number; height: number; dpr: number };
