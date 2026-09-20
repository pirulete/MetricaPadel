/**
 * Prueba la lógica del baseline de tests y del gate de cobertura (--coverage).
 *
 * validate-harness.js ejecuta main() al importarse, por lo que la lógica pura
 * se replica aquí siguiendo el contrato documentado:
 *   - extractTestCount: parsea "Tests: N passed" del output de Jest/Playwright
 *   - testDelta: regresión de cantidad de tests vs baseline previo
 *   - coverage: un módulo falla si algún metric baja >3% vs baseline
 */

const COVERAGE_TOLERANCE = 3

export function extractTestCount(output: string): number | null {
  const match = output.match(/Tests:\s+(\d+)\s+passed/)
  return match ? parseInt(match[1], 10) : null
}

export function computeTestDelta(prev: number | null, current: number): number | null {
  return prev === null ? null : current - prev
}

export function coverageRegressions(
  current: Record<string, Record<string, number>>,
  baseline: Record<string, Record<string, number>>,
  tolerance = COVERAGE_TOLERANCE,
): string[] {
  const drops: string[] = []
  for (const [mod, stats] of Object.entries(current)) {
    const prev = baseline[mod]
    if (!prev) continue
    for (const metric of ["lines", "branches", "functions", "statements"]) {
      const delta = (stats[metric] ?? 0) - (prev[metric] ?? 0)
      if (delta < -tolerance) {
        drops.push(`${mod}.${metric}: ${prev[metric]}% → ${stats[metric]}% (${delta}%)`)
      }
    }
  }
  return drops
}

describe('extractTestCount', () => {
  it('parsea el summary de Jest', () => {
    expect(extractTestCount('Tests: 1635 passed, 1635 total')).toBe(1635)
  })

  it('parsea el summary de Playwright', () => {
    expect(extractTestCount('Tests: 42 passed')).toBe(42)
  })

  it('retorna null si no hay conteo', () => {
    expect(extractTestCount('No tests found')).toBeNull()
    expect(extractTestCount('')).toBeNull()
  })
})

describe('computeTestDelta', () => {
  it('calcula delta positivo', () => {
    expect(computeTestDelta(100, 105)).toBe(5)
  })

  it('calcula delta negativo', () => {
    expect(computeTestDelta(100, 95)).toBe(-5)
  })

  it('retorna null en primera corrida (sin baseline)', () => {
    expect(computeTestDelta(null, 100)).toBeNull()
  })
})

describe('coverageRegressions', () => {
  const baseline = {
    lib: { lines: 80, branches: 70, functions: 75, statements: 80 },
  }

  it('no reporta regresión si todo se mantiene o sube', () => {
    const current = {
      lib: { lines: 82, branches: 72, functions: 75, statements: 81 },
    }
    expect(coverageRegressions(current, baseline)).toEqual([])
  })

  it('reporta regresión si una métrica baja >3%', () => {
    const current = {
      lib: { lines: 76, branches: 70, functions: 75, statements: 80 },
    }
    const drops = coverageRegressions(current, baseline)
    expect(drops.length).toBe(1)
    expect(drops[0]).toContain('lib.lines')
  })

  it('tolera caídas de exactamente 3%', () => {
    const current = {
      lib: { lines: 77, branches: 70, functions: 75, statements: 80 },
    }
    expect(coverageRegressions(current, baseline)).toEqual([])
  })

  it('ignora módulos sin baseline previo', () => {
    const current = {
      app_api: { lines: 10, branches: 5, functions: 5, statements: 8 },
    }
    expect(coverageRegressions(current, baseline)).toEqual([])
  })
})
