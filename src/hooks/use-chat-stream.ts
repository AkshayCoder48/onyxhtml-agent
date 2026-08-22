"use client";

import * as React from "react";
import { toast } from "sonner";
import { useChatStore } from "@/stores/chat-store";
import { useToolStore } from "@/stores/tool-store";
import { useFileStreamStore } from "@/stores/file-stream-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { Message, MessageSegment } from "@/lib/types";
import type { StreamEvent } from "@/lib/streaming/types";
import { EventDispatcher, type DispatcherHandlers } from "@/lib/streaming/dispatcher";
import { useAgentWorker } from "@/hooks/use-agent-worker";
import { db } from "@/lib/db";
import { parseJSON, stringifyJSON } from "@/lib/settings";
import { findEntryFile } from "@/lib/files";
import { AGENT_MD_FILENAME } from "@/lib/agent-md";
import type {
  WorkerChatMessage,
  WorkerFile,
  WorkerProvider,
} from "@/lib/ai/agent-runner";

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function parseArgsJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw || !raw.trim()) return undefined;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveBrowserToolCall(callId: string): {
  tool: string;
  args: Record<string, unknown>;
  label?: string;
  detail?: string;
} | null {
  const t = useToolStore.getState().tools[callId];
  if (t) {
    return {
      tool: t.tool,
      args: t.parsedArguments ?? parseArgsJson(t.rawArguments) ?? {},
      label: t.label,
      detail: t.detail,
    };
  }
  for (const m of useChatStore.getState().messages) {
    for (const s of m.segments) {
      if (s.type === "tool_call" && s.callId === callId) {
        return {
          tool: s.tool,
          args: s.arguments ?? parseArgsJson(s.argumentsText) ?? {},
          label: s.label,
          detail: s.detail,
        };
      }
    }
  }
  return null;
}

type Bridge = {
  execute: (
    tool: string,
    args: Record<string, unknown>,
    callId: string
  ) => Promise<{ result?: unknown; error?: string }>;
};

