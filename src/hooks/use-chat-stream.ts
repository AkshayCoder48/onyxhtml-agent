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
      signal: AbortSignal
    ): Promise<{ browserPending: string[] }> => {
      const browserPending: string[] = [];
      const handled = handledBrowserCallsRef.current;

      while (true) {
        if (signal.aborted) break;
        let evt: StreamEvent | null = null;
        try {
          const r = await stream.next();
          if (r.done) break;
          evt = r.value;
        } catch (err) {
          if (signal.aborted) break;
          const msg = err instanceof Error ? err.message : "Stream error";
          addErrorSegment(assistantId, msg);
          toast.error("AI stream error", { description: msg });
          break;
        }
        if (!evt) continue;

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

      return { browserPending };
    },
    [handleEvent, addErrorSegment, setPendingBrowserTools]
  );

  // Execute pending browser tool calls against the preview iframe, then call
  // the /continue endpoint with the results and resume streaming.
  const executeBrowserToolsAndContinue = React.useCallback(
    async (
      chatIdLocal: string,
      callIds: string[],
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
      // Find each tool_call segment by callId to get its tool+args
      const messages = useChatStore.getState().messages;
      const msg = messages.find((m) => m.id === assistantId);
      if (!msg) return;

      const results: { callId: string; result?: unknown; error?: string }[] = [];
      for (const callId of callIds) {
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

      // Call /continue and resume streaming.
      try {
        const stream = api.streamContinue(
          chatIdLocal,
          { results },
          signal
        );
        await consumeStream(chatIdLocal, stream, assistantId, signal);
      } catch (err) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Continue failed";
        addErrorSegment(assistantId, msg);
        toast.error("AI continue failed", { description: msg });
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

  return { sendMessage, stop, isStreaming, setChatId, setMessages };
}
