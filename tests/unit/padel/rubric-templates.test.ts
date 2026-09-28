/**
 * Unit tests de la plantilla integral de rúbrica (lib/padel/rubric-templates.ts).
 * @jest-environment node
 */
import { RUBRICA_INTEGRAL_TEMPLATE } from "@/lib/padel/rubric-templates";

const VALID_CATEGORIES = [
  "reglas",
  "tecnica_basica",
  "tecnica_especifica",
  "tactica",
  "fisica",
  "actitud_equipo",
];

describe("RUBRICA_INTEGRAL_TEMPLATE", () => {
  it("tiene las 6 dimensiones/categorías esperadas", () => {
    expect(RUBRICA_INTEGRAL_TEMPLATE.criteria).toHaveLength(6);
  });

  it("cada criterio tiene 4 niveles (descriptores)", () => {
    for (const c of RUBRICA_INTEGRAL_TEMPLATE.criteria) {
      expect(c.descriptors).toHaveLength(4);
    }
  });

  it("los niveles mapean a scores 4/3/2/1 (Excelente→4 … En desarrollo→1)", () => {
    const expectedScores = [4, 3, 2, 1];
    for (const c of RUBRICA_INTEGRAL_TEMPLATE.criteria) {
      expect(c.descriptors.map((_, i) => 4 - i)).toEqual(expectedScores);
    }
  });

  it("todos los descriptores están completos (no vacíos)", () => {
    for (const c of RUBRICA_INTEGRAL_TEMPLATE.criteria) {
      expect(c.name.trim()).not.toBe("");
      for (const d of c.descriptors) {
        expect(d.trim()).not.toBe("");
      }
    }
  });

  it("la categoría es válida dentro del enum rubric_category", () => {
    expect(VALID_CATEGORIES).toContain(RUBRICA_INTEGRAL_TEMPLATE.category);
  });

  it("el título no está vacío", () => {
    expect(RUBRICA_INTEGRAL_TEMPLATE.title.trim()).not.toBe("");
  });
});