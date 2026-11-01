/**
 * Modelo de datos del spike de cancha (transición de puzzle tipo PadelChess).
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO: sin imports de `konva`, `react` ni `server-only`, sin "use client".
 * Testeable en Jest con `testEnvironment: node`.
 *
 * Orientación NORTE→SUR (reglamento FIP): eje Y 0..20 m con Y=0 en el norte y
 * Y=20 en el sur, la red cruza en Y=10; eje X 0..10 m (oeste→este). El escenario
 * se expresa SIEMPRE en metros de cancha; la conversión a píxeles vive en
 * `geometry.ts` para que el escenario completo sea serializable a JSON (AC-07).
 */

/** Ancho de la cancha en metros (eje X, oeste→este). */
export const COURT_WIDTH_M = 10;

/** Largo de la cancha en metros (eje Y, norte→sur). */
export const COURT_DEPTH_M = 20;

/** Y de la red (mitad del largo). La red cruza todo el ancho. */
export const NET_Y_M = 10;

/** Distancia reglamentaria de la línea de servicio a la red (FIP: 6,95 m). */
export const SERVICE_LINE_OFFSET_M = 6.95;

/**
 * Prolongación mínima de la línea central de saque más allá de la línea de
 * servicio hacia el fondo (FIP: 0,20 m).
 */
export const SERVICE_LINE_OVERSHOOT_M = 0.2;

/** Punto en unidades de cancha (metros), nunca píxeles. */
export type CourtPoint = { x: number; y: number };

/** Identificador de los 4 jugadores del escenario demo. */
export type PlayerId = "A" | "B" | "C" | "D";

/** Posición de cada jugador en un paso. */
export type PlayerPositions = Record<PlayerId, CourtPoint>;

/** Tiro de la pelota en un paso: la pelota NO se dibuja, sólo su flecha (verde). */
export type Shot = { from: CourtPoint; to: CourtPoint };

/**
 * Flecha de movimiento de UN jugador entre el paso anterior y el actual
 * (negra). Se DERIVA de las posiciones, nunca se persiste en el escenario.
 */
export type MovementArrow = { player: PlayerId; from: CourtPoint; to: CourtPoint };

/** Paso del puzzle: data plana y serializable (sin clases ni refs). */
export type Paso = {
  /** Índice 1-based legible (1, 2, 3...). */
  id: number;
  /** Texto alternativo del paso para la región `aria-live`. */
  label: string;
  /** Posiciones de los 4 jugadores en este paso. */
  positions: PlayerPositions;
  /** Tiro de la pelota en este paso; `null` si no hay tiro. */
  shot: Shot | null;
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
