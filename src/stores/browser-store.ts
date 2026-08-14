"use client";

// ============================================================================
// BrowserStore (PRD §18, §35) — live browser console output during
// terminal_exec / run_javascript tool execution.
//
// Console lines arrive as browser.console stream events. We bucket them per
// toolCallId so the ToolCard for that specific tool can render the live
// console output (PRD §18 "Streaming output").
// ============================================================================

import { create } from "zustand";

export type BrowserConsoleLine = {
  toolCallId: string;
  level: "log" | "info" | "warn" | "error";
  args: string[];
  time: number;
};

type BrowserStoreState = {
  // Map of toolCallId → console lines (in arrival order).
  lines: Record<string, BrowserConsoleLine[]>;

  add: (line: BrowserConsoleLine) => void;
  clear: (toolCallId: string) => void;
  reset: () => void;
};

export const useBrowserStore = create<BrowserStoreState>((set) => ({
  lines: {},

  add: (line) =>
    set((s) => {
      const prev = s.lines[line.toolCallId] ?? [];
      // Cap at 500 lines per tool to bound memory (PRD §28 backpressure).
      const next = prev.length >= 500 ? prev.slice(-499).concat(line) : [...prev, line];
      return { lines: { ...s.lines, [line.toolCallId]: next } };
    }),

  clear: (toolCallId) =>
    set((s) => {
      const lines = { ...s.lines };
      delete lines[toolCallId];
      return { lines };
    }),

  reset: () => set({ lines: {} }),
}));

export function useBrowserConsole(toolCallId: string | undefined): BrowserConsoleLine[] {
  // CRITICAL: return a STABLE empty array reference when the bucket is empty,
  // otherwise useSyncExternalStore sees a new [] on every call and throws
  // "The result of getSnapshot should be cached to avoid an infinite loop".
  return useBrowserStore((s) =>
    toolCallId ? s.lines[toolCallId] ?? EMPTY_LINES : EMPTY_LINES
  );
}

const EMPTY_LINES: BrowserConsoleLine[] = [];
