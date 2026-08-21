"use client";

import * as React from "react";
import { Search, MessageSquare, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/chat-store";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { Chat } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

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
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card/30 px-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
          <Search className="size-4 text-muted-foreground" />
        </div>
        <span className="text-xs font-semibold">Search</span>
        {data && <Badge variant="secondary" className="ml-auto h-5 rounded-full text-[10px]">{data.length}</Badge>}
      </div>
      <div className="border-b bg-card/20 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages…" className="h-9 rounded-full pl-9 text-sm" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-2">
        {q.trim() === "" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Search className="size-6 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">Search chats</div>
            <div className="text-xs text-muted-foreground">Type to search across all conversations</div>
          </div>
        ) : isFetching ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="text-sm">No results for “{q}”</div>
            <div className="text-xs text-muted-foreground">Try different keywords</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.map((c) => (
              <button key={c.id} onClick={() => setChatId(c.id)} className="flex w-full items-start gap-2.5 rounded-xl border bg-card p-3 text-left transition-all hover:shadow-sm hover:border-violet-500/20">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <MessageSquare className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{c.title || "Untitled chat"}</div>
                  {c.lastMessage && <div className="mt-1 truncate text-[11px] text-muted-foreground">{c.lastMessage}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
