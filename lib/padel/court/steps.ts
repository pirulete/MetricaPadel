/**
 * Máquina de pasos del puzzle: clamp de índice y transición determinista.
 * SPIKE NO PRODUCTIVO — borrable tras el go/no-go.
 *
 * Archivo PURO: sin imports de `konva`/`react`, sin "use client". No conoce la
 * escena ni los nodos; sólo índices.
 */

/** Dirección de la transición entre pasos. */
export type StepDirection = "forward" | "backward" | "none";

/** Transición resuelta entre dos índices de paso (0-based). */
export type StepTransition = {
  from: number;
  to: number;
  direction: StepDirection;
  /** Número de pasos saltados: |to - from|. */
  distance: number;
  /**
   * Recorrido completo, incluidos ambos extremos (`[from, ..., to]`). Un salto
   * de N a M produce exactamente la concatenación de los pasos unitarios, así
   * que el estado final es idéntico (E1/E7).
   */
  path: number[];
};

function toIndex(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

/**
 * Acota un índice al rango válido de `steps` (0..totalSteps-1). Resultado
 * usable directamente como índice de array; "anterior" en 0 y "siguiente" en
 * el último paso son no-ops (E4). `totalSteps <= 0` → 0.
 */
export function clampStepIndex(index: number, totalSteps: number): number {
  const total = toIndex(totalSteps);
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, toIndex(index)));
}

/**
 * Resuelve la transición `from → to` sin animar. Determinista y conmutativa en
 * su resultado final: saltar 0→3 termina en el mismo índice y recorre el mismo
 * path que componer 0→1→2→3, de modo que el caller puede hacer snap al destino
 * aunque lleguen toggles en ráfaga (E1/E7).
 */
export function resolveStepTransition(from: number, to: number): StepTransition {
  const start = toIndex(from);
  const end = toIndex(to);
  if (start === end) {
    return { from: start, to: end, direction: "none", distance: 0, path: [start] };
  }
  const step = end > start ? 1 : -1;
  const path: number[] = [];
  for (let i = start; i !== end; i += step) path.push(i);
  path.push(end);
  return {
    from: start,
    to: end,
    direction: step > 0 ? "forward" : "backward",
    distance: Math.abs(end - start),
    path,
  };
}

/** `true` si ambos índices apuntan al mismo paso (evita tweens innecesarios). */
export function isSameStep(a: number, b: number): boolean {
  return toIndex(a) === toIndex(b);
}
