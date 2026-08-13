import { db } from "@/lib/db";
import { buildFileTree, findEntryFile } from "@/lib/files";
import { parseJSON, stringifyJSON } from "@/lib/settings";
import {
  MessageSegment,
  Message as MessageType,
  StreamEvent,
} from "@/lib/types";
import {
  ChatMessage,
  getActiveProvider,
  streamChatCompletion,
  ToolCallRef,
} from "./provider";
import {
  executeFileTool,
  getToolDefinitions,
  getToolDetail,
  getToolLabel,
  isBrowserTool,
} from "./tools";

const MAX_ROUNDS = 8;

// ---------- SSE encoding helpers ----------

export function sseEncode(obj: unknown): Uint8Array {
  const text = typeof obj === "string" ? obj : JSON.stringify(obj);
  return new TextEncoder().encode(`data: ${text}\n\n`);
}

export const DONE_CHUNK = new TextEncoder().encode("data: [DONE]\n\n");

export function sseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ---------- Conversation building ----------

function segmentsToContentText(segments: MessageSegment[]): string {
  return segments
    .filter((s) => s.type === "content")
    .map((s) => (s as { content: string }).content)
    .join("");
}

// Convert stored DB messages into OpenAI-format chat messages.
function buildConversationFromMessages(
  systemPrompt: string,
  rows: { role: string; segments: string }[]
): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: systemPrompt }];
  for (const r of rows) {
    const segments = parseJSON<MessageSegment[]>(r.segments, []);
    if (r.role === "user") {
      const text = segmentsToContentText(segments) || "";
      out.push({ role: "user", content: text });
    } else if (r.role === "assistant") {
      const content = segmentsToContentText(segments) || null;
      const toolCalls: ToolCallRef[] = [];
      for (const s of segments) {
        if (s.type === "tool_call") {
          toolCalls.push({
            id: s.callId,
            type: "function",
            function: {
              name: s.tool,
              arguments: stringifyJSON(s.arguments ?? {}),
            },
          });
        }
      }
      const msg: ChatMessage = {
        role: "assistant",
        content,
      };
      if (toolCalls.length > 0) {
        (msg as { tool_calls?: ToolCallRef[] }).tool_calls = toolCalls;
      }
      out.push(msg);

      // Append a `tool` message for each completed tool_call with a result
      for (const s of segments) {
        if (s.type === "tool_call") {
          const payload =
            s.status === "error"
              ? { error: s.error ?? "tool error" }
              : s.result ?? {};
          out.push({
            role: "tool",
            tool_call_id: s.callId,
            content: stringifyJSON(payload),
          });
        }
      }
    }
  }
  return out;
}

// Build the system prompt with workspace context.
function buildSystemPrompt(opts: {
  workspaceName: string;
  filePaths: string[];
  entryFile: string | null;
  activeFile: string | null;
  activeFileContent: string | null;
  selectedFiles: string[];
}): string {
  const tree = buildFileTree(opts.filePaths);
  const treeText = renderTree(tree, 0);
  const parts: string[] = [
    "You are an AI coding agent inside an HTML Workspace Editor. You can read, create, edit, and delete files in the user's workspace, and you can control the live preview (click, type, scroll, run JavaScript, inspect the DOM and console) to test the website. Always explain briefly what you're doing. Use file tools to make changes, then use browser tools to verify. Be concise. The workspace file tree is provided in the context.",
    "",
    `Workspace: ${opts.workspaceName}`,
    `Entry file: ${opts.entryFile ?? "(none)"}`,
    "",
    "File tree:",
    treeText || "(empty)",
  ];
  if (opts.activeFile && opts.activeFileContent != null) {
    parts.push(
      "",
      `Currently open file: ${opts.activeFile}`,
      "```",
      opts.activeFileContent.slice(0, 8000),
      "```"
    );
  }
  if (opts.selectedFiles.length > 0) {
    parts.push("", `User also referenced these files: ${opts.selectedFiles.join(", ")}`);
  }
  parts.push(
    "",
    "Guidelines:",
    "- Use list_files/read_file to understand the project before editing.",
    "- Use edit_file for small, precise changes; use create_file/write_file for new files or full rewrites.",
    "- After making changes, use check_page / open_page + check_console to verify the page renders correctly.",
    "- Never include API keys, secrets, or sensitive data in your file edits.",
    "- Keep explanations brief — one or two sentences before each action."
  );
  return parts.join("\n");
}

