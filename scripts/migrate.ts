import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import path from 'path'

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
    
    // 2. Check pending migrations before running
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
    
    // 3. Execute migrations
    const migrationsPath = path.join(process.cwd(), 'drizzle')
    console.log('[v0] Running migrations from:', migrationsPath)
    await migrate(db, { migrationsFolder: migrationsPath, migrationsSchema: 'drizzle' })
    console.log('[v0] ✓ Migration completed successfully')

    process.exit(0)
  } catch (error) {
    console.error('[v0] ✗ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
