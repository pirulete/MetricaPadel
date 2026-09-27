import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import path from 'path'

const CRITICAL_TABLES = ['users', 'rubrics', 'evaluations', 'courses', 'academies', 'academy_memberships']

async function checkCriticalTables(): Promise<boolean> {
  for (const table of CRITICAL_TABLES) {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = ${table}
      ) as exists
    `)
    if (!result.rows[0]?.exists) {
      return false
    }
  }
  return true
}

async function runMigration() {
  console.log('[v0] Starting database migration...')
  
  // Skip migrations if DATABASE_URL is not set (local dev without DB)
  if (!process.env.DATABASE_URL) {
    console.log('[v0] ⏭ Skipping migrations: DATABASE_URL not set')
    process.exit(0)
  }
  
  try {
    // 1. Verify database connection
    console.log('[v0] Testing database connection...')
    await db.execute(sql`SELECT 1`)
    console.log('[v0] ✓ Database connection successful')
    
    // 2. Check if critical tables already exist
    console.log('[v0] Checking critical tables...')
    const tablesExist = await checkCriticalTables()
    if (tablesExist) {
      console.log('[v0] ✓ All critical tables exist — skipping migration')
      process.exit(0)
    }
    console.log('[v0] ⚠ Some critical tables missing — running migrations')
    
    // 3. Check migration history
    console.log('[v0] Checking migration history...')
    try {
      const historyResult = await db.execute(sql`
        SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5
      `)
      if (historyResult.rows.length > 0) {
        console.log('[v0] Last 5 migrations:', historyResult.rows.map(r => (r.hash as string)?.substring(0, 20)))
      } else {
        console.log('[v0] No migration history found (fresh database)')
      }
    } catch {
      console.log('[v0] Migration history table not yet created')
    }
    
    // 4. Execute migrations
    const migrationsPath = path.join(process.cwd(), 'drizzle')
    console.log('[v0] Running migrations from:', migrationsPath)
    await migrate(db, { migrationsFolder: migrationsPath, migrationsSchema: 'drizzle' })
    console.log('[v0] ✓ Migration completed successfully')

    // 5. Post-migration verification
    console.log('[v0] Verifying critical tables after migration...')
    const tablesExistAfter = await checkCriticalTables()
    if (!tablesExistAfter) {
      console.error('[v0] ✗ CRITICAL: Some tables still missing after migration!')
      // Log which tables are missing
      for (const table of CRITICAL_TABLES) {
        const result = await db.execute(sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = ${table}
          ) as exists
        `)
        if (!result.rows[0]?.exists) {
          console.error(`[v0]   ✗ Missing: ${table}`)
        }
      }
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
