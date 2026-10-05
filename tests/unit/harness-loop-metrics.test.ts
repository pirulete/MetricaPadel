/**
 * Unit tests para computeLoopMetrics (harness gate --loop-metrics).
 *
 * Contrato (AGENTS.md > Loop Engineering):
 * - El gate es warning NO bloqueante cuando rework rate > threshold.
 * - Events guardan gates_failed (snake_case); se tolera legado gatesFailed.
 * - iterations default 1 si el evento no lo trae.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { computeLoopMetrics } = require("../../lib/modules/harness/validate.js")

describe("computeLoopMetrics", () => {
  it("sin eventos → pass (No events)", () => {
    const r = computeLoopMetrics([], 1.5)
    expect(r.passed).toBe(true)
    expect(r.total).toBe(0)
    expect(r.line).toBe("No events")
  })

  it("rework bajo threshold → pass", () => {
    const events = [
      { change_id: "a", iterations: 1, gates_failed: 0 },
      { change_id: "b", iterations: 1, gates_failed: 1 },
    ]
    const r = computeLoopMetrics(events, 1.5)
    expect(r.passed).toBe(true)
    expect(r.reworkRate).toBe(1)
    expect(r.totalGatesFailed).toBe(1)
  })

  it("rework sobre threshold → fail (no bloqueante a nivel de gate)", () => {
    const events = [
      { change_id: "a", iterations: 3, gates_failed: 0 },
      { change_id: "b", iterations: 1, gates_failed: 1 },
    ]
    const r = computeLoopMetrics(events, 1.5)
    expect(r.passed).toBe(false)
    expect(r.reworkRate).toBe(2)
    expect(r.output).toContain("2 > threshold 1.5")
  })

  it("lee gates_failed (snake_case) del JSON de loop-metrics", () => {
    const events = [
      { change_id: "a", iterations: 1, gates_failed: 2 },
      { change_id: "b", iterations: 1, gates_failed: 3 },
    ]
    const r = computeLoopMetrics(events, 1.5)
    expect(r.totalGatesFailed).toBe(5)
  })

  it("tolera legado gatesFailed (camelCase)", () => {
    const events = [
      { change_id: "a", iterations: 1, gatesFailed: 4 },
      { change_id: "b", iterations: 1, gates_failed: 1 },
    ]
    const r = computeLoopMetrics(events, 1.5)
    expect(r.totalGatesFailed).toBe(5)
  })

  it("iterations default 1 cuando falta", () => {
    const events = [{ change_id: "a" }, { change_id: "b", iterations: 2 }]
    const r = computeLoopMetrics(events, 1.5)
    expect(r.totalIter).toBe(3)
    expect(r.reworkRate).toBe(1.5)
    expect(r.passed).toBe(true) // 1.5 no es > 1.5
  })

  it("cuenta escalaciones", () => {
    const events = [
      { iterations: 1, escalated: true },
      { iterations: 1 },
    ]
    const r = computeLoopMetrics(events, 1.5)
    expect(r.escalations).toBe(1)
  })

  it("acepta data histórica real del repo (academia-branding + pair-evaluation)", () => {
    // Réplica de .validation/loop-metrics.json al 2026-10-03
    const events = [
      { change_id: "spec-epic-01-academia-branding", iterations: 3, gates_failed: 0, loop_duration_ms: 5400000, module: "admin" },
      { change_id: "pair-evaluation-2v2", iterations: 1, gates_failed: 1, loop_duration_ms: 0, module: "dashboard" },
    ]
    const r = computeLoopMetrics(events, 1.5)
    expect(r.reworkRate).toBe(2)
    expect(r.totalGatesFailed).toBe(1)
    expect(r.passed).toBe(false)
  })
})
