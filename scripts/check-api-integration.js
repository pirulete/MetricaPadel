#!/usr/bin/env node

/**
 * check-api-integration.js — Scans API test files for guard-only ratio.
 *
 * Detects files in tests/api/student/ and tests/api/admin/ where >80%
 * of test assertions are guard checks (401/403 status codes).
 *
 * Exit code 0 if all files pass, 1 if any exceed the threshold.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function checkDir(dir) {
  const fullPath = path.join(root, dir)
  const results = []
  if (!fs.existsSync(fullPath)) return results

  const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.spec.ts'))
  for (const file of files) {
    const content = fs.readFileSync(path.join(fullPath, file), 'utf-8')
    const guardTests = (content.match(/status\(\)\)\.toBe\(4/g) || []).length
    const totalTests = (content.match(/test\(/g) || []).length
    if (totalTests > 0 && guardTests / totalTests > 0.8) {
      results.push({
        file: `${dir}/${file}`,
        guardTests,
        totalTests,
        ratio: (guardTests / totalTests * 100).toFixed(0) + '%',
      })
    }
  }
  return results
}

const warnings = [
  ...checkDir('tests/api/student'),
  ...checkDir('tests/api/admin'),
]

if (warnings.length > 0) {
  console.log(`⚠️  ${warnings.length} archivo(s) con >80% tests guard-only:`)
  warnings.forEach(w => {
    console.log(`  - ${w.file}: ${w.guardTests}/${w.totalTests} (${w.ratio})`)
  })
  console.log('Nota: Los archivos *-happy.spec.ts con tests reales no generan warning.')
} else {
  console.log('✅ Todos los archivos API tienen tests happy-path suficientes.')
}

process.exit(warnings.length > 0 ? 1 : 0)
