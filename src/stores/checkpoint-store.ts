"use client";
import { create } from "zustand";

export type Checkpoint = {
  id: string;
  message: string;
  timestamp: number;
  files: Record<string, { content: string; isBinary: boolean }>;
  fileCount: number;
};

type CheckpointState = {
  checkpoints: Checkpoint[];
  addCheckpoint: (message: string, files: Record<string, { content: string; isBinary: boolean }>) => string;
  restoreCheckpoint: (id: string) => Checkpoint | null;
  deleteCheckpoint: (id: string) => void;
  clear: () => void;
};

export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  checkpoints: [],
  addCheckpoint: (message, files) => {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cp: Checkpoint = {
      id,
      message,
      timestamp: Date.now(),
      files: JSON.parse(JSON.stringify(files)), // deep clone
      fileCount: Object.keys(files).length,
    };
    set((s) => ({ checkpoints: [cp, ...s.checkpoints].slice(0, 20) })); // keep 20
    return id;
  },
  restoreCheckpoint: (id) => {
    const cp = get().checkpoints.find((c) => c.id === id);
    return cp ?? null;
  },
  deleteCheckpoint: (id) => set((s) => ({ checkpoints: s.checkpoints.filter((c) => c.id !== id) })),
  clear: () => set({ checkpoints: [] }),
}));
