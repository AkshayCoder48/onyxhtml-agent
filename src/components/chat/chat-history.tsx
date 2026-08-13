"use client";

import * as React from "react";
import { History, MoreHorizontal, Pencil, Trash2, MessageSquare } from "lucide-react";
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
        map[relativeDay(c.updatedAt)].push(c);
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
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : undefined,
      });
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
      toast.error("Rename failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRenameOpen(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5">
        <History className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Chat history
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="space-y-1.5 px-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <MessageSquare className="size-5 text-muted-foreground/50" />
            <div className="text-xs text-muted-foreground">No chats yet.</div>
          </div>
        ) : (
          <div className="py-1">
            {(["Today", "Yesterday", "Earlier"] as const).map((g) => {
              const items = groups[g];
              if (!items || items.length === 0) return null;
              return (
                <div key={g} className="mb-2">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g}
                  </div>
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent",
                        c.id === activeChatId && "bg-accent"
                      )}
                    >
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setChatId(c.id)}
                      >
                        <div className="truncate text-sm">{c.title || "Untitled chat"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {timeShort(c.updatedAt)}
                          {c.messageCount !== undefined ? ` · ${c.messageCount} msgs` : ""}
                        </div>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 opacity-0 group-hover:opacity-100"
                            aria-label="More"
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() =>
                              setRenameOpen({ id: c.id, title: c.title })
                            }
                          >
                            <Pencil className="size-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleDelete(c.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!renameOpen} onOpenChange={(v) => !v && setRenameOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            defaultValue={renameOpen?.title ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameOpen) {
                commitRename(renameOpen.id, (e.target as HTMLInputElement).value);
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameOpen) {
                  const input = document.querySelector(
                    'input[autofocus]'
                  ) as HTMLInputElement | null;
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
