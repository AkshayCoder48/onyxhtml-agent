"use client";

import * as React from "react";
import { Sparkles, MoreHorizontal, MessageSquarePlus, Pencil, Trash2, Bot, Cpu, Zap, Activity, Settings } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useProviders } from "@/hooks/use-providers";
import { useProviderStore, isProviderUsable, activeModelLabel } from "@/stores/provider-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChatMessages } from "./chat-messages";
import { AgentStatusBar } from "./agent-status-bar";
import { ChatPromptBox } from "./prompt-box";
import { useChatStream } from "@/hooks/use-chat-stream";
import type { BridgeExecute } from "@/hooks/use-preview-bridge";
import { useUIStore } from "@/stores/ui-store";

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
  const openSettings = useUIStore((s) => s.openSettings);

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");

  useProviders();
  const activeProvider = useProviderStore((s) => s.activeProvider);
  const usable = isProviderUsable(activeProvider);

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
      api
        .createChat(wsId, { title: "New Chat" })
        .then((c) => {
          setChatId(c.chat.id);
          queryClient.invalidateQueries({ queryKey: ["chats", wsId] });
        })
        .catch(() => {});
    }
  }, [wsId, chatId, chatsQuery.data, chatsQuery.isFetching, setChatId, queryClient]);

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
      toast.error("Failed to create chat", { description: e instanceof Error ? e.message : undefined });
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
      toast.error("Rename failed", { description: e instanceof Error ? e.message : undefined });
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
      toast.error("Delete failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ChatHeader
        title="AI Assistant"
        subtitle={usable ? activeModelLabel(activeProvider) : "Not configured"}
        model={activeProvider?.model}
        providerName={activeProvider?.name}
        usable={usable}
        onNewChat={handleNewChat}
        onRename={handleRename}
        onDelete={handleDelete}
        onOpenSettings={() => openSettings("providers")}
      />
      <ChatMessages />
      {isStreaming && (
        <div className="shrink-0 border-t bg-muted/20 px-3 py-2">
          <AgentStatusBar />
        </div>
      )}
      <ChatPromptBox onSend={(t) => void stream.sendMessage(t)} onStop={stream.stop} isStreaming={isStreaming} />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
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
            className="rounded-xl"
          />
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={commitRename}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatHeader({
  title,
  subtitle,
  model,
  providerName,
  usable,
  onNewChat,
  onRename,
  onDelete,
  onOpenSettings,
}: {
  title: string;
  subtitle: string;
  model?: string;
  providerName?: string;
  usable: boolean;
  onNewChat: () => void;
  onRename: () => void;
  onDelete: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card/50 px-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-md">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold">{title}</span>
            <Badge variant={usable ? "default" : "secondary"} className={usable ? "h-4 rounded-full bg-emerald-500 px-1.5 text-[10px] text-white" : "h-4 rounded-full text-[10px]"}>
              <Activity className="mr-1 size-2.5" /> {usable ? "Live" : "Setup"}
            </Badge>
          </div>
          <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            {providerName && <span className="truncate font-medium">{providerName}</span>}
            {model && (
              <>
                <span>•</span>
                <span className="truncate font-mono">{model}</span>
              </>
            )}
            {!usable && <span className="text-amber-600">Configure AI provider</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={onOpenSettings} aria-label="AI settings">
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI settings</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={onNewChat} aria-label="New chat">
                <MessageSquarePlus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="More">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem onSelect={onRename} className="gap-2">
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="gap-2 text-destructive focus:text-destructive">
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
