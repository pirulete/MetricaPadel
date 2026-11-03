/**
 * Derivación del paso del flujo del editor (① Paso → ⑤ Guarda).
 *
 * Archivo PURO: sin `react`, sin `konva`, sin `server-only`, sin `localStorage`.
 * El paso es **estado derivado** de señales que `editor-screen` ya mantiene
 * (`steps.length`, `selected`, `step.shot`, `dirty`, `previewing`): no añade
 * estado nuevo ni persistencia.
 *
 * Prioridad (determinista, primera regla que aplica gana):
 *   1. sin pasos            → ① Paso (crear el primero)
 *   2. `previewing`         → ④ Prueba (manda sobre cualquier otro estado)
 *   3. documento limpio     → ⑤ Guarda (todo guardado)
 *   4. jugador seleccionado → ② Mueve
 *   5. paso sin tiro        → ③ Tiro
 *   6. resto (sólo falta guardar) → ⑤ Guarda
 */

import type { PlayerId } from "./types";

/** Índice del flujo del editor (1..5). */
export type FlowStep = 1 | 2 | 3 | 4 | 5;

/** Señales de las que se deriva el paso activo. */
export type FlowSignals = {
  /** Cantidad de pasos del documento. */
  stepsCount: number;
  /** Jugador seleccionado en el canvas (`null` = nada seleccionado). */
  selected: PlayerId | null;
  /** El paso activo ya tiene tiro fijado. */
  hasShot: boolean;
  /** Hay cambios sin guardar. */
  dirty: boolean;
  /** Se está reproduciendo el preview en memoria. */
  previewing: boolean;
};

/** Cantidad de pasos del flujo. */
export const FLOW_STEP_COUNT = 5;

export function deriveFlowStep({
  stepsCount,
  selected,
  hasShot,
  dirty,
  previewing,
}: FlowSignals): FlowStep {
  if (stepsCount <= 0) return 1;
  if (previewing) return 4;
  if (!dirty) return 5;
  if (selected !== null) return 2;
  if (!hasShot) return 3;
  return 5;
}
