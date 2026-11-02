/**
 * Unit tests de la máquina de pasos del puzzle (lib/padel/court/steps.ts, AC-08).
 * Cubre E1 (toggles en ráfaga), E4 (clamp en extremos) y E7 (estado final determinista).
 * @jest-environment node
 */
import {
  clampStepIndex,
  isSameStep,
  resolveStepTransition,
} from "@/lib/padel/court/steps";

const TOTAL_STEPS = 3;

describe("clampStepIndex — rango 0..totalSteps-1", () => {
  it("acota índices negativos a 0", () => {
    expect(clampStepIndex(-1, TOTAL_STEPS)).toBe(0);
    expect(clampStepIndex(-100, TOTAL_STEPS)).toBe(0);
  });

  it("acota índices fuera de rango a totalSteps-1", () => {
    expect(clampStepIndex(TOTAL_STEPS, TOTAL_STEPS)).toBe(TOTAL_STEPS - 1);
    expect(clampStepIndex(TOTAL_STEPS + 5, TOTAL_STEPS)).toBe(TOTAL_STEPS - 1);
  });

  it("deja pasar índices válidos y trunca decimales", () => {
    expect(clampStepIndex(0, TOTAL_STEPS)).toBe(0);
    expect(clampStepIndex(1, TOTAL_STEPS)).toBe(1);
    expect(clampStepIndex(2, TOTAL_STEPS)).toBe(2);
    expect(clampStepIndex(1.9, TOTAL_STEPS)).toBe(1);
  });

  it("totalSteps <= 0 o inválido devuelve 0", () => {
    expect(clampStepIndex(3, 0)).toBe(0);
    expect(clampStepIndex(3, -2)).toBe(0);
    expect(clampStepIndex(3, Number.NaN)).toBe(0);
  });

  it("E4: en el último paso, siguiente y anterior no se salen del array", () => {
    const last = clampStepIndex(99, TOTAL_STEPS);
    expect(clampStepIndex(last + 1, TOTAL_STEPS)).toBe(last);
    expect(clampStepIndex(last - 1, TOTAL_STEPS)).toBe(last - 1);
    expect(clampStepIndex(clampStepIndex(0, TOTAL_STEPS) - 1, TOTAL_STEPS)).toBe(0);
  });
});

describe("resolveStepTransition — determinismo (E1/E7)", () => {
  it("salto 0→3 recorre el mismo path que componer 0→1→2→3", () => {
    const direct = resolveStepTransition(0, TOTAL_STEPS);

    const composed: number[] = [];
    for (let i = 0; i < TOTAL_STEPS; i++) {
      const leg = resolveStepTransition(i, i + 1);
      if (composed.length === 0) composed.push(...leg.path);
      else composed.push(...leg.path.slice(1));
    }

    expect(direct.path).toEqual([0, 1, 2, 3]);
    expect(direct.path).toEqual(composed);
    expect(direct.to).toBe(composed[composed.length - 1]);
    expect(direct.direction).toBe("forward");
    expect(direct.distance).toBe(TOTAL_STEPS);
  });

  it("el estado final del salto largo y el de los pasos unitarios coinciden", () => {
    const direct = resolveStepTransition(0, TOTAL_STEPS);
    const stepwise = [0, 1, 2, 3].reduce(
      (state, target) => resolveStepTransition(state, target).to,
      0
    );
    expect(stepwise).toBe(direct.to);
  });

  it("es determinista: la misma entrada produce el mismo resultado", () => {
    expect(resolveStepTransition(0, TOTAL_STEPS)).toEqual(resolveStepTransition(0, TOTAL_STEPS));
  });

  it("hacia atrás recorre los pasos en orden inverso", () => {
    const transition = resolveStepTransition(3, 0);
    expect(transition).toEqual({
      from: 3,
      to: 0,
      direction: "backward",
      distance: 3,
      path: [3, 2, 1, 0],
    });
  });

  it("no-op cuando from === to", () => {
    const transition = resolveStepTransition(2, 2);
    expect(transition).toEqual({
      from: 2,
      to: 2,
      direction: "none",
      distance: 0,
      path: [2],
    });
  });

  it("valores no finitos se tratan como 0", () => {
    expect(resolveStepTransition(Number.NaN, Number.NaN)).toEqual({
      from: 0,
      to: 0,
      direction: "none",
      distance: 0,
      path: [0],
    });
  });
});

describe("isSameStep", () => {
  it("compara índices truncados", () => {
    expect(isSameStep(1, 1)).toBe(true);
    expect(isSameStep(1.4, 1)).toBe(true);
    expect(isSameStep(1, 2)).toBe(false);
    expect(isSameStep(Number.NaN, 0)).toBe(true);
  });
});
