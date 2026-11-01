/**
 * Unit tests de anotaciones de la cancha (lib/padel/court/annotation.ts, AC-07/AC-08).
 * Sólo lógica pura: geometría de flecha, progreso del trazo y derivación de
 * flechas de movimiento de jugadores.
 * @jest-environment node
 */
import {
  computeArrowGeometry,
  computeDashProgress,
  deriveMovementArrows,
} from "@/lib/padel/court/annotation";
import { DEMO_SCENARIO } from "@/lib/padel/court/demo-scenario";
import type {
  CourtScenario,
  CourtViewport,
  PlayerPositions,
  Shot,
} from "@/lib/padel/court/types";

/** Viewport con el mismo aspect que la cancha (10×20 → 1:2), escala 40 px/m. */
const VIEWPORT: CourtViewport = { width: 400, height: 800, dpr: 1 };
const TOTAL_LENGTH = 500;
const PLAYER_ORDER = ["A", "B", "C", "D"] as const;

function shotAt(index: number): Shot {
  const shot = DEMO_SCENARIO.steps[index].shot;
  if (!shot) throw new Error(`el paso ${index} no define tiro`);
  return shot;
}

describe("computeDashProgress — trazo progresivo", () => {
  it("progress 0 → trazo oculto (dashOffset = totalLength)", () => {
    const state = computeDashProgress(0, TOTAL_LENGTH);
    expect(state.dashArray).toEqual([TOTAL_LENGTH, TOTAL_LENGTH]);
    expect(state.dashOffset).toBe(TOTAL_LENGTH);
  });

  it("progress 1 → trazo completo (dashOffset = 0)", () => {
    const state = computeDashProgress(1, TOTAL_LENGTH);
    expect(state.dashArray).toEqual([TOTAL_LENGTH, TOTAL_LENGTH]);
    expect(state.dashOffset).toBe(0);
  });

  it("forward es monótono decreciente de length a 0", () => {
    const offsets = [0, 0.25, 0.5, 0.75, 1].map(
      (progress) => computeDashProgress(progress, TOTAL_LENGTH).dashOffset
    );
    expect(offsets).toEqual([500, 375, 250, 125, 0]);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeLessThan(offsets[i - 1]);
    }
  });

  it("backward es simétrico: crece de 0 a length", () => {
    const offsets = [0, 0.25, 0.5, 0.75, 1].map(
      (progress) => computeDashProgress(progress, TOTAL_LENGTH, "backward").dashOffset
    );
    expect(offsets).toEqual([0, 125, 250, 375, 500]);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });

  it("forward y backward son complementarios en el mismo progreso", () => {
    for (const progress of [0, 0.1, 0.33, 0.5, 0.9, 1]) {
      const forward = computeDashProgress(progress, TOTAL_LENGTH).dashOffset;
      const backward = computeDashProgress(progress, TOTAL_LENGTH, "backward").dashOffset;
      expect(forward + backward).toBeCloseTo(TOTAL_LENGTH, 10);
    }
  });

  it("acota el progreso al rango [0, 1]", () => {
    expect(computeDashProgress(-3, TOTAL_LENGTH).dashOffset).toBe(TOTAL_LENGTH);
    expect(computeDashProgress(7, TOTAL_LENGTH).dashOffset).toBe(0);
    expect(computeDashProgress(Number.NaN, TOTAL_LENGTH).dashOffset).toBe(TOTAL_LENGTH);
  });

  it("length 0 o inválido no produce NaN", () => {
    for (const length of [0, -50, Number.NaN, Infinity]) {
      const state = computeDashProgress(0.5, length);
      expect(state.dashArray).toEqual([0, 0]);
      expect(state.dashOffset).toBe(0);
      expect(Number.isFinite(state.dashOffset)).toBe(true);
    }
  });
});