export function useChatStream(bridge: { execute: Bridge["execute"] }) {
  const bridgeRef = React.useRef(bridge.execute);
  bridgeRef.current = bridge.execute;
  const chatId = useChatStore((s) => s.chatId);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const startStreaming = useChatStore((s) => s.startStreaming);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const appendTextDelta = useChatStore((s) => s.appendTextDelta);
  const appendThinkingDelta = useChatStore((s) => s.appendThinkingDelta);
  const addErrorSegment = useChatStore((s) => s.addErrorSegment);
  const upsertToolCallSegment = useChatStore((s) => s.upsertToolCallSegment);
  const setToolResult = useChatStore((s) => s.setToolResult);
  const setPendingBrowserTools = useChatStore((s) => s.setPendingBrowserTools);
  const setAgentStatus = useChatStore((s) => s.setAgentStatus);
  const setAgentProgress = useChatStore((s) => s.setAgentProgress);
  const setHeartbeat = useChatStore((s) => s.setHeartbeat);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setChatId = useChatStore((s) => s.setChatId);
  const setMessages = useChatStore((s) => s.setMessages);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);

  const toolStart = useToolStore((s) => s.start);
  const toolAppendArgs = useToolStore((s) => s.appendArguments);
  const toolExecute = useToolStore((s) => s.execute);
  const toolProgress = useToolStore((s) => s.progress);
  const toolResult = useToolStore((s) => s.result);
  const toolComplete = useToolStore((s) => s.complete);
  const toolAddConsole = useToolStore((s) => s.addConsoleLine);
  const toolReset = useToolStore((s) => s.reset);
  const fileStreamStart = useFileStreamStore((s) => s.start);
  const fileStreamDelta = useFileStreamStore((s) => s.delta);
  const fileStreamComplete = useFileStreamStore((s) => s.complete);
  const fileStreamReset = useFileStreamStore((s) => s.reset);
  const browserAdd = useBrowserStore((s) => s.add);
  const browserReset = useBrowserStore((s) => s.reset);

  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const addFile = useWorkspaceStore((s) => s.addFile);
  const setAiEditing = useWorkspaceStore((s) => s.setAiEditing);
  const bumpPreview = useWorkspaceStore((s) => s.bumpPreview);
  const renameMessage = useChatStore((s) => s.renameMessage);


  const worker = useAgentWorker();
  const abortRef = React.useRef<{ stop: () => void; resume: (r: { callId: string; result?: unknown; error?: string }[]) => void } | null>(null);

  const handlers = React.useMemo<DispatcherHandlers>(
    () => ({
      onTextDelta: (messageId, delta) => appendTextDelta(messageId, delta),
      onThinkingDelta: (messageId, delta) => appendThinkingDelta(messageId, delta),
      onToolStart: (ev) => {
        toolStart({
          toolCallId: ev.toolCallId,
          messageId: ev.messageId,
          tool: ev.tool,
          label: ev.label,
        });
        upsertToolCallSegment(ev.messageId, {
          type: "tool_call",
          tool: ev.tool,
          arguments: {},
          argumentsText: "",
          callId: ev.toolCallId,
          status: "running",
          label: ev.label,
        });
      },
      onToolArgumentsDelta: (ev) => {
        toolAppendArgs(ev.toolCallId, ev.delta);
        const t = useToolStore.getState().tools[ev.toolCallId];
        if (t) {
          upsertToolCallSegment(ev.messageId, {
            type: "tool_call",
            tool: t.tool,
            arguments: t.parsedArguments ?? {},
            argumentsText: t.rawArguments,
            callId: ev.toolCallId,
            status: "running",
            label: t.label,
          });
        }
      },
      onToolExecute: (toolCallId) => {
        toolExecute(toolCallId);
        const t = useToolStore.getState().tools[toolCallId];
        if (t) {
          upsertToolCallSegment(t.messageId, {
            type: "tool_call",
            tool: t.tool,
            arguments: t.parsedArguments ?? {},
            argumentsText: t.rawArguments,
            callId: toolCallId,
            status: "running",
            label: t.label,
          });
        }
      },
      onToolProgress: (toolCallId, message, progress) => {
        toolProgress(toolCallId, message, progress);
      },
      onToolResult: (ev) => {
        toolResult(ev.toolCallId, ev.status, ev.result, ev.error, ev.label, ev.detail);
        setToolResult(ev.messageId, ev.toolCallId, {
          status: ev.status,
          result: ev.result,
          error: ev.error,
          label: ev.label,
          detail: ev.detail,
        });
      },
      onToolComplete: (toolCallId) => {
        toolComplete(toolCallId);
      },
      onFileStart: (ev) => {
        fileStreamStart({
          path: ev.path,
          operation: ev.operation,
          toolCallId: ev.toolCallId,
        });
        setAiEditing(ev.path, true);
        const ws = useWorkspaceStore.getState();
        if (!ws.files[ev.path]) addFile(ev.path, "", false);
        else updateFileContent(ev.path, "");
        ws.openTab(ev.path);
        ws.setActiveFile(ev.path);
      },
      onFileDelta: (ev) => {
        fileStreamDelta(ev.path, ev.delta);
        const fs = useFileStreamStore.getState().streams[ev.path];
        if (fs) updateFileContent(ev.path, fs.content);
      },
      onFileComplete: (ev) => {
        fileStreamComplete(ev.path, ev.bytes);
        const fs = useFileStreamStore.getState().streams[ev.path];
        if (fs) updateFileContent(ev.path, fs.content);
        setAiEditing(ev.path, false);
        bumpPreview();
      },
      onBrowserConsole: (ev) => {
        browserAdd({
          toolCallId: ev.toolCallId,
          level: ev.level,
          args: ev.args,
          time: ev.time,
        });
        toolAddConsole(ev.toolCallId, ev.level, ev.args, ev.time);
      },
      onStreamStart: () => {},
      onStreamComplete: () => {},
      onStreamError: (messageId, content) => {
        if (messageId) addErrorSegment(messageId, content);
      },
      onBrowserToolsPending: (_messageId, callIds) => {
        setPendingBrowserTools(callIds);
      },
      onAgentStatus: (ev) => setAgentStatus(ev.status, ev.message, ev.currentAction),
      onAgentProgress: (ev) => setAgentProgress(ev.message, ev.progress),
      onRunHeartbeat: (ev) => setHeartbeat(ev.timestamp, ev.currentStep),
    }),
    [
      appendTextDelta, appendThinkingDelta, toolStart, toolAppendArgs,
      toolExecute, toolProgress, toolResult, toolComplete, toolAddConsole,
      fileStreamStart, fileStreamDelta, fileStreamComplete, browserAdd,
      upsertToolCallSegment, setToolResult, addErrorSegment,
      setPendingBrowserTools, setAgentStatus, setAgentProgress, setHeartbeat,
      addFile, updateFileContent, setAiEditing, bumpPreview,
    ]
  );

  const dispatcherRef = React.useRef(new EventDispatcher(handlers));
  React.useEffect(() => {
    dispatcherRef.current = new EventDispatcher(handlers);
  }, [handlers]);

  // Persist worker "persist" / "files-snapshot" control messages to
  // localStorage and keep the workspace file store in sync.
  React.useEffect(() => {
    const off = worker.onWorkerMessage((ev) => {
      const anyEv = ev as unknown as {
        type: string;
        segments?: MessageSegment[];
        files?: WorkerFile[];
      };
      if (anyEv.type === "persist") {
        const mid = useChatStore.getState().streamingMessageId;
        if (mid && anyEv.segments) {
          db.message
            .update({
              where: { id: mid },
              data: { segments: stringifyJSON(anyEv.segments) },
            })
            .catch(() => {});
        }
      }
      if ((anyEv.type === "persist" || anyEv.type === "files-snapshot") && anyEv.files) {
        const ws = useWorkspaceStore.getState();
        if (ws.currentWorkspaceId) {
          const wsId = ws.currentWorkspaceId;
          for (const f of anyEv.files) {
            db.file
              .upsert({
                where: { workspaceId_path: { workspaceId: wsId, path: f.path } },
                update: { content: f.content, isBinary: f.isBinary },
                create: { workspaceId: wsId, path: f.path, content: f.content, isBinary: f.isBinary },
              })
              .catch(() => {});
          }
        }
      }
    });
    return off;
  }, [worker]);

  const consumeAndRun = React.useCallback(
    async (
      handle: Awaited<ReturnType<typeof worker.start>>,
      assistantId: string,
      signal: AbortSignal
    ) => {
      let browserPending: string[] = [];
      const dispatcher = dispatcherRef.current;
      let idReconciled = false;
      for await (const ev of handle.events) {
        if (signal.aborted) break;
        if (!idReconciled && ev.messageId && ev.messageId !== assistantId) {
          renameMessage(assistantId, ev.messageId);
          idReconciled = true;
        }
        if (ev.type === "browser.tools_pending") {
          for (const id of ev.callIds) if (!browserPending.includes(id)) browserPending.push(id);
        }
        dispatcher.dispatch(ev as StreamEvent);
        // CRITICAL: the worker PAUSES after browser.tools_pending and waits
        // for resume. Heartbeats keep arriving, so waiting for stream.complete
        // here deadlocks — tools spin "executing" forever. Break and run them.
        if (ev.type === "stream.complete" || ev.type === "stream.error") break;
        if (ev.type === "browser.tools_pending") break;
      }

      if (browserPending.length > 0 && !signal.aborted) {
        await runBrowserToolsAndContinue(handle, browserPending, assistantId, signal);
      }
    },
    [worker, renameMessage]
  );

  const runBrowserToolsAndContinue = React.useCallback(
    async (
      handle: Awaited<ReturnType<typeof worker.start>>,
      initialCallIds: string[],
      assistantId: string,
      signal: AbortSignal
    ) => {
      let pending = initialCallIds;
      let iter = 0;
      const MAX = 25;
      while (pending.length > 0 && !signal.aborted && iter < MAX) {
        iter++;
        const results: { callId: string; result?: unknown; error?: string }[] = [];
        for (const callId of pending) {
          const resolved = resolveBrowserToolCall(callId);
          if (!resolved) {
            results.push({ callId, error: "Tool call not found" });
            continue;
          }
          try {
            const r = await bridgeRef.current(resolved.tool, resolved.args, callId);
            toolResult(
              callId,
              r.error ? "error" : "success",
              r.result,
              r.error,
              resolved.label,
              resolved.detail
            );
            setToolResult(assistantId, callId, {
              status: r.error ? "error" : "success",
              result: r.result,
              error: r.error,
            });
            toolComplete(callId);
            results.push({ callId, result: r.result, error: r.error });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Execution failed";
            toolResult(callId, "error", undefined, msg, resolved.label, resolved.detail);
            setToolResult(assistantId, callId, { status: "error", error: msg });
            toolComplete(callId);
            results.push({ callId, error: msg });
          }
        }
        setPendingBrowserTools([]);
        handle.resume(results);

        // Consume the resumed stream for another round of events
        let browserPending: string[] = [];
        const dispatcher = dispatcherRef.current;
        for await (const ev of handle.events) {
          if (signal.aborted) break;
          if (ev.type === "browser.tools_pending") {
            for (const id of ev.callIds) if (!browserPending.includes(id)) browserPending.push(id);
          }
          dispatcher.dispatch(ev as StreamEvent);
          if (ev.type === "stream.complete" || ev.type === "stream.error") break;
          if (ev.type === "browser.tools_pending") break;
        }
        pending = browserPending;
      }
    },
    [toolResult, toolComplete, setToolResult, setPendingBrowserTools]
  );

  const buildWorkerInput = React.useCallback(
    async (chatIdLocal: string, context?: { activeFile?: string | null; selectedFiles?: string[] }) => {
      const ws = useWorkspaceStore.getState();
      const workspaceId = ws.currentWorkspaceId;
      if (!workspaceId) throw new Error("No workspace");

      const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) throw new Error("Workspace not found");

      const fileRows = await db.file.findMany({
        where: { workspaceId },
        orderBy: { path: "asc" },
      });
      const files: WorkerFile[] = fileRows.map((f) => ({
        path: f.path as string,
        content: f.content as string,
        isBinary: Boolean(f.isBinary),
      }));

      const paths = files.map((f) => f.path);
      const entry = findEntryFile(paths);
      let activeFile = ws.activeFile ?? (workspace.activeFile as string | null);
      if (context?.activeFile !== undefined) activeFile = context.activeFile ?? null;
      const selectedFiles = context?.selectedFiles ?? [];

      let activeFileContent: string | null = null;
      if (activeFile) {
        const af = files.find((f) => f.path === activeFile);
        if (af) activeFileContent = af.content;
      }
      const agentMdRow = files.find((f) => f.path === AGENT_MD_FILENAME);

      const dbMessages = await db.message.findMany({
        where: { chatId: chatIdLocal },
        orderBy: { createdAt: "asc" },
      });
      const messages: WorkerChatMessage[] = dbMessages.map((m) => ({
        id: m.id as string,
        role: m.role as "user" | "assistant",
        segments: m.segments as string,
      }));

      // Resolve the active provider from localStorage — the DTO in the store
      // hides the apiKey, so we always read the full row here.
      let fullProvider = await db.provider.findFirst({ where: { isActive: true } });
      if (!fullProvider) {
        fullProvider = await db.provider.findFirst({ orderBy: { createdAt: "asc" } });
      }
      if (!fullProvider) throw new Error("No AI provider configured. Add one in Settings → Providers.");
      const provider: WorkerProvider = {
        id: fullProvider.id,
        name: fullProvider.name,
        baseURL: fullProvider.baseURL,
        apiKey: fullProvider.apiKey,
        model: fullProvider.model,
        isActive: Boolean(fullProvider.isActive),
      };

      return {
        workspaceName: workspace.name as string,
        entryFile: entry,
        activeFile,
        activeFileContent,
        selectedFiles,
        agentMdContent: (agentMdRow?.content as string) ?? null,
        files,
        messages,
        provider,
        context,
      };
    },
    []
  );

  const sendMessage = React.useCallback(
    async (content: string) => {
      const localChatId = chatId ?? useChatStore.getState().chatId;
      if (!localChatId) {
        toast.error("No chat selected");
        return;
      }
      if (!content.trim()) return;

      toolReset();
      fileStreamReset();
      browserReset();

      const activeFile = useWorkspaceStore.getState().activeFile;
      const userMsg: Message = {
        id: uid("u"),
        chatId: localChatId,
        role: "user",
        segments: [{ type: "content", content }],
        createdAt: new Date().toISOString(),
      };
      const assistantId = uid("a");
      const assistantMsg: Message = {
        id: assistantId,
        chatId: localChatId,
        role: "assistant",
        segments: [],
        createdAt: new Date().toISOString(),
      };

      // Persist user + empty assistant message to localStorage
      await db.message.create({
        data: {
          id: userMsg.id,
          chatId: localChatId,
          role: "user",
          segments: stringifyJSON(userMsg.segments),
        },
      });
      await db.message.create({
        data: {
          id: assistantId,
          chatId: localChatId,
          role: "assistant",
          segments: stringifyJSON([]),
        },
      });
      await db.chat.update({ where: { id: localChatId }, data: { updatedAt: new Date() } });

      appendMessage(userMsg);
      appendMessage(assistantMsg);
      startStreaming(assistantId);

      const controller = new AbortController();
      try {
        const input = await buildWorkerInput(localChatId, { activeFile });
        const handle = await worker.start({ messageId: assistantId, ...input });
        abortRef.current = { stop: handle.stop, resume: handle.resume };
        await consumeAndRun(handle, assistantId, controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) {
          const msg = e instanceof Error ? e.message : "Send failed";
          addErrorSegment(assistantId, msg);
          toast.error("AI request failed", { description: msg });
        }
      } finally {
        stopStreaming();
        abortRef.current = null;
      }
    },
    [
      chatId, appendMessage, startStreaming, stopStreaming, addErrorSegment,
      buildWorkerInput, worker, consumeAndRun, toolReset, fileStreamReset,
      browserReset,
    ]
  );

  const regenerate = React.useCallback(async () => {
    const localChatId = chatId ?? useChatStore.getState().chatId;
    if (!localChatId) {
      toast.error("No chat selected");
      return;
    }
    if (abortRef.current) abortRef.current.stop();

    toolReset();
    fileStreamReset();
    browserReset();

    // Find last user message; delete everything after it
    const rows = await db.message.findMany({
      where: { chatId: localChatId },
      orderBy: { createdAt: "asc" },
    });
    let lastUserIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) {
      toast.error("Nothing to regenerate");
      return;
    }
    const toDelete = rows.slice(lastUserIdx + 1);
    for (const r of toDelete) {
      await db.message.delete({ where: { id: r.id as string } }).catch(() => {});
    }

    const remaining = rows.slice(0, lastUserIdx + 1);
    setMessages(
      remaining.map((r) => ({
        id: r.id as string,
        chatId: localChatId,
        role: r.role as "user" | "assistant",
        segments: parseJSON<MessageSegment[]>(r.segments as string, []),
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))
    );

    const assistantId = uid("a");
    await db.message.create({
      data: { id: assistantId, chatId: localChatId, role: "assistant", segments: stringifyJSON([]) },
    });
    appendMessage({
      id: assistantId,
      chatId: localChatId,
      role: "assistant",
      segments: [],
      createdAt: new Date().toISOString(),
    });
    startStreaming(assistantId);

    const controller = new AbortController();
    try {
      const input = await buildWorkerInput(localChatId, { activeFile: null });
      const handle = await worker.start({ messageId: assistantId, ...input });
      abortRef.current = { stop: handle.stop, resume: handle.resume };
      await consumeAndRun(handle, assistantId, controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) {
        const msg = e instanceof Error ? e.message : "Regenerate failed";
        addErrorSegment(assistantId, msg);
        toast.error("AI regenerate failed", { description: msg });
      }
    } finally {
      stopStreaming();
      abortRef.current = null;
    }
  }, [chatId, appendMessage, startStreaming, stopStreaming, addErrorSegment, buildWorkerInput, worker, consumeAndRun, setMessages, toolReset, fileStreamReset, browserReset]);

  const stop = React.useCallback(() => {
    abortRef.current?.stop();
    stopStreaming();
  }, [stopStreaming]);

  React.useEffect(() => {
    function onRegenerate() { void regenerate(); }
    window.addEventListener("chat:regenerate", onRegenerate);
    return () => window.removeEventListener("chat:regenerate", onRegenerate);
  }, [regenerate]);

  const lastUserMessage = React.useMemo(() => {
    const msgs = useChatStore.getState().messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === "user") {
        return m.segments
          .filter((s): s is Extract<MessageSegment, { type: "content" }> => s.type === "content")
          .map((s) => s.content)
          .join("");
      }
    }
    return "";
  }, [chatId, isStreaming, streamingMessageId]);

  return { sendMessage, stop, regenerate, isStreaming, lastUserMessage, setChatId, setMessages };
}