function renderTree(
  nodes: { name: string; path: string; type: string; children?: any[] }[],
  depth: number
): string {
  const lines: string[] = [];
  for (const n of nodes) {
    const indent = "  ".repeat(depth);
    const marker = n.type === "folder" ? "📁" : "📄";
    lines.push(`${indent}${marker} ${n.name}`);
    if (n.children && n.children.length > 0) {
      lines.push(renderTree(n.children, depth + 1));
    }
  }
  return lines.join("\n");
}

// ---------- Tool call accumulator ----------

type ToolCallAccum = {
  callId: string;
  name: string;
  arguments: string;
  index: number;
};

// ---------- Agent options ----------

export type AgentOptions = {
  chatId: string;
  workspaceId: string;
  context?: {
    activeFile?: string | null;
    selectedFiles?: string[];
  };
  // For /continue: results from client-side browser tool execution
  resumeResults?: {
    callId: string;
    result?: unknown;
    error?: string;
  }[];
};

// ---------- The main agent loop ----------

export async function runAgentAsReadableStream(
  options: AgentOptions
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const decoder = new TextEncoder(); // placeholder; we use encoder for SSE
  void decoder;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: StreamEvent | string) => {
        try {
          controller.enqueue(sseEncode(obj));
        } catch {
          // controller might be closed
        }
      };
      const sendDone = () => {
        try {
          controller.enqueue(DONE_CHUNK);
        } catch {}
        try {
          controller.close();
        } catch {}
      };

      try {
        await runAgentLoop({ ...options, send, sendDone });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
          send({ type: "error", content: msg });
        } catch {}
        sendDone();
      }
    },
  });

  void encoder;
  return stream;
}

type LoopCtx = {
  chatId: string;
  workspaceId: string;
  context?: {
    activeFile?: string | null;
    selectedFiles?: string[];
  };
  resumeResults?: {
    callId: string;
    result?: unknown;
    error?: string;
  }[];
  send: (obj: StreamEvent | string) => void;
  sendDone: () => void;
};

