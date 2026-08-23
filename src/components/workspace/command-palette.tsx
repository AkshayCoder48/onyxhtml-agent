"use client";

import * as React from "react";
import {
  FilePlus2,
  FolderPlus,
  Download,
  Eye,
  RefreshCw,
  MessageSquarePlus,
  Search,
  Terminal,
  Settings,
  PanelLeft,
  Plus,
  Folder,
  SquareCode,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore, isProviderUsable } from "@/stores/provider-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const quickFileOpen = useUIStore((s) => s.quickFileOpen);
  const setQuickFileOpen = useUIStore((s) => s.setQuickFileOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openSettings = useUIStore((s) => s.openSettings);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  const bumpPreview = useWorkspaceStore((s) => s.bumpPreview);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const files = useWorkspaceStore((s) => s.files);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setChatId = useChatStore((s) => s.setChatId);
  const queryClient = useQueryClient();
  const providers = useProviderStore((s) => s.providers);
  const usable = providers.some(isProviderUsable);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => (await api.listWorkspaces()).workspaces,
    enabled: open,
  });

  async function newWorkspace() {
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
      toast.error("Failed to create workspace", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function newChat() {
    if (!wsId) {
      toast.error("Open a workspace first");
      return;
    }
    try {
      const c = await api.createChat(wsId, { title: "New Chat" });
      setChatId(c.chat.id);
      toast.success("New chat started");
    } catch (e) {
      toast.error("Failed to create chat", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function downloadZip() {
    if (!wsId) return;
    try {
      const blob = await api.downloadWorkspace(wsId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "workspace.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (e) {
      toast.error("Download failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  function runJavaScript() {
    // Defer the prompt until after the palette closes so the prompt dialog
    // isn't visually layered on top of the closing palette.
    setTimeout(() => {
      const code = typeof window !== "undefined" ? window.prompt("Enter JavaScript to run in the preview:") : null;
      if (code && code.trim()) {
        window.dispatchEvent(
          new CustomEvent("preview:run-javascript", { detail: { code } })
        );
        toast.success("JavaScript dispatched to preview");
      }
    }, 0);
  }

  const close = () => {
    setOpen(false);
    setQuickFileOpen(false);
  };

  return (
    <CommandDialog
      open={open || quickFileOpen}
      onOpenChange={(v) => {
        if (!v) close();
      }}
      title={quickFileOpen ? "Quick file" : "Command palette"}
      description={quickFileOpen ? "Search files to open…" : "Search commands and files…"}
    >
      <CommandInput placeholder={quickFileOpen ? "Search files…" : "Type a command or search…"} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {quickFileOpen ? (
          <CommandGroup heading="Files">
            {Object.keys(files).map((p) => (
              <CommandItem
                key={p}
                value={`file ${p}`}
                onSelect={() => {
                  setActiveFile(p);
                  openTab(p);
                  close();
                }}
              >
                <Folder className="size-4" />
                <span className="font-mono text-xs">{p}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <>
            <CommandGroup heading="File">
              <CommandItem
                value="search files go to file"
                onSelect={() => {
                  close();
                  setQuickFileOpen(true);
                }}
              >
                <Search className="size-4" /> Search files…
                <span className="ml-auto text-xs opacity-50">⌘P</span>
              </CommandItem>
              <CommandItem
                value="new file create"
                onSelect={() => {
                  close();
                  window.dispatchEvent(new CustomEvent("files:new-file"));
                }}
              >
                <FilePlus2 className="size-4" /> New file
              </CommandItem>
              <CommandItem
                value="new folder create directory"
                onSelect={() => {
                  close();
                  window.dispatchEvent(new CustomEvent("files:new-folder"));
                }}
              >
                <FolderPlus className="size-4" /> New folder
              </CommandItem>
              <CommandItem
                value="reload preview refresh"
                onSelect={() => {
                  bumpPreview();
                  close();
                  toast.success("Preview reloaded");
                }}
              >
                <RefreshCw className="size-4" /> Reload preview
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Workspace">
              <CommandItem
                value="new workspace"
                onSelect={() => { void newWorkspace(); close(); }}
              >
                <Plus className="size-4" /> New workspace
              </CommandItem>
              <CommandItem
                value="download workspace zip export"
                onSelect={() => { void downloadZip(); close(); }}
              >
                <Download className="size-4" /> Download workspace (ZIP)
              </CommandItem>
            </CommandGroup>

            {workspacesQuery.data && workspacesQuery.data.length > 0 && (
              <CommandGroup heading="Switch workspace">
                {workspacesQuery.data.map((ws) => (
                  <CommandItem
                    key={ws.id}
                    value={`workspace ${ws.name}`}
                    onSelect={() => {
                      setWorkspace(ws);
                      close();
                    }}
                  >
                    <Folder className="size-4" /> {ws.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading="Preview">
              <CommandItem
                value="open preview"
                onSelect={() => {
                  bumpPreview();
                  close();
                }}
              >
                <Eye className="size-4" /> Focus preview
              </CommandItem>
              <CommandItem
                value="reload preview refresh"
                onSelect={() => {
                  bumpPreview();
                  close();
                  toast.success("Preview reloaded");
                }}
              >
                <RefreshCw className="size-4" /> Reload preview
              </CommandItem>
              <CommandItem
                value="open console"
                onSelect={() => {
                  setConsoleOpen(true);
                  close();
                }}
              >
                <Terminal className="size-4" /> Open console
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Developer">
              <CommandItem
                value="run javascript in preview eval"
                onSelect={() => {
                  close();
                  runJavaScript();
                }}
              >
                <SquareCode className="size-4" /> Run JavaScript in preview
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Chat">
              <CommandItem
                value="new chat"
                onSelect={() => { void newChat(); close(); }}
              >
                <MessageSquarePlus className="size-4" /> New chat
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="View">
              <CommandItem
                value="toggle sidebar"
                onSelect={() => {
                  toggleSidebar();
                  close();
                }}
              >
                <PanelLeft className="size-4" /> Toggle sidebar
                <span className="ml-auto text-xs opacity-50">⌘B</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="System">
              <CommandItem
                value="open settings"
                onSelect={() => {
                  openSettings("providers");
                  close();
                }}
              >
                <Settings className="size-4" /> Open settings
                {!usable && <span className="ml-auto text-xs text-amber-500">AI not configured</span>}
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
