// ============================================================================
// Client-side API — localStorage only (no server routes, no database).
//
// This module mirrors the old fetch-based API surface so existing components
// can keep calling `api.listWorkspaces()`, `api.putFile(...)`, etc. without
// changes. All data is persisted to the browser via src/lib/storage.ts.
// ============================================================================

import { db } from "./db";
import type {
  AppSettings,
  Chat,
  FileItem,
  FileNode,
  Message,
  MessageSegment,
  Provider,
  ProviderInput,
  Workspace,
} from "./types";
import { getSettingsSync, saveSettingsSync } from "./settings";
import { AGENT_TEMPLATE_FILE, TEMPLATES, type TemplateKey } from "./templates";
import { buildFileTree, safePath } from "./files";
import {
  testProviderConnection,
  fetchProviderModels,
  ZAI_BUILT_IN_BASEURL,
} from "./ai/provider";
import { createWorkspaceZip, extractZip, slugify } from "./zip";

function now() {
  return new Date();
}

function wsToDTO(row: Record<string, unknown>): Workspace {
  return {
    id: row.id as string,
    name: row.name as string,
    activeFile: (row.activeFile as string | null) ?? null,
    template: (row.template as string) ?? "blank",
    settings: safeParseJSON(row.settings as string, {}),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? new Date().toISOString()),
  };
}

function chatToDTO(row: Record<string, unknown>, messageCount?: number, lastMessage?: string): Chat {
  return {
    id: row.id as string,
    workspaceId: row.workspaceId as string,
    title: (row.title as string) || "New Chat",
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ""),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? ""),
    messageCount,
    lastMessage,
  };
}

function providerToDTO(row: Record<string, unknown>): Provider {
  return {
    id: row.id as string,
    name: row.name as string,
    baseURL: row.baseURL as string,
    hasApiKey: Boolean(row.apiKey && String(row.apiKey).length > 0),
    model: row.model as string,
    isActive: Boolean(row.isActive),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ""),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? ""),
  };
}

function safeParseJSON<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function fileToDTO(row: Record<string, unknown>): FileItem {
  return {
    id: row.id as string,
    workspaceId: row.workspaceId as string,
    path: row.path as string,
    content: row.content as string,
    isBinary: Boolean(row.isBinary),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? ""),
  };
}

// Fire-and-forget so callers can `await api.x()` without caring about ticks.
function tick<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export type FileListResponse = {
  files: { path: string; content: string; isBinary: boolean }[];
  tree: FileNode[];
};

export type CreateFileBody = { path: string; content?: string; isBinary?: boolean };
export type CreateWorkspaceBody = { name: string; template: string };
export type CreateChatBody = { title?: string };
export type SendMessageBody = { content: string; context?: { activeFile?: string | null; selectedFiles?: string[] } };
export type ContinueBody = { results: { callId: string; result?: unknown; error?: string }[] };

