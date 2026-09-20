#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

const EXEMPT_VARS = new Set([
  "NODE_ENV", "NEXT_PUBLIC_VERCEL_URL", "NEXT_PUBLIC_VERCEL_ENV",
  "CI", "VERCEL_ENV", "npm_package_name",
])

const EXEMPT_DIRS = ["node_modules", ".next", "drizzle", ".git", ".validation", "production_artifacts", "test-results"]
const EXEMPT_FILES = [".env.example", "check-env-vars.js"]

function parseEnvExample() {
  const content = fs.readFileSync(path.join(ROOT, ".env.example"), "utf-8")
  const vars = new Set()
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/)
    if (match) vars.add(match[1])
  }
  return vars
}

function scanSource() {
  const vars = new Set()
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXEMPT_DIRS.includes(entry.name)) walk(path.join(dir, entry.name))
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        if (EXEMPT_FILES.includes(entry.name)) continue
        const content = fs.readFileSync(path.join(dir, entry.name), "utf-8")
        const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)
        for (const m of matches) {
          if (!EXEMPT_VARS.has(m[1])) vars.add(m[1])
        }
      }
    }
  }
  walk(ROOT)
  return vars
}

const envExample = parseEnvExample()
const sourceVars = scanSource()
const missing = [...sourceVars].filter((v) => !envExample.has(v)).sort()

if (missing.length === 0) {
  console.log(`✅ Todas las ${sourceVars.size} variables de entorno están documentadas en .env.example`)
  process.exit(0)
} else {
  console.log(`❌ ${missing.length} variable(s) de entorno faltan en .env.example:\n`)
  for (const v of missing) console.log(`   - ${v}`)
  console.log(`\n📝 Total en código: ${sourceVars.size} | Documentadas: ${envExample.size} | Faltantes: ${missing.length}`)
  process.exit(1)
}
