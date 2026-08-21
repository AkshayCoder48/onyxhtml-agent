import { db } from "@/lib/db";
import { buildFileTree, findEntryFile, safePath } from "@/lib/files";
import { parseJSON, stringifyJSON } from "@/lib/settings";
import {
  MessageSegment,
  Message as MessageType,
} from "@/lib/types";
// New canonical streaming event types (PRD §11). The OLD StreamEvent union
// from @/lib/types is replaced by this richer, fine-grained set.
import type { StreamEvent, AgentStatus } from "@/lib/streaming/types";
import { AGENT_MD_CONTENT, AGENT_MD_FILENAME } from "@/lib/agent-md";
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

const MAX_ROUNDS = 25;

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
//
// CRITICAL: The AGENT.md operating manual is injected at the very TOP of the
// system prompt. The model literally cannot avoid reading it — it is the
// first thing in its context. The manual enforces the mandatory task
// lifecycle: PROBE → PLAN → EDIT → TEST → SUMMARIZE.
//
// If the workspace has a user-edited AGENT.md, we use that version (the user
// may have customized the rules). Otherwise we fall back to the canonical
// AGENT_MD_CONTENT from src/lib/agent-md.ts.
function buildSystemPrompt(opts: {
  workspaceName: string;
  filePaths: string[];
  entryFile: string | null;
  activeFile: string | null;
  activeFileContent: string | null;
  selectedFiles: string[];
  agentMdContent: string | null;
}): string {
  const tree = buildFileTree(opts.filePaths);
  const treeText = renderTree(tree, 0);
  const agentMd = opts.agentMdContent ?? AGENT_MD_CONTENT;

  const parts: string[] = [
    // ---- AGENT.md operating manual (injected FIRST so the model reads it) ----
    agentMd,
    "",
    "========================================================",
    "AGENT.md ENDS HERE — workspace context follows.",
    "========================================================",
    "",
    // ---- Workspace context ----
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
    "REMINDERS (these override any contrary instinct):",
    "- You ALREADY read AGENT.md above. Follow its lifecycle: PROBE → PLAN → EDIT → TEST → SUMMARIZE.",
    "- Do NOT generate files when an edit would do. edit_file is the default for existing files.",
    "  If the file already exists, you MUST use edit_file (or read_file first then edit_file).",
    "  create_file is ONLY for files that do not exist yet.",
    "- Do NOT skip the TEST phase. After every meaningful change, verify with browser_read_page",
    "  (observe), browser_execute_js (scripted checks), terminal_exec, or take_screenshot. The preview",
    "  iframe is always loaded — these tools work even when you can't see it.",
    "- Do NOT end the turn without a written SUMMARY. Your last message must include:",
    "    Changes: what you changed (file by file)",
    "    Verification: what you tested and the result",
    "    Result: whether the task is complete",
    "- The preview is already loaded with index.html. Do NOT call open_page first.",
    "- Keep explanations brief — one or two sentences before each action.",
    "- Do NOT repeat the same tool call more than twice. If a tool errors, read the message and adjust.",
    "- When a browser tool (terminal_exec, take_screenshot, etc.) returns an error, READ the error",
    "  message and adjust your approach. Do not just retry the same call.",
    "- ALWAYS prefer the surgical edit over a full rewrite. The user's existing code has value."
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
      // SSE comment heartbeat. Proxies (nginx, Caddy, Cloudflare) will close
      // idle connections after a timeout. Sending a comment line (`: keepalive
      // \n\n`) every few seconds keeps the connection alive AND forces the
      // proxy to flush its buffer. The client's SSE parser ignores comment
      // lines, so this doesn't produce spurious events.
      const sendHeartbeatComment = () => {
        try {
          controller.enqueue(
            new TextEncoder().encode(`: keepalive ${Date.now()}\n\n`)
          );
        } catch {}
      };
      const sendDone = () => {
        try {
          controller.enqueue(DONE_CHUNK);
        } catch {}
        try {
          controller.close();
        } catch {}
      };

      // Heartbeat interval — every 5 seconds, send a comment line + a
      // run.heartbeat event. This serves two purposes:
      //   1. Keeps the SSE connection alive through proxies (PRD §4).
      //   2. Lets the client detect lost connections (if no heartbeat arrives
      //      for 30s, the client knows the run is stuck/disconnected).
      const heartbeatTimer = setInterval(() => {
        sendHeartbeatComment();
      }, 5000);

      try {
        await runAgentLoop({ ...options, send, sendDone });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
          send({ type: "stream.error", messageId: "", content: msg });
        } catch {}
        sendDone();
      } finally {
        clearInterval(heartbeatTimer);
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

// Helper to emit an agent.status event with a human-readable message.
function emitStatus(
  ctx: LoopCtx,
  messageId: string,
  status: AgentStatus,
  message?: string,
  currentAction?: string
) {
  ctx.send({ type: "agent.status", messageId, status, message, currentAction });
}

async function runAgentLoop(ctx: LoopCtx) {
  // 1. Load workspace + files
  const workspace = await db.workspace.findUnique({
    where: { id: ctx.workspaceId },
  });
  if (!workspace) {
    ctx.send({ type: "stream.error", messageId: "", content: "Workspace not found" });
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

  // Load the workspace's AGENT.md (if it exists). The user may have edited
  // it to customize the agent's behavior — we respect those edits. If the
  // workspace doesn't have one yet, ensureAgentMd() in the workspaces API
  // route will create it on next access, but we also fall back to the
  // canonical AGENT_MD_CONTENT here so the system prompt always has it.
  const agentMdRow = files.find((f) => f.path === AGENT_MD_FILENAME);
  const agentMdContent = agentMdRow ? agentMdRow.content : null;

  const systemPrompt = buildSystemPrompt({
    workspaceName: workspace.name,
    filePaths,
    entryFile,
    activeFile,
    activeFileContent,
    selectedFiles,
    agentMdContent,
  });

  // 2. Get active provider
  const provider = await getActiveProvider();
  if (!provider) {
    ctx.send({ type: "stream.error", messageId: "", content: "No active provider configured. Add one in Settings → Providers." });
    ctx.sendDone();
    return;
  }

  // 3. Load chat messages
  const dbMessages = await db.message.findMany({
    where: { chatId: ctx.chatId },
    orderBy: { createdAt: "asc" },
  });
  if (dbMessages.length === 0) {
    ctx.send({ type: "stream.error", messageId: "", content: "Chat has no messages" });
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
    ctx.send({ type: "stream.error", messageId: "", content: "No assistant message to stream into" });
    ctx.sendDone();
    return;
  }

  // Stable messageId for the entire streaming turn (PRD §10). Every event
  // emitted by this run carries this id so the client can route deltas to
  // the correct assistant message without ambiguity.
  const messageId = assistantRow.id;

  let segments: MessageSegment[] = parseJSON<MessageSegment[]>(
    assistantRow.segments,
    []
  );

  // 4. Build conversation (exclude the empty assistant message we're about to fill)
  const convoRows = dbMessages.filter((m) => m.id !== assistantRow.id);
  let conversation = buildConversationFromMessages(systemPrompt, convoRows);

  // 5. If resuming (browser tools), apply results to pending tool_call segments.
  //
  // CRITICAL: We must reconstruct the assistant message (with its tool_calls)
  // from the persisted segments and add it to the conversation BEFORE the
  // tool result messages. Without this, the tool messages are "orphaned" —
  // they reference tool_call_ids that don't appear in any preceding
  // assistant message. The provider will reject the conversation or, worse,
  // the model will be confused and repeat the same tool calls in a loop
  // (which was the "spinner keeps running" / infinite-loop symptom).
  if (ctx.resumeResults && ctx.resumeResults.length > 0) {
    // Reconstruct the assistant message from the current segments. This
    // includes the content text + all tool_call segments (with their
    // original arguments). We need this so the provider sees the full
    // assistant turn (text + tool_calls) before the tool results.
    const assistantContent = segmentsToContentText(segments);
    const assistantToolCalls: ToolCallRef[] = [];
    for (const s of segments) {
      if (s.type === "tool_call") {
        assistantToolCalls.push({
          id: s.callId,
          type: "function",
          function: {
            name: s.tool,
            arguments: stringifyJSON(s.arguments ?? {}),
          },
        });
      }
    }
    if (assistantToolCalls.length > 0) {
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: assistantContent || null,
      };
      (assistantMsg as { tool_calls?: ToolCallRef[] }).tool_calls = assistantToolCalls;
      conversation.push(assistantMsg);
    }

    // Now apply the tool results — each tool message follows the assistant
    // message that issued the tool_call.
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
        // Emit the new granular tool.result + tool.complete events so the
        // client's ToolStore transitions the card out of the running state.
        ctx.send({
          type: "tool.result",
          messageId,
          toolCallId: r.callId,
          status: seg.status,
          result: r.result,
          error: r.error,
          label: seg.label,
          detail: seg.detail,
        });
        ctx.send({
          type: "tool.complete",
          messageId,
          toolCallId: r.callId,
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

  // Emit stream.start ONCE at the beginning of the agent run so the client
  // knows the stream is live (PRD §11 StreamCompleteEvent / lifecycle).
  ctx.send({ type: "stream.start", messageId });

  // Emit the initial agent status. The first thing the agent does is inspect
  // the workspace (PROBE phase) and plan its approach.
  emitStatus(ctx, messageId, "inspecting", "Reading AGENT.md & inspecting workspace…", "Inspecting");

  // Heartbeat interval — emit a run.heartbeat data event every 10 seconds so
  // the client can detect lost connections (PRD §4). The SSE comment heartbeats
  // from runAgentAsReadableStream keep the TCP connection alive through proxies,
  // but this data event lets the client's watchdog know the run is still active.
  const heartbeatInterval = setInterval(() => {
    ctx.send({
      type: "run.heartbeat",
      messageId,
      timestamp: Date.now(),
      status: "executing",
    });
  }, 10000);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let reasoningText = "";
    let contentText = "";
    const toolCalls: ToolCallAccum[] = [];
    const roundCallIdMap = new Map<string, string>();
    // Tracks whether we've already emitted a tool.start event for a given
    // callId, so we emit it exactly once and then stream argument deltas.
    const startedToolCallIds = new Set<string>();
    let hadError = false;
    let errorMsg = "";

    try {
      for await (const ev of streamChatCompletion(provider, {
        messages: conversation,
        tools: toolDefs,
      })) {
        if (ev.type === "reasoning_content") {
          // PRD §7: emit the delta IMMEDIATELY. No accumulation, no batching.
          reasoningText += ev.content;
          ctx.send({ type: "thinking.delta", messageId, delta: ev.content });
        } else if (ev.type === "content") {
          // PRD §7, §12: emit text.delta immediately — character-by-character
          // as the provider sends it. The client appends to the streaming
          // content segment.
          contentText += ev.content;
          ctx.send({ type: "text.delta", messageId, delta: ev.content });
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

          const accum = toolCalls.find((t) => t.callId === mapped)!;
          if (accum.name) {
            // PRD §13, §14: emit tool.start exactly once (when the name first
            // arrives), then stream tool.arguments.delta for every subsequent
            // argument fragment. The client ToolStore accumulates the raw
            // arguments string and best-effort parses it for display.
            if (!startedToolCallIds.has(accum.callId)) {
              startedToolCallIds.add(accum.callId);
              ctx.send({
                type: "tool.start",
                messageId,
                toolCallId: accum.callId,
                tool: accum.name,
                label: getToolLabel(accum.name),
              });
              // If the first delta already carried argument bytes, emit them
              // as the first arguments.delta so the client sees them.
              if (accum.arguments) {
                ctx.send({
                  type: "tool.arguments.delta",
                  messageId,
                  toolCallId: accum.callId,
                  delta: accum.arguments,
                });
              }
            } else if (ev.argumentsDelta) {
              // Subsequent argument fragments — emit the DELTA, not the
              // accumulated text. The client appends.
              ctx.send({
                type: "tool.arguments.delta",
                messageId,
                toolCallId: accum.callId,
                delta: ev.argumentsDelta,
              });
            }
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
      emitStatus(ctx, messageId, "failed", errorMsg || "An error occurred during the agent run.", "Failed");
      ctx.send({ type: "stream.error", messageId, content: errorMsg });
      ctx.sendDone();
      return;
    }

    // Merge accumulated reasoning + content into segments (for persistence)
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
      // No more tool calls → the agent is writing its final summary.
      emitStatus(ctx, messageId, "summarizing", "Preparing summary…", "Summarizing");
      ctx.send({ type: "stream.complete", messageId });
      emitStatus(ctx, messageId, "completed", "Done", "Completed");
      ctx.sendDone();
      return;
    }

    // Filter out tool calls that were truncated by the model hitting its
    // token limit. A tool call is "truncated" if:
    //   - it has no name (only argument fragments arrived), OR
    //   - the arguments JSON is unparseable AND non-empty (incomplete JSON).
    // Truncated calls are dropped with a warning so the model can recover on
    // the next round instead of executing a half-formed tool with empty args.
    const validToolCalls: ToolCallAccum[] = [];
    const droppedToolCalls: ToolCallAccum[] = [];
    for (const tc of toolCalls) {
      const hasName = Boolean(tc.name);
      let argsParseable = true;
      try {
        if (tc.arguments && tc.arguments.trim()) {
          JSON.parse(tc.arguments);
        }
      } catch {
        argsParseable = false;
      }
      if (hasName && (argsParseable || !tc.arguments || !tc.arguments.trim())) {
        validToolCalls.push(tc);
      } else {
        droppedToolCalls.push(tc);
      }
    }
    if (droppedToolCalls.length > 0) {
      // Surface the dropped (truncated) tool calls as content so the user can
      // see what happened, then continue with the valid ones.
      const note =
        droppedToolCalls.length === 1
          ? "⚠️ One tool call was truncated (the model ran out of tokens mid-argument) and has been skipped."
          : `⚠️ ${droppedToolCalls.length} tool calls were truncated (the model ran out of tokens mid-argument) and have been skipped.`;
      segments = mergeSegment(segments, { type: "content", content: `\n\n${note}\n` });
      ctx.send({ type: "text.delta", messageId, delta: `\n\n${note}\n` });
    }
    const toolCallsToProcess = validToolCalls;

    // If all tool calls were truncated, treat this as a final round —
    // there's nothing to execute and no tool message to send back, so the
    // model would just loop. Emit done and finish.
    if (toolCallsToProcess.length === 0) {
      await db.message.update({
        where: { id: assistantRow.id },
        data: { segments: stringifyJSON(segments) },
      });
      await db.chat.update({
        where: { id: ctx.chatId },
        data: { updatedAt: new Date() },
      });
      emitStatus(ctx, messageId, "completed", "Done", "Completed");
      ctx.send({ type: "stream.complete", messageId });
      ctx.sendDone();
      return;
    }

    // Build the assistant message with tool_calls to add to the conversation
    const toolCallRefs: ToolCallRef[] = toolCallsToProcess.map((tc) => ({
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
    for (const tc of toolCallsToProcess) {
      const label = getToolLabel(tc.name);
      let args: Record<string, unknown> = {};
      try {
        args = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        args = {};
      }
      const detail = getToolDetail(tc.name, args);
      const isBrowser = isBrowserTool(tc.name);

      // Emit agent.status so the UI shows what the agent is doing right now
      // (PRD §23). File tools → "executing", browser tools → "testing".
      if (isBrowser) {
        emitStatus(ctx, messageId, "testing", detail || `Running ${label}…`, label);
      } else {
        emitStatus(ctx, messageId, "executing", detail || `Running ${label}…`, label);
      }

      // Emit tool.execute to transition the card from "generating" →
      // "executing" (PRD §15). For browser tools this is the signal that
      // the client should now run the tool against the preview iframe.
      // For file tools it marks the start of server-side execution.
      ctx.send({ type: "tool.execute", messageId, toolCallId: tc.callId });

      // Ensure a persisted tool_call segment exists (for hydration after refresh).
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
      } else {
        const seg = segments[existingSegIdx] as Extract<MessageSegment, { type: "tool_call" }>;
        seg.arguments = args;
        seg.argumentsText = tc.arguments;
        seg.detail = detail;
        seg.label = label;
      }

      if (isBrowser) {
        // Browser tools are executed client-side against the preview iframe.
        // We do NOT execute them here — we collect their callIds and emit
        // browser.tools_pending so the client runs them, then calls /continue.
        browserCallIds.push(tc.callId);
        // We do NOT append a tool message yet — that happens on /continue
      } else {
        // ---- File tool: stream the file content LIVE before writing (PRD §20, §21) ----
        //
        // For tools that write file content (create_file, write_file, edit_file,
        // replace_content), emit file.start → file.delta* → file.complete so the
        // editor shows the file being generated character-by-character. We emit
        // the deltas from the argument content BEFORE executing the tool, then
        // execute the actual DB write. This gives the user real-time feedback.
        const filePathForStream = pickFilePathForStreaming(tc.name, args);
        if (filePathForStream) {
          const contentToStream = pickFileContentForStreaming(tc.name, args);
          const operation: "create" | "write" | "append" | "replace" | "patch" | "delete" =
            tc.name === "create_file"
              ? "create"
              : tc.name === "edit_file"
              ? "patch"
              : tc.name === "replace_content"
              ? "replace"
              : "write";
          ctx.send({
            type: "file.start",
            messageId,
            toolCallId: tc.callId,
            path: filePathForStream,
            operation,
          });
          if (contentToStream) {
            // Stream in ~256-byte chunks. This is NOT artificial throttling of
            // the AI stream — the AI has already produced this content. We chunk
            // it only so the editor can apply incremental updates without
            // blocking the main thread on a single huge insertion (PRD §28
            // backpressure, §23 prevent editor flickering).
            const CHUNK = 256;
            for (let i = 0; i < contentToStream.length; i += CHUNK) {
              ctx.send({
                type: "file.delta",
                messageId,
                toolCallId: tc.callId,
                path: filePathForStream,
                delta: contentToStream.slice(i, i + CHUNK),
              });
            }
          }
          ctx.send({
            type: "file.complete",
            messageId,
            toolCallId: tc.callId,
            path: filePathForStream,
            bytes: contentToStream ? contentToStream.length : 0,
          });
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

        // Update persisted segment
        const segIdx2 = segments.findIndex(
          (s): s is Extract<MessageSegment, { type: "tool_call" }> =>
            s.type === "tool_call" && s.callId === tc.callId
        );
        if (segIdx2 >= 0) {
          const seg = segments[segIdx2] as Extract<MessageSegment, { type: "tool_call" }>;
          seg.status = status;
          seg.result = result;
          seg.error = errorMsg;
        }

        // Emit tool.result + tool.complete (PRD §13 lifecycle)
        ctx.send({
          type: "tool.result",
          messageId,
          toolCallId: tc.callId,
          status,
          result,
          error: errorMsg,
          label,
          detail,
        });
        ctx.send({ type: "tool.complete", messageId, toolCallId: tc.callId });

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

    // If there are pending browser tools → pause and resume. The client will
    // execute the browser tools and call /continue, which starts a NEW stream.
    // We emit a heartbeat-status so the UI shows "Testing…" while waiting.
    if (browserCallIds.length > 0) {
      emitStatus(ctx, messageId, "testing", "Running browser tools in preview…", "Testing");
      ctx.send({
        type: "browser.tools_pending",
        messageId,
        callIds: browserCallIds,
      });
      ctx.sendDone();
      return;
    }

    // Otherwise loop again (file tools ran; model may produce more)
  }

  // Max rounds exceeded — emit stream.complete (not error) so the spinner stops.
  // The model has been working for 25 rounds; that's a legitimate stopping
  // point, not a failure. Persist what we have and finish gracefully.
  await db.message.update({
    where: { id: assistantRow.id },
    data: { segments: stringifyJSON(segments) },
  });
  await db.chat.update({
    where: { id: ctx.chatId },
    data: { updatedAt: new Date() },
  });
  ctx.send({
    type: "text.delta",
    messageId,
    delta:
      "\n\n_I've reached the maximum number of reasoning rounds for this turn. If you'd like me to continue, please send another message._\n",
  });
  emitStatus(ctx, messageId, "completed", "Done", "Completed");
  ctx.send({ type: "stream.complete", messageId });
  ctx.sendDone();
  clearInterval(heartbeatInterval);
}

// ---------- File streaming helpers ----------
//
// Determine which file-writing tools should stream their content to the live
// editor, and extract the (path, content) pair from the parsed arguments.

function pickFilePathForStreaming(
  toolName: string,
  args: Record<string, unknown>
): string | null {
  try {
    switch (toolName) {
      case "create_file":
      case "write_file":
      case "edit_file":
      case "replace_content":
        return safePath(String(args.path ?? "")) || null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function pickFileContentForStreaming(
  toolName: string,
  args: Record<string, unknown>
): string | null {
  try {
    switch (toolName) {
      case "create_file":
      case "write_file":
        return String(args.content ?? "");
      case "edit_file": {
        // For edit_file we stream the NEW content (what will replace the old).
        return String(args.newContent ?? "");
      }
      case "replace_content": {
        // For replace_content we stream the replacement text.
        return String(args.replace ?? "");
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
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