export const api = {
  /* --------------------------- Workspaces --------------------------- */

  listWorkspaces: async () => {
    const rows = await db.workspace.findMany({ orderBy: { updatedAt: "desc" } });
    return { workspaces: rows.map(wsToDTO) };
  },

  createWorkspace: async (body: CreateWorkspaceBody) => {
    const key = (body.template || "blank") as TemplateKey;
    const tpl = TEMPLATES[key] ?? TEMPLATES.blank;
    const ws = await db.workspace.create({
      data: {
        name: body.name?.trim() || "Untitled workspace",
        template: key,
        activeFile: tpl.files.some((f) => f.path === "index.html")
          ? "index.html"
          : (tpl.files[0]?.path ?? null),
        settings: "{}",
      },
    });
    const seed = [AGENT_TEMPLATE_FILE, ...tpl.files.filter((f) => f.path !== AGENT_TEMPLATE_FILE.path)];
    if (seed.length > 0) {
      await db.file.createMany({
        data: seed.map((f) => ({
          workspaceId: ws.id as string,
          path: f.path,
          content: f.content,
          isBinary: false,
        })),
      });
    }
    return { workspace: wsToDTO(ws) };
  },

  getWorkspace: async (id: string) => {
    const row = await db.workspace.findUnique({ where: { id } });
    if (!row) throw new Error("Workspace not found");
    return { workspace: wsToDTO(row) };
  },

  patchWorkspace: async (
    id: string,
    body: { name?: string; activeFile?: string | null; settings?: unknown }
  ) => {
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.activeFile !== undefined) data.activeFile = body.activeFile;
    if (body.settings && typeof body.settings === "object") {
      const existing = await db.workspace.findUnique({ where: { id } });
      const current = safeParseJSON(existing?.settings, {});
      data.settings = JSON.stringify({ ...current, ...(body.settings as object) });
    }
    const updated = await db.workspace.update({ where: { id }, data });
    return { workspace: wsToDTO(updated) };
  },

  deleteWorkspace: async (id: string) => {
    await db.workspace.delete({ where: { id } });
    return { ok: true };
  },

  downloadWorkspace: async (id: string) => {
    const ws = await db.workspace.findUnique({ where: { id } });
    if (!ws) throw new Error("Workspace not found");
    const files = await db.file.findMany({ where: { workspaceId: id }, orderBy: { path: "asc" } });
    const buffer = await createWorkspaceZip(
      slugify(ws.name as string),
      files.map((f) => ({
        path: f.path as string,
        content: f.content as string,
        isBinary: Boolean(f.isBinary),
      }))
    );
    return new Blob([buffer as unknown as BlobPart], { type: "application/zip" });
  },

  importWorkspace: async (file: File) => {
    const buf = Buffer.from(await file.arrayBuffer());
    const entries = await extractZip(buf);
    if (entries.length === 0) throw new Error("ZIP contains no importable files");
    const name = file.name.replace(/\.zip$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "Imported Workspace";
    const ws = await db.workspace.create({
      data: {
        name,
        template: "blank",
        activeFile: entries.some((e) => e.path === "index.html") ? "index.html" : (entries[0]?.path ?? null),
        settings: "{}",
      },
    });
    const safe = entries.slice(0, 2000);
    await db.file.createMany({
      data: safe.map((e) => ({
        workspaceId: ws.id as string,
        path: e.path,
        content: e.content,
        isBinary: e.isBinary,
      })),
    });
    return { workspace: wsToDTO(ws) };
  },

  /* ------------------------------ Files ------------------------------ */

  listFiles: async (id: string): Promise<FileListResponse> => {
    const files = await db.file.findMany({
      where: { workspaceId: id },
      orderBy: { path: "asc" },
    });
    // Lazy-create AGENT.md if missing
    const hasAgentMd = files.some((f) => f.path === AGENT_TEMPLATE_FILE.path);
    if (!hasAgentMd) {
      await db.file.create({
        data: {
          workspaceId: id,
          path: AGENT_TEMPLATE_FILE.path,
          content: AGENT_TEMPLATE_FILE.content,
          isBinary: false,
        },
      }).catch(() => {});
      const refreshed = await db.file.findMany({ where: { workspaceId: id }, orderBy: { path: "asc" } });
      return {
        files: refreshed.map((f) => ({ path: f.path as string, content: f.content as string, isBinary: Boolean(f.isBinary) })),
        tree: buildFileTree(refreshed.map((f) => f.path as string)),
      };
    }
    return {
      files: files.map((f) => ({ path: f.path as string, content: f.content as string, isBinary: Boolean(f.isBinary) })),
      tree: buildFileTree(files.map((f) => f.path as string)),
    };
  },

  createFile: async (id: string, body: CreateFileBody) => {
    const path = safePath(body.path);
    if (!path) throw new Error("Invalid or missing path");
    const file = await db.file.upsert({
      where: { workspaceId_path: { workspaceId: id, path } },
      update: { content: body.content ?? "", isBinary: body.isBinary ?? false },
      create: { workspaceId: id, path, content: body.content ?? "", isBinary: body.isBinary ?? false },
    });
    await db.workspace.update({ where: { id }, data: { updatedAt: now() } }).catch(() => {});
    return { file: fileToDTO(file) };
  },

  getFile: async (id: string, path: string) => {
    const file = await db.file.findUnique({
      where: { workspaceId_path: { workspaceId: id, path: safePath(path) } },
    });
    if (!file) throw new Error("File not found");
    return { file: fileToDTO(file) };
  },

  putFile: async (id: string, path: string, content: string) => {
    const safe = safePath(path);
    const file = await db.file.upsert({
      where: { workspaceId_path: { workspaceId: id, path: safe } },
      update: { content },
      create: { workspaceId: id, path: safe, content, isBinary: false },
    });
    await db.workspace.update({ where: { id }, data: { updatedAt: now() } }).catch(() => {});
    return { file: fileToDTO(file) };
  },

  deleteFile: async (id: string, path: string) => {
    const safe = safePath(path);
    const prefix = safe.endsWith("/") ? safe : safe + "/";
    await db.file.deleteMany({
      where: { workspaceId: id, OR: [{ path: safe }, { path: { startsWith: prefix } }] },
    });
    await db.workspace.update({ where: { id }, data: { updatedAt: now() } }).catch(() => {});
    return { ok: true };
  },

  renameFile: async (id: string, from: string, to: string) => {
    const f = safePath(from);
    const t = safePath(to);
    if (!f || !t) throw new Error("Invalid path");
    if (f === t) throw new Error("Source and destination are the same");
    const existing = await db.file.findUnique({ where: { workspaceId_path: { workspaceId: id, path: f } } });
    const children = await db.file.findMany({ where: { workspaceId: id, path: { startsWith: f + "/" } } });
    if (!existing && children.length === 0) throw new Error(`File or folder not found: ${f}`);
    if (await db.file.findUnique({ where: { workspaceId_path: { workspaceId: id, path: t } } }))
      throw new Error(`Destination already exists: ${t}`);
    if (existing) await db.file.update({ where: { id: existing.id as string }, data: { path: t } });
    for (const c of children) {
      await db.file
        .update({ where: { id: c.id as string }, data: { path: t + (c.path as string).slice(f.length) } })
        .catch(() => {});
    }
    const any = await db.file.findFirst({ where: { workspaceId: id, path: { startsWith: t } } });
    await db.workspace.update({ where: { id }, data: { updatedAt: now() } }).catch(() => {});
    return {
      file: any
        ? fileToDTO(any)
        : ({ id: "", workspaceId: id, path: t, content: "", isBinary: false, updatedAt: "" } as FileItem),
    };
  },

  /* ------------------------------ Chats ------------------------------ */

  listChats: async (workspaceId: string) => {
    const rows = await db.chat.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
    });
    const chats: Chat[] = [];
    for (const c of rows) {
      const count = await db.message.count({ where: { chatId: c.id as string } });
      let lastMessage: string | undefined;
      const last = await db.message.findFirst({
        where: { chatId: c.id as string, role: "user" },
        orderBy: { createdAt: "desc" },
      });
      if (last) {
        const segs = safeParseJSON<MessageSegment[]>(last.segments, []);
        lastMessage = segs
          .filter((s) => s.type === "content")
          .map((s) => (s as { content: string }).content)
          .join(" ")
          .trim()
          .slice(0, 160) || undefined;
      }
      chats.push(chatToDTO(c, count, lastMessage));
    }
    return { chats };
  },

  createChat: async (workspaceId: string, body: CreateChatBody = {}) => {
    const chat = await db.chat.create({
      data: { workspaceId, title: body.title?.trim() || "New Chat" },
    });
    return { chat: chatToDTO(chat, 0) };
  },

  getChat: async (id: string) => {
    const row = await db.chat.findUnique({ where: { id } });
    if (!row) throw new Error("Chat not found");
    const msgRows = await db.message.findMany({ where: { chatId: id }, orderBy: { createdAt: "asc" } });
    const messages: Message[] = msgRows.map((m) => ({
      id: m.id as string,
      chatId: m.chatId as string,
      role: m.role as "user" | "assistant",
      segments: safeParseJSON<MessageSegment[]>(m.segments, []),
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
    }));
    return { chat: chatToDTO(row, messages.length), messages };
  },

  patchChat: async (id: string, body: { title?: string }) => {
    const data: Record<string, unknown> = {};
    if (body.title) data.title = body.title.trim();
    const updated = await db.chat.update({ where: { id }, data });
    return { chat: chatToDTO(updated) };
  },

  deleteChat: async (id: string) => {
    await db.chat.delete({ where: { id } });
    return { ok: true };
  },

  duplicateChat: async (id: string) => {
    const src = await db.chat.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    if (!src) throw new Error("Chat not found");
    const created = await db.chat.create({
      data: {
        workspaceId: src.workspaceId as string,
        title: `${(src.title as string) || "New Chat"} (copy)`,
      },
    });
    const msgs = (src as unknown as { messages: Record<string, unknown>[] }).messages;
    if (msgs.length > 0) {
      await db.message.createMany({
        data: msgs.map((m) => ({
          chatId: created.id as string,
          role: m.role as string,
          segments: m.segments as string,
          createdAt: m.createdAt as Date,
        })),
      });
    }
    return { chat: chatToDTO(created) };
  },

  searchChats: async (q: string) => {
    const query = q.trim().toLowerCase();
    if (!query) return { chats: [] };
    const chats = await db.chat.findMany({
      include: { workspace: { select: { name: true } }, messages: { select: { role: true, segments: true, createdAt: true } } },
      orderBy: { updatedAt: "desc" },
    });
    const results: Chat[] = [];
    for (const c of chats) {
      let snippet: string | undefined;
      let matched = (c.title as string).toLowerCase().includes(query);
      const msgs = (c as unknown as { messages: Record<string, unknown>[] }).messages;
      if (!matched) {
        for (const m of msgs) {
          const segs = safeParseJSON<MessageSegment[]>(m.segments, []);
          for (const s of segs) {
            if (s.type === "content") {
              const text = (s as { content: string }).content;
              const idx = text.toLowerCase().indexOf(query);
              if (idx >= 0) {
                matched = true;
                const start = Math.max(0, idx - 30);
                snippet = (start > 0 ? "…" : "") + text.slice(start, start + 160).trim() + (start + 160 < text.length ? "…" : "");
                break;
              }
            }
          }
          if (matched) break;
        }
      }
      if (matched) {
        results.push(chatToDTO(c, undefined, snippet));
        if (results.length >= 50) break;
      }
    }
    return { chats: results };
  },

  /* ------------------------- AI (client streaming via worker) ---------
     The agent now runs in a Web Worker (useAgentWorker). These methods are
     retained as no-op placeholders so older imports keep type-checking;
     useChatStream drives the worker directly. -------------------------------- */

  streamMessage: async (): Promise<ReadableStream<Uint8Array>> => {
    throw new Error("Streaming is handled by the Web Worker agent.");
  },
  streamContinue: async (): Promise<ReadableStream<Uint8Array>> => {
    throw new Error("Streaming is handled by the Web Worker agent.");
  },
  streamRegenerate: async (): Promise<ReadableStream<Uint8Array>> => {
    throw new Error("Streaming is handled by the Web Worker agent.");
  },

  /* ---------------------------- Providers ---------------------------- */

  listProviders: async () => {
    const rows = await db.provider.findMany({ orderBy: { createdAt: "asc" } });
    return { providers: rows.map(providerToDTO) };
  },

  createProvider: async (body: ProviderInput) => {
    const isActive = body.isActive !== false;
    if (isActive) await db.provider.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const row = await db.provider.create({
      data: {
        name: body.name,
        baseURL: body.baseURL.replace(/\/+$/, ""),
        apiKey: body.apiKey?.trim() || null,
        model: body.model,
        isActive,
      },
    });
    return { provider: providerToDTO(row) };
  },

  patchProvider: async (id: string, body: Partial<ProviderInput> & { clearApiKey?: boolean }) => {
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.baseURL === "string" && body.baseURL.trim()) {
      const norm = body.baseURL.trim().replace(/\/+$/, "");
      if (norm !== ZAI_BUILT_IN_BASEURL) {
        try { new URL(norm); } catch { throw new Error("Invalid baseURL"); }
      }
      data.baseURL = norm;
    }
    if (typeof body.model === "string" && body.model.trim()) data.model = body.model.trim();
    if (typeof body.apiKey === "string") {
      if (body.apiKey.trim().length > 0) data.apiKey = body.apiKey.trim();
      else if (body.clearApiKey) data.apiKey = null;
    }
    if (body.isActive === true) {
      await db.provider.updateMany({ where: { isActive: true }, data: { isActive: false } });
      data.isActive = true;
    } else if (body.isActive === false) {
      data.isActive = false;
    }
    const row = await db.provider.update({ where: { id }, data });
    return { provider: providerToDTO(row) };
  },

  deleteProvider: async (id: string) => {
    const existing = await db.provider.findUnique({ where: { id } });
    await db.provider.delete({ where: { id } });
    if (existing?.isActive) {
      const first = await db.provider.findFirst({ orderBy: { createdAt: "asc" } });
      if (first) await db.provider.update({ where: { id: first.id as string }, data: { isActive: true } });
    }
    return { ok: true };
  },

  testProvider: async (id: string, body?: { apiKey?: string }) => {
    const row = await db.provider.findUnique({ where: { id } });
    if (!row) throw new Error("Provider not found");
    const p = { ...(row as Record<string, unknown>), apiKey: body?.apiKey?.trim() || (row.apiKey as string | null) } as Record<string, unknown>;
    return testProviderConnection(p as any);
  },

  listProviderModels: async (id: string) => {
    const row = await db.provider.findUnique({ where: { id } });
    if (!row) throw new Error("Provider not found");
    const models = await fetchProviderModels(row as any);
    return { models };
  },

  fetchModelsForCustom: async (body: { baseURL: string; apiKey?: string }) => {
    const temp = {
      id: "temp",
      name: "temp",
      baseURL: body.baseURL.replace(/\/+$/, ""),
      apiKey: body.apiKey?.trim() || null,
      model: "temp",
      isActive: false,
    };
    const models = await fetchProviderModels(temp as any);
    return { models };
  },

  testCustomConnection: async (body: { baseURL: string; apiKey?: string; model?: string }) => {
    const temp = {
      id: "temp",
      name: "temp",
      baseURL: body.baseURL.replace(/\/+$/, ""),
      apiKey: body.apiKey?.trim() || null,
      model: body.model?.trim() || "gpt-4o-mini",
      isActive: false,
    };
    return testProviderConnection(temp as any);
  },

  /* ----------------------------- Settings ----------------------------- */

  getSettings: async () => ({ settings: getSettingsSync() }),

  patchSettings: async (body: Partial<AppSettings>) => ({
    settings: saveSettingsSync(body),
  }),
};

// Re-exported so callers can use the type without importing from ./types.
export type { MessageSegment };
