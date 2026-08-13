"use client";

import { create } from "zustand";
import type { Message, MessageSegment } from "@/lib/types";

type ChatState = {
  chatId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  pendingBrowserTools: string[]; // callIds awaiting client-side execution
  // local-only: assistant message currently being streamed
  // (we mutate its segments directly via the helpers below)

  setChatId: (id: string | null) => void;
  setMessages: (msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  startStreaming: (assistantId: string) => void;
  stopStreaming: () => void;
  clearMessages: () => void;

  // streaming segment helpers
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

function cloneMessages(msgs: Message[]): Message[] {
  return msgs.map((m) => ({ ...m, segments: m.segments.map((s) => ({ ...s })) }));
}

export const useChatStore = create<ChatState>((set) => ({
  chatId: null,
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  pendingBrowserTools: [],

  setChatId: (id) =>
    set({ chatId: id, messages: [], isStreaming: false, streamingMessageId: null, pendingBrowserTools: [] }),

  setMessages: (msgs) => set({ messages: msgs }),

  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  startStreaming: (assistantId) =>
    set({ isStreaming: true, streamingMessageId: assistantId }),

  stopStreaming: () =>
    set({ isStreaming: false, streamingMessageId: null, pendingBrowserTools: [] }),

  clearMessages: () => set({ messages: [], isStreaming: false, streamingMessageId: null }),

  appendToSegment: (messageId, predicate, create, mutate) =>
    set((s) => {
      const msgs = cloneMessages(s.messages);
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx < 0) return {};
      const msg = msgs[idx];
      const last = msg.segments[msg.segments.length - 1];
      if (last && predicate(last)) {
        msg.segments[msg.segments.length - 1] = mutate(last);
      } else {
        const seg = create();
        msg.segments.push(seg);
      }
      msgs[idx] = msg;
      return { messages: msgs };
    }),

  upsertToolCallSegment: (messageId, seg) =>
    set((s) => {
      const msgs = cloneMessages(s.messages);
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx < 0) return {};
      const msg = msgs[idx];
      const toolSeg = seg as Extract<MessageSegment, { type: "tool_call" }>;
      const existingIdx = msg.segments.findIndex(
        (x) => x.type === "tool_call" && (x as Extract<MessageSegment, { type: "tool_call" }>).callId === toolSeg.callId
      );
      if (existingIdx >= 0) {
        const existing = msg.segments[existingIdx] as Extract<MessageSegment, { type: "tool_call" }>;
        msg.segments[existingIdx] = {
          ...existing,
          ...toolSeg,
          // keep latest arguments/status; tool streaming may add label/detail progressively
          arguments: toolSeg.arguments ?? existing.arguments,
          status: toolSeg.status ?? existing.status,
        };
      } else {
        msg.segments.push(seg);
      }
      msgs[idx] = msg;
      return { messages: msgs };
    }),

  setToolResult: (messageId, callId, patch) =>
    set((s) => {
      const msgs = cloneMessages(s.messages);
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx < 0) return {};
      const msg = msgs[idx];
      msg.segments = msg.segments.map((seg) => {
        if (seg.type === "tool_call" && seg.callId === callId) {
          return { ...seg, ...patch } as MessageSegment;
        }
        return seg;
      });
      msgs[idx] = msg;
      return { messages: msgs };
    }),

  addErrorSegment: (messageId, content) =>
    set((s) => {
      const msgs = cloneMessages(s.messages);
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx < 0) return {};
      msgs[idx].segments.push({ type: "error", content });
      return { messages: msgs };
    }),

  setPendingBrowserTools: (callIds) => set({ pendingBrowserTools: callIds }),
}));
