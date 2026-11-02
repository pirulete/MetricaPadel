/**
 * Unit tests de los schemas Zod del editor de transiciones
 * (lib/validations/padel.ts, F1 / D-15).
 * @jest-environment node
 */
import {
  transitionCreateSchema,
  transitionPointSchema,
  transitionScenarioSchema,
  transitionShotSchema,
  transitionStepSchema,
} from "@/lib/validations/padel";
import { COURT_DEPTH_M, COURT_WIDTH_M } from "@/lib/padel/court/types";

const VALID_STEP = {
  id: 1,
  label: "Paso 1",
  positions: {
    A: { x: 3, y: 4 },
    B: { x: 7, y: 4 },
    C: { x: 3, y: 16 },
    D: { x: 7, y: 16 },
  },
  shot: null,
};

const validBody = () => ({
  title: "Transición",
  initialStepIndex: 0,
  steps: [structuredClone(VALID_STEP)],
});

/** Rutas de los issues, para no acoplar los tests a los mensajes. */
const errorPaths = (result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
  (result.error?.issues ?? []).map((issue) => issue.path.join("."));

describe("transitionPointSchema — coordenadas de cancha", () => {
  it("acepta esquinas y centro (0..10 × 0..20)", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: COURT_WIDTH_M, y: COURT_DEPTH_M },
      { x: 5, y: 10 },
    ]) {
      expect(transitionPointSchema.safeParse(point).success).toBe(true);
    }
  });

  it("rechaza coordenadas fuera de la cancha", () => {
    expect(transitionPointSchema.safeParse({ x: COURT_WIDTH_M + 0.1, y: 5 }).success).toBe(false);
    expect(transitionPointSchema.safeParse({ x: 5, y: COURT_DEPTH_M + 0.1 }).success).toBe(false);
    expect(transitionPointSchema.safeParse({ x: -0.1, y: 5 }).success).toBe(false);
    expect(transitionPointSchema.safeParse({ x: 5, y: -1 }).success).toBe(false);
  });

  it("rechaza puntos incompletos o no numéricos", () => {
    expect(transitionPointSchema.safeParse({ x: 5 }).success).toBe(false);
    expect(transitionPointSchema.safeParse({ x: "5", y: 5 }).success).toBe(false);
    expect(transitionPointSchema.safeParse({}).success).toBe(false);
  });
});

