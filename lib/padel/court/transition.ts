/**
 * Serialización del documento de transición: DB ↔ `CourtScenario`.
 *
 * Archivo PURO (sin `konva`/`react`/`server-only`). Lo que la tabla
 * `coach_transitions` guarda en `scenario` es SÓLO `{ initialStepIndex, steps }`;
 * `id` y `title` viven en columnas (D-03/AC-02).
 */

import { clampStepIndex } from "./steps";
import { type CourtScenario, type Paso, type PlayerPositions } from "./types";

/** Payload jsonb tal como vive en `coach_transitions.scenario`. */
type TransitionScenarioData = {
  initialStepIndex: number;
  steps: Paso[];
};

/** Fila mínima de `coach_transitions` necesaria para reconstruir el escenario. */
export type TransitionRow = {
  id: string;
  title: string;
  scenario: TransitionScenarioData;
};

/** Plantilla de 4 jugadores en formación inicial (metros de cancha). */
export const DEFAULT_POSITIONS: PlayerPositions = {
  A: { x: 3, y: 4 },
  B: { x: 7, y: 4 },
  C: { x: 3, y: 16 },
  D: { x: 7, y: 16 },
};

const DEFAULT_TITLE = "Nueva transición";

/** Siguiente `id` legible (1-based) del escenario: `max(id) + 1`. */
export function nextStepId(steps: readonly Paso[]): number {
  return steps.reduce((max, step) => (Number.isFinite(step.id) && step.id > max ? step.id : max), 0) + 1;
}

/** Documento inicial: 1 paso, sin tiro, título por defecto. */
export function emptyTransitionDoc(title: string = DEFAULT_TITLE): TransitionScenarioData & { title: string } {
  return {
    title,
    initialStepIndex: 0,
    steps: [
      {
        id: 1,
        label: "Paso 1",
        positions: structuredClone(DEFAULT_POSITIONS),
        shot: null,
      },
    ],
  };
}

/**
 * Reconstruye el `CourtScenario` completo que consume `CourtStage`/`EditorStage`
 * desde la fila de DB. Copia profunda de los pasos (el caller puede mutarlos
 * vía reducer sin tocar el origen) y acota `initialStepIndex`.
 */
export function toCourtScenario(row: TransitionRow): CourtScenario {
  // Copia profunda + whitelist: los pasos llegan de jsonb y sólo se expone la
  // forma `Paso` (AC-02), sin campos extra que pueda arrastrar la fila.
  const steps = row.scenario.steps.map(({ id, label, positions, shot }) => ({
    id,
    label,
    positions: structuredClone(positions),
    shot: shot
      ? { control: structuredClone(shot.control), to: structuredClone(shot.to), label: shot.label }
      : null,
  }));

  return {
    id: row.id,
    title: row.title.trim() || DEFAULT_TITLE,
    initialStepIndex: clampStepIndex(row.scenario.initialStepIndex, steps.length),
    steps,
  };
}
