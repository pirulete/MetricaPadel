/**
 * Unit tests de `deriveFlowStep` (lib/padel/court/flow.ts) — onboarding G2.
 * Estado derivado de señales existentes: sin estado nuevo, sin localStorage.
 * @jest-environment node
 */
import { deriveFlowStep, FLOW_STEP_COUNT, type FlowSignals } from "@/lib/padel/court/flow";

/** Señales base: un paso, limpio, sin selección ni tiro. */
const base: FlowSignals = {
  stepsCount: 1,
  selected: null,
  hasShot: false,
  dirty: false,
  previewing: false,
};

const derive = (patch: Partial<FlowSignals> = {}) => deriveFlowStep({ ...base, ...patch });

describe("deriveFlowStep — los 5 estados", () => {
  it("① Paso cuando todavía no hay pasos", () => {
    expect(derive({ stepsCount: 0 })).toBe(1);
  });

  it("② Mueve cuando hay un jugador seleccionado y cambios sin guardar", () => {
    expect(derive({ dirty: true, selected: "A" })).toBe(2);
  });

  it("③ Tiro cuando no hay selección y el paso no tiene tiro", () => {
    expect(derive({ dirty: true, selected: null, hasShot: false })).toBe(3);
  });

  it("④ Prueba mientras se reproduce el preview", () => {
    expect(derive({ previewing: true })).toBe(4);
  });

  it("⑤ Guarda cuando el documento está guardado", () => {
    expect(derive({ dirty: false })).toBe(5);
  });

  it("⑤ Guarda cuando solo falta guardar (paso con tiro, sin selección)", () => {
    expect(derive({ dirty: true, selected: null, hasShot: true })).toBe(5);
  });
});

describe("deriveFlowStep — prioridad y transiciones", () => {
  it("transita ① → ② → ③ → ⑤ al crear y completar el paso", () => {
    const created = derive({ stepsCount: 1, dirty: true, hasShot: false });
    const moving = derive({ stepsCount: 1, dirty: true, selected: "B", hasShot: false });
    const shooting = derive({ stepsCount: 1, dirty: true, selected: null, hasShot: false });
    const saving = derive({ stepsCount: 1, dirty: true, selected: null, hasShot: true });
    const saved = derive({ stepsCount: 1, dirty: false, selected: null, hasShot: true });

    expect([created, moving, shooting, saving, saved]).toEqual([3, 2, 3, 5, 5]);
  });

  it("vuelve de ⑤ a ② al tocar un jugador con cambios sin guardar", () => {
    expect(derive({ dirty: false })).toBe(5);
    expect(derive({ dirty: true, selected: "C", hasShot: true })).toBe(2);
  });

  it("previewing gana sobre dirty + selección", () => {
    expect(derive({ previewing: true, dirty: true, selected: "D", hasShot: true })).toBe(4);
  });

  it("previewing gana también sobre el documento limpio", () => {
    expect(derive({ previewing: true, dirty: false })).toBe(4);
  });
});

describe("deriveFlowStep — valores borde", () => {
  it.each([0, -1])("stepsCount %i se resuelve como ① Paso", (stepsCount) => {
    expect(derive({ stepsCount, dirty: true, previewing: true })).toBe(1);
  });

  it("stepsCount 1 con todo pendiente es ③ Tiro", () => {
    expect(derive({ stepsCount: 1, dirty: true })).toBe(3);
  });

  it("stepsCount grande no altera la derivación", () => {
    expect(derive({ stepsCount: 12, dirty: false })).toBe(5);
    expect(derive({ stepsCount: 12, dirty: true, selected: "A" })).toBe(2);
  });

  it("selected null nunca devuelve ②", () => {
    for (const dirty of [true, false]) {
      for (const hasShot of [true, false]) {
        expect(derive({ selected: null, dirty, hasShot })).not.toBe(2);
      }
    }
  });

  it("siempre devuelve un índice dentro de 1..FLOW_STEP_COUNT", () => {
    const players = [null, "A", "B", "C", "D"] as const;
    for (const stepsCount of [0, 1, 5]) {
      for (const selected of players) {
        for (const hasShot of [true, false]) {
          for (const dirty of [true, false]) {
            for (const previewing of [true, false]) {
              const step = deriveFlowStep({ stepsCount, selected, hasShot, dirty, previewing });
              expect(step).toBeGreaterThanOrEqual(1);
              expect(step).toBeLessThanOrEqual(FLOW_STEP_COUNT);
            }
          }
        }
      }
    }
  });

  it("es determinista: mismas señales ⇒ mismo paso", () => {
    const signals: FlowSignals = { stepsCount: 2, selected: "B", hasShot: false, dirty: true, previewing: false };
    expect(deriveFlowStep(signals)).toBe(deriveFlowStep({ ...signals }));
  });
});
