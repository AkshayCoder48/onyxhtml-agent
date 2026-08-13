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
  StreamEvent,
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

  searchChats: (q: string) =>
    request<{ chats: Chat[] }>(`/api/chats?search=${encodeURIComponent(q)}`),

  /* --------------------------- AI Streaming --------------------------- */

  // Returns an async generator of StreamEvent from an SSE response.
  streamMessage: async function* (
    chatId: string,
    body: SendMessageBody,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
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
    yield* parseSSE(res.body);
  },

  streamContinue: async function* (
    chatId: string,
    body: ContinueBody,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
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
    yield* parseSSE(res.body);
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

  testProvider: (id: string) =>
    request<{ ok: boolean; model?: string; error?: string; status?: number }>(
      `/api/providers/${id}/test`,
      { method: "POST" }
    ),

  listProviderModels: (id: string) =>
    request<{ models: string[] }>(`/api/providers/${id}/models`),

  /* ------------------------------ Settings ----------------------------- */

  getSettings: () => request<{ settings: AppSettings }>("/api/settings"),

  patchSettings: (body: Partial<AppSettings>) =>
    request<{ settings: AppSettings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

/* ------------------------------ helpers ------------------------------ */

async function* parseSSE(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE messages separated by double newline
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = raw.split("\n");
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("data:")) {
            dataStr += line.slice(5).trimStart();
          } else if (line.startsWith("data: ")) {
            dataStr += line.slice(6);
          }
        }
        if (!dataStr) continue;
        if (dataStr === "[DONE]") return;
        try {
          const evt = JSON.parse(dataStr) as StreamEvent;
          yield evt;
        } catch {
          // ignore malformed line
        }
      }
    }
    // flush trailing
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataStr += line.slice(5).trimStart();
        }
      }
      if (dataStr && dataStr !== "[DONE]") {
        try {
          const evt = JSON.parse(dataStr) as StreamEvent;
          yield evt;
        } catch {
          // ignore
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
