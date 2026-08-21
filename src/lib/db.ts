import { PrismaClient } from '@prisma/client'
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  openSync,
  closeSync,
  unlinkSync,
} from 'node:fs'
import { join, dirname, basename, isAbsolute, resolve } from 'node:path'
import { tmpdir } from 'node:os'

// Prisma resolves the datasource URL from `DATABASE_URL` lazily — at the first
// query, not at import time. If the variable is missing it surfaces as a
// cryptic "Environment variable not found: DATABASE_URL" 500 on the first DB
// call (e.g. "Failed to create workspace"). We provide a SQLite fallback so
// the app keeps working regardless of how it was started:
//   - packaged sandbox/FC deployment -> /app/db/custom.db (.zscripts/start.sh)
//   - local dev (repo root) -> ./db/custom.db
//
// A second, subtler failure mode is "attempt to write a readonly database"
// (SQLite error code 8). It happens when the bundled SQLite file sits on a
// read-only filesystem — e.g. a serverless deployment or a read-only
// container — where reads succeed (ensureDbInitialized's `SELECT 1` passes)
// but the first write (workspace.create) throws. We detect that and migrate
// to a writable temp directory, seeding it from the bundled DB.

// Can we actually create files in this directory? (definitive, catches ro mounts)
function canWriteDir(dir: string): boolean {
  try {
    const probe = join(
      dir,
      `.onyx-w-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    const fd = openSync(probe, 'w')
    closeSync(fd)
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

// Can we open this existing file for read+write?
function canWriteFile(path: string): boolean {
  try {
    const fd = openSync(path, 'r+')
    closeSync(fd)
    return true
  } catch {
    return false
  }
}

function isWritableTarget(path: string): boolean {
  if (existsSync(path)) return canWriteFile(path)
  return canWriteDir(dirname(path))
}

function toAbsolute(p: string): string {
  return isAbsolute(p) ? p : resolve(process.cwd(), p)
}

// The committed seed database, bundled at the known deployment locations.
function findSeedDb(): string | null {
  for (const p of ['/app/db/custom.db', join(process.cwd(), 'db', 'custom.db')]) {
    if (existsSync(p)) return p
  }
  return null
}

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL

  // A non-file datasource (external Postgres/LibSQL/etc.) — trust it as-is.
  if (raw && !raw.startsWith('file:')) return raw

  // Resolve the target SQLite path.
  let path: string
  if (raw) {
    path = toAbsolute(raw.slice('file:'.length))
  } else {
    path = findSeedDb() ?? join(process.cwd(), 'db', 'custom.db')
  }

  // If the target is writable, use it directly (covers local dev + writable
  // containers).
  if (isWritableTarget(path)) return `file:${path}`

  // Read-only filesystem: migrate to a writable temp dir, seeding it from the
  // bundled DB on first run so existing data isn't lost.
  const dir = join(tmpdir(), 'onyxhtml')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  const target = join(dir, basename(path) || 'custom.db')
  const seed = findSeedDb() ?? path
  if (!existsSync(target) && existsSync(seed)) {
    try {
      copyFileSync(seed, target)
    } catch {}
  }
  return `file:${target}`
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
