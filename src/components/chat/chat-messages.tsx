"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUIStore } from "@/stores/ui-store";
import type { Message, MessageSegment } from "@/lib/types";
import { ThinkingPanel } from "./thinking-panel";
import { ToolCard } from "./tool-card";
import { MarkdownContent, ErrorCard } from "./markdown";
import { Button } from "@/components/ui/button";

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);

  function scrollToBottom(smooth = false) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  React.useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [messages, atBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < 80);
  }

  if (messages.length === 0) {
    return <EmptyChat />;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
          {messages.map((m) => (
            <MessageItem key={m.id} message={m} streaming={isStreaming} />
          ))}
          {isStreaming && <div className="h-1 w-1 animate-pulse-soft rounded-full bg-accent-strong" />}
        </div>
      </div>
      {!atBottom && (
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            setAtBottom(true);
            scrollToBottom(true);
          }}
          className="absolute bottom-3 left-1/2 size-7 -translate-x-1/2 rounded-full shadow-md"
          aria-label="Jump to latest"
        >
          <ArrowDown className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function MessageItem({ message, streaming }: { message: Message; streaming: boolean }) {
  const openFile = useWorkspaceStore((s) => s.openTab);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);

  if (message.role === "user") {
    // Find the content segment(s)
    const content = message.segments
      .filter((s): s is Extract<MessageSegment, { type: "content" }> => s.type === "content")
      .map((s) => s.content)
      .join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {message.segments.map((seg, i) => {
        if (seg.type === "thinking") {
          return (
            <ThinkingPanel
              key={i}
              content={seg.content}
              streaming={streaming && i === message.segments.length - 1}
            />
          );
        }
        if (seg.type === "content") {
          return (
            <div key={i} className="animate-fade-in">
              <MarkdownContent
                content={seg.content}
                onFileClick={(path) => {
                  setActiveFile(path);
                  openFile(path);
                }}
              />
            </div>
          );
        }
        if (seg.type === "tool_call") {
          return (
            <ToolCard
              key={seg.callId ?? i}
              seg={seg}
              onOpenFile={(path) => {
                setActiveFile(path);
                openFile(path);
              }}
              onOpenConsole={() => setConsoleOpen(true)}
            />
          );
        }
        if (seg.type === "error") {
          return <ErrorCard key={i} content={seg.content} />;
        }
        return null;
      })}
      {message.segments.length === 0 && streaming && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse-soft rounded-full bg-accent-strong" />
          Thinking…
        </div>
      )}
    </div>
  );
}

function EmptyChat() {
  const suggestions = [
    "Create landing page",
    "Fix mobile layout",
    "Add dark mode",
  ];
  const setPrompt = useSetExternalPrompt();

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent-strong/10 text-accent-strong">
        ✦
      </div>
      <h2 className="text-lg font-semibold">What should we build?</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Describe a feature or change and the AI will edit your files. You can iterate in the chat.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((s) => (
          <Button
            key={s}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPrompt(s)}
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}

// Lightweight external prompt bridge for the empty-state suggestion buttons
function useSetExternalPrompt() {
  return React.useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: text }));
  }, []);
}