describe("computeArrowGeometry — determinista (AC-07)", () => {
  it("convierte los extremos a píxeles y calcula la longitud", () => {
    const arrow = computeArrowGeometry({ x: 0, y: 0 }, { x: 10, y: 0 }, VIEWPORT);
    expect(arrow).toEqual({ x1: 0, y1: 0, x2: 400, y2: 0, length: 400 });
  });

  it("calcula la longitud euclídea de un tramo diagonal", () => {
    const from = { x: 3, y: 15 };
    const to = { x: 8.5, y: 2 };
    const arrow = computeArrowGeometry(from, to, VIEWPORT);
    expect(arrow.x1).toBeCloseTo(120, 10);
    expect(arrow.y1).toBeCloseTo(600, 10);
    expect(arrow.x2).toBeCloseTo(340, 10);
    expect(arrow.y2).toBeCloseTo(80, 10);
    expect(arrow.length).toBeCloseTo(Math.hypot(220, 520), 10);
  });

  it("misma cancha + mismo viewport → mismo resultado (repetible)", () => {
    const from = { x: 2, y: 3 };
    const to = { x: 9, y: 7 };
    expect(computeArrowGeometry(from, to, VIEWPORT)).toEqual(
      computeArrowGeometry(from, to, VIEWPORT)
    );
  });

  it("el escenario es serializable: el round-trip JSON no cambia el tiro", () => {
    const roundTrip = JSON.parse(JSON.stringify(DEMO_SCENARIO)) as CourtScenario;
    const original = shotAt(1);
    const restored = roundTrip.steps[1].shot;
    expect(restored).not.toBeNull();
    if (!restored) throw new Error("el tiro no sobrevivió al round-trip");

    expect(computeArrowGeometry(restored.from, restored.to, VIEWPORT)).toEqual(
      computeArrowGeometry(original.from, original.to, VIEWPORT)
    );
  });

  it("E5: viewport 0×0 no produce NaN ni Infinity", () => {
    const arrow = computeArrowGeometry({ x: 5, y: 5 }, { x: 15, y: 5 }, { width: 0, height: 0, dpr: 1 });
    for (const value of [arrow.x1, arrow.y1, arrow.x2, arrow.y2, arrow.length]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(arrow.length).toBe(0);
  });
});

describe("deriveMovementArrows — flechas negras derivadas de posiciones", () => {
  const step1 = DEMO_SCENARIO.steps[0].positions;
  const step2 = DEMO_SCENARIO.steps[1].positions;

  it("el paso inicial no genera flechas (nadie se movió)", () => {
    expect(deriveMovementArrows(step1, step1, PLAYER_ORDER)).toEqual([]);
  });

  it("paso 1 → 2: sólo los jugadores que se desplazaron (A y D)", () => {
    const arrows = deriveMovementArrows(step1, step2, PLAYER_ORDER);
    expect(arrows.map((arrow) => arrow.player)).toEqual(["A", "D"]);
    expect(arrows[0].from).toEqual(step1.A);
    expect(arrows[0].to).toEqual(step2.A);
    expect(arrows[1].from).toEqual(step1.D);
    expect(arrows[1].to).toEqual(step2.D);
  });

  it("respeta el orden estable A, B, C, D aunque se muevan al revés", () => {
    const arrows = deriveMovementArrows(step2, step1, PLAYER_ORDER);
    expect(arrows.map((arrow) => arrow.player)).toEqual(["A", "D"]);
    expect(arrows[0].from).toEqual(step2.A);
    expect(arrows[0].to).toEqual(step1.A);
  });

  it("desplazamientos por debajo del epsilon no cuentan como movimiento", () => {
    const from: PlayerPositions = { ...step1 };
    const to: PlayerPositions = { ...step1, A: { x: 3.005, y: 5 } };
    expect(deriveMovementArrows(from, to, PLAYER_ORDER)).toEqual([]);
  });

  it("es determinista: mismas posiciones → mismas flechas", () => {
    expect(deriveMovementArrows(step1, step2, PLAYER_ORDER)).toEqual(
      deriveMovementArrows(step1, step2, PLAYER_ORDER)
    );
  });

  it("sobrevive al round-trip JSON del escenario", () => {
    const roundTrip = JSON.parse(JSON.stringify(DEMO_SCENARIO)) as CourtScenario;
    expect(deriveMovementArrows(roundTrip.steps[0].positions, roundTrip.steps[1].positions, PLAYER_ORDER)).toEqual(
      deriveMovementArrows(step1, step2, PLAYER_ORDER)
    );
  });
});
