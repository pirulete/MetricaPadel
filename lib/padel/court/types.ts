/**
 * Modelo de datos del spike de cancha (transición de puzzle tipo PadelChess).
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO: sin imports de `konva`, `react` ni `server-only`, sin "use client".
 * Testeable en Jest con `testEnvironment: node`.
 *
 * Homologación visual a PadelChess: cancha 10×20 m vertical (norte→sur),
 * Y=0 norte / Y=20 sur, red en Y=10, líneas de servicio a 7 m de la red.
 * El escenario se expresa SIEMPRE en metros de cancha; la conversión a píxeles
 * vive en `geometry.ts` para que el escenario sea serializable a JSON (AC-07).
 */

/** Ancho de la cancha en metros (eje X, oeste→este). */
export const COURT_WIDTH_M = 10;

/** Largo de la cancha en metros (eje Y, norte→sur). */
export const COURT_DEPTH_M = 20;

/** Y de la red (mitad del largo). La red cruza todo el ancho. */
export const NET_Y_M = 10;

/** Distancia de la línea de servicio a la red (estilo PadelChess: 7 m). */
export const SERVICE_LINE_OFFSET_M = 7;

/**
 * Prolongación de la línea central de saque más allá de la línea de servicio
 * hacia el fondo (estilo PadelChess: 0,4 m).
 */
export const SERVICE_LINE_OVERSHOOT_M = 0.4;

/** Punto en unidades de cancha (metros), nunca píxeles. */
export type CourtPoint = { x: number; y: number };

/** Identificador de los 4 jugadores del escenario demo. */
export type PlayerId = "A" | "B" | "C" | "D";

/** Posición de cada jugador en un paso. */
export type PlayerPositions = Record<PlayerId, CourtPoint>;

/**
 * Tiro de la pelota en un paso: curva Bézier cuadrática (como PadelChess,
 * que modela los tiros con `startPoint`/`controlPoint`/`endPoint`).
 * La etiqueta se dibuja en escena junto a la curva.
 */
export type Shot = {
  from: CourtPoint;
  /** Punto de control de la cuadrática (define el arco del tiro). */
  control: CourtPoint;
  to: CourtPoint;
  /** Etiqueta en escena, p. ej. "GLOBO". */
  label: string;
};

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
