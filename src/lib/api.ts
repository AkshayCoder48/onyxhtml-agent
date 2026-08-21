// Typed fetch wrappers for all API routes.
// All routes are relative paths under the app origin.

import type {
  AppSettings,
  Chat,
  FileItem,
  FileNode,
  Message,
  Provider,
  ProviderInput,
  Workspace,
} from "./types";

export type FileListResponse = {
  files: { path: string; content: string; isBinary: boolean }[];
  tree: FileNode[];
};

export type CreateFileBody = {
  path: string;
  content?: string;
  isBinary?: boolean;
};

export type CreateWorkspaceBody = {
  name: string;
  template: string;
};

export type CreateChatBody = {
  title?: string;
};

export type SendMessageBody = {
  content: string;
  context?: {
    activeFile?: string | null;
    selectedFiles?: string[];
  };
};

export type ContinueBody = {
  results: {
    callId: string;
    result?: unknown;
    error?: string;
  }[];
};

async function request<T>(
  url: string,
  init?: RequestInit,
  expectJson = true
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.clone().json()) as { error?: string; message?: string };
      if (j?.error) detail = j.error;
      else if (j?.message) detail = j.message;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  if (!expectJson) return undefined as unknown as T;
  return (await res.json()) as T;
}

/* ----------------------------- Workspaces ----------------------------- */

export const api = {
  listWorkspaces: () =>
    request<{ workspaces: Workspace[] }>("/api/workspaces"),

  createWorkspace: (body: CreateWorkspaceBody) =>
    request<{ workspace: Workspace }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getWorkspace: (id: string) =>
    request<{ workspace: Workspace }>(`/api/workspaces/${id}`),

  patchWorkspace: (
    id: string,
    body: { name?: string; activeFile?: string | null; settings?: unknown }
  ) =>
    request<{ workspace: Workspace }>(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteWorkspace: (id: string) =>
    request<{ ok: boolean }>(`/api/workspaces/${id}`, { method: "DELETE" }),

  downloadWorkspace: async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}/download`);
    if (!res.ok) throw new Error("Download failed");
    return res.blob();
  },

  importWorkspace: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    // The [id] segment is ignored by the backend — it creates a new workspace.
    return request<{ workspace: Workspace }>(`/api/workspaces/new/import`, {
      method: "POST",
      body: form,
    });
  },

  /* ------------------------------- Files ------------------------------- */

  listFiles: (id: string) =>
    request<FileListResponse>(`/api/workspaces/${id}/files`),

  createFile: (id: string, body: CreateFileBody) =>
    request<{ file: FileItem }>(`/api/workspaces/${id}/files`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getFile: (id: string, path: string) =>
    request<{ file: FileItem }>(
      `/api/workspaces/${id}/files?path=${encodeURIComponent(path)}`
    ),

  putFile: (id: string, path: string, content: string) =>
    request<{ file: FileItem }>(
      `/api/workspaces/${id}/files?path=${encodeURIComponent(path)}`,
      {
        method: "PUT",
        body: JSON.stringify({ content }),
      }
    ),

  deleteFile: (id: string, path: string) =>
    request<{ ok: boolean }>(
      `/api/workspaces/${id}/files?path=${encodeURIComponent(path)}`,
      { method: "DELETE" }
    ),

  renameFile: (id: string, from: string, to: string) =>
    request<{ file: FileItem }>(`/api/workspaces/${id}/files/rename`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),

  /* ------------------------------- Chats ------------------------------- */

  listChats: (workspaceId: string) =>
    request<{ chats: Chat[] }>(`/api/workspaces/${workspaceId}/chats`),

  createChat: (workspaceId: string, body: CreateChatBody = {}) =>
    request<{ chat: Chat }>(`/api/workspaces/${workspaceId}/chats`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getChat: (id: string) =>
    request<{ chat: Chat; messages: Message[] }>(`/api/chats/${id}`),

  patchChat: (id: string, body: { title?: string }) =>
    request<{ chat: Chat }>(`/api/chats/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteChat: (id: string) =>
    request<{ ok: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),

  duplicateChat: (id: string) =>
    request<{ chat: Chat }>(`/api/chats/${id}/duplicate`, {
      method: "POST",
    }),

  searchChats: (q: string) =>
    request<{ chats: Chat[] }>(`/api/chats?search=${encodeURIComponent(q)}`),

  /* --------------------------- AI Streaming --------------------------- */

  // Fetch the SSE stream as a raw ReadableStream<Uint8Array>. The caller
  // passes this to the new StreamEngine (lib/streaming/engine.ts), which
  // decodes bytes across chunk boundaries and parses SSE frames into the
  // canonical StreamEvent types. This replaces the old parseSSE helper that
  // lived in this file (PRD §3.1 — delete the old streaming parser).
  streamMessage: async (
    chatId: string,
    body: SendMessageBody,
    signal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> => {
    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      let detail = `Stream failed (${res.status})`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) detail = j.error;
      } catch {
        // ignore
      }
      throw new Error(detail);
    }
    return res.body as ReadableStream<Uint8Array>;
  },

  streamContinue: async (
    chatId: string,
    body: ContinueBody,
    signal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> => {
    const res = await fetch(`/api/chats/${chatId}/messages/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      let detail = `Continue failed (${res.status})`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) detail = j.error;
      } catch {
        // ignore
      }
      throw new Error(detail);
    }
    return res.body as ReadableStream<Uint8Array>;
  },

  // Re-stream the assistant response for the last user message in the chat.
  // The server deletes the previous assistant turn + any tool messages and
  // starts a fresh agent run.
  streamRegenerate: async (
    chatId: string,
    signal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> => {
    const res = await fetch(`/api/chats/${chatId}/messages/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
    });
    if (!res.ok || !res.body) {
      let detail = `Regenerate failed (${res.status})`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) detail = j.error;
      } catch {
        // ignore
      }
      throw new Error(detail);
    }
    return res.body as ReadableStream<Uint8Array>;
  },

  /* ----------------------------- Providers ----------------------------- */

  listProviders: () => request<{ providers: Provider[] }>("/api/providers"),

  createProvider: (body: ProviderInput) =>
    request<{ provider: Provider }>("/api/providers", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  patchProvider: (id: string, body: Partial<ProviderInput>) =>
    request<{ provider: Provider }>(`/api/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteProvider: (id: string) =>
    request<{ ok: boolean }>(`/api/providers/${id}`, { method: "DELETE" }),

  testProvider: (id: string, body?: { apiKey?: string }) =>
    request<{ ok: boolean; model?: string; error?: string; status?: number }>(
      `/api/providers/${id}/test`,
      { method: "POST", body: JSON.stringify(body ?? {}) }
    ),

  listProviderModels: (id: string) =>
    request<{ models: string[] }>(`/api/providers/${id}/models`),

  fetchModelsForCustom: (body: { baseURL: string; apiKey?: string }) =>
    request<{ models: string[]; error?: string }>("/api/providers/fetch-models", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  testCustomConnection: (body: { baseURL: string; apiKey?: string; model?: string }) =>
    request<{ ok: boolean; model?: string; error?: string; status?: number }>(
      "/api/providers/test-connection",
      { method: "POST", body: JSON.stringify(body) }
    ),

  /* ------------------------------ Settings ----------------------------- */

  getSettings: () => request<{ settings: AppSettings }>("/api/settings"),

  patchSettings: (body: Partial<AppSettings>) =>
    request<{ settings: AppSettings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
