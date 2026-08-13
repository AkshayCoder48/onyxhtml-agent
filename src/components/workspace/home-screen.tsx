"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  FilePlus2,
  Sparkles,
  Clock,
  Trash2,
  ArrowUp,
  Settings,
} from "lucide-react";
import { api } from "@/lib/api";
import { TEMPLATES } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUIStore } from "@/stores/ui-store";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function HomeScreen() {
  const queryClient = useQueryClient();
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setChatId = useChatStore((s) => s.setChatId);
  const openSettings = useUIStore((s) => s.openSettings);
  const [prompt, setPrompt] = React.useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = React.useState(false);
  const [recentOpen, setRecentOpen] = React.useState(false);

  const recentQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => (await api.listWorkspaces()).workspaces,
  });

  const createWs = useMutation({
    mutationFn: async (vars: { name?: string; template: string }) =>
      api.createWorkspace({
        name: vars.name?.trim() || "Untitled workspace",
        template: vars.template,
      }),
    onSuccess: async (data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setWorkspace(data.workspace);
      // create a default chat for the workspace
      try {
        const chat = await api.createChat(data.workspace.id, { title: "New Chat" });
        setChatId(chat.chat.id);
      } catch {
        // ignore
      }
      // If the user typed a prompt, send it as the first message.
      if (vars.name && prompt.trim()) {
        // Defer to next tick so the chat panel mounts and subscribes.
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("home:send", { detail: prompt.trim() })
          );
        }, 100);
        setPrompt("");
      }
      toast.success("Workspace created");
    },
    onError: (e: Error) => toast.error("Failed to create workspace", { description: e.message }),
  });

  const deleteWs = useMutation({
    mutationFn: async (id: string) => api.deleteWorkspace(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  function handleSendPrompt() {
    if (!prompt.trim()) return;
    createWs.mutate({ name: prompt.trim().slice(0, 60), template: "blank" });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSendPrompt();
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Sparkles className="size-3.5" />
          AI HTML Workspace
        </div>
        <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          What do you want to build?
        </h1>
        <p className="mt-3 max-w-xl text-center text-sm text-muted-foreground">
          Describe an idea and the AI will draft the HTML, CSS and JavaScript for you. Then iterate together in the editor.
        </p>

        <div className="mt-8 w-full max-w-2xl">
          <div className="rounded-2xl border bg-card p-2 shadow-sm">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. A landing page for a coffee shop with a hero image and a menu section…"
              className="min-h-[120px] resize-none border-0 bg-transparent px-3 py-2 text-base shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openSettings("providers")}
                  className="text-muted-foreground"
                >
                  <Settings className="size-4" /> AI settings
                </Button>
              </div>
              <Button
                onClick={handleSendPrompt}
                disabled={!prompt.trim() || createWs.isPending}
                className="gap-1.5 rounded-full"
              >
                {createWs.isPending ? "Creating…" : "Send"}
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplatePickerOpen(true)} className="gap-1.5">
              <FilePlus2 className="size-4" /> Blank Workspace
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecentOpen(true)}
              className="gap-1.5"
            >
              <Clock className="size-4" /> Recent Workspaces
            </Button>
          </div>
        </div>

        {recentQuery.data && recentQuery.data.length > 0 && (
          <div className="mt-12 w-full max-w-4xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Recent workspaces</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentQuery.data.slice(0, 6).map((ws) => (
                <Card
                  key={ws.id}
                  className="group cursor-pointer transition-colors hover:bg-accent/40"
                  onClick={() => setWorkspace(ws)}
                >
                  <CardContent className="flex items-start justify-between gap-2 p-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{ws.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {ws.template} · {timeAgo(ws.updatedAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWs.mutate(ws.id);
                        toast.success("Workspace deleted");
                      }}
                      className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete workspace"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <TemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onPick={(key) => {
          setTemplatePickerOpen(false);
          createWs.mutate({ template: key });
        }}
      />

      <RecentDialog
        open={recentOpen}
        onOpenChange={setRecentOpen}
        workspaces={recentQuery.data ?? []}
        onOpen={(ws) => {
          setRecentOpen(false);
          setWorkspace(ws);
        }}
        onDelete={(id) => {
          deleteWs.mutate(id);
          toast.success("Workspace deleted");
        }}
      />
    </div>
  );
}

function TemplatePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (key: keyof typeof TEMPLATES) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a template</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.values(TEMPLATES).map((t) => (
            <button
              key={t.key}
              onClick={() => onPick(t.key)}
              className={cn(
                "group flex flex-col items-start gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-medium">{t.name}</span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <span className="text-xs text-muted-foreground">{t.description}</span>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.files.map((f) => (
                  <span
                    key={f.path}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {f.path}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecentDialog({
  open,
  onOpenChange,
  workspaces,
  onOpen,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaces: { id: string; name: string; template: string; updatedAt: string }[];
  onOpen: (ws: { id: string; name: string; template: string; updatedAt: string }) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Recent workspaces</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {workspaces.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No workspaces yet. Create one to get started.
            </div>
          ) : (
            <div className="flex flex-col">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="flex items-center justify-between gap-2 border-b py-2.5 last:border-0"
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpen(ws)}
                  >
                    <div className="truncate text-sm font-medium">{ws.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ws.template} · {timeAgo(ws.updatedAt)}
                    </div>
                  </button>
                  <button
                    onClick={() => onDelete(ws.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete workspace"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
