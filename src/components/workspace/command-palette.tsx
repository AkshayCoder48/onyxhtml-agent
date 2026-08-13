"use client";

import * as React from "react";
import {
  FilePlus2,
  FolderPlus,
  Save,
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
  const setPreviewMode = useWorkspaceStore((s) => s.setPreviewMode);
  const bumpPreview = useWorkspaceStore((s) => s.bumpPreview);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const files = useWorkspaceStore((s) => s.files);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setChatId = useChatStore((s) => s.setChatId);
  const markSaved = useWorkspaceStore((s) => s.markSaved);
  const queryClient = useQueryClient();
  const providers = useProviderStore((s) => s.providers);
  const usable = providers.some(isProviderUsable);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => (await api.listWorkspaces()).workspaces,
    enabled: open,
  });

  async function saveActive() {
    const id = wsId;
    const path = useWorkspaceStore.getState().activeFile;
    const entry = path ? files[path] : null;
    if (!id || !path || !entry) return;
    try {
      await api.putFile(id, path, entry.content);
      markSaved(path);
      toast.success("Saved", { description: path });
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

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
                onSelect={() => {
                  close();
                  setQuickFileOpen(true);
                }}
              >
                <Search className="size-4" /> Search files…
                <span className="ml-auto text-xs opacity-50">⌘P</span>
              </CommandItem>
              <CommandItem onSelect={() => { close(); toast.info("Use the Files panel to create new files."); }}>
                <FilePlus2 className="size-4" /> New file
              </CommandItem>
              <CommandItem onSelect={() => { close(); toast.info("Use the Files panel to create new folders."); }}>
                <FolderPlus className="size-4" /> New folder
              </CommandItem>
              <CommandItem onSelect={() => { void saveActive(); close(); }}>
                <Save className="size-4" /> Save file
                <span className="ml-auto text-xs opacity-50">⌘S</span>
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Workspace">
              <CommandItem onSelect={() => { void newWorkspace(); close(); }}>
                <Plus className="size-4" /> New workspace
              </CommandItem>
              <CommandItem onSelect={() => { void downloadZip(); close(); }}>
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
                onSelect={() => {
                  setPreviewMode("preview");
                  close();
                }}
              >
                <Eye className="size-4" /> Open preview
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  bumpPreview();
                  close();
                  toast.success("Preview reloaded");
                }}
              >
                <RefreshCw className="size-4" /> Reload preview
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setConsoleOpen(true);
                  close();
                }}
              >
                <Terminal className="size-4" /> Open console
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Chat">
              <CommandItem onSelect={() => { void newChat(); close(); }}>
                <MessageSquarePlus className="size-4" /> New chat
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="View">
              <CommandItem
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
