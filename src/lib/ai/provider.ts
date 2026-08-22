import { db } from "@/lib/db";
import { Provider as ProviderType } from "@/lib/types";
import {
  ZAI_BUILT_IN_BASEURL,
  ZAI_BUILT_IN_NAME,
  ZAI_BUILT_IN_MODEL,
} from "./provider-constants";

// Re-export constants for existing imports.
export { ZAI_BUILT_IN_BASEURL, ZAI_BUILT_IN_NAME, ZAI_BUILT_IN_MODEL };

export type DBProvider = {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string | null;
  model: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function isBuiltInProvider(p: { baseURL: string }): boolean {
  return p.baseURL === ZAI_BUILT_IN_BASEURL;
}

export function toProviderDTO(p: DBProvider): ProviderType {
  return {
    id: p.id,
    name: p.name,
    baseURL: p.baseURL,
    hasApiKey: Boolean(p.apiKey && p.apiKey.length > 0),
    model: p.model,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// No built-in provider is seeded by default — the user configures their own
// AI provider in Settings. Returns the active row (or the first provider if
// none is flagged active).
export async function getActiveProvider(): Promise<DBProvider | null> {
  let p = await db.provider.findFirst({ where: { isActive: true } });
  if (!p) {
    p = await db.provider.findFirst({ orderBy: { createdAt: "asc" } });
  }
  return (p as DBProvider) ?? null;
}

// Select the active provider from an already-loaded list of plain rows (used
// by the Web Worker, which cannot access localStorage / db).
export function getActiveProviderFromRows(
  rows: DBProvider[]
): DBProvider | null {
  if (!rows || rows.length === 0) return null;
  const active = rows.find((r) => r.isActive);
  if (active) return active;
  const builtin = rows.find((r) => r.baseURL === ZAI_BUILT_IN_BASEURL);
  return builtin ?? rows[0] ?? null;
}

// ---------- Conversation types (OpenAI chat format) ----------

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCallRef[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCallRef = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

// ---------- Provider streaming ----------

export type ProviderEvent =
  | { type: "reasoning_content"; content: string }
  | { type: "content"; content: string }
  | {
      type: "tool_call_delta";
      callId: string;
      id: string;
      name?: string;
      argumentsDelta?: string;
      index: number;
    }
  | { type: "finish" }
  | { type: "error"; content: string };

export type StreamArgs = {
  messages: ChatMessage[];
  tools?: unknown[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
};

async function* parseSSEStream(
  stream: ReadableStream<Uint8Array> | null
): AsyncGenerator<string, void, unknown> {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.trim()) continue;
        if (line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        yield data;
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data && data !== "[DONE]") yield data;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

function extractDelta(choice: any): {
  content?: string;
  reasoning?: string;
  toolCalls?: any[];
} {
  if (!choice) return {};
  const delta = choice.delta ?? choice.message ?? {};
  const out: { content?: string; reasoning?: string; toolCalls?: any[] } = {};
  if (typeof delta.content === "string" && delta.content.length > 0) {
    out.content = delta.content;
  }
  if (
    typeof delta.reasoning_content === "string" &&
    delta.reasoning_content.length > 0
  ) {
    out.reasoning = delta.reasoning_content;
  } else if (typeof delta.reasoning === "string" && delta.reasoning.length > 0) {
    out.reasoning = delta.reasoning;
  }
  if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
    out.toolCalls = delta.tool_calls;
  }
  return out;
}

async function* yieldEventsFromSSE(
  stream: ReadableStream<Uint8Array> | null
): AsyncGenerator<ProviderEvent, void, unknown> {
  let finishEmitted = false;
  const callSuffix = Math.random().toString(36).slice(2, 8);
  const idByIndex = new Map<number, string>();
  for await (const data of parseSSEStream(stream)) {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.error) {
      const msg =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error?.message ?? "Provider stream error";
      yield { type: "error", content: msg };
      return;
    }
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    if (choices.length === 0) continue;
    for (const choice of choices) {
      const d = extractDelta(choice);
      if (d.reasoning)
        yield { type: "reasoning_content", content: d.reasoning };
      if (d.content) yield { type: "content", content: d.content };
      if (d.toolCalls) {
        for (const tc of d.toolCalls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          let id: string;
          if (typeof tc.id === "string" && tc.id) {
            idByIndex.set(idx, tc.id);
            id = tc.id;
          } else {
            const cached = idByIndex.get(idx);
            id = cached ?? `call_${idx}_${callSuffix}`;
            if (!cached) idByIndex.set(idx, id);
          }
          const fn = tc.function ?? {};
          const name = typeof fn.name === "string" ? fn.name : undefined;
          const argsDelta =
            typeof fn.arguments === "string" ? fn.arguments : undefined;
          yield {
            type: "tool_call_delta",
            callId: id,
            id,
            name,
            argumentsDelta: argsDelta,
            index: idx,
          };
        }
      }
      if (choice.finish_reason && !finishEmitted) {
        finishEmitted = true;
        yield { type: "finish" };
      }
    }
  }
  if (!finishEmitted) yield { type: "finish" };
}

// Build the request body and return fetch() init. The caller (worker or
// main thread) performs the actual fetch so CORS / proxying is handled in
// one place.
export function buildChatRequest(
  provider: DBProvider,
  args: StreamArgs
): { url: string; init: RequestInit } {
  const base = provider.baseURL.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.apiKey && provider.apiKey.length > 0) {
    headers["Authorization"] = `Bearer ${provider.apiKey}`;
  }
  const body: any = {
    model: provider.model,
    messages: args.messages,
    stream: true,
    max_tokens: args.maxTokens ?? 16384,
  };
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
    body.tool_choice = "auto";
  }
  if (typeof args.temperature === "number") body.temperature = args.temperature;
  return { url, init: { method: "POST", headers, body: JSON.stringify(body) } };
}

// When running in the browser we route custom-provider fetches through the
// /api/proxy endpoint to avoid CORS errors. The Web Worker has access to
// fetch and uses the same logic.
async function doFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  if (typeof self !== "undefined" && (self as any).WorkerGlobalScope && (self as any).location) {
    // In a worker: still go through the origin's proxy route for non-absolute
    // same-origin relative URLs; external https URLs are fetched directly but
    // may be blocked by CORS — the proxy would handle that, but workers can
    // also POST to /api/proxy.
    if (/^https?:\/\//.test(url)) {
      const proxyResp = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          body: init.body ? JSON.parse(init.body as string) : undefined,
          headers: (init.headers as Record<string, string>) ?? {},
        }),
      });
      return proxyResp;
    }
    return fetch(url, init);
  }
  // Browser main thread
  if (/^https?:\/\//.test(url)) {
    return fetch("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        body: init.body ? JSON.parse(init.body as string) : undefined,
        headers: (init.headers as Record<string, string>) ?? {},
      }),
    });
  }
  return fetch(url, init);
}

