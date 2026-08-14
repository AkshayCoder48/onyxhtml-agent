"use client";

// ============================================================================
// ToolStore (PRD §35) — per-tool-callId state with fine-grained subscriptions.
//
// Components subscribe to a SINGLE tool by callId via `useTool(callId)`, so a
// streaming argument delta only re-renders that one ToolCard, not every tool
// in the message (PRD §36 React Performance Requirements).
//
// Updates are IMMEDIATE (no coalescing). React 18 batches synchronous
// setState calls within the same tick, so dozens of deltas per second produce
// at most one re-render per frame — without any artificial throttle.
// ============================================================================

import { create } from "zustand";
import type { ToolState, ToolCardState } from "@/lib/streaming/types";

type ToolStoreState = {
  // Map of callId → tool state. We mutate this immutably (new Map per update)
  // so React's useSyncExternalStore sees a change. But we only create new
  // objects for the TOUCHED tool — untouched tools keep their reference,
  // so their subscribers don't re-render.
  tools: Record<string, ToolState>;

  // Ordered list of callIds for the current streaming message, so the UI can
  // render tools in arrival order.
  order: string[];

  // ---- mutators (called by EventDispatcher) ----
  start: (tool: Omit<ToolState, "state" | "rawArguments" | "consoleLines" | "startedAt">) => void;
  appendArguments: (callId: string, delta: string) => void;
  execute: (callId: string) => void;
  progress: (callId: string, message: string | undefined, progress: number | undefined) => void;
  result: (callId: string, status: "success" | "error" | "cancelled", result: unknown, error: string | undefined, label: string | undefined, detail: string | undefined) => void;
  complete: (callId: string) => void;
  addConsoleLine: (callId: string, level: "log" | "info" | "warn" | "error", args: string[], time: number) => void;
  reset: () => void;
  // Hydrate persisted tool calls (e.g. on chat reload). Replaces the store.
  hydrate: (tools: Record<string, ToolState>) => void;
};

function shallowCloneTool(t: ToolState): ToolState {
  return { ...t, consoleLines: t.consoleLines };
}

export const useToolStore = create<ToolStoreState>((set, get) => ({
  tools: {},
  order: [],

  start: (tool) =>
    set((s) => {
      const existing = s.tools[tool.toolCallId];
      const next: ToolState = existing
        ? {
            ...existing,
            tool: tool.tool,
            label: tool.label ?? existing.label,
            messageId: tool.messageId,
            state: "generating",
          }
        : {
            toolCallId: tool.toolCallId,
            messageId: tool.messageId,
            tool: tool.tool,
            label: tool.label,
            detail: tool.detail,
            rawArguments: "",
            state: "generating",
            consoleLines: [],
            startedAt: Date.now(),
          };
      return {
        tools: { ...s.tools, [tool.toolCallId]: next },
        order: s.order.includes(tool.toolCallId)
          ? s.order
          : [...s.order, tool.toolCallId],
      };
    }),

  appendArguments: (callId, delta) =>
    set((s) => {
      const t = s.tools[callId];
      if (!t) return s;
      const next: ToolState = {
        ...t,
        rawArguments: t.rawArguments + delta,
      };
      // Best-effort parse: if the accumulated JSON is now complete, store the
      // parsed arguments. Never throw on partial JSON (PRD §16).
      if (next.rawArguments.trim()) {
        try {
          next.parsedArguments = JSON.parse(next.rawArguments);
        } catch {
          // Still incomplete — keep the previous parsedArguments if any.
          next.parsedArguments = t.parsedArguments;
        }
      }
      return { tools: { ...s.tools, [callId]: next } };
    }),

  execute: (callId) =>
    set((s) => {
      const t = s.tools[callId];
      if (!t) return s;
      return {
        tools: {
          ...s.tools,
          [callId]: { ...t, state: "executing" as ToolCardState },
        },
      };
    }),

  progress: (callId, message, prog) =>
    set((s) => {
      const t = s.tools[callId];
      if (!t) return s;
      return {
        tools: {
          ...s.tools,
          [callId]: {
            ...t,
            state: "streaming",
            progressMessage: message,
            progress: prog,
          },
        },
      };
    }),

  result: (callId, status, res, err, label, detail) =>
    set((s) => {
      const t = s.tools[callId];
      if (!t) return s;
      return {
        tools: {
          ...s.tools,
          [callId]: {
            ...t,
            state: status,
            result: res,
            error: err,
            label: label ?? t.label,
            detail: detail ?? t.detail,
            completedAt: Date.now(),
          },
        },
      };
    }),

  complete: (callId) =>
    set((s) => {
      const t = s.tools[callId];
      if (!t) return s;
      // Only advance to success if not already in a terminal state.
      if (t.state === "success" || t.state === "error" || t.state === "cancelled") return s;
      return {
        tools: {
          ...s.tools,
          [callId]: shallowCloneTool({ ...t, state: "success", completedAt: Date.now() }),
        },
      };
    }),

  addConsoleLine: (callId, level, args, time) =>
    set((s) => {
      const t = s.tools[callId];
      if (!t) return s;
      return {
        tools: {
          ...s.tools,
          [callId]: {
            ...t,
            consoleLines: [...t.consoleLines, { level, args, time }],
          },
        },
      };
    }),

  reset: () => set({ tools: {}, order: [] }),

  hydrate: (tools) =>
    set({
      tools,
      order: Object.keys(tools),
    }),
}));

// ---------- Fine-grained selectors ----------
//
// `useTool(callId)` subscribes to a single tool's state. Only that component
// re-renders when the tool's arguments stream in — not every ToolCard in the
// message. This is the key to smooth character-level streaming (PRD §36).

export function useTool(callId: string | undefined): ToolState | undefined {
  return useToolStore((s) => (callId ? s.tools[callId] : undefined));
}

export function useToolOrder(): string[] {
  return useToolStore((s) => s.order);
}
