/**
 * Unit tests de anotaciones de la cancha (lib/padel/court/annotation.ts, AC-07/AC-08).
 * Sólo lógica pura: resolución del hitador, curvas Bézier de los tiros y
 * progreso del trazo.
 * @jest-environment node
 */
import {
  computeCurveGeometry,
  computeDashProgress,
  quadraticPoint,
  resolveHitter,
} from "@/lib/padel/court/annotation";
import { DEMO_SCENARIO } from "@/lib/padel/court/demo-scenario";
import type {
  CourtScenario,
  CourtViewport,
  PlayerId,
  PlayerPositions,
  Shot,
} from "@/lib/padel/court/types";

/** Viewport con el mismo aspect que la cancha (10×20 → 1:2), escala 40 px/m. */
const VIEWPORT: CourtViewport = { width: 400, height: 800, dpr: 1 };
const TOTAL_LENGTH = 500;
const ORDER: readonly PlayerId[] = ["A", "B", "C", "D"];

const STEPS = DEMO_SCENARIO.steps;

function shotAt(index: number): Shot {
  const shot = STEPS[index].shot;
  if (!shot) throw new Error(`el paso ${index} no define tiro`);
  return shot;
}

/** Origen del tiro del paso N = posiciones del paso N-1 (regla del demo). */
function originAt(index: number): PlayerPositions {
  return STEPS[Math.max(0, index - 1)].positions;
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

describe("quadraticPoint — Bézier cuadrática (estilo PadelChess)", () => {
  const from = { x: 0, y: 0 };
  const control = { x: 5, y: 0 };
  const to = { x: 10, y: 0 };

  it("t=0 → origen, t=1 → destino", () => {
    expect(quadraticPoint(from, control, to, 0)).toEqual(from);
    expect(quadraticPoint(from, control, to, 1)).toEqual(to);
  });

  it("t=0.5 → punto medio de la parábola", () => {
    expect(quadraticPoint(from, control, to, 0.5)).toEqual({ x: 5, y: 0 });
  });

  it("el control desvía la curva de la cuerda", () => {
    const offCurve = quadraticPoint(from, { x: 5, y: 4 }, to, 0.5);
    const onChord = quadraticPoint(from, { x: 5, y: 0 }, to, 0.5);
    expect(offCurve).toEqual({ x: 5, y: 2 });
    expect(offCurve.y).not.toBe(onChord.y);
  });

  it("acota t fuera de rango a [0,1] (sin extrapolación)", () => {
    expect(quadraticPoint(from, control, to, -5)).toEqual(from);
    expect(quadraticPoint(from, control, to, 9)).toEqual(to);
  });
});

describe("resolveHitter — el tiro sale del jugador más cercano al destino", () => {
  const positions: PlayerPositions = {
    A: { x: 0, y: 0 },
    B: { x: 10, y: 0 },
    C: { x: 0, y: 10 },
    D: { x: 10, y: 10 },
  };

  it("elige al más cercano al destino", () => {
    expect(resolveHitter(positions, { x: 9, y: 1 }, ORDER)).toBe("B");
    expect(resolveHitter(positions, { x: 1, y: 9 }, ORDER)).toBe("C");
    expect(resolveHitter(positions, { x: 1, y: 1 }, ORDER)).toBe("A");
    expect(resolveHitter(positions, { x: 9, y: 9 }, ORDER)).toBe("D");
  });

  it("desempate determinista por orden estable A,B,C,D", () => {
    const tie: PlayerPositions = {
      A: { x: 5, y: 0 },
      B: { x: 5, y: 0 },
      C: { x: 0, y: 0 },
      D: { x: 10, y: 0 },
    };
    // A y B empatan a distancia 0 → gana A (primero en PLAYER_IDS).
    expect(resolveHitter(tie, { x: 5, y: 0 }, ORDER)).toBe("A");
  });

  it("el escenario demo cumple la regla: paso 2 lo inicia C, paso 3 lo inicia B", () => {
    const hitterStep2 = resolveHitter(originAt(1), shotAt(1).to, ORDER);
    const hitterStep3 = resolveHitter(originAt(2), shotAt(2).to, ORDER);
    expect(hitterStep2).toBe("C");
    expect(hitterStep3).toBe("B");
    // El hitador declarado en la narrativa del label coincide con el resuelto.
    expect(STEPS[1].label).toContain(hitterStep2);
    expect(STEPS[2].label).toContain(hitterStep3);
  });

  it("el origen del tiro está en los pies del hitador (es una posición real)", () => {
    const origin = originAt(1)[resolveHitter(originAt(1), shotAt(1).to, ORDER)];
    expect(origin).toBeDefined();
    expect(Number.isFinite(origin.x)).toBe(true);
    expect(Number.isFinite(origin.y)).toBe(true);
  });
});

describe("computeCurveGeometry — polilínea en píxeles (AC-07)", () => {
  const from = { x: 4.5, y: 11 };

  it("el primer y último punto coinciden con origen/destino en px", () => {
    const shot = shotAt(1);
    const geometry = computeCurveGeometry(from, shot, VIEWPORT);
    const start = { x: geometry.points[0], y: geometry.points[1] };
    const end = {
      x: geometry.points[geometry.points.length - 2],
      y: geometry.points[geometry.points.length - 1],
    };
    expect(start.x).toBeCloseTo(from.x * 40, 5);
    expect(start.y).toBeCloseTo(from.y * 40, 5);
    expect(end.x).toBeCloseTo(shot.to.x * 40, 5);
    expect(end.y).toBeCloseTo(shot.to.y * 40, 5);
  });

  it("la longitud es finita, positiva y mayor que la cuerda recta", () => {
    const shot = shotAt(1);
    const geometry = computeCurveGeometry(from, shot, VIEWPORT);
    const chord = Math.hypot((shot.to.x - from.x) * 40, (shot.to.y - from.y) * 40);
    expect(Number.isFinite(geometry.length)).toBe(true);
    expect(geometry.length).toBeGreaterThan(chord);
  });

  it("el punto medio queda sobre la curva (no en la cuerda)", () => {
    const shot = shotAt(1);
    const geometry = computeCurveGeometry(from, shot, VIEWPORT);
    const chordMid = {
      x: ((from.x + shot.to.x) / 2) * 40,
      y: ((from.y + shot.to.y) / 2) * 40,
    };
    const dist = Math.hypot(geometry.midpoint.x - chordMid.x, geometry.midpoint.y - chordMid.y);
    expect(dist).toBeGreaterThan(10);
  });

  it("mismo escenario + mismo viewport → mismo resultado (repetible)", () => {
    const shot = shotAt(2);
    expect(computeCurveGeometry(from, shot, VIEWPORT)).toEqual(
      computeCurveGeometry(from, shot, VIEWPORT)
    );
  });

  it("el escenario es serializable: el round-trip JSON no cambia la curva", () => {
    const roundTrip = JSON.parse(JSON.stringify(DEMO_SCENARIO)) as CourtScenario;
    const original = shotAt(1);
    const restored = roundTrip.steps[1].shot;
    expect(restored).not.toBeNull();
    if (!restored) throw new Error("el tiro no sobrevivió al round-trip");

    expect(computeCurveGeometry(from, restored, VIEWPORT)).toEqual(
      computeCurveGeometry(from, original, VIEWPORT)
    );
    expect(resolveHitter(roundTrip.steps[0].positions, restored.to, ORDER)).toBe("C");
  });

  it("E5: viewport 0×0 no produce NaN ni Infinity", () => {
    const geometry = computeCurveGeometry(from, shotAt(1), { width: 0, height: 0, dpr: 1 });
    for (const value of [...geometry.points, geometry.length, geometry.midpoint.x, geometry.midpoint.y]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(geometry.length).toBe(0);
  });
});