// Main entry: stream a chat completion from the configured provider.
// Uses standard OpenAI-compatible SSE over fetch.
export async function* streamChatCompletion(
  provider: DBProvider,
  args: StreamArgs
): AsyncGenerator<ProviderEvent, void, unknown> {
  const { url, init } = buildChatRequest(provider, args);

  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch (e) {
    yield {
      type: "error",
      content: `Provider request failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
    return;
  }

  if (!response.ok) {
    let errText = "";
    try {
      errText = await response.text();
    } catch {
      /* noop */
    }
    let msg = `Provider returned HTTP ${response.status}`;
    try {
      const j = JSON.parse(errText);
      if (j?.error?.message) msg = `${msg}: ${j.error.message}`;
      else if (typeof j?.error === "string") msg = `${msg}: ${j.error}`;
      else if (errText) msg = `${msg}: ${errText.slice(0, 400)}`;
    } catch {
      if (errText) msg = `${msg}: ${errText.slice(0, 400)}`;
    }
    yield { type: "error", content: msg };
    return;
  }

  if (!response.body) {
    yield { type: "error", content: "Provider returned no response body" };
    return;
  }

  yield* yieldEventsFromSSE(
    response.body as unknown as ReadableStream<Uint8Array>
  );
}

// ---------- Non-streaming helpers (Settings → test connection) ----------

export async function testProviderConnection(provider: DBProvider): Promise<{
  ok: boolean;
  model?: string;
  error?: string;
  status?: number;
}> {
  try {
    const { url, init } = buildChatRequest(provider, {
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 1,
    });
    const response = await doFetch(url, init);
    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}${
          txt ? `: ${txt.slice(0, 300)}` : ""
        }`,
      };
    }
    return { ok: true, model: provider.model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Fetch models list for a provider. Non-fatal — returns [] on error.
export async function fetchProviderModels(
  provider: DBProvider
): Promise<string[]> {
  try {
    const base = provider.baseURL.replace(/\/+$/, "");
    const url = `${base}/models`;
    const headers: Record<string, string> = {};
    if (provider.apiKey && provider.apiKey.length > 0) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }
    let response: Response;
    if (typeof window !== "undefined" || (self as any)?.WorkerGlobalScope) {
      if (/^https?:\/\//.test(url)) {
        response = await fetch("/api/proxy?" + new URLSearchParams({ url }), {
          method: "GET",
          headers,
        });
      } else {
        response = await fetch(url, { method: "GET", headers });
      }
    } else {
      response = await fetch(url, { method: "GET", headers });
    }
    if (!response.ok) return [];
    const json = await response.json();
    const data = json?.data ?? json?.models ?? [];
    if (!Array.isArray(data)) return [];
    const models: string[] = [];
    for (const m of data) {
      const id = typeof m === "string" ? m : m?.id;
      if (typeof id === "string" && id.length > 0) models.push(id);
    }
    return models;
  } catch {
    return [];
  }
}
