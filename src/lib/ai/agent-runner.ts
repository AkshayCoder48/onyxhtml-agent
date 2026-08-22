// ============================================================================
// Agent runner — self-contained, runs inside a Web Worker.
//
// Unlike src/lib/ai/agent.ts (which reads from the localStorage db and is
// kept for the legacy server/API path), this runner receives ALL its data
// via the start message and mutates files in memory. File updates and
// browser-tool pauses are sent back to the main thread via postMessage.
// ============================================================================

import { parseJSON, stringifyJSON } from "@/lib/settings";
import {
  MessageSegment,
} from "@/lib/types";
import type { StreamEvent } from "@/lib/streaming/types";
import { AGENT_MD_CONTENT, AGENT_MD_FILENAME } from "@/lib/agent-md";
import {
  ChatMessage,
  streamChatCompletion,
  ToolCallRef,
} from "./provider";
import { executeFileToolInMemory } from "./worker-file-tools";

export type { WorkerFile } from "./worker-file-tools";
type WorkerFile = import("./worker-file-tools").WorkerFile;
import {
  getToolDefinitions,
  getToolDetail,
  getToolLabel,
  isBrowserTool,
} from "./tools";
import { buildFileTree, findEntryFile, safePath } from "@/lib/files";

const MAX_ROUNDS = 25;

export type WorkerProvider = {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string | null;
  model: string;
  isActive: boolean;
};

export type WorkerChatMessage = {
  id: string;
  role: "user" | "assistant";
  segments: string; // JSON (matches DB shape)
};

export type StartMessage = {
  type: "start";
  runId: string;
  messageId: string;
  workspaceName: string;
  entryFile: string | null;
  activeFile: string | null;
  activeFileContent: string | null;
  selectedFiles: string[];
  agentMdContent: string | null;
  files: WorkerFile[];
  messages: WorkerChatMessage[];
  provider: WorkerProvider;
  context?: { activeFile?: string | null; selectedFiles?: string[] };
};

export type ResumeMessage = {
  type: "resume";
  results: { callId: string; result?: unknown; error?: string }[];
};

export type StopMessage = { type: "stop" };
export type WorkerInMessage = StartMessage | ResumeMessage | StopMessage;

type Emit = (ev: StreamEvent) => void;

// ---------- Conversation / system prompt (mirrors agent.ts) ----------

function segmentsToContentText(segments: MessageSegment[]): string {
  return segments
    .filter((s) => s.type === "content")
    .map((s) => (s as { content: string }).content)
    .join("");
}

function buildConversation(
  systemPrompt: string,
  rows: WorkerChatMessage[]
): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: systemPrompt }];
  for (const r of rows) {
    const segments = parseJSON<MessageSegment[]>(r.segments, []);
    if (r.role === "user") {
      out.push({ role: "user", content: segmentsToContentText(segments) });
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
      const msg: ChatMessage = { role: "assistant", content };
      if (toolCalls.length > 0) {
        (msg as { tool_calls?: ToolCallRef[] }).tool_calls = toolCalls;
      }
      out.push(msg);
      for (const s of segments) {
        if (s.type === "tool_call") {
          out.push({
            role: "tool",
            tool_call_id: s.callId,
            content: stringifyJSON(
              s.status === "error"
                ? { error: s.error ?? "tool error" }
                : s.result ?? {}
            ),
          });
        }
      }
    }
  }
  return out;
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
    agentMd,
    "",
    "========================================================",
    "AGENT.md ENDS HERE — workspace context follows.",
    "========================================================",
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
    parts.push(
      "",
      `User also referenced these files: ${opts.selectedFiles.join(", ")}`
    );
  }
  parts.push(
    "",
    "REMINDERS (these override any contrary instinct):",
    "- You ALREADY read AGENT.md above. Follow its lifecycle: PROBE → PLAN → EDIT → TEST → SUMMARIZE.",
    "- Do NOT generate files when an edit would do. edit_file is the default for existing files.",
    "  create_file is ONLY for files that do not exist yet.",
    "- Do NOT skip the TEST phase. After every meaningful change, verify with browser_read_page",
    "  (observe), browser_execute_js (scripted checks), terminal_exec, or take_screenshot.",
    "- Do NOT end the turn without a written SUMMARY.",
    "- The preview is already loaded with index.html. Do NOT call open_page first.",
    "- Keep explanations brief — one or two sentences before each action.",
    "- ALWAYS prefer the surgical edit over a full rewrite."
  );
  return parts.join("\n");
}

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

