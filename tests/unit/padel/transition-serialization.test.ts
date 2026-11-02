/**
 * Unit tests de serialización del documento de transición
 * (lib/padel/court/transition.ts, AC-02/D-03).
 * @jest-environment node
 */
import {
  DEFAULT_POSITIONS,
  emptyTransitionDoc,
  nextStepId,
  toCourtScenario,
  type TransitionRow,
} from "@/lib/padel/court/transition";
import { COURT_DEPTH_M, COURT_WIDTH_M, PLAYER_IDS, type Paso } from "@/lib/padel/court/types";

function makeStep(id = 1, label = `Paso ${id}`): Paso {
  return {
    id,
    label,
    positions: {
      A: { x: 3, y: 4 },
      B: { x: 7, y: 4 },
      C: { x: 3, y: 16 },
      D: { x: 7, y: 16 },
    },
    shot: id === 1 ? { control: { x: 4, y: 3 }, to: { x: 5, y: 2 }, label: "CRUZADO" } : null,
  };
}

const makeRow = (overrides: Partial<TransitionRow> = {}): TransitionRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Salida de pared",
  scenario: { initialStepIndex: 0, steps: [makeStep(1), makeStep(2)] },
  ...overrides,
});

describe("emptyTransitionDoc", () => {
  it("crea 1 paso con las posiciones por defecto y sin tiro", () => {
    const doc = emptyTransitionDoc("Mi jugada");
    expect(doc.title).toBe("Mi jugada");
    expect(doc.initialStepIndex).toBe(0);
    expect(doc.steps).toHaveLength(1);
    expect(doc.steps[0]).toEqual({
      id: 1,
      label: "Paso 1",
      positions: DEFAULT_POSITIONS,
      shot: null,
    });
  });

  it("usa un título por defecto y no comparte refs con DEFAULT_POSITIONS", () => {
    const doc = emptyTransitionDoc();
    expect(doc.title).toBe("Nueva transición");
    expect(doc.steps[0].positions).not.toBe(DEFAULT_POSITIONS);
    doc.steps[0].positions.A.x = 9;
    expect(DEFAULT_POSITIONS.A.x).toBe(3);
  });
});

describe("nextStepId", () => {
  it("devuelve 1 con lista vacía y max(id)+1 en el resto", () => {
    expect(nextStepId([])).toBe(1);
    expect(nextStepId([makeStep(1), makeStep(3), makeStep(2)])).toBe(4);
  });

  it("ignora ids no finitos", () => {
    const broken: Paso[] = [makeStep(1), { ...makeStep(1), id: Number.NaN }];
    expect(nextStepId(broken)).toBe(2);
  });
});

describe("toCourtScenario — AC-02 (fila DB → CourtScenario)", () => {
  it("conserva id, título y número de pasos", () => {
    const scenario = toCourtScenario(makeRow());
    expect(scenario.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(scenario.title).toBe("Salida de pared");
    expect(scenario.steps).toHaveLength(2);
    expect(scenario.steps.map((s) => s.id)).toEqual([1, 2]);
  });

  it("aclara el título vacío con el default", () => {
    expect(toCourtScenario(makeRow({ title: "   " })).title).toBe("Nueva transición");
  });

  it("acota initialStepIndex fuera de rango", () => {
    const row = makeRow({ scenario: { initialStepIndex: 7, steps: [makeStep(1), makeStep(2)] } });
    expect(toCourtScenario(row).initialStepIndex).toBe(1);

    const negative = makeRow({ scenario: { initialStepIndex: -3, steps: [makeStep(1)] } });
    expect(toCourtScenario(negative).initialStepIndex).toBe(0);
  });

  it("produce positions completas y finitas para los 4 jugadores", () => {
    const scenario = toCourtScenario(makeRow());
    for (const step of scenario.steps) {
      expect(Object.keys(step.positions).sort()).toEqual([...PLAYER_IDS].sort());
      for (const id of PLAYER_IDS) {
        const { x, y } = step.positions[id];
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(COURT_WIDTH_M);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(COURT_DEPTH_M);
      }
    }
  });

  it("no comparte referencias con la fila de origen (copia profunda)", () => {
    const row = makeRow();
    const scenario = toCourtScenario(row);

    scenario.steps[0].positions.A.x = 0;
    scenario.steps[0].shot!.to.y = 19;
    expect(row.scenario.steps[0].positions.A.x).toBe(3);
    expect(row.scenario.steps[0].shot?.to.y).toBe(2);
  });

  it("sólo expone {id,label,positions,shot} por paso (sin campos extra de DB)", () => {
    const row = makeRow();
    const dirty = row.scenario.steps[0] as Paso & { createdAt?: string };
    dirty.createdAt = "2026-01-01T00:00:00.000Z";
    expect(Object.keys(toCourtScenario(row).steps[0]).sort()).toEqual(["id", "label", "positions", "shot"]);
  });
});

describe("serialización JSON (AC-02)", () => {
  it("round-trip sin pérdida del escenario reconstruido", () => {
    const scenario = toCourtScenario(makeRow());
    const roundTripped = JSON.parse(JSON.stringify(scenario));
    expect(roundTripped).toEqual(scenario);
  });

  it("round-trip sin pérdida del payload de DB {initialStepIndex, steps}", () => {
    const doc = emptyTransitionDoc("Persistible");
    const payload = { initialStepIndex: doc.initialStepIndex, steps: doc.steps };
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("el escenario es serializable sin tocar prototypes ni tipos raros", () => {
    const scenario = toCourtScenario(makeRow());
    for (const step of scenario.steps) {
      expect(step.shot === null || typeof step.shot.label === "string").toBe(true);
      for (const id of PLAYER_IDS) {
        expect(typeof step.positions[id].x).toBe("number");
        expect(typeof step.positions[id].y).toBe("number");
      }
    }
  });
});
