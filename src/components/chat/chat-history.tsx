"use client";

import * as React from "react";
import { History, MoreHorizontal, Pencil, Trash2, MessageSquare, Copy, Clock, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function relativeDay(iso: string): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return "Earlier";
}

function timeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatHistory() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setChatId = useChatStore((s) => s.setChatId);
  const activeChatId = useChatStore((s) => s.chatId);
  const queryClient = useQueryClient();

  const [renameOpen, setRenameOpen] = React.useState<{ id: string; title: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["chats", wsId],
    queryFn: async () => (wsId ? (await api.listChats(wsId)).chats : []),
    enabled: !!wsId,
  });

  const groups = React.useMemo(() => {
    const map: Record<"Today" | "Yesterday" | "Earlier", typeof data> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };
    if (data) {
      for (const c of data) {
        const key = relativeDay(c.updatedAt);
        if (map[key]) map[key].push(c);
      }
    }
    return map;
  }, [data]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this chat?")) return;
    try {
      await api.deleteChat(id);
      await queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
      if (activeChatId === id) setChatId(null);
      toast.success("Chat deleted");
    } catch (e) {
      toast.error("Delete failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function commitRename(id: string, title: string) {
    const v = title.trim();
    if (!v) {
      setRenameOpen(null);
      return;
    }
    try {
      await api.patchChat(id, { title: v });
      await queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
      toast.success("Renamed");
    } catch (e) {
      toast.error("Rename failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setRenameOpen(null);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const { chat } = await api.duplicateChat(id);
      await queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
      toast.success("Chat duplicated", { description: chat.title });
    } catch (e) {
      toast.error("Duplicate failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card/30 px-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
          <History className="size-4 text-muted-foreground" />
        </div>
        <span className="text-xs font-semibold">History</span>
        <Badge variant="secondary" className="ml-auto h-5 rounded-full text-[10px]">
          {data?.length ?? 0}
        </Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <MessageSquare className="size-6 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">No chats yet</div>
            <div className="text-xs text-muted-foreground">Start a new chat to see history</div>
          </div>
        ) : (
          <div className="space-y-4">
            {(["Today", "Yesterday", "Earlier"] as const).map((g) => {
              const items = groups[g];
              if (!items || items.length === 0) return null;
              return (
                <div key={g} className="space-y-1">
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <Clock className="size-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-1">
                    {items.map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          "group flex items-center gap-2 rounded-xl border bg-card p-2.5 text-xs transition-all hover:shadow-sm hover:border-violet-500/20",
                          c.id === activeChatId && "border-violet-500/30 bg-violet-500/5 shadow-sm"
                        )}
                      >
                        <button className="min-w-0 flex-1 text-left" onClick={() => setChatId(c.id)}>
                          <div className="truncate text-[13px] font-medium">{c.title || "Untitled chat"}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{timeShort(c.updatedAt)}</span>
                            {c.messageCount !== undefined && (
                              <>
                                <span>•</span>
                                <span>{c.messageCount} msgs</span>
                              </>
                            )}
                          </div>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7 rounded-full opacity-0 group-hover:opacity-100" aria-label="More">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onSelect={() => setRenameOpen({ id: c.id, title: c.title })} className="gap-2">
                              <Pencil className="size-4" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleDuplicate(c.id)} className="gap-2">
                              <Copy className="size-4" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleDelete(c.id)} className="gap-2 text-destructive focus:text-destructive">
                              <Trash2 className="size-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!renameOpen} onOpenChange={(v) => !v && setRenameOpen(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input autoFocus defaultValue={renameOpen?.title ?? ""} className="rounded-xl" onKeyDown={(e) => { if (e.key === "Enter" && renameOpen) { commitRename(renameOpen.id, (e.target as HTMLInputElement).value); } }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(null)} className="rounded-full">
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={() => {
                if (renameOpen) {
                  const input = document.querySelector("input[autofocus]") as HTMLInputElement | null;
                  commitRename(renameOpen.id, input?.value ?? renameOpen.title);
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