async function runAgentLoop(ctx: LoopCtx) {
  // 1. Load workspace + files
  const workspace = await db.workspace.findUnique({
    where: { id: ctx.workspaceId },
  });
  if (!workspace) {
    ctx.send({ type: "error", content: "Workspace not found" });
    ctx.sendDone();
    return;
  }
  const files = await db.file.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { path: "asc" },
  });
  const filePaths = files.map((f) => f.path);
  const entryFile = findEntryFile(filePaths);

  let activeFile: string | null = workspace.activeFile ?? null;
  if (ctx.context?.activeFile !== undefined) {
    activeFile = ctx.context.activeFile ?? null;
  }
  const selectedFiles = ctx.context?.selectedFiles ?? [];

  // Load active file content (capped) for context
  let activeFileContent: string | null = null;
  if (activeFile) {
    const af = files.find((f) => f.path === activeFile);
    if (af) activeFileContent = af.content;
  }

  const systemPrompt = buildSystemPrompt({
    workspaceName: workspace.name,
    filePaths,
    entryFile,
    activeFile,
    activeFileContent,
    selectedFiles,
  });

  // 2. Get active provider
  const provider = await getActiveProvider();
  if (!provider) {
    ctx.send({ type: "error", content: "No active provider configured. Add one in Settings → Providers." });
    ctx.sendDone();
    return;
  }

  // 3. Load chat messages
  const dbMessages = await db.message.findMany({
    where: { chatId: ctx.chatId },
    orderBy: { createdAt: "asc" },
  });
  if (dbMessages.length === 0) {
    ctx.send({ type: "error", content: "Chat has no messages" });
    ctx.sendDone();
    return;
  }

  // Find the latest assistant message (the empty one created for this turn, or the persisted one being resumed)
  let assistantRow = dbMessages[dbMessages.length - 1];
  if (assistantRow.role !== "assistant") {
    // find last assistant
    for (let i = dbMessages.length - 1; i >= 0; i--) {
      if (dbMessages[i].role === "assistant") {
        assistantRow = dbMessages[i];
        break;
      }
    }
  }
  if (!assistantRow || assistantRow.role !== "assistant") {
    ctx.send({ type: "error", content: "No assistant message to stream into" });
    ctx.sendDone();
    return;
  }

  let segments: MessageSegment[] = parseJSON<MessageSegment[]>(
    assistantRow.segments,
    []
  );

  // 4. Build conversation (exclude the empty assistant message we're about to fill)
  const convoRows = dbMessages.filter((m) => m.id !== assistantRow.id);
  let conversation = buildConversationFromMessages(systemPrompt, convoRows);

  // 5. If resuming (browser tools), apply results to pending tool_call segments
  if (ctx.resumeResults && ctx.resumeResults.length > 0) {
    for (const r of ctx.resumeResults) {
      const segIdx = segments.findIndex(
        (s): s is Extract<MessageSegment, { type: "tool_call" }> =>
          s.type === "tool_call" && s.callId === r.callId
      );
      if (segIdx >= 0) {
        const seg = segments[segIdx] as Extract<MessageSegment, { type: "tool_call" }>;
        seg.status = r.error ? "error" : "success";
        seg.result = r.result;
        seg.error = r.error;
        ctx.send({
          type: "tool_result",
          callId: r.callId,
          status: seg.status,
          result: r.result,
          error: r.error,
          label: seg.label,
          detail: seg.detail,
        });
        // Append tool message to conversation
        const payload = r.error ? { error: r.error } : r.result ?? {};
        conversation.push({
          role: "tool",
          tool_call_id: r.callId,
          content: stringifyJSON(payload),
        });
      } else {
        // No matching pending segment — still append a tool message so the model can continue
        const payload = r.error ? { error: r.error } : r.result ?? {};
        conversation.push({
          role: "tool",
          tool_call_id: r.callId,
          content: stringifyJSON(payload),
        });
      }
    }
    // Persist updated segments
    await db.message.update({
      where: { id: assistantRow.id },
      data: { segments: stringifyJSON(segments) },
    });
  }

  // 6. Agentic loop
  const toolDefs = getToolDefinitions();
  // Global counter (across rounds) so every tool call gets a unique callId.
  // The provider may reuse ids like `call_0` each round, which would collide
  // in the message segments / React keys. We remap to `tc_<runTag>_<n>` per
  // round, where `runTag` is a short random suffix unique to this agent run
  // (so /continue calls don't collide with the original run's callIds).
  const runTag = Math.random().toString(36).slice(2, 6);
  let callIdSeq = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let reasoningText = "";
    let contentText = "";
    const toolCalls: ToolCallAccum[] = [];
    const roundCallIdMap = new Map<string, string>();
    // Tracks whether we've already emitted a tool_call SSE event for a given
    // accumulated callId, so we only emit on the *first* delta and then patch
    // the same segment on subsequent deltas (true streaming display).
    const emittedToolCallIds = new Set<string>();
    let hadError = false;
    let errorMsg = "";

    try {
      for await (const ev of streamChatCompletion(provider, {
        messages: conversation,
        tools: toolDefs,
      })) {
        if (ev.type === "reasoning_content") {
          reasoningText += ev.content;
          ctx.send({ type: "reasoning_content", content: ev.content });
        } else if (ev.type === "content") {
          contentText += ev.content;
          ctx.send({ type: "content", content: ev.content });
        } else if (ev.type === "tool_call_delta") {
          // Remap the provider's callId to a globally-unique id for this round.
          let mapped = roundCallIdMap.get(ev.callId);
          if (!mapped) {
            mapped = `tc_${runTag}_${callIdSeq++}`;
            roundCallIdMap.set(ev.callId, mapped);
          }
          const existing = toolCalls.find((t) => t.callId === mapped);
          if (existing) {
            if (ev.argumentsDelta) existing.arguments += ev.argumentsDelta;
            if (ev.name && !existing.name) existing.name = ev.name;
          } else {
            toolCalls.push({
              callId: mapped,
              name: ev.name ?? "",
              arguments: ev.argumentsDelta ?? "",
              index: ev.index,
            });
          }

          // Stream the tool_call to the client as it accumulates so the UI
          // can show the arguments being written character-by-character.
          const accum = toolCalls.find((t) => t.callId === mapped)!;
          if (accum.name) {
            // Best-effort partial parse for the `arguments` field. If the JSON
            // is incomplete we send an empty object — the client will rely on
            // `argumentsText` for live display until the call completes.
            let partialArgs: Record<string, unknown> = {};
            try {
              partialArgs = JSON.parse(accum.arguments);
            } catch {
              // not yet complete JSON — that's fine during streaming
            }
            ctx.send({
              type: "tool_call",
              tool: accum.name,
              arguments: partialArgs,
              argumentsText: accum.arguments,
              callId: accum.callId,
              label: getToolLabel(accum.name),
              status: "running",
            });
            emittedToolCallIds.add(accum.callId);
          }
        } else if (ev.type === "error") {
          hadError = true;
          errorMsg = ev.content;
          break;
        }
      }
    } catch (e) {
      hadError = true;
      errorMsg = e instanceof Error ? e.message : String(e);
    }

    if (hadError) {
      // Persist what we have and exit
      if (reasoningText) {
        segments = mergeSegment(segments, { type: "thinking", content: reasoningText });
      }
      if (contentText) {
        segments = mergeSegment(segments, { type: "content", content: contentText });
      }
      await db.message.update({
        where: { id: assistantRow.id },
        data: { segments: stringifyJSON(segments) },
      });
      ctx.send({ type: "error", content: errorMsg });
      ctx.sendDone();
      return;
    }

    // Merge accumulated reasoning + content into segments
    if (reasoningText) {
      segments = mergeSegment(segments, { type: "thinking", content: reasoningText });
    }
    if (contentText) {
      segments = mergeSegment(segments, { type: "content", content: contentText });
    }

    // No tool calls → done
    if (toolCalls.length === 0) {
      await db.message.update({
        where: { id: assistantRow.id },
        data: { segments: stringifyJSON(segments) },
      });
      await db.chat.update({
        where: { id: ctx.chatId },
        data: { updatedAt: new Date() },
      });
      ctx.send({ type: "done" });
      ctx.sendDone();
      return;
    }

    // Build the assistant message with tool_calls to add to the conversation
    const toolCallRefs: ToolCallRef[] = toolCalls.map((tc) => ({
      id: tc.callId,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments || "{}" },
    }));
    conversation.push({
      role: "assistant",
      content: contentText || null,
      tool_calls: toolCallRefs,
    });

    // Process each tool call
    const browserCallIds: string[] = [];
    for (const tc of toolCalls) {
      const label = getToolLabel(tc.name);
      let args: Record<string, unknown> = {};
      try {
        args = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        args = {};
      }
      const detail = getToolDetail(tc.name, args);
      const isBrowser = isBrowserTool(tc.name);

      if (isBrowser) {
        // If we already emitted a streaming tool_call for this id, we don't
        // need to re-emit — just ensure the segment exists in `segments`
        // with running status. Otherwise emit one now.
        if (!emittedToolCallIds.has(tc.callId)) {
          ctx.send({
            type: "tool_call",
            tool: tc.name,
            arguments: args,
            argumentsText: tc.arguments,
            callId: tc.callId,
            label,
            detail,
            status: "running",
          });
          emittedToolCallIds.add(tc.callId);
        }
        // Make sure the segment exists in our persisted segments array.
        const existingSegIdx = segments.findIndex(
          (s): s is Extract<MessageSegment, { type: "tool_call" }> =>
            s.type === "tool_call" && s.callId === tc.callId
        );
        if (existingSegIdx < 0) {
          segments.push({
            type: "tool_call",
            tool: tc.name,
            arguments: args,
            argumentsText: tc.arguments,
            callId: tc.callId,
            status: "running",
            label,
            detail,
          });
        }
        browserCallIds.push(tc.callId);
        // We do NOT append a tool message yet — that happens on /continue
      } else {
        // For file tools, emit a final tool_call with the complete parsed
        // arguments (replaces the streamed partial). This also handles the
        // case where the tool name was empty during streaming.
        ctx.send({
          type: "tool_call",
          tool: tc.name,
          arguments: args,
          argumentsText: tc.arguments,
          callId: tc.callId,
          label,
          detail,
          status: "running",
        });
        emittedToolCallIds.add(tc.callId);

        // Add segment in running status (or update if streaming already created it)
        const existingSegIdx = segments.findIndex(
          (s): s is Extract<MessageSegment, { type: "tool_call" }> =>
            s.type === "tool_call" && s.callId === tc.callId
        );
        let segIdx: number;
        if (existingSegIdx < 0) {
          segIdx = segments.push({
            type: "tool_call",
            tool: tc.name,
            arguments: args,
            argumentsText: tc.arguments,
            callId: tc.callId,
            status: "running",
            label,
            detail,
          }) - 1;
        } else {
          segIdx = existingSegIdx;
          const seg = segments[segIdx] as Extract<MessageSegment, { type: "tool_call" }>;
          seg.arguments = args;
          seg.argumentsText = tc.arguments;
          seg.detail = detail;
        }

        // Execute file tool server-side
        let result: unknown;
        let status: "success" | "error" = "success";
        let errorMsg: string | undefined;
        try {
          result = await executeFileTool(tc.name, args, workspace.id);
        } catch (e) {
          status = "error";
          errorMsg = e instanceof Error ? e.message : String(e);
          result = { error: errorMsg };
        }

        // Update segment
        const seg = segments[segIdx] as Extract<MessageSegment, { type: "tool_call" }>;
        seg.status = status;
        seg.result = result;
        seg.error = errorMsg;

        // Emit tool_result
        ctx.send({
          type: "tool_result",
          callId: tc.callId,
          status,
          result,
          error: errorMsg,
          label,
          detail,
        });

        // Append tool message to conversation
        const payload = status === "error" ? { error: errorMsg ?? "tool error" } : result;
        conversation.push({
          role: "tool",
          tool_call_id: tc.callId,
          content: stringifyJSON(payload ?? {}),
        });
      }
    }

    // Persist segments at end of round
    await db.message.update({
      where: { id: assistantRow.id },
      data: { segments: stringifyJSON(segments) },
    });

    // If there are pending browser tools → pause and resume
    if (browserCallIds.length > 0) {
      ctx.send({
        type: "browser_tools_pending",
        callIds: browserCallIds,
      } as unknown as StreamEvent);
      ctx.sendDone();
      return;
    }

    // Otherwise loop again (file tools ran; model may produce more)
  }

  // Max rounds exceeded
  await db.message.update({
    where: { id: assistantRow.id },
    data: { segments: stringifyJSON(segments) },
  });
  ctx.send({
    type: "error",
    content: "Agent reached the maximum number of reasoning rounds.",
  });
  ctx.sendDone();
}