type RunnerState = {
  files: Map<string, WorkerFile>;
  segments: MessageSegment[];
  cancelled: boolean;
  runId: string;
  messageId: string;
  conversation: ChatMessage[];
  assistantRowId: string;
};

function post(message: unknown) {
  (globalThis as unknown as { postMessage?: (m: unknown) => void }).postMessage?.(message);
}

export class AgentRunner {
  private state: RunnerState | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  start(msg: StartMessage) {
    this.stopHeartbeat();
    const files = new Map<string, WorkerFile>();
    for (const f of msg.files) files.set(f.path, { ...f });

    const agentMdRow = msg.files.find((f) => f.path === AGENT_MD_FILENAME);
    const systemPrompt = buildSystemPrompt({
      workspaceName: msg.workspaceName,
      filePaths: msg.files.map((f) => f.path),
      entryFile: msg.entryFile,
      activeFile: msg.activeFile,
      activeFileContent: msg.activeFileContent,
      selectedFiles: msg.selectedFiles,
      agentMdContent: agentMdRow?.content ?? msg.agentMdContent,
    });

    const rows = msg.messages;
    const lastAssistant =
      [...rows].reverse().find((r) => r.role === "assistant") ?? rows[rows.length - 1];

    const convoRows = rows.filter((r) => r.id !== lastAssistant?.id);
    const conversation = buildConversation(systemPrompt, convoRows);

    const segments = parseJSON<MessageSegment[]>(
      lastAssistant?.segments ?? "[]",
      []
    );

    this.state = {
      files,
      segments,
      cancelled: false,
      runId: msg.runId,
      messageId: msg.messageId,
      conversation,
      assistantRowId: lastAssistant?.id ?? msg.messageId,
    };

    const emit: Emit = (ev) => {
      if (this.state?.cancelled) return;
      post(ev);
    };

    this.run(msg.provider, emit).catch((e) => {
      emit({
        type: "stream.error",
        messageId: msg.messageId,
        content: e instanceof Error ? e.message : String(e),
      });
      this.done(emit);
    });
  }

  resume(results: { callId: string; result?: unknown; error?: string }[]) {
    if (!this.state) return;
    const s = this.state;
    const emit: Emit = (ev) => post(ev);

    // Reconstruct assistant message with tool_calls
    const assistantContent = segmentsToContentText(s.segments);
    const assistantToolCalls: ToolCallRef[] = [];
    for (const seg of s.segments) {
      if (seg.type === "tool_call") {
        assistantToolCalls.push({
          id: seg.callId,
          type: "function",
          function: {
            name: seg.tool,
            arguments: stringifyJSON(seg.arguments ?? {}),
          },
        });
      }
    }
    if (assistantToolCalls.length > 0) {
      const m: ChatMessage = { role: "assistant", content: assistantContent || null };
      (m as { tool_calls?: ToolCallRef[] }).tool_calls = assistantToolCalls;
      s.conversation.push(m);
    }

    for (const r of results) {
      const idx = s.segments.findIndex(
        (x): x is Extract<MessageSegment, { type: "tool_call" }> =>
          x.type === "tool_call" && x.callId === r.callId
      );
      if (idx >= 0) {
        const seg = s.segments[idx] as Extract<MessageSegment, { type: "tool_call" }>;
        seg.status = r.error ? "error" : "success";
        seg.result = r.result;
        seg.error = r.error;
        emit({
          type: "tool.result",
          messageId: s.messageId,
          toolCallId: r.callId,
          status: seg.status,
          result: r.result,
          error: r.error,
          label: seg.label,
          detail: seg.detail,
        });
        emit({
          type: "tool.complete",
          messageId: s.messageId,
          toolCallId: r.callId,
        });
        s.conversation.push({
          role: "tool",
          tool_call_id: r.callId,
          content: stringifyJSON(r.error ? { error: r.error } : r.result ?? {}),
        });
      } else {
        s.conversation.push({
          role: "tool",
          tool_call_id: r.callId,
          content: stringifyJSON(r.error ? { error: r.error } : r.result ?? {}),
        });
      }
    }

    post({ type: "persist", segments: s.segments, files: this.snapshotFiles() });

    this.runFromState(emit).catch((e) => {
      emit({
        type: "stream.error",
        messageId: s.messageId,
        content: e instanceof Error ? e.message : String(e),
      });
      this.done(emit);
    });
  }

