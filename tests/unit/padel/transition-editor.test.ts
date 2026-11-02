/**
 * Unit tests de las operaciones puras del editor de transiciones
 * (lib/padel/court/editor.ts, AC-05/EC-05/EC-10).
 * @jest-environment node
 */
import {
  DEFAULT_SHOT_LABEL,
  addStep,
  clearShot,
  duplicateStep,
  movePlayer,
  moveShotControl,
  moveShotTo,
  nudgePlayer,
  removeStep,
  reorderSteps,
  setShot,
} from "@/lib/padel/court/editor";
import { COURT_DEPTH_M, COURT_WIDTH_M, type Paso } from "@/lib/padel/court/types";

function makeStep(id = 1, overrides: Partial<Paso> = {}): Paso {
  return {
    id,
    label: `Paso ${id}`,
    positions: {
      A: { x: 3, y: 4 },
      B: { x: 7, y: 4 },
      C: { x: 3, y: 16 },
      D: { x: 7, y: 16 },
    },
    shot: null,
    ...overrides,
  };
}

/** Serializa para comparar sin acoplarse a identidad de referencias. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("movePlayer / nudgePlayer — clamp EC-10", () => {
  it("mueve al jugador al punto pedido", () => {
    const next = movePlayer(makeStep(), "A", { x: 5, y: 6 });
    expect(next.positions.A).toEqual({ x: 5, y: 6 });
    expect(next.positions.B).toEqual({ x: 7, y: 4 });
  });

  it("recorta a los límites de la cancha", () => {
    expect(movePlayer(makeStep(), "C", { x: -4, y: -1 }).positions.C).toEqual({ x: 0, y: 0 });
    expect(movePlayer(makeStep(), "C", { x: 99, y: 99 }).positions.C).toEqual({
      x: COURT_WIDTH_M,
      y: COURT_DEPTH_M,
    });
  });

  it("no muta el paso de entrada", () => {
    const step = makeStep();
    const snapshot = plain(step);
    movePlayer(step, "A", { x: 9, y: 9 });
    expect(step).toEqual(snapshot);
  });

  it("nudgePlayer aplica el delta y vuelve a recortar", () => {
    const step = makeStep();
    expect(nudgePlayer(step, "A", { x: 0.5, y: -0.5 }).positions.A).toEqual({ x: 3.5, y: 3.5 });
    expect(nudgePlayer(step, "A", { x: -50, y: 0 }).positions.A).toEqual({ x: 0, y: 4 });
  });
});

describe("setShot — F9 (origen derivado, control por defecto)", () => {
  it("sin argumentos usa el fondo de la mitad del jugador más profundo y etiqueta por defecto", () => {
    const next = setShot(makeStep());
    expect(next.shot).toEqual({ control: { x: 4, y: 3 }, to: { x: 5, y: 2 }, label: DEFAULT_SHOT_LABEL });
  });

  it("respeta `to` explícito y calcula el control como punto medio del jugador más cercano", () => {
    const next = setShot(makeStep(), { x: 2, y: 18 });
    expect(next.shot?.to).toEqual({ x: 2, y: 18 });
    expect(next.shot?.control).toEqual({ x: 2.5, y: 17 });
  });

  it("usa el control explícito y recorta ambos puntos", () => {
    const next = setShot(makeStep(), { x: 20, y: -5 }, { x: -3, y: 40 });
    expect(next.shot?.to).toEqual({ x: COURT_WIDTH_M, y: 0 });
    expect(next.shot?.control).toEqual({ x: 0, y: COURT_DEPTH_M });
  });

  it("conserva la etiqueta existente y cae al default si es blanca", () => {
    const labelled = makeStep(1, {
      shot: { control: { x: 4, y: 3 }, to: { x: 5, y: 2 }, label: "CRUZADO" },
    });
    expect(setShot(labelled).shot?.label).toBe("CRUZADO");

    const blank = makeStep(1, { shot: { control: { x: 4, y: 3 }, to: { x: 5, y: 2 }, label: "   " } });
    expect(setShot(blank).shot?.label).toBe(DEFAULT_SHOT_LABEL);
  });

  it("no muta el paso de entrada", () => {
    const step = makeStep();
    const snapshot = plain(step);
    setShot(step, { x: 5, y: 2 });
    expect(step).toEqual(snapshot);
  });
});

describe("moveShotTo / moveShotControl / clearShot", () => {
  const withShot = () =>
    makeStep(1, { shot: { control: { x: 4, y: 3 }, to: { x: 5, y: 2 }, label: "CRUZADO" } });

  it("mueve destino y control con clamp", () => {
    expect(moveShotTo(withShot(), { x: -1, y: 30 }).shot?.to).toEqual({ x: 0, y: COURT_DEPTH_M });
    expect(moveShotControl(withShot(), { x: 30, y: -1 }).shot?.control).toEqual({ x: COURT_WIDTH_M, y: 0 });
  });

  it("es no-op sobre un paso sin tiro", () => {
    const step = makeStep();
    expect(moveShotTo(step, { x: 1, y: 1 })).toBe(step);
    expect(moveShotControl(step, { x: 1, y: 1 })).toBe(step);
  });

  it("clearShot quita el tiro y es idempotente", () => {
    expect(clearShot(withShot()).shot).toBeNull();
    expect(clearShot(makeStep()).shot).toBeNull();
  });
});

describe("addStep — append con id único y ≥1 paso", () => {
  it("desde lista vacía crea el paso inicial con id 1", () => {
    const steps = addStep([]);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe(1);
    expect(steps[0].shot).toBeNull();
    expect(Object.keys(steps[0].positions)).toEqual(["A", "B", "C", "D"]);
  });

  it("copia las posiciones del último paso y deja el tiro vacío", () => {
    const last = makeStep(2, {
      positions: { A: { x: 1, y: 2 }, B: { x: 2, y: 3 }, C: { x: 3, y: 4 }, D: { x: 4, y: 5 } },
      shot: { control: { x: 5, y: 5 }, to: { x: 5, y: 8 }, label: "X" },
    });
    const steps = addStep([makeStep(1), last]);
    expect(steps).toHaveLength(3);
    expect(steps[2].id).toBe(3);
    expect(steps[2].label).toBe("Paso 3");
    expect(steps[2].positions).toEqual(last.positions);
    expect(steps[2].positions).not.toBe(last.positions);
    expect(steps[2].shot).toBeNull();
  });

  it("no muta la lista de entrada", () => {
    const input = [makeStep(1)];
    const snapshot = plain(input);
    addStep(input);
    expect(input).toEqual(snapshot);
  });
});

describe("duplicateStep", () => {
  it("inserta la copia justo después con id nuevo y sufijo (copia)", () => {
    const steps = duplicateStep([makeStep(1), makeStep(2), makeStep(3)], 1);
    expect(steps.map((s) => s.id)).toEqual([1, 2, 4, 3]);
    expect(steps[2].label).toBe("Paso 2 (copia)");
  });

  it("copia el tiro como referencia nueva", () => {
    const source = makeStep(1, { shot: { control: { x: 4, y: 3 }, to: { x: 5, y: 2 }, label: "CRUZADO" } });
    const steps = duplicateStep([source], 0);
    expect(steps[1].shot).toEqual(source.shot);
    expect(steps[1].shot).not.toBe(source.shot);
  });

  it("acota el índice fuera de rango", () => {
    const steps = duplicateStep([makeStep(1), makeStep(2)], 99);
    expect(steps[2].label).toBe("Paso 2 (copia)");
    const negative = duplicateStep([makeStep(1), makeStep(2)], -3);
    expect(negative[1].label).toBe("Paso 1 (copia)");
  });

  it("sobre lista vacía delega en addStep", () => {
    expect(duplicateStep([], 0)).toHaveLength(1);
  });
});

describe("removeStep — EC-05 (nunca deja 0 pasos)", () => {
  it("rechaza borrar el único paso", () => {
    expect(removeStep([makeStep(1)], 0)).toEqual({ ok: false, reason: "last_step" });
    expect(removeStep([], 0)).toEqual({ ok: false, reason: "last_step" });
  });

  it("borra el índice pedido dejando los demás pasos", () => {
    const result = removeStep([makeStep(1), makeStep(2), makeStep(3)], 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.steps.map((s) => s.id)).toEqual([1, 3]);
  });

  it("acota índices fuera de rango al último paso", () => {
    const result = removeStep([makeStep(1), makeStep(2)], 42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.steps.map((s) => s.id)).toEqual([1]);
  });
});

describe("reorderSteps — ids estables", () => {
  it("mueve un paso de posición sin renumerar", () => {
    const steps = reorderSteps([makeStep(1), makeStep(2), makeStep(3)], 0, 2);
    expect(steps.map((s) => s.id)).toEqual([2, 3, 1]);
  });

  it("from === to devuelve el mismo orden", () => {
    const steps = [makeStep(1), makeStep(2)];
    expect(reorderSteps(steps, 1, 1).map((s) => s.id)).toEqual([1, 2]);
  });

  it("acota índices fuera de rango", () => {
    expect(reorderSteps([makeStep(1), makeStep(2)], -5, 99).map((s) => s.id)).toEqual([2, 1]);
  });

  it("no muta la lista de entrada", () => {
    const input = [makeStep(1), makeStep(2), makeStep(3)];
    const snapshot = plain(input);
    reorderSteps(input, 2, 0);
    expect(input).toEqual(snapshot);
  });
});

describe("invariantes globales (determinismo + ids únicos)", () => {
  it("mismas entradas → mismo resultado (determinista y sin refs compartidas)", () => {
    const input = [makeStep(1), makeStep(2)];
    const a = addStep(input);
    const b = addStep(input);
    expect(a).toEqual(b);

    a[0].positions.A.x = 9.5;
    expect(input[0].positions.A.x).toBe(3);
    expect(b[0].positions.A.x).toBe(3);
  });

  it("secuencia add/duplicate/remove mantiene ids únicos y ≥1 paso", () => {
    let steps = addStep([]);
    steps = addStep(steps);
    steps = duplicateStep(steps, 0);
    const removed = removeStep(steps, 1);
    const finalSteps = removed.ok ? removed.steps : steps;

    expect(finalSteps.length).toBeGreaterThanOrEqual(1);
    const ids = finalSteps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
