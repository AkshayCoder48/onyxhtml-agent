// ============================================================================
// LocalStorage-backed data layer
//
// Replaces the old Prisma/SQLite database. All workspaces, files, chats,
// messages, providers and settings live in the browser's localStorage.
//
// The API intentionally mirrors the small subset of Prisma's API that the
// app uses (findUnique/findMany/findFirst/create/createMany/update/updateMany/
// upsert/delete/deleteMany/count/$transaction), so the rest of the codebase
// can `import { db } from "@/lib/db"` unchanged.
//
// Dates are stored as ISO strings and revived into Date objects on read so
// the rest of the app can keep calling .toISOString() etc.
// ============================================================================

const STORAGE_KEY = "onyxhtml:db:v1";

type Row = Record<string, unknown>;
type TableMap = Record<string, Row[]>;

type MemoryShape = {
  workspace: Row[];
  file: Row[];
  chat: Row[];
  message: Row[];
  provider: Row[];
  appSetting: Row[];
};

const emptyDb = (): MemoryShape => ({
  workspace: [],
  file: [],
  chat: [],
  message: [],
  provider: [],
  appSetting: [],
});

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// In-memory mirror used on the server (SSR) and as a write-through cache in
// the browser. On the server there is no persistence — every SSR render
// starts empty, which is fine because all real data access happens in event
// handlers / effects on the client.
let memory: MemoryShape = emptyDb();
let loaded = false;

function reviveValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(reviveValue);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (
        typeof v === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) &&
        (k === "createdAt" || k === "updatedAt" || k === "time")
      ) {
        const d = new Date(v);
        out[k] = isNaN(d.getTime()) ? v : d;
      } else {
        out[k] = reviveValue(v);
      }
    }
    return out;
  }
  return value;
}

function load(): MemoryShape {
  if (loaded) return memory;
  loaded = true;
  if (isBrowser()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MemoryShape>;
        memory = { ...emptyDb(), ...parsed };
      }
    } catch {
      memory = emptyDb();
    }
  }
  return memory;
}

