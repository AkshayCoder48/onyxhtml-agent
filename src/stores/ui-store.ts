"use client";

import { create } from "zustand";

export type SidebarView =
  | "files"
  | "preview"
  | "browser"
  | "console"
  | "history"
  | "search";

export type MobileView = "code" | "preview" | "ai" | "files";

type UIState = {
  sidebarCollapsed: boolean;
  activeSidebarView: SidebarView;
  settingsOpen: boolean;
  settingsCategory: string;
  commandPaletteOpen: boolean;
  quickFileOpen: boolean;
  consoleOpen: boolean;
  mobileView: MobileView;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setActiveSidebarView: (v: SidebarView) => void;
  openSettings: (category?: string) => void;
  closeSettings: () => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setQuickFileOpen: (v: boolean) => void;
  toggleConsole: () => void;
  setConsoleOpen: (v: boolean) => void;
  setMobileView: (v: MobileView) => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeSidebarView: "files",
  settingsOpen: false,
  settingsCategory: "providers",
  commandPaletteOpen: false,
  quickFileOpen: false,
  consoleOpen: false,
  mobileView: "code",

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setActiveSidebarView: (v) => set({ activeSidebarView: v }),
  openSettings: (category = "providers") =>
    set({ settingsOpen: true, settingsCategory: category }),
  closeSettings: () => set({ settingsOpen: false }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setQuickFileOpen: (v) => set({ quickFileOpen: v }),
  toggleConsole: () => set((s) => ({ consoleOpen: !s.consoleOpen })),
  setConsoleOpen: (v) => set({ consoleOpen: v }),
  setMobileView: (v) => set({ mobileView: v }),
}));
