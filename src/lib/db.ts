import { PrismaClient } from '@prisma/client'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Prisma resolves the datasource URL from `DATABASE_URL` lazily — at the first
// query, not at import time. If the variable is missing it surfaces as a
// cryptic "Environment variable not found: DATABASE_URL" 500 on the first DB
// call (e.g. "Failed to create workspace"). Provide a SQLite fallback so the
// app keeps working regardless of how it was started:
//   - packaged sandbox/FC deployment  -> /app/db/custom.db  (.zscripts/start.sh)
//   - local dev (repo root)           -> ./db/custom.db
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const candidates = [
    '/app/db/custom.db', // packaged sandbox/FC deployment
    join(process.cwd(), 'db', 'custom.db'), // local dev (repo root)
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return `file:${candidate}`
  }
  return 'file:./db/custom.db'
}

process.env.DATABASE_URL = resolveDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

let dbInitialized = false
let dbInitPromise: Promise<void> | null = null

export async function ensureDbInitialized(): Promise<void> {
  if (dbInitialized) return
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await db.$queryRawUnsafe('SELECT 1')
      dbInitialized = true
    })()
  }
  await dbInitPromise
}
