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
  Sparkles,
  Layers,
  Code2,
  Zap,
  Folder,
  Clock,
  Star,
  MoreHorizontal,
  Trash2,
  Copy,
  ExternalLink,
  Command,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
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
  const currentWorkspace = useWorkspaceStore((s) => s.workspace);

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
      } catch {}
      toast.success("Workspace created", { description: data.workspace.name });
    } catch (e) {
      toast.error("Failed to create workspace", { description: e instanceof Error ? e.message : undefined });
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
      toast.error("Failed to create chat", { description: e instanceof Error ? e.message : undefined });
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
    badge?: string;
  };

  const items: NavItem[] = [
    { id: "files", label: "Files", icon: Files, group: "WORKSPACE", action: () => pickView("files"), active: activeSidebarView === "files" },
    { id: "preview", label: "Preview", icon: Eye, group: "WORKSPACE", action: () => pickView("preview"), active: useWorkspaceStore.getState().previewMode === "preview" },
    { id: "browser", label: "Browser", icon: Globe, group: "WORKSPACE", action: () => pickView("browser"), active: activeSidebarView === "browser" },
    { id: "console", label: "Console", icon: Terminal, group: "WORKSPACE", action: () => pickView("console"), active: useUIStore.getState().consoleOpen },
    { id: "new-chat", label: "New Chat", icon: MessageSquarePlus, group: "CHAT", action: handleNewChat },
    { id: "history", label: "History", icon: History, group: "CHAT", action: () => pickView("history"), active: activeSidebarView === "history" },
    { id: "search", label: "Search", icon: Search, group: "CHAT", action: () => pickView("search"), active: activeSidebarView === "search" },
    { id: "settings", label: "Settings", icon: Settings, group: "SYSTEM", action: () => openSettings("providers") },
  ];

  const groups: { label: string; icon: React.ComponentType<{ className?: string }>; group: NavItem["group"] }[] = [
    { label: "Workspace", icon: Layers, group: "WORKSPACE" },
    { label: "Chat", icon: MessageSquarePlus, group: "CHAT" },
    { label: "System", icon: Command, group: "SYSTEM" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          sidebarCollapsed ? "w-[64px]" : "w-[280px]"
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center gap-3 border-b px-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-md">
            <Sparkles className="size-5" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-bold tracking-tight">Onyx HTML</span>
                <Badge variant="secondary" className="h-4 rounded-full px-1.5 text-[9px] font-bold">
                  BETA
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <div className={cn("size-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-amber-500")} />
                {connected ? "AI Connected" : "Setup AI"}
              </div>
            </div>
          )}
          {!sidebarCollapsed && (
            <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={toggleSidebar}>
              <PanelLeftClose className="size-4" />
            </Button>
          )}
        </div>

        {/* New workspace */}
        <div className="p-3">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={handleNewWorkspace} className="w-full rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-md hover:from-violet-700 hover:to-blue-700" aria-label="New Workspace">
                  <Plus className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New Workspace</TooltipContent>
            </Tooltip>
          ) : (
            <Button onClick={handleNewWorkspace} className="w-full justify-start gap-2 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-md hover:from-violet-700 hover:to-blue-700" size="default">
              <Plus className="size-4" /> New Workspace
            </Button>
          )}
        </div>

        {/* Current workspace card */}
        {!sidebarCollapsed && currentWorkspace && (
          <div className="mx-3 mb-3 rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Folder className="size-3.5 text-muted-foreground" />
                  <span className="truncate text-xs font-medium">{currentWorkspace.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Hash className="size-3" />
                  <span className="truncate font-mono">{currentWorkspace.id.slice(0, 8)}</span>
                </div>
              </div>
              <Badge variant="outline" className="h-5 rounded-full text-[10px]">
                {currentWorkspace.template}
              </Badge>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 space-y-4 overflow-y-auto scrollbar-thin px-3 pb-3">
          {groups.map((g) => {
            const groupItems = items.filter((i) => i.group === g.group);
            if (groupItems.length === 0) return null;
            return (
              <div key={g.group} className="space-y-1">
                {!sidebarCollapsed && (
                  <div className="flex items-center gap-1.5 px-2 pb-1 pt-2">
                    <g.icon className="size-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</span>
                  </div>
                )}
                {groupItems.map((item) => (
                  <NavButton key={item.id} item={item} collapsed={sidebarCollapsed} active={item.active} />
                ))}
                {!sidebarCollapsed && g.group === "PROJECT" && (
                  <RecentList workspaces={recentQuery.data ?? []} onPick={(ws) => setWorkspace(ws)} />
                )}
              </div>
            );
          })}

          {/* Recent workspaces */}
          {!sidebarCollapsed && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 px-2 pb-1 pt-2">
                <Clock className="size-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</span>
              </div>
              <RecentList workspaces={recentQuery.data ?? []} onPick={(ws) => setWorkspace(ws)} />
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t p-3">
          {sidebarCollapsed ? (
            <div className="flex flex-col gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => openSettings("providers")} className="w-full rounded-xl" aria-label="Settings">
                    <div className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-amber-500")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{connected ? "AI Connected" : "Setup AI"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => toggleSidebar()} aria-label="Expand sidebar" className="w-full rounded-xl">
                    <PanelLeft className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand (⌘B)</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="space-y-2">
              <button onClick={() => openSettings("providers")} className="flex w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-accent">
                <div className={cn("flex size-8 items-center justify-center rounded-lg", connected ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600")}>
                  <Zap className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{connected ? "AI Connected" : "AI Not Configured"}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{connected ? activeProvider?.model ?? "Ready" : "Setup in settings"}</div>
                </div>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </button>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Command className="size-3" /> ⌘B to toggle
                </div>
                <Button size="icon" variant="ghost" className="size-7 rounded-full" onClick={() => toggleSidebar()} aria-label="Collapse sidebar">
                  <PanelLeftClose className="size-4" />
                </Button>
              </div>
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
  item: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; action: () => void; badge?: string };
  collapsed: boolean;
  active?: boolean;
}) {
  const Icon = item.icon;
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant={active ? "secondary" : "ghost"} onClick={item.action} className={cn("w-full rounded-xl transition-all", active && "bg-sidebar-accent shadow-sm ring-1 ring-border")} aria-label={item.label}>
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
        "group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-border" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-violet-600" />}
      <Icon className={cn("size-4 shrink-0", active && "text-violet-600")} />
      <span className="truncate font-medium">{item.label}</span>
      {item.badge && <Badge variant="secondary" className="ml-auto h-4 rounded-full px-1.5 text-[10px]">{item.badge}</Badge>}
    </button>
  );
}

function RecentList({ workspaces, onPick }: { workspaces: Workspace[]; onPick: (ws: Workspace) => void }) {
  if (workspaces.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {workspaces.slice(0, 5).map((ws) => (
        <button key={ws.id} onClick={() => onPick(ws)} className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/50">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted group-hover:bg-card">
            <Folder className="size-3 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{ws.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{ws.template}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
