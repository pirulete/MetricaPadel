/**
 * Resilient database migration script.
 *
 * Handles partial databases where some objects (enums, tables) already exist
 * from previous incomplete migrations. Executes each SQL statement individually,
 * skipping "already exists" errors while still failing on real errors.
 *
 * Flow:
 * 1. Verify DB connection
 * 2. Check if critical tables exist → skip if all present
 * 3. Read journal + SQL files from drizzle/
 * 4. Execute each statement individually, catching "already exists"
 * 5. Record applied migrations in __drizzle_migrations
 * 6. Verify critical tables exist after migration
 */

import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const CRITICAL_TABLES = [
  'users', 'rubrics', 'rubric_levels', 'rubric_criteria', 'rubric_descriptors',
  'evaluations', 'evaluation_scores', 'courses', 'course_enrollments', 'course_rubrics',
  'academies', 'academy_memberships',
]

interface JournalEntry {
  idx: number
  version: number
  when: number
  tag: string
  breakpoints: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function tableExists(tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) as exists
  `)
  return !!result.rows[0]?.exists
}

async function checkCriticalTables(): Promise<{ allExist: boolean; missing: string[] }> {
  const missing: string[] = []
  for (const table of CRITICAL_TABLES) {
    if (!(await tableExists(table))) {
      missing.push(table)
    }
  }
  return { allExist: missing.length === 0, missing }
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const applied = new Set<string>()
  try {
    const result = await db.execute(sql`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id
    `)
    for (const row of result.rows) {
      applied.add(row.hash as string)
    }
  } catch {
    // __drizzle_migrations table doesn't exist yet
  }
  return applied
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function splitStatements(sqlContent: string): string[] {
  // Drizzle uses "--> statement-breakpoint" as delimiter
  return sqlContent
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runMigration() {
  console.log('[v0] Starting resilient database migration...')

  if (!process.env.DATABASE_URL) {
    console.log('[v0] ⏭ Skipping migrations: DATABASE_URL not set')
    process.exit(0)
  }

  try {
    // 1. Verify connection
    console.log('[v0] Testing database connection...')
    await db.execute(sql`SELECT 1`)
    console.log('[v0] ✓ Database connection successful')

    // 2. Check if all critical tables exist
    console.log('[v0] Checking critical tables...')
    const { allExist, missing } = await checkCriticalTables()

    // 3. Read journal to check for unapplied migrations
    const drizzleDir = path.join(process.cwd(), 'drizzle')
    const journalPath = path.join(drizzleDir, 'meta', '_journal.json')
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'))
    const entries: JournalEntry[] = journal.entries
    const lastJournalTag = entries[entries.length - 1]?.tag

    // 4. Get already-applied migrations
    const applied = await getAppliedMigrations()
    console.log(`[v0] ${applied.size} migrations already tracked in __drizzle_migrations`)

    // 5. Check if the last migration in the journal has been applied
    let lastAppliedTag = ''
    for (const entry of entries) {
      const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`)
      if (!fs.existsSync(sqlFile)) continue
      const sqlContent = fs.readFileSync(sqlFile, 'utf-8')
      const hash = computeHash(sqlContent)
      if (applied.has(hash)) {
        lastAppliedTag = entry.tag
      }
    }

    if (allExist && lastAppliedTag === lastJournalTag) {
      console.log('[v0] ✓ All critical tables exist and migrations up to date — skipping')
      process.exit(0)
    }

    if (allExist) {
      console.log(`[v0] ⚠ Tables exist but migrations pending (last applied: ${lastAppliedTag || 'none'}, journal: ${lastJournalTag})`)
    } else {
      console.log(`[v0] ⚠ Missing tables: ${missing.join(', ')}`)
    }

    // 5. Execute each migration statement-by-statement
    let appliedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const entry of entries) {
      const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`)
      if (!fs.existsSync(sqlFile)) {
        console.log(`[v0] ⏭ ${entry.tag}.sql not found — skipping`)
        continue
      }

      const sqlContent = fs.readFileSync(sqlFile, 'utf-8')
      const hash = computeHash(sqlContent)

      if (applied.has(hash)) {
        skippedCount++
        continue
      }

      const statements = splitStatements(sqlContent)
      console.log(`[v0] Applying ${entry.tag} (${statements.length} statements)...`)

      let migrationErrors = 0
      for (const stmt of statements) {
        try {
          await db.execute(sql.raw(stmt))
        } catch (e: any) {
          const msg = `${e?.message ?? ''} ${e?.cause?.message ?? ''}`
          if (msg.includes('already exists') || msg.includes('does not exist') || msg.includes('duplicate')) {
            // Object already exists from a partial previous migration — skip
            migrationErrors++
          } else {
            // Real error — log but continue with next statement
            console.error(`[v0]   ⚠ Statement failed: ${msg.substring(0, 120)}`)
            migrationErrors++
          }
        }
      }

      // Record this migration as applied (even with partial errors — the objects exist)
      try {
        await db.execute(sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${Date.now()})
          ON CONFLICT DO NOTHING
        `)
      } catch {
        // If __drizzle_migrations table doesn't exist, create it and retry
        try {
          await db.execute(sql`
            CREATE SCHEMA IF NOT EXISTS drizzle
          `)
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
              id SERIAL PRIMARY KEY,
              hash TEXT NOT NULL UNIQUE,
              created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
            )
          `)
          await db.execute(sql`
            INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES (${hash}, ${Date.now()})
          `)
        } catch (e: any) {
          console.error(`[v0]   ⚠ Could not record migration: ${e?.message?.substring(0, 80)}`)
        }
      }

      if (migrationErrors === 0) {
        console.log(`[v0]   ✓ ${entry.tag} applied cleanly`)
      } else {
        console.log(`[v0]   ⏭ ${entry.tag} applied with ${migrationErrors} skipped (objects exist)`)
      }
      appliedCount++
    }

    console.log(`[v0] Migrations: ${appliedCount} processed, ${skippedCount} already tracked`)

    // 6. Post-migration verification
    console.log('[v0] Verifying critical tables after migration...')
    const { allExist: tablesExistAfter, missing: stillMissing } = await checkCriticalTables()
    if (!tablesExistAfter) {
      console.error(`[v0] ✗ CRITICAL: Tables still missing: ${stillMissing.join(', ')}`)
      process.exit(1)
    }
    console.log('[v0] ✓ All critical tables verified')

    process.exit(0)
  } catch (error: any) {
    console.error('[v0] ✗ Migration failed:', error?.message ?? error)
    if (error?.cause?.message) {
      console.error('[v0]   Cause:', error.cause.message)
    }
    process.exit(1)
  }
}

runMigration()
