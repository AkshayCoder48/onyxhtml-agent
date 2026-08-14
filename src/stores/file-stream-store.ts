"use client";

// ============================================================================
// FileStreamStore (PRD §22, §40) — per-file-path streaming state.
//
// When the AI writes a file, the server emits file.start → file.delta* →
// file.complete. This store accumulates the content live so the editor can
// display it character-by-character (PRD §20, §21).
//
// Components subscribe to a SINGLE file via `useFileStream(path)`, so only
// the affected editor re-renders on each delta — not the whole workspace
// (PRD §36, §23 "Prevent Editor Flickering").
// ============================================================================

import { create } from "zustand";
import type { FileStreamState } from "@/lib/streaming/types";

type FileStreamStoreState = {
  streams: Record<string, FileStreamState>; // keyed by path
  order: string[]; // arrival order

  start: (ev: {
    path: string;
    operation: FileStreamState["operation"];
    toolCallId: string;
  }) => void;
  delta: (path: string, delta: string) => void;
  complete: (path: string, bytes: number) => void;
  error: (path: string, message: string) => void;
  clear: (path: string) => void;
  reset: () => void;
};

export const useFileStreamStore = create<FileStreamStoreState>((set, get) => ({
  streams: {},
  order: [],

  start: ({ path, operation, toolCallId }) =>
    set((s) => {
      // If a stream for this path already exists (e.g. re-write), reset it.
      const next: FileStreamState = {
        path,
        operation,
        content: "",
        status: "writing",
        bytes: 0,
        startedAt: Date.now(),
        toolCallId,
      };
      return {
        streams: { ...s.streams, [path]: next },
        order: s.order.includes(path) ? s.order : [...s.order, path],
      };
    }),

  delta: (path, delta) =>
    set((s) => {
      const t = s.streams[path];
      if (!t) return s;
      return {
        streams: {
          ...s.streams,
          [path]: {
            ...t,
            content: t.content + delta,
            bytes: t.bytes + delta.length,
          },
        },
      };
    }),

  complete: (path, bytes) =>
    set((s) => {
      const t = s.streams[path];
      if (!t) return s;
      return {
        streams: {
          ...s.streams,
          [path]: { ...t, status: "complete", bytes: bytes || t.bytes },
        },
      };
    }),

  error: (path, message) =>
    set((s) => {
      const t = s.streams[path];
      if (!t) return s;
      return {
        streams: { ...s.streams, [path]: { ...t, status: "error" } },
      };
    }),

  clear: (path) =>
    set((s) => {
      const streams = { ...s.streams };
      delete streams[path];
      return { streams, order: s.order.filter((p) => p !== path) };
    }),

  reset: () => set({ streams: {}, order: [] }),
}));

// ---------- Fine-grained selector ----------

export function useFileStream(path: string | undefined): FileStreamState | undefined {
  return useFileStreamStore((s) => (path ? s.streams[path] : undefined));
}

export function useFileStreamOrder(): string[] {
  return useFileStreamStore((s) => s.order);
}

// ---------- Direct access (for non-React code paths) ----------

export function getFileStream(path: string): FileStreamState | undefined {
  return useFileStreamStore.getState().streams[path];
}
