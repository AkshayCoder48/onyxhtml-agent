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
  Layers,
  Zap,
  Globe,
  Code2,
  Palette,
  Wand2,
  Folder,
  Star,
  ExternalLink,
  Plus,
  Search,
  Command,
  Bot,
  Cpu,
  Hash,
} from "lucide-react";
import { api } from "@/lib/api";
import { TEMPLATES } from "@/lib/templates";
import type { Workspace } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  const [searchQuery, setSearchQuery] = React.useState("");

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
      try {
        const chat = await api.createChat(data.workspace.id, { title: "New Chat" });
        setChatId(chat.chat.id);
      } catch {}
      if (vars.name && prompt.trim()) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("home:send", { detail: prompt.trim() }));
        }, 100);
        setPrompt("");
      }
      toast.success("Workspace created", { description: data.workspace.name });
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

  const filteredWorkspaces = React.useMemo(() => {
    if (!recentQuery.data) return [];
    if (!searchQuery) return recentQuery.data;
    return recentQuery.data.filter((ws) => ws.name.toLowerCase().includes(searchQuery.toLowerCase()) || ws.template.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [recentQuery.data, searchQuery]);

  const suggestions = [
    { icon: Globe, text: "Landing page for a coffee shop", color: "text-emerald-600" },
    { icon: Layers, text: "Portfolio with dark mode", color: "text-violet-600" },
    { icon: Palette, text: "Dashboard with charts", color: "text-blue-600" },
    { icon: Code2, text: "Blog with markdown", color: "text-orange-600" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow">
            <Sparkles className="size-4" />
          </div>
          <span className="text-sm font-bold tracking-tight">Onyx HTML</span>
          <Badge variant="secondary" className="h-5 rounded-full text-[10px]">
            BETA
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 rounded-full" onClick={() => openSettings("providers")}>
            <Settings className="size-4" /> AI Settings
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Hero */}
        <div className="mb-2 flex items-center gap-2 rounded-full border bg-card px-3 py-1 shadow-sm">
          <div className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">AI-Powered • OpenAI Compatible</span>
        </div>

        <h1 className="mt-6 text-center text-4xl font-bold tracking-tight sm:text-5xl">
          What do you want to{" "}
          <span className="bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-600 bg-clip-text text-transparent">build?</span>
        </h1>
        <p className="mt-4 max-w-xl text-center text-sm leading-relaxed text-muted-foreground text-balance">
          Describe an idea and the AI will draft the HTML, CSS and JavaScript for you. Then iterate together in the editor with live preview and browser testing.
        </p>

        {/* Prompt box */}
        <div className="mt-8 w-full max-w-2xl">
          <div className="group relative rounded-[20px] border bg-card p-2 shadow-lg transition-all hover:shadow-xl focus-within:shadow-xl focus-within:ring-1 focus-within:ring-violet-500/20">
            <div className="absolute inset-0 rounded-[20px] bg-gradient-to-br from-violet-500/5 via-transparent to-blue-500/5 opacity-0 transition-opacity group-focus-within:opacity-100" />
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. A landing page for a coffee shop with a hero image and a menu section…"
              className="relative min-h-[120px] resize-none border-0 bg-transparent px-4 py-3 text-[15px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
            />
            <div className="relative flex items-center justify-between gap-2 px-2 pb-1">
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openSettings("providers")} className="h-8 gap-1.5 rounded-full text-xs text-muted-foreground">
                  <Bot className="size-4" /> Configure AI
                </Button>
                <div className="hidden h-4 w-px bg-border sm:block" />
                <span className="hidden text-[11px] text-muted-foreground sm:inline">⌘+Enter to send</span>
              </div>
              <Button onClick={handleSendPrompt} disabled={!prompt.trim() || createWs.isPending} className="gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 shadow-md hover:from-violet-700 hover:to-blue-700">
                {createWs.isPending ? (
                  <>
                    <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Creating…
                  </>
                ) : (
                  <>
                    Send <ArrowUp className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Suggestions */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {suggestions.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.text}
                  onClick={() => setPrompt(s.text)}
                  className="group flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs shadow-sm transition-all hover:shadow-md hover:border-violet-500/20"
                >
                  <Icon className={cn("size-3.5", s.color)} />
                  <span className="font-medium">{s.text}</span>
                  <ArrowRight className="size-3 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplatePickerOpen(true)} className="gap-1.5 rounded-full">
              <FilePlus2 className="size-4" /> Blank Workspace
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRecentOpen(true)} className="gap-1.5 rounded-full">
              <Clock className="size-4" /> Recent Workspaces
            </Button>
          </div>
        </div>

        {/* Recent workspaces */}
        {recentQuery.data && recentQuery.data.length > 0 && (
          <div className="mt-16 w-full max-w-4xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="size-4 text-muted-foreground" /> Recent workspaces
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="h-8 w-[160px] rounded-full pl-8 text-xs" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredWorkspaces.slice(0, 6).map((ws) => (
                <Card key={ws.id} className="group cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all hover:shadow-lg hover:border-violet-500/20 hover:-translate-y-0.5" onClick={() => setWorkspace(ws)}>
                  <CardContent className="p-0">
                    <div className="h-1 w-full bg-gradient-to-r from-violet-600 to-blue-600 opacity-60 group-hover:opacity-100 transition-opacity" />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex size-7 items-center justify-center rounded-lg bg-muted group-hover:bg-violet-500/10 transition-colors">
                              <Folder className="size-3.5 text-muted-foreground group-hover:text-violet-600" />
                            </div>
                            <span className="truncate text-sm font-semibold">{ws.name}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            <Badge variant="outline" className="h-5 rounded-full text-[10px]">
                              {ws.template}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">{timeAgo(ws.updatedAt)}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Hash className="size-3" />
                            <span className="font-mono">{ws.id.slice(0, 8)}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWs.mutate(ws.id);
                            toast.success("Workspace deleted");
                          }}
                          className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          aria-label="Delete workspace"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Features */}
        <div className="mt-16 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: Code2, title: "Live Code Editor", desc: "Monaco-like editing with autocomplete, linting, and AI co-editing" },
            { icon: Globe, title: "Instant Preview", desc: "Real-time preview with device emulation and console" },
            { icon: Zap, title: "AI Agent", desc: "OpenAI-compatible, streams tool calls, edits files, tests UI" },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl border bg-card p-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-muted">
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                <div className="mt-3 text-sm font-semibold">{f.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      <TemplatePicker open={templatePickerOpen} onOpenChange={setTemplatePickerOpen} onPick={(key, name) => { setTemplatePickerOpen(false); createWs.mutate({ name, template: key }); }} />

      <RecentDialog open={recentOpen} onOpenChange={setRecentOpen} workspaces={recentQuery.data ?? []} onOpen={(ws) => { setRecentOpen(false); setWorkspace(ws); }} onDelete={(id) => { deleteWs.mutate(id); toast.success("Workspace deleted"); }} />
    </div>
  );
}

function TemplatePicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (key: keyof typeof TEMPLATES, name: string) => void }) {
  const [name, setName] = React.useState("");
  React.useEffect(() => { if (open) setName(""); }, [open]);
  function pick(key: keyof typeof TEMPLATES) { onPick(key, name.trim()); }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-5" /> Choose a template
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input id="workspace-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="My awesome project" className="h-10 rounded-xl" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pick("blank"); } }} />
            <p className="text-xs text-muted-foreground">Leave empty to use &ldquo;Untitled workspace&rdquo;.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.values(TEMPLATES).map((t) => (
              <button key={t.key} onClick={() => pick(t.key)} className="group flex flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left transition-all hover:shadow-md hover:border-violet-500/20 hover:-translate-y-0.5">
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-semibold">{t.name}</span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <span className="text-xs text-muted-foreground">{t.description}</span>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.files.map((f) => (
                    <span key={f.path} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {f.path}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecentDialog({ open, onOpenChange, workspaces, onOpen, onDelete }: { open: boolean; onOpenChange: (v: boolean) => void; workspaces: Workspace[]; onOpen: (ws: Workspace) => void; onDelete: (id: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5" /> Recent workspaces
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {workspaces.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No workspaces yet. Create one to get started.</div>
          ) : (
            <div className="flex flex-col divide-y">
              {workspaces.map((ws) => (
                <div key={ws.id} className="flex items-center justify-between gap-2 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(ws)}>
                    <div className="truncate text-sm font-medium">{ws.name}</div>
                    <div className="text-xs text-muted-foreground">{ws.template} · {timeAgo(ws.updatedAt)}</div>
                  </button>
                  <button onClick={() => onDelete(ws.id)} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete workspace">
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
