import { PrismaClient } from '@prisma/client'

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