let persistScheduled = false;
let persistSuppressed = false;
function persist(): void {
  if (persistSuppressed) return;
  if (!isBrowser()) return;
  if (persistScheduled) return;
  persistScheduled = true;
  // Microtask debounce so a $transaction of many writes serializes once.
  Promise.resolve().then(() => {
    persistScheduled = false;
    if (persistSuppressed) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch (e) {
      console.error("[storage] Failed to persist:", e);
    }
  });
}
function persistNow(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch (e) {
    console.error("[storage] Failed to persist:", e);
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

function genId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

// ----------------------------------------------------------------------------
// Query helpers
// ----------------------------------------------------------------------------

type Where = Record<string, unknown>;

function compareValues(av: unknown, bv: unknown): number {
  if (av === bv) return 0;
  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;
  if (av instanceof Date && bv instanceof Date) {
    return av.getTime() - bv.getTime();
  }
  if (av < bv) return -1;
  return 1;
}

// Prisma compound unique inputs look like
//   { workspaceId_path: { workspaceId, path } }
// The row has workspaceId + path, not a workspaceId_path field. Flatten those
// objects so findUnique / upsert actually match existing file rows.
const FILTER_OPS = new Set([
  "equals",
  "in",
  "notIn",
  "not",
  "startsWith",
  "endsWith",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
]);

function expandWhere(where: Where): Where {
  const out: Where = {};
  for (const key of Object.keys(where)) {
    const expected = where[key];
    if (
      key.includes("_") &&
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      !(expected instanceof Date)
    ) {
      const obj = expected as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length > 0 && keys.every((k) => !FILTER_OPS.has(k))) {
        Object.assign(out, obj);
        continue;
      }
    }
    out[key] = expected;
  }
  return out;
}

function matchWhere(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  where = expandWhere(where);
  for (const key of Object.keys(where)) {
    const expected = where[key];
    if (key === "AND") {
      const arr = expected as Where[];
      if (!arr.every((w) => matchWhere(row, w))) return false;
      continue;
    }
    if (key === "OR") {
      const arr = expected as Where[];
      if (!arr.some((w) => matchWhere(row, w))) return false;
      continue;
    }
    if (key === "NOT") {
      if (matchWhere(row, expected as Where)) return false;
      continue;
    }
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
      const ops = expected as Record<string, unknown>;
      const val = row[key];
      if ("equals" in ops && val !== ops.equals) return false;
      if ("in" in ops) {
        const arr = ops.in as unknown[];
        if (!arr.includes(val)) return false;
      }
      if ("notIn" in ops) {
        const arr = ops.notIn as unknown[];
        if (arr.includes(val)) return false;
      }
      if ("not" in ops && val === ops.not) return false;
      if ("startsWith" in ops) {
        if (typeof val !== "string" || !(val as string).startsWith(ops.startsWith as string))
          return false;
      }
      if ("endsWith" in ops) {
        if (typeof val !== "string" || !(val as string).endsWith(ops.endsWith as string))
          return false;
      }
      if ("contains" in ops) {
        if (typeof val !== "string" || !(val as string).includes(ops.contains as string))
          return false;
      }
      if ("gt" in ops && !(compareValues(val, ops.gt) > 0)) return false;
      if ("gte" in ops && !(compareValues(val, ops.gte) >= 0)) return false;
      if ("lt" in ops && !(compareValues(val, ops.lt) < 0)) return false;
      if ("lte" in ops && !(compareValues(val, ops.lte) <= 0)) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

function applySelect<T extends Row>(row: T, select: Record<string, unknown> | undefined): T {
  if (!select) return row;
  const out: Row = {};
  for (const k of Object.keys(select)) {
    if (select[k]) out[k] = row[k];
  }
  return out as T;
}

type IncludeSpec = Record<string, boolean | Record<string, unknown>>;

function applyInclude(
  row: Row,
  include: IncludeSpec | undefined
): Row {
  if (!include) return row;
  const out: Row = { ...row };
  const d = load();
  for (const key of Object.keys(include)) {
    if (!include[key]) continue;
    if (key === "messages") {
      out.messages = d.message
        .filter((m) => m.chatId === row.id)
        .map((r) => reviveValue(r) as Row);
    } else if (key === "files") {
      out.files = d.file
        .filter((f) => f.workspaceId === row.id)
        .map((r) => reviveValue(r) as Row);
    } else if (key === "workspace") {
      out.workspace = reviveValue(
        d.workspace.find((w) => w.id === row.workspaceId) ?? null
      );
    } else if (key === "chats") {
      out.chats = d.chat
        .filter((c) => c.workspaceId === row.id)
        .map((r) => reviveValue(r) as Row);
    } else if (key === "_count") {
      const spec = (include[key] as Record<string, boolean>) ?? {};
      const count: Record<string, number> = {};
      if (spec.messages) count.messages = d.message.filter((m) => m.chatId === row.id).length;
      if (spec.files) count.files = d.file.filter((f) => f.workspaceId === row.id).length;
      out._count = count;
    }
  }
  return out;
}

type OrderBy = Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];

type FindManyArgs = {
  where?: Where;
  orderBy?: OrderBy;
  take?: number;
  skip?: number;
  include?: IncludeSpec;
  select?: Record<string, unknown>;
};

function sortRows(rows: Row[], orderBy: OrderBy | undefined): Row[] {
  if (!orderBy) return rows;
  const arr = Array.isArray(orderBy) ? orderBy : [orderBy];
  const out = rows.slice();
  out.sort((a, b) => {
    for (const o of arr) {
      const key = Object.keys(o)[0];
      const dir = o[key] === "desc" ? -1 : 1;
      const cmp = compareValues(a[key], b[key]);
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
  return out;
}

// ----------------------------------------------------------------------------
// Delegate (per-table)
// ----------------------------------------------------------------------------

export class Delegate<T extends Row> {
  constructor(public tableName: keyof MemoryShape) {}

  private rows(): Row[] {
    return load()[this.tableName];
  }

  private stamp(row: Row, isCreate: boolean): Row {
    const now = nowISO();
    if (isCreate && row.createdAt === undefined) row.createdAt = now;
    row.updatedAt = now;
    return row;
  }

  async findMany(args: FindManyArgs = {}): Promise<T[]> {
    let rows = this.rows().filter((r) => matchWhere(r as Row, args.where as Where));
    rows = sortRows(rows, args.orderBy);
    if (args.skip) rows = rows.slice(args.skip);
    if (args.take) rows = rows.slice(0, args.take);
    return rows
      .map((r) => applyInclude(r as Row, args.include))
      .map((r) => applySelect(reviveValue(r) as Row, args.select)) as unknown as T[];
  }

  async findUnique(args: {
    where: Record<string, unknown>;
    include?: IncludeSpec;
    select?: Record<string, unknown>;
  }): Promise<T | null> {
    const row = this.rows().find((r) => matchWhere(r as Row, args.where));
    if (!row) return null;
    const withInc = applyInclude(row as Row, args.include);
    return applySelect(reviveValue(withInc) as Row, args.select) as unknown as T;
  }

  async findFirst(args: FindManyArgs = {}): Promise<T | null> {
    const rows = await this.findMany(args);
    return (rows[0] as T) ?? null;
  }

  async count(args: { where?: Record<string, unknown> } = {}): Promise<number> {
    return this.rows().filter((r) => matchWhere(r, args.where)).length;
  }

  async create(args: { data: Partial<T> }): Promise<T> {
    const row: Row = { ...(args.data as Row) };
    if (!row.id) row.id = genId();
    this.stamp(row, true);
    this.rows().push(row);
    persist();
    return reviveValue(row) as T;
  }

  async createMany(args: { data: Partial<T>[] }): Promise<{ count: number }> {
    let count = 0;
    for (const d of args.data) {
      const row: Row = { ...(d as Row) };
      if (!row.id) row.id = genId();
      this.stamp(row, true);
      this.rows().push(row);
      count++;
    }
    persist();
    return { count };
  }

  async update(args: { where: Where; data: Partial<T> }): Promise<T> {
    const rows = this.rows();
    const idx = rows.findIndex((r) => matchWhere(r, args.where));
    if (idx < 0) throw new Error(`Record not found in ${this.tableName}`);
    rows[idx] = { ...rows[idx], ...(args.data as Row) };
    this.stamp(rows[idx], false);
    persist();
    return reviveValue(rows[idx]) as T;
  }

  async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }> {
    let count = 0;
    for (const r of this.rows()) {
      if (matchWhere(r, args.where)) {
        Object.assign(r, args.data as Row);
        this.stamp(r, false);
        count++;
      }
    }
    persist();
    return { count };
  }

  async upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<T> {
    const existing = this.rows().find((r) => matchWhere(r, args.where));
    if (existing) {
      Object.assign(existing, args.update as Row);
      this.stamp(existing, false);
      persist();
      return reviveValue(existing) as T;
    }
    return this.create({ data: args.create as unknown as Partial<T> });
  }

  async delete(args: { where: Record<string, unknown> }): Promise<T> {
    const rows = this.rows();
    const idx = rows.findIndex((r) => matchWhere(r, args.where));
    if (idx < 0) throw new Error(`Record not found in ${this.tableName}`);
    const [removed] = rows.splice(idx, 1);
    this.cascadeDelete(removed);
    persist();
    return reviveValue(removed) as T;
  }

  async deleteMany(args: { where?: Record<string, unknown> } = {}): Promise<{ count: number }> {
    const rows = this.rows();
    const keep: Row[] = [];
    let count = 0;
    for (const r of rows) {
      if (matchWhere(r, args.where)) {
        this.cascadeDelete(r);
        count++;
      } else {
        keep.push(r);
      }
    }
    load()[this.tableName] = keep;
    persist();
    return { count };
  }

  private cascadeDelete(row: Row): void {
    const d = load();
    if (this.tableName === "workspace") {
      const chatIds = d.chat.filter((c) => c.workspaceId === row.id).map((c) => c.id);
      d.chat = d.chat.filter((c) => c.workspaceId !== row.id);
      d.file = d.file.filter((f) => f.workspaceId !== row.id);
      d.message = d.message.filter((m) => !chatIds.includes(m.chatId));
    } else if (this.tableName === "chat") {
      d.message = d.message.filter((m) => m.chatId !== row.id);
    }
  }

  async $queryRawUnsafe(_q: string): Promise<unknown> {
    return [{ 1: 1 }];
  }
}

// ----------------------------------------------------------------------------
// Transaction (defers persist until the batch completes)
// ----------------------------------------------------------------------------

// Strongly-typed row shapes so the rest of the app can read `file.content`
// etc. without casting.
export type WorkspaceRow = {
  id: string;
  name: string;
  activeFile: string | null;
  template: string;
  settings: string;
  createdAt: Date;
  updatedAt: Date;
  [k: string]: unknown;
};
export type FileRow = {
  id: string;
  workspaceId: string;
  path: string;
  content: string;
  isBinary: boolean;
  createdAt: Date;
  updatedAt: Date;
  [k: string]: unknown;
};
export type ChatRow = {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  [k: string]: unknown;
};
export type MessageRow = {
  id: string;
  chatId: string;
  role: string;
  segments: string;
  createdAt: Date;
  [k: string]: unknown;
};
export type ProviderRow = {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string | null;
  model: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  [k: string]: unknown;
};
export type AppSettingRow = { key: string; value: string; [k: string]: unknown };

export type DbClient = {
  workspace: Delegate<WorkspaceRow>;
  file: Delegate<FileRow>;
  chat: Delegate<ChatRow>;
  message: Delegate<MessageRow>;
  provider: Delegate<ProviderRow>;
  appSetting: Delegate<AppSettingRow>;
  $transaction: <R>(fn: (tx: DbClient) => Promise<R> | R) => Promise<R>;
  $queryRawUnsafe: (q: string) => Promise<unknown>;
};

function makeClient(): DbClient {
  const workspace = new Delegate<WorkspaceRow>("workspace");
  const file = new Delegate<FileRow>("file");
  const chat = new Delegate<ChatRow>("chat");
  const message = new Delegate<MessageRow>("message");
  const provider = new Delegate<ProviderRow>("provider");
  const appSetting = new Delegate<AppSettingRow>("appSetting");
  const client: DbClient = {
    workspace,
    file,
    chat,
    message,
    provider,
    appSetting,
    $transaction: async (fn) => {
      persistSuppressed = true;
      try {
        const result = await fn(client);
        persistSuppressed = false;
        persistNow();
        return result;
      } catch (e) {
        persistSuppressed = false;
        throw e;
      }
    },
    $queryRawUnsafe: (q) => workspace.$queryRawUnsafe(q),
  };
  return client;
}

export const db: DbClient = makeClient();

export async function ensureDbInitialized(): Promise<void> {
  // localStorage is initialised lazily on first access. No default provider
  // is seeded — the user must add their own AI provider in Settings.
  load();
}

// Test/utility: wipe all local data.
export function resetStorage(): void {
  memory = emptyDb();
  loaded = true;
  if (isBrowser()) window.localStorage.removeItem(STORAGE_KEY);
}
