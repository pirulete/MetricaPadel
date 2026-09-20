/**
 * Cálculo puro de sortOrders para reorder de secciones.
 * Paso incremental (1024) para minimizar rewrites en el futuro.
 */
export function computeSortOrders(
  sectionIds: string[],
  step = 1024
): Record<string, number> {
  return sectionIds.reduce<Record<string, number>>((acc, id, index) => {
    acc[id] = index * step;
    return acc;
  }, {});
}
