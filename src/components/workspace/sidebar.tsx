"use client";

import * as React from "react";
import {
  Plus,
  Files,
  Eye,
  Globe,
  Terminal,
  MessageSquarePlus,
  History,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUIStore, type SidebarView } from "@/stores/ui-store";
import { useProviderStore, isProviderUsable } from "@/stores/provider-store";
import { useProviders } from "@/hooks/use-providers";
import { api } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useChatStore } from "@/stores/chat-store";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@/lib/types";

export function Sidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    setActiveSidebarView,
    activeSidebarView,
    openSettings,
    setConsoleOpen,
  } = useUIStore();
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setChatId = useChatStore((s) => s.setChatId);
  const setPreviewMode = useWorkspaceStore((s) => s.setPreviewMode);
  const bumpPreview = useWorkspaceStore((s) => s.bumpPreview);
  const queryClient = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  useProviders();
  const providers = useProviderStore((s) => s.providers);
  const activeProvider = useProviderStore((s) => s.activeProvider);
  const connected = isProviderUsable(activeProvider) || providers.some(isProviderUsable);

  const recentQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => (await api.listWorkspaces()).workspaces,
    enabled: !sidebarCollapsed,
  });

  async function handleNewWorkspace() {
    try {
      const data = await api.createWorkspace({ name: "Untitled workspace", template: "blank" });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setWorkspace(data.workspace);
      try {
        const chat = await api.createChat(data.workspace.id, { title: "New Chat" });
        setChatId(chat.chat.id);
      } catch {
        // ignore
      }
      toast.success("Workspace created");
    } catch (e) {
      toast.error("Failed to create workspace", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleNewChat() {
    if (!wsId) {
      toast.error("Open a workspace first");
      return;
    }
    try {
      const chat = await api.createChat(wsId, { title: "New Chat" });
      setChatId(chat.chat.id);
      await queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
      toast.success("New chat started");
    } catch (e) {
      toast.error("Failed to create chat", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  function pickView(view: SidebarView) {
    if (view === "preview") {
      setPreviewMode("preview");
      return;
    }
    if (view === "console") {
      setConsoleOpen(!useUIStore.getState().consoleOpen);
      return;
    }
    setActiveSidebarView(view);
  }

  type NavItem = {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    group: "WORKSPACE" | "CHAT" | "PROJECT" | "SYSTEM";
    action: () => void;
    active?: boolean;
  };

  const items: NavItem[] = [
    { id: "files", label: "Files", icon: Files, group: "WORKSPACE", action: () => pickView("files"), active: activeSidebarView === "files" },
    { id: "preview", label: "Preview", icon: Eye, group: "WORKSPACE", action: () => pickView("preview"), active: useWorkspaceStore.getState().previewMode === "preview" },
    { id: "browser", label: "Browser / Test", icon: Globe, group: "WORKSPACE", action: () => pickView("browser"), active: activeSidebarView === "browser" },
    { id: "console", label: "Console", icon: Terminal, group: "WORKSPACE", action: () => pickView("console"), active: useUIStore.getState().consoleOpen },
    { id: "new-chat", label: "New Chat", icon: MessageSquarePlus, group: "CHAT", action: handleNewChat },
    { id: "history", label: "History", icon: History, group: "CHAT", action: () => pickView("history"), active: activeSidebarView === "history" },
    { id: "search", label: "Search Chats", icon: Search, group: "CHAT", action: () => pickView("search"), active: activeSidebarView === "search" },
    { id: "recent", label: "Recent Workspaces", icon: History, group: "PROJECT", action: () => { setActiveSidebarView("files"); bumpPreview(); } },
    { id: "settings", label: "Settings", icon: Settings, group: "SYSTEM", action: () => openSettings("providers") },
  ];

  const groups: { label: string; group: NavItem["group"] }[] = [
    { label: "WORKSPACE", group: "WORKSPACE" },
    { label: "CHAT", group: "CHAT" },
    { label: "PROJECT", group: "PROJECT" },
    { label: "SYSTEM", group: "SYSTEM" },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          sidebarCollapsed ? "w-[60px]" : "w-[260px]"
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-bold">◆</span>
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold leading-tight">Onyx HTML</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                AI Workspace
              </div>
            </div>
          )}
        </div>

        {/* New workspace button */}
        <div className="px-2">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={handleNewWorkspace}
                  className="w-full"
                  aria-label="New Workspace"
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New Workspace</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              onClick={handleNewWorkspace}
              className="w-full justify-start gap-2"
              size="default"
            >
              <Plus className="size-4" />
              New Workspace
            </Button>
          )}
        </div>

        {/* Nav */}
        <nav className="mt-3 flex-1 space-y-3 overflow-y-auto scrollbar-thin px-2 pb-3">
          {groups.map((g) => {
            const groupItems = items.filter((i) => i.group === g.group);
            if (groupItems.length === 0) return null;
            return (
              <div key={g.group} className="space-y-0.5">
                {!sidebarCollapsed && (
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </div>
                )}
                {groupItems.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    collapsed={sidebarCollapsed}
                    active={item.active}
                  />
                ))}
                {!sidebarCollapsed && g.group === "PROJECT" && (
                  <RecentList
                    workspaces={recentQuery.data ?? []}
                    onPick={(ws) => setWorkspace(ws)}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-2">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleSidebar()}
                  aria-label="Expand sidebar"
                  className="w-full"
                >
                  <PanelLeft className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand (⌘B)</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={() => openSettings("providers")}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    connected ? "bg-emerald-500" : "bg-muted-foreground/40"
                  )}
                />
                <span className="truncate text-muted-foreground">
                  {connected ? "Connected" : "AI not configured"}
                </span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => toggleSidebar()}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function NavButton({
  item,
  collapsed,
  active,
}: {
  item: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; action: () => void };
  collapsed: boolean;
  active?: boolean;
}) {
  const Icon = item.icon;
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={active ? "secondary" : "ghost"}
            onClick={item.action}
            className="w-full"
            aria-label={item.label}
          >
            <Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <button
      onClick={item.action}
      className={cn(
        "group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent-strong" />
      )}
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.id === "recent" && <ChevronRight className="ml-auto size-3.5 opacity-50" />}
    </button>
  );
}

function RecentList({
  workspaces,
  onPick,
}: {
  workspaces: Workspace[];
  onPick: (ws: Workspace) => void;
}) {
  if (workspaces.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {workspaces.slice(0, 5).map((ws) => (
        <button
          key={ws.id}
          onClick={() => onPick(ws)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        >
          <span className="truncate">{ws.name}</span>
        </button>
      ))}
    </div>
  );
}
