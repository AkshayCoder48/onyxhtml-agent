import { db } from "@/lib/db";
import { Provider as ProviderType } from "@/lib/types";

// Convention: built-in Z.ai provider has baseURL === ZAI_BUILT_IN_BASEURL
export const ZAI_BUILT_IN_BASEURL = "zai-built-in";
export const ZAI_BUILT_IN_NAME = "Z.ai (Built-in)";
export const ZAI_BUILT_IN_MODEL = "glm-4.6";

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

// Seed the built-in Z.ai provider if no provider exists. Idempotent.
export async function seedBuiltInProviderIfNeeded(): Promise<void> {
  const count = await db.provider.count();
  if (count > 0) return;
  await db.provider.create({
    data: {
      name: ZAI_BUILT_IN_NAME,
      baseURL: ZAI_BUILT_IN_BASEURL,
      apiKey: null,
      model: ZAI_BUILT_IN_MODEL,
      isActive: true,
    },
  });
}

// Get the currently-active provider, seeding the built-in if needed.
export async function getActiveProvider(): Promise<DBProvider | null> {
  await seedBuiltInProviderIfNeeded();
  let p = await db.provider.findFirst({ where: { isActive: true } });
  if (!p) {
    // Fall back to the built-in if nothing is active
    p = await db.provider.findFirst({ where: { baseURL: ZAI_BUILT_IN_BASEURL } });
    if (p) {
      await db.provider.update({ where: { id: p.id }, data: { isActive: true } });
    }
  }
  return p ?? null;
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

// Normalized events yielded by streamChatCompletion
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

// Parse an SSE byte stream into discrete `data:` payloads.
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
        // Strip trailing \r
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.trim()) continue;
        if (line.startsWith(":")) continue; // comment/heartbeat
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        yield data;
      }
    }
    // Flush any trailing data
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data && data !== "[DONE]") yield data;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // noop
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
  // Reasoning: support reasoning_content (Z.ai / Qwen) and reasoning (DeepSeek-style)
  if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
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
  // Per-call suffix so fallback callIds (when the provider omits ids) are
  // unique across agentic rounds — prevents duplicate React keys / segments.
  const callSuffix = Math.random().toString(36).slice(2, 8);
  // Track the SDK-provided id for each tool-call index so we can re-use it
  // on every subsequent delta chunk. Without this, the first chunk (which
  // carries the SDK id) and later chunks (which usually omit it) would be
  // treated as different tool calls — causing the arguments to never
  // accumulate and tools to be invoked with empty args ("Invalid path").
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
      if (d.reasoning) yield { type: "reasoning_content", content: d.reasoning };
      if (d.content) yield { type: "content", content: d.content };
      if (d.toolCalls) {
        for (const tc of d.toolCalls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          // Resolve the id: prefer SDK-provided id, fall back to a stable
          // index-based id (same across all chunks for this index).
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
          const argsDelta = typeof fn.arguments === "string" ? fn.arguments : undefined;
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
  if (!finishEmitted) {
    yield { type: "finish" };
  }
}

// Main entry: stream a chat completion from the active provider.
export async function* streamChatCompletion(
  provider: DBProvider,
  args: StreamArgs
): AsyncGenerator<ProviderEvent, void, unknown> {
  if (isBuiltInProvider(provider)) {
    yield* streamBuiltInZai(args);
    return;
  }
  yield* streamOpenAICompatible(provider, args);
}

// Built-in Z.ai provider via z-ai-web-dev-sdk
async function* streamBuiltInZai(
  args: StreamArgs
): AsyncGenerator<ProviderEvent, void, unknown> {
  let ZAIModule: any;
  try {
    ZAIModule = await import("z-ai-web-dev-sdk");
  } catch (e) {
    yield {
      type: "error",
      content: `Built-in Z.ai SDK unavailable: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
    return;
  }
  const ZAI = ZAIModule.default ?? ZAIModule;
  let zai: any;
  try {
    zai = await ZAI.create();
  } catch (e) {
    yield {
      type: "error",
      content: `Failed to initialize Z.ai SDK: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
    return;
  }

  const body: any = {
    model: ZAI_BUILT_IN_MODEL,
    messages: args.messages,
    stream: true,
    thinking: { type: "enabled" },
    // GLM-4.6 supports up to 16K output tokens. Without an explicit cap, the
    // provider applies a much smaller default (often 4K), which causes the
    // AI to stop mid-response after ~10-15K characters — exactly the
    // "ai auto stops" symptom. We request the maximum so long generations
    // complete fully.
    max_tokens: args.maxTokens ?? 16384,
  };
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
    body.tool_choice = "auto";
  }
  if (typeof args.temperature === "number") body.temperature = args.temperature;

  let result: any;
  try {
    result = await zai.chat.completions.create(body);
  } catch (e) {
    yield {
      type: "error",
      content: `Z.ai request failed: ${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }

  // The SDK returns a ReadableStream when stream:true
  if (result && typeof result.getReader === "function") {
    yield* yieldEventsFromSSE(result);
    return;
  }
  // Fallback: non-streaming JSON response
  if (result && Array.isArray(result.choices)) {
    const choice = result.choices[0] ?? {};
    const msg = choice.message ?? {};
    const callSuffix = Math.random().toString(36).slice(2, 8);
    if (typeof msg.reasoning_content === "string" && msg.reasoning_content) {
      yield { type: "reasoning_content", content: msg.reasoning_content };
    }
    if (typeof msg.content === "string" && msg.content) {
      yield { type: "content", content: msg.content };
    }
    if (Array.isArray(msg.tool_calls)) {
      for (let i = 0; i < msg.tool_calls.length; i++) {
        const tc = msg.tool_calls[i];
        const id = typeof tc.id === "string" && tc.id ? tc.id : `call_${i}_${callSuffix}`;
        const fn = tc.function ?? {};
        yield {
          type: "tool_call_delta",
          callId: id,
          id,
          name: typeof fn.name === "string" ? fn.name : undefined,
          argumentsDelta: typeof fn.arguments === "string" ? fn.arguments : undefined,
          index: i,
        };
      }
    }
    yield { type: "finish" };
    return;
  }
  yield { type: "error", content: "Unexpected Z.ai SDK response shape" };
}

// OpenAI-compatible provider via fetch
async function* streamOpenAICompatible(
  provider: DBProvider,
  args: StreamArgs
): AsyncGenerator<ProviderEvent, void, unknown> {
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
    // Raise the output cap so long generations aren't truncated. Many
    // OpenAI-compatible providers default to 4K tokens, which is too short
    // for agentic work with tool calls + reasoning.
    max_tokens: args.maxTokens ?? 16384,
  };
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
    body.tool_choice = "auto";
  }
  if (typeof args.temperature === "number") body.temperature = args.temperature;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: args.signal ?? undefined,
    });
  } catch (e) {
    yield {
      type: "error",
      content: `Provider request failed: ${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }

  if (!response.ok) {
    let errText = "";
    try {
      errText = await response.text();
    } catch {
      // noop
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

  yield* yieldEventsFromSSE(response.body as unknown as ReadableStream<Uint8Array>);
}

// ---------- Non-streaming helpers (for /providers/[id]/test) ----------

export async function testProviderConnection(
  provider: DBProvider
): Promise<{ ok: boolean; model?: string; error?: string; status?: number }> {
  try {
    if (isBuiltInProvider(provider)) {
      let ZAIModule: any;
      try {
        ZAIModule = await import("z-ai-web-dev-sdk");
      } catch (e) {
        return {
          ok: false,
          error: `SDK unavailable: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
      const ZAI = ZAIModule.default ?? ZAIModule;
      const zai = await ZAI.create();
      const result: any = await zai.chat.completions.create({
        model: ZAI_BUILT_IN_MODEL,
        messages: [{ role: "user", content: "ping" }],
      });
      // If non-streaming JSON returned
      if (result && Array.isArray(result.choices)) {
        return { ok: true, model: ZAI_BUILT_IN_MODEL };
      }
      // If streaming body returned, drain it briefly
      if (result && typeof result.getReader === "function") {
        const reader = result.getReader();
        await reader.read();
        try {
          reader.releaseLock();
        } catch {}
        return { ok: true, model: ZAI_BUILT_IN_MODEL };
      }
      return { ok: true, model: ZAI_BUILT_IN_MODEL };
    }

    const base = provider.baseURL.replace(/\/+$/, "");
    const url = `${base}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.apiKey && provider.apiKey.length > 0) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
    });
    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}${txt ? `: ${txt.slice(0, 300)}` : ""}`,
      };
    }
    return { ok: true, model: provider.model };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Fetch models list for a provider. Non-fatal — always returns `{ models: [] }` on error.
export async function fetchProviderModels(provider: DBProvider): Promise<string[]> {
  try {
    if (isBuiltInProvider(provider)) {
      // Return a sensible default list for the built-in GLM-4 family
      return [
        "glm-4.6",
        "glm-4.5",
        "glm-4.5-air",
        "glm-4.5-flash",
        "glm-4-plus",
        "glm-4-air",
        "glm-4-flash",
        "glm-4-long",
        "glm-4v-plus",
        "glm-4v",
        "glm-4v-flash",
      ];
    }
    const base = provider.baseURL.replace(/\/+$/, "");
    const url = `${base}/models`;
    const headers: Record<string, string> = {};
    if (provider.apiKey && provider.apiKey.length > 0) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }
    const response = await fetch(url, { method: "GET", headers });
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
