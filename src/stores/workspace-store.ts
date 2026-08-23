"use client";

import { create } from "zustand";
import type { FileNode, PreviewDevice, Workspace } from "@/lib/types";

type FileMap = Record<string, { content: string; isBinary: boolean }>;

type WorkspaceState = {
  currentWorkspaceId: string | null;
  workspace: Workspace | null;
  files: FileMap;
  tree: FileNode[];
  activeFile: string | null;
  openTabs: string[];
  unsavedPaths: Set<string>;
  previewMode: "code" | "preview";
  previewEntry: string | null;
  device: PreviewDevice;
  aiEditingFiles: Set<string>;
  isDirty: boolean;
  previewNonce: number;

  setWorkspace: (ws: Workspace | null) => void;
  clearWorkspace: () => void;
  setFiles: (files: { path: string; content: string; isBinary: boolean }[]) => void;
  setTree: (tree: FileNode[]) => void;
  setActiveFile: (path: string | null) => void;
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  markUnsaved: (path: string) => void;
  markAllSaved: () => void;
  addFile: (path: string, content: string, isBinary?: boolean) => void;
  removeFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
  setPreviewMode: (m: "code" | "preview") => void;
  setPreviewEntry: (path: string | null) => void;
  setDevice: (d: PreviewDevice) => void;
  setAiEditing: (path: string, editing: boolean) => void;
  bumpPreview: () => void;
  upsertFile: (path: string, content: string, isBinary?: boolean) => void;
  toSnapshot: () => { path: string; content: string; isBinary: boolean }[];
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentWorkspaceId: null,
  workspace: null,
  files: {},
  tree: [],
  activeFile: null,
  openTabs: [],
  unsavedPaths: new Set<string>(),
  previewMode: "code",
  previewEntry: null,
  device: "desktop",
  aiEditingFiles: new Set<string>(),
  isDirty: false,
  previewNonce: 0,

  setWorkspace: (ws) =>
    set({
      currentWorkspaceId: ws?.id ?? null,
      workspace: ws,
      files: {},
      tree: [],
      activeFile: ws?.activeFile ?? null,
      openTabs: ws?.activeFile ? [ws.activeFile] : [],
      unsavedPaths: new Set<string>(),
      aiEditingFiles: new Set<string>(),
      isDirty: false,
      previewEntry: null,
    }),

  clearWorkspace: () =>
    set({
      currentWorkspaceId: null,
      workspace: null,
      files: {},
      tree: [],
      activeFile: null,
      openTabs: [],
      unsavedPaths: new Set<string>(),
      aiEditingFiles: new Set<string>(),
      isDirty: false,
      previewEntry: null,
    }),

  setFiles: (files) => {
    const map: FileMap = {};
    for (const f of files) map[f.path] = { content: f.content, isBinary: f.isBinary };
    set({ files: map });
  },

  setTree: (tree) => set({ tree }),

  setActiveFile: (path) =>
    set((s) => {
      const next: Partial<WorkspaceState> = { activeFile: path };
      if (path && !s.openTabs.includes(path)) {
        next.openTabs = [...s.openTabs, path];
      }
      return next as WorkspaceState;
    }),

  openTab: (path) =>
    set((s) =>
      s.openTabs.includes(path)
        ? { activeFile: path }
        : { openTabs: [...s.openTabs, path], activeFile: path }
    ),

  closeTab: (path) =>
    set((s) => {
      const idx = s.openTabs.indexOf(path);
      const nextTabs = s.openTabs.filter((t) => t !== path);
      let nextActive = s.activeFile;
      if (s.activeFile === path) {
        nextActive = nextTabs[Math.min(idx, nextTabs.length - 1)] ?? null;
      }
      const nextUnsaved = new Set(s.unsavedPaths);
      nextUnsaved.delete(path);
      return { openTabs: nextTabs, activeFile: nextActive, unsavedPaths: nextUnsaved };
    }),

  updateFileContent: (path, content) =>
    set((s) => {
      const prev = s.files[path];
      const files = {
        ...s.files,
        [path]: { content, isBinary: prev?.isBinary ?? false },
      };
      const unsaved = new Set(s.unsavedPaths);
      unsaved.add(path);
      return { files, unsavedPaths: unsaved, isDirty: true };
    }),

  markSaved: (path) =>
    set((s) => {
      const unsaved = new Set(s.unsavedPaths);
      unsaved.delete(path);
      return { unsavedPaths: unsaved, isDirty: unsaved.size > 0 };
    }),

  markUnsaved: (path) =>
    set((s) => {
      const unsaved = new Set(s.unsavedPaths);
      unsaved.add(path);
      return { unsavedPaths: unsaved, isDirty: true };
    }),

  markAllSaved: () => set({ unsavedPaths: new Set<string>(), isDirty: false }),

  addFile: (path, content, isBinary = false) =>
    set((s) => ({
      files: { ...s.files, [path]: { content, isBinary } },
    })),

  removeFile: (path) =>
    set((s) => {
      const files = { ...s.files };
      delete files[path];
      const openTabs = s.openTabs.filter((t) => t !== path);
      let activeFile = s.activeFile;
      if (activeFile === path) activeFile = openTabs[0] ?? null;
      const unsaved = new Set(s.unsavedPaths);
      unsaved.delete(path);
      const ai = new Set(s.aiEditingFiles);
      ai.delete(path);
      return { files, openTabs, activeFile, unsavedPaths: unsaved, aiEditingFiles: ai };
    }),

  renameFile: (from, to) =>
    set((s) => {
      const files = { ...s.files };
      const entry = files[from];
      if (entry) {
        files[to] = entry;
        delete files[from];
      }
      const openTabs = s.openTabs.map((t) => (t === from ? to : t));
      const activeFile = s.activeFile === from ? to : s.activeFile;
      const unsaved = new Set<string>();
      for (const p of s.unsavedPaths) unsaved.add(p === from ? to : p);
      const ai = new Set<string>();
      for (const p of s.aiEditingFiles) ai.add(p === from ? to : p);
      return { files, openTabs, activeFile, unsavedPaths: unsaved, aiEditingFiles: ai };
    }),

  setPreviewMode: (m) => set({ previewMode: m }),
  setPreviewEntry: (path) => set({ previewEntry: path }),
  setDevice: (d) => set({ device: d }),
  setAiEditing: (path, editing) =>
    set((s) => {
      const next = new Set(s.aiEditingFiles);
      if (editing) next.add(path);
      else next.delete(path);
      return { aiEditingFiles: next };
    }),
  bumpPreview: () => set((s) => ({ previewNonce: s.previewNonce + 1 })),
  upsertFile: (path, content, isBinary = false) =>
    set((s) => ({
      files: { ...s.files, [path]: { content, isBinary } },
    })),
  toSnapshot: () => {
    const files = get().files;
    return Object.entries(files).map(([path, f]) => ({ path, content: f.content, isBinary: f.isBinary }));
  },
}));
