"use client";

import * as React from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useChatStore } from "@/stores/chat-store";
import { api } from "@/lib/api";
import { buildFileTree } from "@/lib/files";
import { db } from "@/lib/db";

// Loads the selected workspace's files into the workspace store and ensures a
// chat exists. Replaces the per-component React Query fetching so opening a
// workspace never shows a blank/broken page while data loads.

export function useWorkspaceBootstrap() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setFiles = useWorkspaceStore((s) => s.setFiles);
  const setTree = useWorkspaceStore((s) => s.setTree);
  const setChatId = useChatStore((s) => s.setChatId);
  const setMessages = useChatStore((s) => s.setMessages);
  const chatId = useChatStore((s) => s.chatId);

  React.useEffect(() => {
    if (!wsId) return;
    let cancelled = false;

    (async () => {
      try {
        const [filesRes, chatsRes] = await Promise.all([
          api.listFiles(wsId),
          api.listChats(wsId),
        ]);
        if (cancelled) return;
        setFiles(filesRes.files);
        setTree(filesRes.tree);

        // Ensure a chat is selected
        const currentChatId = useChatStore.getState().chatId;
        if (currentChatId) {
          const belongs = chatsRes.chats.some((c) => c.id === currentChatId);
          if (belongs) return;
        }
        if (chatsRes.chats.length > 0) {
          const first = chatsRes.chats[0];
          setChatId(first.id);
          const chat = await api.getChat(first.id);
          if (cancelled) return;
          setMessages(chat.messages);
        } else {
          const c = await api.createChat(wsId, { title: "New Chat" });
          if (cancelled) return;
          setChatId(c.chat.id);
          setMessages([]);
        }
      } catch (e) {
        console.error("Failed to load workspace:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally re-run only when wsId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  // When chatId changes, load that chat's messages.
  React.useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getChat(chatId);
        if (!cancelled) setMessages(res.messages);
      } catch (e) {
        console.error("Failed to load chat:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, setMessages]);
}

// Keeps the workspace store's file map in sync after a successful save /
// agent edit by re-reading from localStorage. Useful after external updates.
export async function refreshWorkspaceFiles() {
  const wsId = useWorkspaceStore.getState().currentWorkspaceId;
  if (!wsId) return;
  const rows = await db.file.findMany({
    where: { workspaceId: wsId },
    orderBy: { path: "asc" },
  });
  const files = rows.map((f) => ({
    path: f.path as string,
    content: f.content as string,
    isBinary: Boolean(f.isBinary),
  }));
  useWorkspaceStore.getState().setFiles(files);
  useWorkspaceStore.getState().setTree(buildFileTree(files.map((f) => f.path)));
}
