/**
 * Operaciones puras del editor de transiciones (pasos, jugadores y tiros).
 *
 * Archivo PURO: sin imports de `konva`/`react`, sin "use client". Testeable en
 * Jest con `testEnvironment: node`. Nunca muta el paso/array recibido: todas
 * las funciones devuelven estructuras nuevas (serializables a JSON, AC-02).
 *
 * La selección (`selected: PlayerId | null`) es estado de UI y vive FUERA de
 * este módulo (F8): aquí sólo se transforman escenarios.
 */

import { resolveHitter } from "./annotation";
import { clampCourtPoint } from "./geometry";
import { nextStepId } from "./transition";
import { NET_Y_M, type CourtPoint, type Paso, type PlayerId, type Shot } from "./types";

/** Desplazamiento de los nudges del context bar (metros). */
export const NUDGE_M = 0.5;

/** Etiqueta por defecto de un tiro nuevo (schema: 1..40 chars). */
export const DEFAULT_SHOT_LABEL = "GOLPE";

/** Largo máximo de la etiqueta de un tiro. */
const SHOT_LABEL_MAX = 40;

/** Largo máximo de la etiqueta de un paso. */
const STEP_LABEL_MAX = 200;

/** Resultado de `removeStep` (EC-05: el escenario exige ≥1 paso). */
type RemoveStepResult = { ok: true; steps: Paso[] } | { ok: false; reason: "last_step" };

/** Tipo de delta 2D usado por los nudges. */
export type Delta = { x: number; y: number };

/** Copia profunda de un paso (`Paso` es data plana y serializable). */
const cloneStep = (step: Paso): Paso => structuredClone(step);

function midpoint(from: CourtPoint, to: CourtPoint): CourtPoint {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

/** Y del jugador MÁS ALEJADO de la red (desempate: orden estable de jugadores). */
function farPlayerY(step: Paso): number {
  let farY = NET_Y_M;
  let farDistance = -1;
  for (const id of ["A", "B", "C", "D"] as const) {
    const { y } = step.positions[id];
    const distance = Math.abs(y - NET_Y_M);
    if (distance > farDistance) {
      farDistance = distance;
      farY = y;
    }
  }
  return farY;
}

/** Destino por defecto del tiro (F9): fondo de la mitad del jugador más profundo. */
function defaultShotTarget(step: Paso): CourtPoint {
  return farPlayerY(step) < NET_Y_M ? { x: 5, y: 2 } : { x: 5, y: 18 };
}

function withShot(step: Paso, shot: Shot | null): Paso {
  return { ...step, shot };
}

/** Mueve un jugador a `point` (recortado a la cancha, EC-10). */
export function movePlayer(step: Paso, id: PlayerId, point: CourtPoint): Paso {
  return {
    ...step,
    positions: { ...step.positions, [id]: clampCourtPoint(point) },
  };
}

/** Desplaza un jugador por `delta` metros (nudges ±0.5 del context bar). */
export function nudgePlayer(step: Paso, id: PlayerId, delta: Delta): Paso {
  const current = step.positions[id];
  return movePlayer(step, id, { x: current.x + delta.x, y: current.y + delta.y });
}

/** Mueve el destino del tiro; no-op si el paso no tiene tiro. */
export function moveShotTo(step: Paso, to: CourtPoint): Paso {
  if (!step.shot) return step;
  return withShot(step, { ...step.shot, to: clampCourtPoint(to) });
}

/** Mueve el punto de control de la curva; no-op si el paso no tiene tiro. */
export function moveShotControl(step: Paso, control: CourtPoint): Paso {
  if (!step.shot) return step;
  return withShot(step, { ...step.shot, control: clampCourtPoint(control) });
}

/** Quita el tiro del paso (idempotente). */
export function clearShot(step: Paso): Paso {
  return withShot(step, null);
}

/**
 * Crea/fija el tiro del paso (F9). El ORIGEN no se persiste: se deriva del
 * jugador más cercano al destino (`resolveHitter`). `control` por defecto es el
 * punto medio origen→destino; la etiqueta existente se conserva.
 */
export function setShot(step: Paso, to?: CourtPoint, control?: CourtPoint): Paso {
  const target = clampCourtPoint(to ?? defaultShotTarget(step));
  const from = step.positions[resolveHitter(step.positions, target)];
  const curve = clampCourtPoint(control ?? midpoint(from, target));
  const label = step.shot?.label.trim().slice(0, SHOT_LABEL_MAX) || DEFAULT_SHOT_LABEL;
  return withShot(step, { control: curve, to: target, label });
}

function defaultStep(id: number, label: string, step: Paso): Paso {
  return { ...cloneStep(step), id, label: label.slice(0, STEP_LABEL_MAX), shot: null };
}

/** Añade un paso al final copiando posiciones del último (tiro vacío). */
export function addStep(steps: readonly Paso[]): Paso[] {
  const last = steps[steps.length - 1];
  const base = last ?? {
    id: 1,
    label: "Paso 1",
    positions: { A: { x: 3, y: 4 }, B: { x: 7, y: 4 }, C: { x: 3, y: 16 }, D: { x: 7, y: 16 } },
    shot: null,
  };
  const id = nextStepId(steps);
  return [...steps.map(cloneStep), defaultStep(id, `Paso ${id}`, base)];
}

/** Duplica el paso `index` justo después de él (nuevo `id`, tiro copiado). */
export function duplicateStep(steps: readonly Paso[], index: number): Paso[] {
  if (steps.length === 0) return addStep(steps);
  const at = Math.min(steps.length - 1, Math.max(0, Math.trunc(index)));
  const source = steps[at];
  const id = nextStepId(steps);
  const copy: Paso = { ...cloneStep(source), id, label: `${source.label} (copia)`.slice(0, STEP_LABEL_MAX) };
  return [...steps.slice(0, at + 1).map(cloneStep), copy, ...steps.slice(at + 1).map(cloneStep)];
}

/** Borra el paso `index`. Si es el único paso → `{ ok:false, reason:"last_step" }`. */
export function removeStep(steps: readonly Paso[], index: number): RemoveStepResult {
  if (steps.length <= 1) return { ok: false, reason: "last_step" };
  const at = Math.min(steps.length - 1, Math.max(0, Math.trunc(index)));
  return { ok: true, steps: steps.filter((_, i) => i !== at).map(cloneStep) };
}

/** Reordena el paso `from` a la posición `to` (ids estables, sin renumerar). */
export function reorderSteps(steps: readonly Paso[], from: number, to: number): Paso[] {
  const next = steps.map(cloneStep);
  if (next.length === 0) return next;
  const at = Math.min(next.length - 1, Math.max(0, Math.trunc(from)));
  const target = Math.min(next.length - 1, Math.max(0, Math.trunc(to)));
  if (at === target) return next;
  const [moved] = next.splice(at, 1);
  next.splice(target, 0, moved);
  return next;
}
