"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/chat-store";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { Chat } from "@/lib/types";

export function ChatSearch() {
  const [q, setQ] = React.useState("");
  const setChatId = useChatStore((s) => s.setChatId);

  const { data, isFetching } = useQuery({
    queryKey: ["chats-search", q],
    queryFn: async () => {
      if (!q.trim()) return [] as Chat[];
      const r = await api.searchChats(q.trim());
      return r.chats;
    },
    enabled: q.trim().length > 0,
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5">
        <Search className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Search chats
        </span>
      </div>
      <div className="border-b p-2">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search messages…"
          className="h-8 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {q.trim() === "" ? (
          <div className="flex h-full items-center justify-center px-4 py-10 text-center text-xs text-muted-foreground">
            Type to search across all chats.
          </div>
        ) : isFetching ? (
          <div className="space-y-1.5 px-2 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 py-10 text-center text-xs text-muted-foreground">
            No results for “{q}”.
          </div>
        ) : (
          <div className="py-1">
            {data.map((c) => (
              <button
                key={c.id}
                onClick={() => setChatId(c.id)}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-accent"
              >
                <div className="truncate text-sm font-medium">{c.title || "Untitled chat"}</div>
                {c.lastMessage && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {c.lastMessage}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
