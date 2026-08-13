"use client";

import * as React from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUIStore } from "@/stores/ui-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { HomeScreen } from "@/components/workspace/home-screen";
import { Sidebar } from "@/components/workspace/sidebar";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import { MobileWorkspaceView } from "@/components/workspace/mobile-workspace-view";
import { MobileNav } from "@/components/workspace/mobile-nav";
import { CommandPalette } from "@/components/workspace/command-palette";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function Page() {
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setQuickFileOpen = useUIStore((s) => s.setQuickFileOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  const isMobile = useIsMobile();

  // Apply settings (theme etc.)
  useSettings();

  // Keyboard shortcuts (registered globally)
  useKeyboardShortcuts([
    {
      key: "s",
      ctrl: true,
      meta: true,
      handler: async () => {
        const id = useWorkspaceStore.getState().currentWorkspaceId;
        const path = useWorkspaceStore.getState().activeFile;
        const entry = path ? useWorkspaceStore.getState().files[path] : null;
        if (!id || !path || !entry) return;
        try {
          await api.putFile(id, path, entry.content);
          useWorkspaceStore.getState().markSaved(path);
          await api.patchWorkspace(id, { activeFile: path });
          toast.success("Saved", { description: path });
        } catch (e) {
          toast.error("Save failed", {
            description: e instanceof Error ? e.message : undefined,
          });
        }
      },
    },
    { key: "p", ctrl: true, meta: true, handler: () => setQuickFileOpen(true) },
    {
      key: "p",
      ctrl: true,
      meta: true,
      shift: true,
      handler: () => setCommandPaletteOpen(true),
    },
    {
      key: "k",
      ctrl: true,
      meta: true,
      handler: () => {
        window.dispatchEvent(new CustomEvent("chat:focus-prompt"));
      },
    },
    { key: "b", ctrl: true, meta: true, handler: () => toggleSidebar() },
    {
      key: "`",
      ctrl: true,
      meta: true,
      handler: () => setConsoleOpen(!useUIStore.getState().consoleOpen),
    },
    {
      key: "Escape",
      handler: () => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      },
      allowInInput: true,
    },
  ]);

  // No workspace selected -> home screen
  if (!currentWorkspaceId) {
    return (
      <>
        <HomeScreen />
        <CommandPalette />
        <SettingsDialog />
      </>
    );
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <MobileWorkspaceView />
        <MobileNav />
        <CommandPalette />
        <SettingsDialog />
      </div>
    );
  }

  // Desktop layout: [Sidebar | WorkspaceView]
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <WorkspaceView />
      </div>
      <CommandPalette />
      <SettingsDialog />
    </div>
  );
}
