"use client";

import * as React from "react";
import { Sparkles, MoreHorizontal, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useProviders } from "@/hooks/use-providers";
import { useProviderStore, isProviderUsable, activeModelLabel } from "@/stores/provider-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChatMessages } from "./chat-messages";
import { ChatPromptBox } from "./prompt-box";
import { useChatStream } from "@/hooks/use-chat-stream";
import type { BridgeExecute } from "@/hooks/use-preview-bridge";

export function ChatPanel({
  bridgeExecute,
}: {
  bridgeExecute: BridgeExecute | null;
}) {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const chatId = useChatStore((s) => s.chatId);
  const setChatId = useChatStore((s) => s.setChatId);
  const setMessages = useChatStore((s) => s.setMessages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const queryClient = useQueryClient();

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");

  useProviders();
  const activeProvider = useProviderStore((s) => s.activeProvider);
  const usable = isProviderUsable(activeProvider);

  // Load chats for this workspace; pick the most recent if none is active.
  const chatsQuery = useQuery({
    queryKey: ["chats", wsId],
    queryFn: async () => (wsId ? (await api.listChats(wsId)).chats : []),
    enabled: !!wsId,
  });

  React.useEffect(() => {
    if (!wsId) {
      setChatId(null);
      return;
    }
    if (chatId) return;
    if (chatsQuery.data && chatsQuery.data.length > 0) {
      const latest = chatsQuery.data[0];
      setChatId(latest.id);
    } else if (chatsQuery.data && chatsQuery.data.length === 0 && !chatsQuery.isFetching) {
      // Create a default chat
      api
        .createChat(wsId, { title: "New Chat" })
        .then((c) => {
          setChatId(c.chat.id);
          queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
        })
        .catch(() => {
          // ignore
        });
    }
  }, [wsId, chatId, chatsQuery.data, chatsQuery.isFetching, setChatId, queryClient]);

  // Load messages when chatId changes
  const messagesQuery = useQuery({
    queryKey: ["chat", chatId],
    queryFn: async () => (chatId ? await api.getChat(chatId) : null),
    enabled: !!chatId,
  });

  React.useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data.messages);
    }
  }, [messagesQuery.data, setMessages]);

  // Wire up the chat stream
  const stream = useChatStream({ execute: bridgeExecute ?? (async () => ({ error: "No preview" })) });

  async function handleNewChat() {
    if (!wsId) return;
    try {
      const c = await api.createChat(wsId, { title: "New Chat" });
      setChatId(c.chat.id);
      clearMessages();
      await queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
      toast.success("New chat started");
    } catch (e) {
      toast.error("Failed to create chat", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleRename() {
    if (!chatId) return;
    const chat = chatsQuery.data?.find((c) => c.id === chatId);
    setRenameValue(chat?.title ?? "");
    setRenameOpen(true);
  }

  async function commitRename() {
    if (!chatId) return;
    const v = renameValue.trim();
    if (!v) {
      setRenameOpen(false);
      return;
    }
    try {
      await api.patchChat(chatId, { title: v });
      await queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
      await queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      toast.success("Chat renamed");
    } catch (e) {
      toast.error("Rename failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRenameOpen(false);
    }
  }

  async function handleDelete() {
    if (!chatId) return;
    if (!confirm("Delete this chat? Messages will be lost.")) return;
    try {
      await api.deleteChat(chatId);
      setChatId(null);
      clearMessages();
      await queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
      toast.success("Chat deleted");
    } catch (e) {
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ChatHeader
        title="AI Assistant"
        subtitle={usable ? activeModelLabel(activeProvider) : "Not configured"}
        onNewChat={handleNewChat}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <ChatMessages />
      <ChatPromptBox
        onSend={(t) => void stream.sendMessage(t)}
        onStop={stream.stop}
        isStreaming={isStreaming}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenameOpen(false);
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={commitRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatHeader({
  title,
  subtitle,
  onNewChat,
  onRename,
  onDelete,
}: {
  title: string;
  subtitle: string;
  onNewChat: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background px-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-strong/10 text-accent-strong">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={onNewChat} aria-label="New chat">
                <MessageSquarePlus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="More">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
