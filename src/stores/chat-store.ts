"use client";

import { create } from "zustand";
import type { Message, MessageSegment } from "@/lib/types";

type ChatState = {
  chatId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  pendingBrowserTools: string[]; // callIds awaiting client-side execution

  setChatId: (id: string | null) => void;
  setMessages: (msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  startStreaming: (assistantId: string) => void;
  stopStreaming: () => void;
  clearMessages: () => void;

  // streaming segment helpers — these are buffered & coalesced
  appendToSegment: (
    messageId: string,
    predicate: (s: MessageSegment) => boolean,
    create: () => MessageSegment,
    mutate: (s: MessageSegment) => MessageSegment
  ) => void;
  upsertToolCallSegment: (messageId: string, seg: MessageSegment) => void;
  setToolResult: (
    messageId: string,
    callId: string,
    patch: Partial<MessageSegment>
  ) => void;
  addErrorSegment: (messageId: string, content: string) => void;
  setPendingBrowserTools: (callIds: string[]) => void;
};

// ---------- Coalescing layer ----------
//
// During streaming, the agent emits dozens of SSE events per second
// (reasoning_content, content, tool_call_delta, …). Calling zustand's
// `set()` synchronously on every chunk triggers React's
// "Maximum update depth exceeded" guard.
//
// We buffer mutations in a queue and flush them on a requestAnimationFrame
// (≈60fps). This is far less aggressive than queueMicrotask (which can fire
// thousands of times per second) and avoids React's nested-update detection.
// We also use a 16ms setTimeout fallback when rAF is unavailable (SSR / tests).

type Mutator = (msgs: Message[]) => Message[];

const pendingMutators: Mutator[] = [];
let flushScheduled = false;
// Whether any mutator actually changed the array reference. If no mutator
// modified anything, we skip the `set()` call entirely to avoid unnecessary
// re-renders.
let anyMutatorChanged = false;

function applyMutators(msgs: Message[]): Message[] {
  if (pendingMutators.length === 0) {
    anyMutatorChanged = false;
    return msgs;
  }
  let next = msgs;
  let changed = false;
  for (const fn of pendingMutators) {
    const result = fn(next);
    if (result !== next) {
      changed = true;
      next = result;
    }
  }
  pendingMutators.length = 0;
  anyMutatorChanged = changed;
  return next;
}

function scheduleFlush(set: (fn: (s: ChatState) => Partial<ChatState>) => void) {
  if (flushScheduled) return;
  flushScheduled = true;
  const flush = () => {
    flushScheduled = false;
    set((s) => {
      if (pendingMutators.length === 0) return {};
      const messages = applyMutators(s.messages);
      // If no mutator actually changed the array, don't trigger a re-render.
      if (!anyMutatorChanged || messages === s.messages) return {};
      return { messages };
    });
  };
  // Prefer requestAnimationFrame for ~60fps coalescing (max one flush per
  // frame). Fall back to setTimeout(0) when rAF isn't available.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(flush);
  } else {
    setTimeout(flush, 16);
  }
}

// Immutably patch a single message's segments. Returns a NEW messages array
// (shallow-copied) so React sees a new reference, but only the touched
// message and its touched segment array are new objects.
function patchMessage(
  msgs: Message[],
  messageId: string,
  patch: (msg: Message) => Message
): Message[] {
  const idx = msgs.findIndex((m) => m.id === messageId);
  if (idx < 0) return msgs;
  const next = msgs.slice();
  next[idx] = patch(msgs[idx]);
  return next;
}

export const useChatStore = create<ChatState>((set) => ({
  chatId: null,
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  pendingBrowserTools: [],

  setChatId: (id) =>
    set({
      chatId: id,
      messages: [],
      isStreaming: false,
      streamingMessageId: null,
      pendingBrowserTools: [],
    }),

  setMessages: (msgs) => set({ messages: msgs }),

  appendMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  startStreaming: (assistantId) =>
    set({ isStreaming: true, streamingMessageId: assistantId }),

  stopStreaming: () =>
    set({ isStreaming: false, streamingMessageId: null, pendingBrowserTools: [] }),

  clearMessages: () =>
    set({ messages: [], isStreaming: false, streamingMessageId: null }),

  appendToSegment: (messageId, predicate, create, mutate) => {
    pendingMutators.push((msgs) =>
      patchMessage(msgs, messageId, (msg) => {
        const segments = msg.segments;
        const last = segments[segments.length - 1];
        if (last && predicate(last)) {
          const nextSegs = segments.slice();
          nextSegs[nextSegs.length - 1] = mutate(last);
          return { ...msg, segments: nextSegs };
        }
        return { ...msg, segments: [...segments, create()] };
      })
    );
    scheduleFlush(set);
  },

  upsertToolCallSegment: (messageId, seg) => {
    const toolSeg = seg as Extract<MessageSegment, { type: "tool_call" }>;
    pendingMutators.push((msgs) =>
      patchMessage(msgs, messageId, (msg) => {
        const idx = msg.segments.findIndex(
          (x) =>
            x.type === "tool_call" &&
            (x as Extract<MessageSegment, { type: "tool_call" }>).callId ===
              toolSeg.callId
        );
        if (idx >= 0) {
          const existing = msg.segments[idx] as Extract<
            MessageSegment,
            { type: "tool_call" }
          >;
          const merged: Extract<MessageSegment, { type: "tool_call" }> = {
            ...existing,
            ...toolSeg,
            // For streaming tool_call updates, we always want the latest
            // arguments / argumentsText / status from the incoming segment.
            arguments:
              toolSeg.arguments && Object.keys(toolSeg.arguments).length > 0
                ? toolSeg.arguments
                : existing.arguments,
            argumentsText:
              toolSeg.argumentsText ?? existing.argumentsText,
            status: toolSeg.status ?? existing.status,
            // Persist label/detail once set.
            label: toolSeg.label ?? existing.label,
            detail: toolSeg.detail ?? existing.detail,
            result: toolSeg.result ?? existing.result,
            error: toolSeg.error ?? existing.error,
          };
          const nextSegs = msg.segments.slice();
          nextSegs[idx] = merged;
          return { ...msg, segments: nextSegs };
        }
        return { ...msg, segments: [...msg.segments, seg] };
      })
    );
    scheduleFlush(set);
  },

  setToolResult: (messageId, callId, patch) => {
    pendingMutators.push((msgs) =>
      patchMessage(msgs, messageId, (msg) => {
        let touched = false;
        const nextSegs = msg.segments.map((seg) => {
          if (seg.type === "tool_call" && seg.callId === callId) {
            touched = true;
            return { ...seg, ...patch } as MessageSegment;
          }
          return seg;
        });
        if (!touched) return msg;
        return { ...msg, segments: nextSegs };
      })
    );
    scheduleFlush(set);
  },

  addErrorSegment: (messageId, content) => {
    pendingMutators.push((msgs) =>
      patchMessage(msgs, messageId, (msg) => ({
        ...msg,
        segments: [...msg.segments, { type: "error", content }],
      }))
    );
    scheduleFlush(set);
  },

  setPendingBrowserTools: (callIds) =>
    set({ pendingBrowserTools: callIds }),
}));
