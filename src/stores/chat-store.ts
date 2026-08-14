"use client";

// ============================================================================
// ChatStore (PRD §9, §10, §35) — high-performance streaming message store.
//
// CRITICAL CHANGE vs the old store: the rAF coalescing layer is GONE (PRD §8,
// §3.1 "Delete … artificial streaming throttle"). Updates are now IMMEDIATE.
// React 18's automatic batching handles dozens of deltas per second without
// any throttle — and crucially, without the "paragraph batching" visual lag
// the old rAF layer produced.
//
// To avoid the old "Maximum update depth exceeded" bug, the messages array
// reference is NOT changed on every delta. Instead we keep a stable array
// and mutate the streaming message's segments in place via a shallow clone
// of ONLY that message. Components subscribe to primitive counts or to a
// single message's content length — never to the whole `messages` array —
// so only the affected component re-renders.
// ============================================================================

import { create } from "zustand";
import type { Message, MessageSegment } from "@/lib/types";
import type { AgentStatus } from "@/lib/streaming/types";

type ChatState = {
  chatId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  pendingBrowserTools: string[];

  // ---- Agent status machine (PRD §3, §23) ----
  // The UI derives its status display from these fields rather than a generic
  // isLoading boolean, so the user sees meaningful progress ("Inspecting
  // workspace…", "Editing index.html…") instead of indefinite "Thinking…".
  agentStatus: AgentStatus;
  agentStatusMessage: string | null; // human-readable detail
  agentStatusAction: string | null; // short label for the current step
  lastHeartbeatAt: number | null; // epoch ms of the last run.heartbeat event

  setChatId: (id: string | null) => void;
  setMessages: (msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  startStreaming: (assistantId: string) => void;
  stopStreaming: () => void;
  clearMessages: () => void;

  // ---- streaming mutators (IMMEDIATE, no coalescing) ----

  // Append a text delta to the streaming message's last content segment,
  // creating one if none exists. This is the hot path — called per token.
  appendTextDelta: (messageId: string, delta: string) => void;
  appendThinkingDelta: (messageId: string, delta: string) => void;
  addErrorSegment: (messageId: string, content: string) => void;

  // Tool-call segment sync: the ToolStore is the source of truth for tool
  // state, but the ChatStore also keeps a lightweight tool_call segment in
  // the message so persisted messages render correctly after refresh.
  upsertToolCallSegment: (messageId: string, seg: MessageSegment) => void;
  setToolResult: (
    messageId: string,
    callId: string,
    patch: Partial<MessageSegment>
  ) => void;

  setPendingBrowserTools: (callIds: string[]) => void;

  // ---- agent status mutators ----
  setAgentStatus: (
    status: AgentStatus,
    message?: string,
    currentAction?: string
  ) => void;
  setAgentProgress: (message?: string, progress?: number) => void;
  setHeartbeat: (timestamp: number, currentStep?: string) => void;

  // Rename a message's ID. Used to reconcile the client-generated assistant
  // message ID (e.g. "a_abc123") with the server's DB message ID (e.g.
  // "cmss...") when the first stream event arrives. Without this, all
  // subsequent text.delta / tool.start events would fail to find the message
  // and be silently dropped — causing the "stuck on thinking" UI bug where
  // the AI's response never appears during streaming.
  renameMessage: (oldId: string, newId: string) => void;
};

// Immutably patch a single message. Returns a NEW messages array (shallow
// copied) so React sees a new reference, but only the touched message object
// is new — all other messages keep their reference, so their subscribers
// don't re-render.
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
  agentStatus: "idle",
  agentStatusMessage: null,
  agentStatusAction: null,
  lastHeartbeatAt: null,

  setChatId: (id) =>
    set({
      chatId: id,
      messages: [],
      isStreaming: false,
      streamingMessageId: null,
      pendingBrowserTools: [],
      agentStatus: "idle",
      agentStatusMessage: null,
      agentStatusAction: null,
      lastHeartbeatAt: null,
    }),

  setMessages: (msgs) => set({ messages: msgs }),

  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  startStreaming: (assistantId) =>
    set({
      isStreaming: true,
      streamingMessageId: assistantId,
      agentStatus: "planning",
      agentStatusMessage: "Starting…",
      agentStatusAction: null,
      lastHeartbeatAt: Date.now(),
    }),

  stopStreaming: () =>
    set((s) => ({
      isStreaming: false,
      streamingMessageId: null,
      pendingBrowserTools: [],
      // If the agent never reached a terminal status, mark it completed so
      // the UI doesn't stay stuck on "executing…". The stream ended, so from
      // the UI's perspective the run is done.
      agentStatus:
        s.agentStatus === "completed" ||
        s.agentStatus === "failed" ||
        s.agentStatus === "cancelled"
          ? s.agentStatus
          : "completed",
    })),

  clearMessages: () =>
    set({
      messages: [],
      isStreaming: false,
      streamingMessageId: null,
      agentStatus: "idle",
      agentStatusMessage: null,
      agentStatusAction: null,
    }),

  // ---- IMMEDIATE streaming mutators (no rAF, no debounce) ----

  appendTextDelta: (messageId, delta) =>
    set((s) => ({
      messages: patchMessage(s.messages, messageId, (msg) => {
        const segments = msg.segments;
        const last = segments[segments.length - 1];
        if (last && last.type === "content") {
          // Hot path: just append to the existing content segment. We create
          // a new segment object (so React sees a change) but we do NOT copy
          // the whole segments array — we use a tiny splice.
          const nextSegs = segments.slice();
          nextSegs[nextSegs.length - 1] = {
            type: "content",
            content: (last as { content: string }).content + delta,
          };
          return { ...msg, segments: nextSegs };
        }
        return {
          ...msg,
          segments: [...segments, { type: "content", content: delta }],
        };
      }),
    })),

  appendThinkingDelta: (messageId, delta) =>
    set((s) => ({
      messages: patchMessage(s.messages, messageId, (msg) => {
        const segments = msg.segments;
        const last = segments[segments.length - 1];
        if (last && last.type === "thinking") {
          const nextSegs = segments.slice();
          nextSegs[nextSegs.length - 1] = {
            type: "thinking",
            content: (last as { content: string }).content + delta,
          };
          return { ...msg, segments: nextSegs };
        }
        return {
          ...msg,
          segments: [...segments, { type: "thinking", content: delta }],
        };
      }),
    })),

  addErrorSegment: (messageId, content) =>
    set((s) => ({
      messages: patchMessage(s.messages, messageId, (msg) => ({
        ...msg,
        segments: [...msg.segments, { type: "error", content }],
      })),
    })),

  upsertToolCallSegment: (messageId, seg) => {
    const toolSeg = seg as Extract<MessageSegment, { type: "tool_call" }>;
    set((s) => ({
      messages: patchMessage(s.messages, messageId, (msg) => {
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
            arguments:
              toolSeg.arguments && Object.keys(toolSeg.arguments).length > 0
                ? toolSeg.arguments
                : existing.arguments,
            argumentsText: toolSeg.argumentsText ?? existing.argumentsText,
            status: toolSeg.status ?? existing.status,
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
      }),
    }));
  },

  setToolResult: (messageId, callId, patch) =>
    set((s) => ({
      messages: patchMessage(s.messages, messageId, (msg) => {
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
      }),
    })),

  setPendingBrowserTools: (callIds) => set({ pendingBrowserTools: callIds }),

  // ---- agent status mutators ----
  setAgentStatus: (status, message, currentAction) =>
    set({
      agentStatus: status,
      agentStatusMessage: message ?? null,
      agentStatusAction: currentAction ?? null,
      // A status update implies the run is alive — refresh the heartbeat.
      lastHeartbeatAt: Date.now(),
    }),

  setAgentProgress: (message, _progress) =>
    set({
      agentStatusMessage: message ?? null,
      lastHeartbeatAt: Date.now(),
    }),

  setHeartbeat: (timestamp, _currentStep) =>
    set({ lastHeartbeatAt: timestamp }),

  renameMessage: (oldId, newId) =>
    set((s) => {
      if (oldId === newId) return s;
      const idx = s.messages.findIndex((m) => m.id === oldId);
      if (idx < 0) return s;
      const next = s.messages.slice();
      next[idx] = { ...next[idx], id: newId };
      // Also update streamingMessageId if it was pointing at the old id.
      const streamingMessageId =
        s.streamingMessageId === oldId ? newId : s.streamingMessageId;
      return { messages: next, streamingMessageId };
    }),
}));
