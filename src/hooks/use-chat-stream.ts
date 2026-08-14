"use client";

import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";
import { useToolStore } from "@/stores/tool-store";
import { useFileStreamStore } from "@/stores/file-stream-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { Message, MessageSegment } from "@/lib/types";
import type { StreamEvent } from "@/lib/streaming/types";
import { consumeReadableStream } from "@/lib/streaming/engine";
import { EventDispatcher, type DispatcherHandlers } from "@/lib/streaming/dispatcher";

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// Browser tools that must be executed against the preview iframe on the client.
const BROWSER_TOOLS = new Set([
  "click",
  "type",
  "press_key",
  "scroll",
  "hover",
  "select",
  "get_dom",
  "get_element",
  "inspect_element",
  "get_console_logs",
  "get_page_errors",
  "get_network_errors",
  "take_screenshot",
  "run_javascript",
  "run_test",
  "terminal_exec",
  "terminal_reset",
  "check_links",
  "check_page",
  "check_console",
  "open_page",
  "reload_page",
  "wait",
]);

type Bridge = {
  execute: (
    tool: string,
    args: Record<string, unknown>,
    callId: string
  ) => Promise<{ result?: unknown; error?: string }>;
};

export function useChatStream(bridge: Bridge | null) {
  // Use stable selectors so the hook doesn't re-subscribe on every render.
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

  // Tool / file / browser store actions (stable references)
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

  // Live file-stream → workspace-store bridge. When file.delta events arrive,
  // we also push the accumulated content into the workspace store so the
  // CodeMirror editor shows the file being written in real time (PRD §20, §21,
  // §40). The editor subscribes to workspaceStore.files[path] and updates
  // incrementally without flickering (PRD §23).
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const addFile = useWorkspaceStore((s) => s.addFile);
  const setAiEditing = useWorkspaceStore((s) => s.setAiEditing);
  const bumpPreview = useWorkspaceStore((s) => s.bumpPreview);

  const renameMessage = useChatStore((s) => s.renameMessage);

  const abortRef = React.useRef<AbortController | null>(null);
  const bridgeRef = React.useRef(bridge);
  React.useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  // ---------- EventDispatcher handlers ----------
  //
  // These are the bridge between the parsed StreamEvents and the stores.
  // Every handler runs IMMEDIATELY when an event arrives — no batching,
  // no throttle (PRD §8). React 18's automatic batching keeps re-renders
  // bounded to one per frame even under high event rates.
  //
  // The handlers are memoized on the stable store actions so the dispatcher
  // reference is stable across renders (preventing use-chat-stream from
  // re-subscribing its consumers on every render).

  const handlers = React.useMemo<DispatcherHandlers>(
    () => ({
      onTextDelta: (messageId, delta) => {
        appendTextDelta(messageId, delta);
      },
      onThinkingDelta: (messageId, delta) => {
        appendThinkingDelta(messageId, delta);
      },
      onToolStart: (ev) => {
        toolStart({
          toolCallId: ev.toolCallId,
          messageId: ev.messageId,
          tool: ev.tool,
          label: ev.label,
        });
        // Also create a lightweight tool_call segment in the chat store so
        // the message renders a ToolCard placeholder immediately and so the
        // persisted message has the segment for hydration after refresh.
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
        // Append the DELTA to the ToolStore's rawArguments (the source of
        // truth for live display). Also mirror the accumulated text into the
        // chat-store segment so persisted messages render correctly.
        toolAppendArgs(ev.toolCallId, ev.delta);
        // Best-effort: update the chat-store segment's argumentsText so the
        // ToolCard (which may read from the message segment for legacy
        // reasons) sees the streaming text. We read the latest from ToolStore.
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
        // Mark the chat-store segment as still running (the card transitions
        // from "generating" to "executing" via the ToolStore state).
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
        toolResult(
          ev.toolCallId,
          ev.status,
          ev.result,
          ev.error,
          ev.label,
          ev.detail
        );
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
        // Mark the file as AI-editing so the editor becomes read-only and
        // autosave is suppressed during streaming (prevents the autosave
        // timer from firing mid-stream and fighting with the live updates).
        setAiEditing(ev.path, true);
        // Ensure the file exists in the workspace store with empty content
        // so the editor can open it and begin receiving deltas.
        const ws = useWorkspaceStore.getState();
        if (!ws.files[ev.path]) {
          addFile(ev.path, "", false);
        } else {
          updateFileContent(ev.path, "");
        }
        // Auto-open the file being written so the user sees it live (PRD §21).
        ws.openTab(ev.path);
        ws.setActiveFile(ev.path);
      },
      onFileDelta: (ev) => {
        fileStreamDelta(ev.path, ev.delta);
        // Append the delta to the workspace store's file content so the
        // CodeMirror editor re-renders with the new text. We read the
        // accumulated content from the FileStreamStore (source of truth).
        const fs = useFileStreamStore.getState().streams[ev.path];
        if (fs) {
          updateFileContent(ev.path, fs.content);
        }
      },
      onFileComplete: (ev) => {
        fileStreamComplete(ev.path, ev.bytes);
        // Final sync to workspace store.
        const fs = useFileStreamStore.getState().streams[ev.path];
        if (fs) {
          updateFileContent(ev.path, fs.content);
        }
        // Release the AI-editing lock so the user can edit again, and bump
        // the preview so the live website refreshes with the final content
        // (PRD §24 — preview scheduler coalesces reloads, never the file
        // stream itself).
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
      onStreamStart: (_messageId) => {
        // The streaming message was already created in sendMessage. Nothing
        // to do here except optionally reset per-stream bookkeeping.
      },
      onStreamComplete: (_messageId) => {
        // The finally block in sendMessage will call stopStreaming().
      },
      onStreamError: (messageId, content) => {
        if (messageId) addErrorSegment(messageId, content);
      },
      onBrowserToolsPending: (_messageId, callIds) => {
        setPendingBrowserTools(callIds);
      },
      onAgentStatus: (ev) => {
        setAgentStatus(ev.status, ev.message, ev.currentAction);
      },
      onAgentProgress: (ev) => {
        setAgentProgress(ev.message, ev.progress);
      },
      onRunHeartbeat: (ev) => {
        setHeartbeat(ev.timestamp, ev.currentStep);
      },
    }),
    [
      appendTextDelta,
      appendThinkingDelta,
      toolStart,
      toolAppendArgs,
      toolExecute,
      toolProgress,
      toolResult,
      toolComplete,
      toolAddConsole,
      fileStreamStart,
      fileStreamDelta,
      fileStreamComplete,
      browserAdd,
      upsertToolCallSegment,
      setToolResult,
      addErrorSegment,
      setPendingBrowserTools,
      setAgentStatus,
      setAgentProgress,
      setHeartbeat,
      addFile,
      updateFileContent,
      setAiEditing,
      bumpPreview,
    ]
  );

  const dispatcherRef = React.useRef(new EventDispatcher(handlers));
  React.useEffect(() => {
    // Update the dispatcher's handlers when the memoized handlers change
    // (they're stable across renders due to the dependency array above, but
    // we keep this effect to be safe).
    dispatcherRef.current = new EventDispatcher(handlers);
  }, [handlers]);

  // ---------- Stream consumer ----------
  //
  // Consumes a raw ReadableStream via the StreamEngine, dispatches each parsed
  // StreamEvent to the stores IMMEDIATELY, and collects any browser tool
  // callIds that need client-side execution. Returns the list of pending
  // browser tool callIds when the stream ends.
  const consumeStream = React.useCallback(
    async (
      stream: ReadableStream<Uint8Array>,
      assistantId: string,
      signal: AbortSignal
    ): Promise<{ browserPending: string[] }> => {
      const browserPending: string[] = [];
      const dispatcher = dispatcherRef.current;

      // Watchdog: if no event arrives for 5 minutes, abort so the spinner
      // can't spin forever (PRD §33 interrupted streams). We use the outer
      // abortRef (set by sendMessage) to cancel the in-flight fetch.
      let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;
      const WATCHDOG_MS = 5 * 60 * 1000;
      const resetWatchdog = () => {
        if (watchdogTimer) clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(() => {
          timedOut = true;
          addErrorSegment(
            assistantId,
            "The AI stream has been silent for 5 minutes and was aborted. Please try again."
          );
          toast.error("AI stream timed out", {
            description: "No events received for 5 minutes.",
          });
          try {
            abortRef.current?.abort();
          } catch {
            // noop
          }
        }, WATCHDOG_MS);
      };
      const clearWatchdog = () => {
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
      };
      resetWatchdog();

      // CRITICAL: The client creates the assistant message with a local ID
      // (e.g. "a_abc123"), but the server sends stream events with the DB
      // message's ID (e.g. "cmss..."). If we don't reconcile these IDs,
      // every appendTextDelta / upsertToolCallSegment call will fail to find
      // the message and silently drop the update — causing the "stuck on
      // thinking" UI bug where the AI's response never appears during
      // streaming (only after a page reload fetches the persisted message).
      //
      // Fix: on the FIRST event that carries a server messageId different
      // from our local assistantId, rename the message in the store. After
      // that, all subsequent events (text.delta, tool.start, etc.) will
      // find the message by its new (server) ID.
      let idReconciled = false;
      // Track the CURRENT message id (starts as the client-generated id,
      // becomes the server's id after reconciliation).
      let currentMessageId = assistantId;

      try {
        for await (const evt of consumeReadableStream(stream, { signal })) {
          if (signal.aborted || timedOut) break;
          resetWatchdog();

          // Reconcile the message ID on the first event that has a messageId.
          if (!idReconciled && evt.messageId && evt.messageId !== assistantId) {
            renameMessage(assistantId, evt.messageId);
            currentMessageId = evt.messageId;
            idReconciled = true;
          }

          // Track browser tool calls that need client-side execution. We
          // collect them from tool.start events (so we know the tool name)
          // AND from the explicit browser.tools_pending event (which is the
          // server's authoritative "these need execution now" signal).
          if (evt.type === "browser.tools_pending") {
            for (const id of evt.callIds) {
              if (!browserPending.includes(id)) browserPending.push(id);
            }
          }

          // Route every event to the dispatcher → stores. IMMEDIATE, no batch.
          dispatcher.dispatch(evt);

          if (evt.type === "stream.complete") break;
        }
      } catch (err) {
        if (signal.aborted) {
          // User cancelled — preserve partial content (PRD §34).
        } else {
          const msg = err instanceof Error ? err.message : "Stream error";
          addErrorSegment(currentMessageId, msg);
          toast.error("AI stream error", { description: msg });
        }
      } finally {
        clearWatchdog();
      }

      return { browserPending };
    },
    [addErrorSegment, renameMessage]
  );

  // ---------- Browser tool execution + /continue loop ----------
  //
  // After the primary stream ends, if there are pending browser tools, run
  // them against the preview iframe and call /continue with the results. The
  // /continue stream may produce MORE browser tools — we loop until none
  // remain (PRD §27 event ordering, fix-3 in worklog).
  const executeBrowserToolsAndContinue = React.useCallback(
    async (
      chatIdLocal: string,
      initialCallIds: string[],
      assistantId: string,
      signal: AbortSignal
    ) => {
      const b = bridgeRef.current;
      if (!b) {
        toast.error("Preview not available", {
          description: "Open the Preview tab to enable browser automation.",
        });
        return;
      }

      let pendingCallIds = initialCallIds;
      let iteration = 0;
      const MAX_CONTINUE_ITERATIONS = 25;
      while (
        pendingCallIds.length > 0 &&
        !signal.aborted &&
        iteration < MAX_CONTINUE_ITERATIONS
      ) {
        iteration++;
        const results: { callId: string; result?: unknown; error?: string }[] =
          [];
        for (const callId of pendingCallIds) {
          const t = useToolStore.getState().tools[callId];
          if (!t) {
            results.push({ callId, error: "Tool call not found" });
            continue;
          }
          try {
            const r = await b.execute(t.tool, t.parsedArguments ?? {}, callId);
            toolResult(
              callId,
              r.error ? "error" : "success",
              r.result,
              r.error,
              t.label,
              t.detail
            );
            setToolResult(assistantId, callId, {
              status: r.error ? "error" : "success",
              result: r.result,
              error: r.error,
            });
            toolComplete(callId);
            results.push({ callId, result: r.result, error: r.error });
          } catch (err) {
            const errMsg =
              err instanceof Error ? err.message : "Execution failed";
            toolResult(callId, "error", undefined, errMsg, t.label, t.detail);
            setToolResult(assistantId, callId, {
              status: "error",
              error: errMsg,
            });
            toolComplete(callId);
            results.push({ callId, error: errMsg });
          }
        }

        setPendingBrowserTools([]);

        try {
          const stream = await api.streamContinue(
            chatIdLocal,
            { results },
            signal
          );
          const { browserPending } = await consumeStream(
            stream,
            assistantId,
            signal
          );
          pendingCallIds = browserPending;
        } catch (err) {
          if (signal.aborted) return;
          const errMsg =
            err instanceof Error ? err.message : "Continue failed";
          addErrorSegment(assistantId, errMsg);
          toast.error("AI continue failed", { description: errMsg });
          return;
        }
      }
      if (iteration >= MAX_CONTINUE_ITERATIONS && pendingCallIds.length > 0) {
        addErrorSegment(
          assistantId,
          "Reached the maximum number of browser-tool continuation rounds (25). The agent may be stuck in a loop — try rephrasing your request."
        );
      }
    },
    [consumeStream, toolResult, toolComplete, setToolResult, setPendingBrowserTools, addErrorSegment]
  );

  // Ref so the retry action can re-invoke sendMessage without a self-reference.
  const sendMessageRef = React.useRef<(content: string) => Promise<void>>(
    async () => {}
  );

  const sendMessage = React.useCallback(
    async (content: string) => {
      const localChatId = chatId ?? useChatStore.getState().chatId;
      if (!localChatId) {
        toast.error("No chat selected");
        return;
      }
      if (!content.trim()) return;

      // Reset per-stream stores so old tool/file state doesn't leak in.
      toolReset();
      fileStreamReset();
      browserReset();

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
      appendMessage(userMsg);
      appendMessage(assistantMsg);
      startStreaming(assistantId);

      const controller = new AbortController();
      abortRef.current = controller;

      const activeFile = useWorkspaceStore.getState().activeFile;

      try {
        const stream = await api.streamMessage(
          localChatId,
          { content, context: { activeFile } },
          controller.signal
        );
        const { browserPending } = await consumeStream(
          stream,
          assistantId,
          controller.signal
        );
        if (browserPending.length > 0 && !controller.signal.aborted) {
          await executeBrowserToolsAndContinue(
            localChatId,
            browserPending,
            assistantId,
            controller.signal
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : "Send failed";
          addErrorSegment(assistantId, msg);
          toast.error("AI request failed", {
            description: msg,
            action: {
              label: "Retry",
              onClick: () => void sendMessageRef.current(content),
            },
          });
        }
      } finally {
        stopStreaming();
        abortRef.current = null;
      }
    },
    [
      chatId,
      appendMessage,
      startStreaming,
      stopStreaming,
      addErrorSegment,
      consumeStream,
      executeBrowserToolsAndContinue,
      toolReset,
      fileStreamReset,
      browserReset,
    ]
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    stopStreaming();
  }, [stopStreaming]);

  sendMessageRef.current = sendMessage;

  // Derive the last user message content from the store snapshot. We read
  // via getState() on each render so we don't subscribe to `messages` (which
  // would re-render this hook on every delta during streaming).
  const lastUserMessage = React.useMemo(() => {
    const msgs = useChatStore.getState().messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === "user") {
        return m.segments
          .filter(
            (s): s is Extract<MessageSegment, { type: "content" }> =>
              s.type === "content"
          )
          .map((s) => s.content)
          .join("");
      }
    }
    return "";
  }, [chatId, isStreaming, streamingMessageId]);

  const regenerateRef = React.useRef<() => Promise<void>>(async () => {});

  const regenerate = React.useCallback(async () => {
    const localChatId = chatId ?? useChatStore.getState().chatId;
    if (!localChatId) {
      toast.error("No chat selected");
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Reset per-stream stores.
    toolReset();
    fileStreamReset();
    browserReset();

    const current = useChatStore.getState().messages;
    let lastUserIdx = -1;
    for (let i = current.length - 1; i >= 0; i--) {
      if (current[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) {
      toast.error("Nothing to regenerate", {
        description: "Send a message first.",
      });
      return;
    }
    const trimmed = current.slice(0, lastUserIdx + 1);
    setMessages(trimmed);

    const assistantId = uid("a");
    const assistantMsg: Message = {
      id: assistantId,
      chatId: localChatId,
      role: "assistant",
      segments: [],
      createdAt: new Date().toISOString(),
    };
    appendMessage(assistantMsg);
    startStreaming(assistantId);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const stream = await api.streamRegenerate(localChatId, controller.signal);
      const { browserPending } = await consumeStream(
        stream,
        assistantId,
        controller.signal
      );
      if (browserPending.length > 0 && !controller.signal.aborted) {
        await executeBrowserToolsAndContinue(
          localChatId,
          browserPending,
          assistantId,
          controller.signal
        );
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : "Regenerate failed";
        addErrorSegment(assistantId, msg);
        toast.error("AI regenerate failed", {
          description: msg,
          action: {
            label: "Retry",
            onClick: () => void regenerateRef.current(),
          },
        });
      }
    } finally {
      stopStreaming();
      abortRef.current = null;
    }
  }, [
    chatId,
    appendMessage,
    startStreaming,
    stopStreaming,
    addErrorSegment,
    consumeStream,
    executeBrowserToolsAndContinue,
    setMessages,
    toolReset,
    fileStreamReset,
    browserReset,
  ]);

  regenerateRef.current = regenerate;

  React.useEffect(() => {
    function onRegenerate() {
      void regenerateRef.current();
    }
    window.addEventListener("chat:regenerate", onRegenerate);
    return () => {
      window.removeEventListener("chat:regenerate", onRegenerate);
    };
  }, []);

  return {
    sendMessage,
    stop,
    regenerate,
    isStreaming,
    lastUserMessage,
    setChatId,
    setMessages,
  };
}
