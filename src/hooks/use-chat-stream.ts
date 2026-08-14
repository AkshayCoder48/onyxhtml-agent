"use client";

import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { Message, MessageSegment, StreamEvent } from "@/lib/types";

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
  "get_console_logs",
  "get_page_errors",
  "take_screenshot",
  "run_javascript",
  "terminal_exec",
  "terminal_reset",
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
  // Action functions in zustand are stable references.
  //
  // IMPORTANT: we deliberately do NOT subscribe to `messages` here. The
  // `messages` array reference changes on every coalesced flush during
  // streaming (dozens of times per second), which would re-render this hook
  // and every downstream consumer on every chunk. Instead we read
  // `messages` from `useChatStore.getState()` only where we actually need
  // a snapshot (e.g. to find the last user message for Regenerate).
  const chatId = useChatStore((s) => s.chatId);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const startStreaming = useChatStore((s) => s.startStreaming);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const appendToSegment = useChatStore((s) => s.appendToSegment);
  const upsertToolCallSegment = useChatStore((s) => s.upsertToolCallSegment);
  const setToolResult = useChatStore((s) => s.setToolResult);
  const addErrorSegment = useChatStore((s) => s.addErrorSegment);
  const setPendingBrowserTools = useChatStore((s) => s.setPendingBrowserTools);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setChatId = useChatStore((s) => s.setChatId);
  const setMessages = useChatStore((s) => s.setMessages);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);

  const abortRef = React.useRef<AbortController | null>(null);
  const bridgeRef = React.useRef(bridge);
  React.useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  // Track browser tool callIds we have already attempted, to avoid duplicates.
  const handledBrowserCallsRef = React.useRef<Set<string>>(new Set());

  const handleEvent = React.useCallback(
    async (assistantId: string, evt: StreamEvent, chatIdLocal: string): Promise<boolean> => {
      // Returns true if stream should continue (caller may decide to suspend for browser tools)
      switch (evt.type) {
        case "reasoning_content": {
          appendToSegment(
            assistantId,
            (s) => s.type === "thinking",
            () => ({ type: "thinking", content: evt.content }),
            (s) =>
              s.type === "thinking"
                ? { type: "thinking", content: s.content + evt.content }
                : s
          );
          break;
        }
        case "content": {
          appendToSegment(
            assistantId,
            (s) => s.type === "content",
            () => ({ type: "content", content: evt.content }),
            (s) =>
              s.type === "content"
                ? { type: "content", content: s.content + evt.content }
                : s
          );
          break;
        }
        case "tool_call": {
          // Streaming tool_call: arguments may be partial (incomplete JSON)
          // during streaming. We upsert the segment so the UI shows the
          // arguments being written character-by-character via `argumentsText`.
          const seg: MessageSegment = {
            type: "tool_call",
            tool: evt.tool,
            arguments: evt.arguments ?? {},
            argumentsText: evt.argumentsText,
            callId: evt.callId,
            status: evt.status ?? "running",
            label: evt.label,
            detail: evt.detail,
          };
          upsertToolCallSegment(assistantId, seg);
          break;
        }
        case "tool_result": {
          setToolResult(assistantId, evt.callId, {
            status: evt.status,
            result: evt.result,
            error: evt.error,
            label: evt.label,
            detail: evt.detail,
          });
          break;
        }
        case "error": {
          addErrorSegment(assistantId, evt.content);
          break;
        }
        case "done": {
          return true;
        }
      }
      void chatIdLocal;
      return false;
    },
    [appendToSegment, upsertToolCallSegment, setToolResult, addErrorSegment]
  );

  const consumeStream = React.useCallback(
    async (
      chatIdLocal: string,
      stream: AsyncGenerator<StreamEvent>,
      assistantId: string,
      signal: AbortSignal,
      onTimeout?: () => void
    ): Promise<{ browserPending: string[] }> => {
      const browserPending: string[] = [];
      const handled = handledBrowserCallsRef.current;

      // Watchdog: if no event arrives for 5 minutes, break out of the loop so
      // the spinner can't spin forever (e.g. if the server hangs or the SSE
      // connection silently drops). Reset on every received event.
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
          if (onTimeout) onTimeout();
        }, WATCHDOG_MS);
      };
      const clearWatchdog = () => {
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
      };
      resetWatchdog();

      try {
        while (true) {
          if (signal.aborted || timedOut) break;
          let evt: StreamEvent | null = null;
          try {
            const r = await stream.next();
            if (r.done) break;
            evt = r.value;
            resetWatchdog();
          } catch (err) {
            if (signal.aborted) break;
            const msg = err instanceof Error ? err.message : "Stream error";
            addErrorSegment(assistantId, msg);
            toast.error("AI stream error", { description: msg });
            break;
          }
          if (!evt || timedOut) continue;

          // Check for browser_tools_pending event variant — spec lists it as a
          // possible stream event with callIds[]. We accept either the typed
          // events or a loosely-typed payload via cast.
          const loose = evt as unknown as {
            type?: string;
            callIds?: string[];
            tool?: string;
            callId?: string;
          };
          if (loose.type === "browser_tools_pending" && loose.callIds) {
            for (const id of loose.callIds) if (!browserPending.includes(id)) browserPending.push(id);
            setPendingBrowserTools([...browserPending]);
            continue;
          }

          // Track browser tool calls we may need to execute locally.
          if (evt.type === "tool_call" && BROWSER_TOOLS.has(evt.tool)) {
            if (!handled.has(evt.callId)) {
              handled.add(evt.callId);
            }
          }

          await handleEvent(assistantId, evt, chatIdLocal);

          if (evt.type === "done") {
            break;
          }
        }
      } finally {
        clearWatchdog();
      }

      return { browserPending };
    },
    [handleEvent, addErrorSegment, setPendingBrowserTools]
  );

  // Execute pending browser tool calls against the preview iframe, then call
  // the /continue endpoint with the results and resume streaming.
  //
  // IMPORTANT: The /continue endpoint can produce MORE browser tool calls
  // (the model may chain open_page → get_console_logs → terminal_exec etc.).
  // We loop: execute pending tools → call /continue → if /continue produced
  // more browser tools, execute those too → repeat until no more pending.
  // This was the root cause of the "spinner keeps running" bug — the client
  // only called /continue once, so the second round of browser tools was
  // never executed and stayed in "running" status forever.
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

      // Loop: execute pending browser tools → call /continue → check for more.
      let pendingCallIds = initialCallIds;
      let iteration = 0;
      const MAX_CONTINUE_ITERATIONS = 25; // safety cap to prevent infinite loops
      while (pendingCallIds.length > 0 && !signal.aborted && iteration < MAX_CONTINUE_ITERATIONS) {
        iteration++;

        // Re-read the latest messages from the store on each iteration
        // because /continue may have added new segments.
        const currentMsgs = useChatStore.getState().messages;
        const msg = currentMsgs.find((m) => m.id === assistantId);
        if (!msg) break;

        const results: { callId: string; result?: unknown; error?: string }[] = [];
        for (const callId of pendingCallIds) {
          const seg = msg.segments.find(
            (s) => s.type === "tool_call" && s.callId === callId
          ) as Extract<MessageSegment, { type: "tool_call" }> | undefined;
          if (!seg) {
            results.push({ callId, error: "Tool call not found" });
            continue;
          }
          try {
            const r = await b.execute(seg.tool, seg.arguments ?? {}, callId);
            setToolResult(assistantId, callId, {
              status: r.error ? "error" : "success",
              result: r.result,
              error: r.error,
            });
            results.push({ callId, result: r.result, error: r.error });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Execution failed";
            setToolResult(assistantId, callId, { status: "error", error: errMsg });
            results.push({ callId, error: errMsg });
          }
        }

        setPendingBrowserTools([]);

        // Call /continue and resume streaming. The stream may produce MORE
        // browser_tools_pending events — we collect them and loop.
        try {
          const stream = api.streamContinue(
            chatIdLocal,
            { results },
            signal
          );
          const { browserPending } = await consumeStream(
            chatIdLocal,
            stream,
            assistantId,
            signal,
            () => {
              abortRef.current?.abort();
            }
          );
          pendingCallIds = browserPending;
        } catch (err) {
          if (signal.aborted) return;
          const errMsg = err instanceof Error ? err.message : "Continue failed";
          addErrorSegment(assistantId, errMsg);
          toast.error("AI continue failed", { description: errMsg });
          return;
        }
      }
      // If we hit the iteration cap, surface a note so the user knows.
      if (iteration >= MAX_CONTINUE_ITERATIONS && pendingCallIds.length > 0) {
        addErrorSegment(
          assistantId,
          "Reached the maximum number of browser-tool continuation rounds (25). The agent may be stuck in a loop — try rephrasing your request."
        );
      }
    },
    [consumeStream, setToolResult, setPendingBrowserTools, addErrorSegment]
  );

  // Ref so the retry action can re-invoke sendMessage without a self-reference
  // (which trips react-hooks/immutability / use-before-define).
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
        const stream = api.streamMessage(
          localChatId,
          { content, context: { activeFile } },
          controller.signal
        );
        const { browserPending } = await consumeStream(
          localChatId,
          stream,
          assistantId,
          controller.signal,
          () => {
            // On timeout, abort the controller so the in-flight fetch is cancelled.
            controller.abort();
          }
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
        handledBrowserCallsRef.current = new Set();
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
    ]
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    stopStreaming();
  }, [stopStreaming]);

  // Keep the ref in sync so the retry action invokes the latest sendMessage.
  sendMessageRef.current = sendMessage;

  // Derive the last user message content. We read from getState() on each
  // render so we don't have to subscribe to `messages` (which would cause
  // this hook to re-render on every coalesced flush during streaming).
  // The hook still re-renders when `chatId`, `isStreaming`, or
  // `streamingMessageId` change — those are the only state values that
  // affect the hook's returned values.
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

  // Ref so the retry action from an error toast can re-invoke regenerate
  // without a self-reference (mirrors the sendMessageRef pattern).
  const regenerateRef = React.useRef<() => Promise<void>>(async () => {});

  const regenerate = React.useCallback(async () => {
    const localChatId = chatId ?? useChatStore.getState().chatId;
    if (!localChatId) {
      toast.error("No chat selected");
      return;
    }

    // Don't allow regenerating while a stream is in flight — abort it first
    // so we don't fight over the streamingMessageId slot.
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Locally drop every message strictly AFTER the last user message —
    // the server does the same DB-side, and we want the UI to match.
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
      const stream = api.streamRegenerate(localChatId, controller.signal);
      const { browserPending } = await consumeStream(
        localChatId,
        stream,
        assistantId,
        controller.signal,
        () => {
          // On timeout, abort the controller so the in-flight fetch is cancelled.
          controller.abort();
        }
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
      handledBrowserCallsRef.current = new Set();
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
  ]);

  // Keep the ref in sync so the retry action invokes the latest regenerate.
  regenerateRef.current = regenerate;

  // Subscribe to the global `chat:regenerate` window event so any UI surface
  // (the Regenerate button in chat-messages.tsx, the Retry action on an
  // ErrorCard, a future keyboard shortcut, etc.) can trigger regeneration
  // without needing direct access to this hook instance. The hook is the
  // single owner of the streaming state, so it's the right place to centralize
  // the side effect.
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
