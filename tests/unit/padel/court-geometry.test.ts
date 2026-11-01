/**
 * Unit tests de geometría de la cancha (lib/padel/court/geometry.ts, AC-08).
 * Spike no productivo — sólo lógica pura, sin canvas ni Konva.
 * @jest-environment node
 */
import {
  MAX_DPR,
  applyDpr,
  computeOffsets,
  computeScale,
  courtToPx,
  normalizeDpr,
} from "@/lib/padel/court/geometry";
import { COURT_DEPTH_M, COURT_WIDTH_M, type CourtViewport } from "@/lib/padel/court/types";

/** Viewport con el mismo aspect que la cancha (10×20 → 1:2). */
const VIEWPORT: CourtViewport = { width: 400, height: 800, dpr: 1 };

describe("computeScale — aspect 10:20 (norte→sur)", () => {
  it("usa la dimensión limitante (min de ambos ejes por metro)", () => {
    expect(computeScale(VIEWPORT)).toBe(40);
    expect(computeScale({ width: 200, height: 800, dpr: 1 })).toBe(20);
    expect(computeScale({ width: 400, height: 400, dpr: 1 })).toBe(20);
  });

  it("mantiene el aspect ratio 1:2 al pasar a píxeles", () => {
    const scale = computeScale({ width: 1000, height: 1000, dpr: 1 });
    const widthPx = COURT_WIDTH_M * scale;
    const depthPx = COURT_DEPTH_M * scale;
    expect(widthPx / depthPx).toBeCloseTo(0.5, 10);
    expect(widthPx).toBeLessThanOrEqual(1000);
    expect(depthPx).toBeLessThanOrEqual(1000);
  });

  it("E5: viewport 0×0, negativo o NaN devuelve 0 sin NaN/Infinity", () => {
    const scales = [
      computeScale({ width: 0, height: 0, dpr: 1 }),
      computeScale({ width: 400, height: 0, dpr: 1 }),
      computeScale({ width: -10, height: 800, dpr: 1 }),
      computeScale({ width: Number.NaN, height: 800, dpr: 1 }),
      computeScale({ width: Infinity, height: 800, dpr: 1 }),
    ];
    for (const scale of scales) {
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBe(0);
    }
  });
});

describe("computeOffsets — letterbox centrado", () => {
  it("viewport con el mismo aspect no deja margen", () => {
    expect(computeOffsets(VIEWPORT)).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it("viewport más ancho centra la cancha en X", () => {
    const { offsetX, offsetY } = computeOffsets({ width: 800, height: 800, dpr: 1 });
    expect(offsetX).toBe(200);
    expect(offsetY).toBe(0);
  });

  it("viewport más alto centra la cancha en Y", () => {
    const { offsetX, offsetY } = computeOffsets({ width: 400, height: 1200, dpr: 1 });
    expect(offsetX).toBe(0);
    expect(offsetY).toBe(200);
  });

  it("E5: viewport degenerado da offsets finitos", () => {
    const offsets = computeOffsets({ width: 0, height: 0, dpr: 1 });
    expect(offsets).toEqual({ offsetX: 0, offsetY: 0 });
    expect(Number.isFinite(offsets.offsetX)).toBe(true);
    expect(Number.isFinite(offsets.offsetY)).toBe(true);
  });
});

describe("courtToPx — conversión de esquinas", () => {
  it("(0,0) y (10,20) caen en las esquinas del viewport", () => {
    expect(courtToPx({ x: 0, y: 0 }, VIEWPORT)).toEqual({ x: 0, y: 0 });
    expect(courtToPx({ x: COURT_WIDTH_M, y: COURT_DEPTH_M }, VIEWPORT)).toEqual({
      x: VIEWPORT.width,
      y: VIEWPORT.height,
    });
  });

  it("respeta los offsets del letterbox", () => {
    const viewport: CourtViewport = { width: 800, height: 800, dpr: 1 };
    expect(courtToPx({ x: 0, y: 0 }, viewport)).toEqual({ x: 200, y: 0 });
    expect(courtToPx({ x: COURT_WIDTH_M, y: COURT_DEPTH_M }, viewport)).toEqual({
      x: 600,
      y: 800,
    });
  });

  it("el centro de la cancha se mapea al centro del área escalada", () => {
    const center = courtToPx({ x: COURT_WIDTH_M / 2, y: COURT_DEPTH_M / 2 }, VIEWPORT);
    expect(center).toEqual({ x: 200, y: 400 });
  });

  it("E5: coordenadas no finitas no generan NaN", () => {
    const point = courtToPx({ x: Number.NaN, y: Infinity }, VIEWPORT);
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});

describe("normalizeDpr / applyDpr — sin deformar", () => {
  it("normaliza al rango [1, MAX_DPR]", () => {
    expect(MAX_DPR).toBe(4);
    expect(normalizeDpr(2)).toBe(2);
    expect(normalizeDpr(3.5)).toBe(3.5);
    expect(normalizeDpr(0.5)).toBe(1);
    expect(normalizeDpr(0)).toBe(1);
    expect(normalizeDpr(-2)).toBe(1);
    expect(normalizeDpr(10)).toBe(MAX_DPR);
    expect(normalizeDpr(Number.NaN)).toBe(1);
    expect(normalizeDpr(Infinity)).toBe(1);
  });

  it("multiplica ambos ejes por el mismo DPR: el aspect no cambia", () => {
    const widthPx = applyDpr(VIEWPORT.width, 2);
    const heightPx = applyDpr(VIEWPORT.height, 2);
    expect(widthPx).toBe(800);
    expect(heightPx).toBe(1600);
    expect(widthPx / heightPx).toBeCloseTo(VIEWPORT.width / VIEWPORT.height, 10);
  });

  it("DPR inválido cae a 1 y no produce NaN", () => {
    expect(applyDpr(400, 0)).toBe(400);
    expect(applyDpr(400, Number.NaN)).toBe(400);
    expect(applyDpr(Number.NaN, 2)).toBe(0);
  });
});