  stop() {
    if (this.state) this.state.cancelled = true;
    this.stopHeartbeat();
  }

  private snapshotFiles(): WorkerFile[] {
    if (!this.state) return [];
    return Array.from(this.state.files.values());
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private done(emit: Emit) {
    this.stopHeartbeat();
    if (this.state) {
      post({
        type: "persist",
        segments: this.state.segments,
        files: this.snapshotFiles(),
      });
    }
    post({ type: "done" });
  }

  private async run(provider: WorkerProvider, emit: Emit) {
    const s = this.state;
    if (!s) return;

    emit({ type: "stream.start", messageId: s.messageId });
    emit({
      type: "agent.status",
      messageId: s.messageId,
      status: "inspecting",
      message: "Reading AGENT.md & inspecting workspace…",
      currentAction: "Inspecting",
    });

    this.heartbeatTimer = setInterval(() => {
      emit({
        type: "run.heartbeat",
        messageId: s.messageId,
        timestamp: Date.now(),
        status: "executing",
      });
    }, 10000);

    await this.loop(provider, emit);
  }

  private async runFromState(emit: Emit) {
    const s = this.state;
    if (!s) return;
    // Need provider: we stored it via a closure-less approach; re-request it
    // by asking the main thread. Simpler: provider is posted on start and we
    // cache it on the instance.
    if (!this.provider) {
      emit({
        type: "stream.error",
        messageId: s.messageId,
        content: "Worker provider missing",
      });
      this.done(emit);
      return;
    }
    await this.loop(this.provider, emit);
  }

  private provider: WorkerProvider | null = null;

  private async loop(provider: WorkerProvider, emit: Emit) {
    this.provider = provider;
    const s = this.state!;
    const toolDefs = getToolDefinitions();
    const runTag = Math.random().toString(36).slice(2, 6);
    let callIdSeq = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (s.cancelled) return;
      let contentText = "";
      let reasoningText = "";
      const toolCalls: {
        callId: string;
        name: string;
        arguments: string;
        index: number;
      }[] = [];
      const idMap = new Map<number, string>();
      const started = new Set<string>();
      let hadError = false;
      let errorMsg = "";

      try {
        for await (const ev of streamChatCompletion(provider as any, {
          messages: s.conversation,
          tools: toolDefs,
        })) {
          if (s.cancelled) return;
          if (ev.type === "reasoning_content") {
            reasoningText += ev.content;
            emit({
              type: "thinking.delta",
              messageId: s.messageId,
              delta: ev.content,
            });
          } else if (ev.type === "content") {
            contentText += ev.content;
            emit({
              type: "text.delta",
              messageId: s.messageId,
              delta: ev.content,
            });
          } else if (ev.type === "tool_call_delta") {
            let mapped = idMap.get(ev.index);
            if (!mapped) {
              mapped = `tc_${runTag}_${callIdSeq++}`;
              idMap.set(ev.index, mapped);
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
            if (accum.name && !started.has(accum.callId)) {
              started.add(accum.callId);
              emit({
                type: "tool.start",
                messageId: s.messageId,
                toolCallId: accum.callId,
                tool: accum.name,
                label: getToolLabel(accum.name),
              });
              if (accum.arguments) {
                emit({
                  type: "tool.arguments.delta",
                  messageId: s.messageId,
                  toolCallId: accum.callId,
                  delta: accum.arguments,
                });
              }
            } else if (ev.argumentsDelta) {
              emit({
                type: "tool.arguments.delta",
                messageId: s.messageId,
                toolCallId: accum.callId,
                delta: ev.argumentsDelta,
              });
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
        if (reasoningText)
          mergeSegment(s.segments, { type: "thinking", content: reasoningText });
        if (contentText)
          mergeSegment(s.segments, { type: "content", content: contentText });
        post({
          type: "persist",
          segments: s.segments,
          files: this.snapshotFiles(),
        });
        emit({
          type: "agent.status",
          messageId: s.messageId,
          status: "failed",
          message: errorMsg,
          currentAction: "Failed",
        });
        emit({ type: "stream.error", messageId: s.messageId, content: errorMsg });
        this.done(emit);
        return;
      }

      if (reasoningText)
        mergeSegment(s.segments, { type: "thinking", content: reasoningText });
      if (contentText)
        mergeSegment(s.segments, { type: "content", content: contentText });

      if (toolCalls.length === 0) {
        post({
          type: "persist",
          segments: s.segments,
          files: this.snapshotFiles(),
        });
        emit({
          type: "agent.status",
          messageId: s.messageId,
          status: "summarizing",
          message: "Preparing summary…",
          currentAction: "Summarizing",
        });
        emit({ type: "stream.complete", messageId: s.messageId });
        emit({
          type: "agent.status",
          messageId: s.messageId,
          status: "completed",
          message: "Done",
          currentAction: "Completed",
        });
        this.done(emit);
        return;
      }

      // Drop truncated calls
      const valid: typeof toolCalls = [];
      for (const tc of toolCalls) {
        const hasName = Boolean(tc.name);
        let argsOk = true;
        try {
          if (tc.arguments && tc.arguments.trim()) JSON.parse(tc.arguments);
        } catch {
          argsOk = false;
        }
        if (hasName && (argsOk || !tc.arguments || !tc.arguments.trim())) {
          valid.push(tc);
        }
      }
      if (valid.length === 0) {
        post({
          type: "persist",
          segments: s.segments,
          files: this.snapshotFiles(),
        });
        emit({ type: "stream.complete", messageId: s.messageId });
        this.done(emit);
        return;
      }

      // Append assistant turn with tool_calls
      const toolCallRefs: ToolCallRef[] = valid.map((tc) => ({
        id: tc.callId,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments || "{}" },
      }));
      s.conversation.push({
        role: "assistant",
        content: contentText || null,
        tool_calls: toolCallRefs,
      });

      const browserIds: string[] = [];
      for (const tc of valid) {
        const label = getToolLabel(tc.name);
        let args: Record<string, unknown> = {};
        try {
          args = tc.arguments ? JSON.parse(tc.arguments) : {};
        } catch {
          args = {};
        }
        const detail = getToolDetail(tc.name, args);
        const isBrowser = isBrowserTool(tc.name);

        if (isBrowser)
          emit({
            type: "agent.status",
            messageId: s.messageId,
            status: "testing",
            message: detail || `Running ${label}…`,
            currentAction: label,
          });
        else
          emit({
            type: "agent.status",
            messageId: s.messageId,
            status: "executing",
            message: detail || `Running ${label}…`,
            currentAction: label,
          });

        emit({
          type: "tool.execute",
          messageId: s.messageId,
          toolCallId: tc.callId,
        });

        const segIdx = s.segments.findIndex(
          (x): x is Extract<MessageSegment, { type: "tool_call" }> =>
            x.type === "tool_call" && x.callId === tc.callId
        );
        if (segIdx < 0) {
          s.segments.push({
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
          const seg = s.segments[segIdx] as Extract<
            MessageSegment,
            { type: "tool_call" }
          >;
          seg.arguments = args;
          seg.argumentsText = tc.arguments;
          seg.detail = detail;
          seg.label = label;
        }

        if (isBrowser) {
          browserIds.push(tc.callId);
        } else {
          // File tool — stream content then execute in memory
          const filePath = pickFilePath(tc.name, args);
          if (filePath) {
            const fileContent = pickFileContent(tc.name, args);
            const operation =
              tc.name === "create_file"
                ? "create"
                : tc.name === "edit_file"
                ? "patch"
                : tc.name === "replace_content"
                ? "replace"
                : "write";
            emit({
              type: "file.start",
              messageId: s.messageId,
              toolCallId: tc.callId,
              path: filePath,
              operation,
            });
            if (fileContent) {
              const CHUNK = 256;
              for (let i = 0; i < fileContent.length; i += CHUNK) {
                emit({
                  type: "file.delta",
                  messageId: s.messageId,
                  toolCallId: tc.callId,
                  path: filePath,
                  delta: fileContent.slice(i, i + CHUNK),
                });
              }
            }
            emit({
              type: "file.complete",
              messageId: s.messageId,
              toolCallId: tc.callId,
              path: filePath,
              bytes: fileContent ? fileContent.length : 0,
            });
          }

          let result: unknown;
          let status: "success" | "error" = "success";
          let errorMsg2: string | undefined;
          try {
            const r = executeFileToolInMemory(tc.name, args, s.files);
            result = r.result;
            // Push the updated snapshot to the main thread so it can persist.
            post({
              type: "files-snapshot",
              files: r.files,
            });
          } catch (e) {
            status = "error";
            errorMsg2 = e instanceof Error ? e.message : String(e);
            result = { error: errorMsg2 };
          }

          const idx2 = s.segments.findIndex(
            (x): x is Extract<MessageSegment, { type: "tool_call" }> =>
              x.type === "tool_call" && x.callId === tc.callId
          );
          if (idx2 >= 0) {
            const seg = s.segments[idx2] as Extract<
              MessageSegment,
              { type: "tool_call" }
            >;
            seg.status = status;
            seg.result = result;
            seg.error = errorMsg2;
          }

          emit({
            type: "tool.result",
            messageId: s.messageId,
            toolCallId: tc.callId,
            status,
            result,
            error: errorMsg2,
            label,
            detail,
          });
          emit({
            type: "tool.complete",
            messageId: s.messageId,
            toolCallId: tc.callId,
          });

          s.conversation.push({
            role: "tool",
            tool_call_id: tc.callId,
            content: stringifyJSON(result ?? {}),
          });
        }
      }

      post({
        type: "persist",
        segments: s.segments,
        files: this.snapshotFiles(),
      });

      if (browserIds.length > 0) {
        emit({
          type: "agent.status",
          messageId: s.messageId,
          status: "testing",
          message: "Running browser tools in preview…",
          currentAction: "Testing",
        });
        emit({
          type: "browser.tools_pending",
          messageId: s.messageId,
          callIds: browserIds,
        });
        // Pause — main thread runs browser tools and posts "resume" back.
        return;
      }
    }

    // Max rounds
    post({
      type: "persist",
      segments: s.segments,
      files: this.snapshotFiles(),
    });
    emit({
      type: "text.delta",
      messageId: s.messageId,
      delta:
        "\n\n_I've reached the maximum number of reasoning rounds for this turn._\n",
    });
    emit({ type: "stream.complete", messageId: s.messageId });
    this.done(emit);
  }
}

function pickFilePath(
  name: string,
  args: Record<string, unknown>
): string | null {
  try {
    switch (name) {
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

function pickFileContent(
  name: string,
  args: Record<string, unknown>
): string | null {
  try {
    switch (name) {
      case "create_file":
      case "write_file":
        return String(args.content ?? "");
      case "edit_file":
        return String(args.newContent ?? "");
      case "replace_content":
        return String(args.replace ?? "");
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// Re-export findEntryFile so callers can compute the entry file before
// starting the worker.
export { findEntryFile };
