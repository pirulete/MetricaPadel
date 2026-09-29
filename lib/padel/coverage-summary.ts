/**
 * R5 — Resumen de cobertura dimensional (puro, sin imports server-side).
 * Importable desde client components. Las 6 categorías de rúbrica duplican
 * el enum DB `rubric_category` (mismo patrón que SHARED_CATEGORIES en pair.ts).
 */
export const RUBRIC_CATEGORIES = [
  "reglas",
  "tecnica_basica",
  "tecnica_especifica",
  "tactica",
  "fisica",
  "actitud_equipo",
] as const;

export type CoverageSummary = {
  covered: number;
  total: number;
  uncovered: string[];
  percentage: number;
};

/**
 * Resumen de cobertura dimensional para el aviso pre-publish.
 * `alreadyEvaluated` son las categorías ya publicadas del alumno.
 */
export function getCoverageSummary(
  alreadyEvaluated: Array<{ category: string }>,
  allCategories: string[]
): CoverageSummary {
  const coveredSet = new Set(alreadyEvaluated.map((e) => e.category));
  const uncovered = allCategories.filter((c) => !coveredSet.has(c));
  return {
    covered: coveredSet.size,
    total: allCategories.length,
    uncovered,
    percentage:
      allCategories.length === 0
        ? 0
        : Math.round((coveredSet.size / allCategories.length) * 100),
  };
}