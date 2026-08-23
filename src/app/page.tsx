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
import { useWorkspaceBootstrap } from "@/hooks/use-workspace-bootstrap";


export default function Page() {
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setQuickFileOpen = useUIStore((s) => s.setQuickFileOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  const isMobile = useIsMobile();

  // Apply settings (theme etc.)
  useSettings();

  // Load workspace files + chat into stores whenever the selected workspace changes.
  useWorkspaceBootstrap();

  // Keyboard shortcuts (registered globally)
  useKeyboardShortcuts([
    {
      key: "s",
      ctrl: true,
      meta: true,
      handler: () => {
        // Files already sync to localStorage on every keystroke.
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