// Merge a thinking/content segment, folding into the previous one if same type.
function mergeSegment(
  segments: MessageSegment[],
  seg: MessageSegment
): MessageSegment[] {
  const last = segments[segments.length - 1];
  if (last && last.type === seg.type) {
    if (last.type === "thinking" && seg.type === "thinking") {
      last.content += seg.content;
    } else if (last.type === "content" && seg.type === "content") {
      last.content += seg.content;
    } else {
      segments.push(seg);
    }
  } else {
    segments.push(seg);
  }
  return segments;
}

// ---------- Helpers used by the route handlers ----------

// Serialize a DB message row to the API Message type, parsing segments.
export function serializeMessage(row: {
  id: string;
  chatId: string;
  role: string;
  segments: string;
  createdAt: Date;
}): MessageType {
  const segments = parseJSON<MessageSegment[]>(row.segments, []);
  return {
    id: row.id,
    chatId: row.chatId,
    role: row.role as "user" | "assistant",
    segments,
    createdAt: row.createdAt.toISOString(),
  };
}

// Auto-title a chat from the first user message content.
export async function maybeAutoTitle(chatId: string): Promise<void> {
  const chat = await db.chat.findUnique({ where: { id: chatId } });
  if (!chat) return;
  if (chat.title !== "New Chat") return;
  const firstUser = await db.message.findFirst({
    where: { chatId, role: "user" },
    orderBy: { createdAt: "asc" },
  });
  if (!firstUser) return;
  const segs = parseJSON<MessageSegment[]>(firstUser.segments, []);
  const text = segs
    .filter((s) => s.type === "content")
    .map((s) => (s as { content: string }).content)
    .join(" ")
    .trim();
  if (!text) return;
  const title = text.slice(0, 40) + (text.length > 40 ? "…" : "");
  await db.chat.update({ where: { id: chatId }, data: { title } });
}
