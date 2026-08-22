// Backwards-compatible entry point. The real implementation now lives in
// src/lib/storage.ts and is backed by the browser's localStorage (not
// Prisma/SQLite). This re-export keeps all existing `import { db } from
// "@/lib/db"` call sites working unchanged.

export { db, ensureDbInitialized, resetStorage } from "./storage";
