import {
  computeRadarPoints,
  computeRadarPolygon,
  computeGridRing,
  RADAR_DIMENSIONS,
} from "@/lib/padel/radar";

const FULL_SCORES: Record<string, number> = {
  reglas: 4,
  tecnica_basica: 4,
  tecnica_especifica: 4,
  tactica: 4,
  fisica: 4,
  actitud_equipo: 4,
};

describe("computeRadarPoints", () => {
  it("devuelve exactamente 6 puntos en el orden de RADAR_DIMENSIONS", () => {
    const points = computeRadarPoints(FULL_SCORES, 4);
    expect(points).toHaveLength(6);
    expect(RADAR_DIMENSIONS).toHaveLength(6);
  });

  it("empieza en el tope (ángulo -90°) y avanza en sentido horario", () => {
    const points = computeRadarPoints(FULL_SCORES, 4);
    // Tope: x≈0, y negativo (radio 1).
    expect(points[0].x).toBeCloseTo(0, 5);
    expect(points[0].y).toBeCloseTo(-1, 5);
    // Segundo vértice: ángulo -30° → x positivo, y negativo.
    expect(points[1].x).toBeGreaterThan(0);
    expect(points[1].y).toBeLessThan(0);
    // Cuarto vértice (tactica, ángulo 60°): x positivo, y positivo.
    expect(points[3].x).toBeGreaterThan(0);
    expect(points[3].y).toBeGreaterThan(0);
  });

  it("normaliza score/maxScore a radio unitario", () => {
    const half: Record<string, number> = { ...FULL_SCORES, reglas: 2 };
    const points = computeRadarPoints(half, 4);
    expect(points[0].x).toBeCloseTo(0, 5);
    expect(points[0].y).toBeCloseTo(-0.5, 5);
  });

  it("clampa scores por encima de maxScore a radio 1", () => {
    const over: Record<string, number> = { ...FULL_SCORES, reglas: 99 };
    const points = computeRadarPoints(over, 4);
    expect(Math.hypot(points[0].x, points[0].y)).toBeCloseTo(1, 5);
  });

  it("trata dimensiones ausentes como 0 (centro)", () => {
    const points = computeRadarPoints({ reglas: 4 }, 4);
    expect(points[0].y).toBeCloseTo(-1, 5);
    expect(points[1].x).toBeCloseTo(0, 5);
    expect(points[1].y).toBeCloseTo(0, 5);
  });

  it("no divide por cero con maxScore ≤ 0 (todos al centro)", () => {
    const points = computeRadarPoints(FULL_SCORES, 0);
    for (const p of points) {
      expect(p.x).toBeCloseTo(0, 5);
      expect(p.y).toBeCloseTo(0, 5);
    }
  });
});

describe("computeRadarPolygon", () => {
  it("retorna 6 pares 'x,y' separados por espacio", () => {
    const polygon = computeRadarPolygon(FULL_SCORES, 4, 110, 110, 80);
    const pairs = polygon.split(" ");
    expect(pairs).toHaveLength(6);
    for (const pair of pairs) {
      expect(pair).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    }
  });

  it("mapea el centro unitario a (cx, cy)", () => {
    const polygon = computeRadarPolygon({}, 4, 100, 200, 50);
    const pairs = polygon.split(" ");
    for (const pair of pairs) {
      const [x, y] = pair.split(",").map(Number);
      expect(x).toBeCloseTo(100, 1);
      expect(y).toBeCloseTo(200, 1);
    }
  });

  it("mapea radio 1 al borde: tope en (cx, cy - radius)", () => {
    const polygon = computeRadarPolygon(FULL_SCORES, 4, 110, 110, 80);
    const [x, y] = polygon.split(" ")[0].split(",").map(Number);
    expect(x).toBeCloseTo(110, 1);
    expect(y).toBeCloseTo(30, 1);
  });
});

describe("computeGridRing", () => {
  it("genera un polígono regular de radio r", () => {
    const ring = computeGridRing(0.5, 110, 110, 80);
    const pairs = ring.split(" ");
    expect(pairs).toHaveLength(6);
    const [x, y] = pairs[0].split(",").map(Number);
    expect(x).toBeCloseTo(110, 1);
    expect(y).toBeCloseTo(70, 1); // 110 - 0.5*80
  });
});