describe("transitionShotSchema — tiro opcional", () => {
  it("acepta null (paso sin tiro)", () => {
    expect(transitionShotSchema.safeParse(null).success).toBe(true);
  });

  it("acepta una curva con control, to y label", () => {
    const result = transitionShotSchema.safeParse({
      control: { x: 4, y: 3 },
      to: { x: 5, y: 2 },
      label: "CRUZADO",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza label vacío o de más de 40 caracteres", () => {
    const base = { control: { x: 4, y: 3 }, to: { x: 5, y: 2 } };
    expect(transitionShotSchema.safeParse({ ...base, label: "   " }).success).toBe(false);
    expect(transitionShotSchema.safeParse({ ...base, label: "A".repeat(41) }).success).toBe(false);
    expect(transitionShotSchema.safeParse({ ...base, label: "A".repeat(40) }).success).toBe(true);
  });

  it("rechaza un destino fuera de la cancha", () => {
    expect(
      transitionShotSchema.safeParse({ control: { x: 4, y: 3 }, to: { x: 99, y: 2 }, label: "X" }).success,
    ).toBe(false);
  });
});

describe("transitionStepSchema — 4 jugadores", () => {
  it("acepta un paso válido", () => {
    expect(transitionStepSchema.safeParse(structuredClone(VALID_STEP)).success).toBe(true);
  });

  it("rechaza posiciones incompletas", () => {
    const step = structuredClone(VALID_STEP) as Record<string, unknown>;
    delete (step.positions as Record<string, unknown>).D;
    const result = transitionStepSchema.safeParse(step);
    expect(result.success).toBe(false);
    expect(errorPaths(result)).toEqual(["positions.D"]);
  });

  it("rechaza un jugador fuera de la cancha", () => {
    const step = structuredClone(VALID_STEP);
    step.positions.B = { x: 10.5, y: 4 };
    const result = transitionStepSchema.safeParse(step);
    expect(result.success).toBe(false);
    expect(errorPaths(result)).toEqual(["positions.B.x"]);
  });

  it("rechaza id no entero o menor que 1", () => {
    expect(transitionStepSchema.safeParse({ ...structuredClone(VALID_STEP), id: 0 }).success).toBe(false);
    expect(transitionStepSchema.safeParse({ ...structuredClone(VALID_STEP), id: 1.5 }).success).toBe(false);
  });

  it("rechaza label de paso vacío o mayor de 200 caracteres", () => {
    expect(transitionStepSchema.safeParse({ ...structuredClone(VALID_STEP), label: "  " }).success).toBe(false);
    expect(
      transitionStepSchema.safeParse({ ...structuredClone(VALID_STEP), label: "A".repeat(201) }).success,
    ).toBe(false);
  });
});

describe("transitionCreateSchema — body de POST/PUT", () => {
  it("acepta un body válido y recorta el title", () => {
    const result = transitionCreateSchema.safeParse({ ...validBody(), title: "  Jugada  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("Jugada");
  });

  it("rechaza title vacío o de más de 200 caracteres", () => {
    expect(transitionCreateSchema.safeParse({ ...validBody(), title: "" }).success).toBe(false);
    expect(transitionCreateSchema.safeParse({ ...validBody(), title: "   " }).success).toBe(false);
    expect(transitionCreateSchema.safeParse({ ...validBody(), title: "A".repeat(201) }).success).toBe(false);
    expect(transitionCreateSchema.safeParse({ ...validBody(), title: "A".repeat(200) }).success).toBe(true);
  });

  it("exige el title (viene del .extend, F1)", () => {
    const body = validBody() as Record<string, unknown>;
    delete body.title;
    const result = transitionCreateSchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(errorPaths(result)).toEqual(["title"]);
  });

  it("rechaza steps vacíos", () => {
    const result = transitionCreateSchema.safeParse({ ...validBody(), steps: [] });
    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain("steps");
  });

  it("rechaza más de 50 pasos", () => {
    const steps = Array.from({ length: 51 }, (_, i) => ({ ...structuredClone(VALID_STEP), id: i + 1 }));
    expect(transitionCreateSchema.safeParse({ ...validBody(), steps }).success).toBe(false);
  });

  it("rechaza initialStepIndex negativo o no entero", () => {
    expect(transitionCreateSchema.safeParse({ ...validBody(), initialStepIndex: -1 }).success).toBe(false);
    expect(transitionCreateSchema.safeParse({ ...validBody(), initialStepIndex: 0.5 }).success).toBe(false);
  });

  it("F1: el superRefine sigue activo después del .extend", () => {
    const result = transitionCreateSchema.safeParse({
      ...validBody(),
      initialStepIndex: 3,
      steps: [structuredClone(VALID_STEP)],
    });
    expect(result.success).toBe(false);
    expect(errorPaths(result)).toEqual(["initialStepIndex"]);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("initialStepIndex fuera de rango");
    }
  });

  it("F1: acepta initialStepIndex dentro de rango con varios pasos", () => {
    const steps = [1, 2, 3].map((id) => ({ ...structuredClone(VALID_STEP), id }));
    expect(transitionCreateSchema.safeParse({ ...validBody(), initialStepIndex: 2, steps }).success).toBe(true);
  });
});

describe("transitionScenarioSchema — lectura de DB (F10)", () => {
  it("no exige title y comparte el refine con el body de API", () => {
    expect(transitionScenarioSchema.safeParse(validBody()).success).toBe(true);

    const outOfRange = transitionScenarioSchema.safeParse({ ...validBody(), initialStepIndex: 9 });
    expect(outOfRange.success).toBe(false);
    expect(errorPaths(outOfRange)).toEqual(["initialStepIndex"]);
  });

  it("rechaza un escenario corrupto de DB", () => {
    expect(transitionScenarioSchema.safeParse(null).success).toBe(false);
    expect(transitionScenarioSchema.safeParse({ steps: [] }).success).toBe(false);
    expect(transitionScenarioSchema.safeParse({ initialStepIndex: 0, steps: [{}] }).success).toBe(false);
  });
});
