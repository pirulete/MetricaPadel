/**
 * Historial undo/redo por snapshots (editor de transiciones del coach).
 *
 * Archivo PURO: sin imports de `konva`/`react`, sin "use client". Testeable en
 * Jest con `testEnvironment: node`. Cada snapshot es inmutable: nunca se muta
 * `present`/`past`/`future`, se devuelven estructuras nuevas.
 *
 * Semántica (EC-01): undo/redo sin entradas son no-ops que devuelven el MISMO
 * estado (identidad), para que el reducer de React no re-renderice de más.
 */

/** Límite de pasos deshacibles (memoria acotada, AC-06). */
export const HISTORY_LIMIT = 50;

/** Estado del historial: presente + pila de deshacer + pila de rehacer. */
export type HistoryState<T> = {
  present: T;
  /** Más reciente al final; nunca supera `HISTORY_LIMIT`. */
  past: T[];
  /** Más reciente al final; se vacía en cada `commit`. */
  future: T[];
};

/** Crea un historial con un único snapshot presente. */
export function createHistory<T>(present: T): HistoryState<T> {
  return { present, past: [], future: [] };
}

/**
 * Registra un snapshot nuevo como presente y descarta el futuro. Si `next` es
 * el MISMO objeto que `present` no hay cambio: devuelve el estado intacto.
 */
export function commit<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  return {
    present: next,
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  };
}

/** Deshace el último commit. Sin historial → mismo estado (no-op). */
export function undo<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    present: previous,
    past: history.past.slice(0, -1),
    future: [...history.future, history.present],
  };
}

/** Rehace el último undo. Sin futuro → mismo estado (no-op). */
export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[history.future.length - 1];
  if (next === undefined) return history;
  return {
    present: next,
    past: [...history.past, history.present],
    future: history.future.slice(0, -1),
  };
}

/** `true` si `undo` cambiaría el presente. */
export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

/** `true` si `redo` cambiaría el presente. */
export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}
