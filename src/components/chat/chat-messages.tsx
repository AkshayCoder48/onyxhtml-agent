"use client";

import * as React from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUIStore } from "@/stores/ui-store";
import type { Message, MessageSegment } from "@/lib/types";
import { ThinkingPanel } from "./thinking-panel";
import { ToolCard } from "./tool-card";
import { MarkdownContent, ErrorCard } from "./markdown";
import { Button } from "@/components/ui/button";

// Dispatch a global event so chat-panel.tsx (or any other consumer) can wire
// it to the `regenerate` function exposed by useChatStream, without us
// needing direct access to the hook here.
function triggerRegenerate() {
  window.dispatchEvent(new CustomEvent("chat:regenerate"));
}

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottomRef = React.useRef(true);
  const [atBottom, setAtBottom] = React.useState(true);
  // Distinguishes programmatic scrolls (from auto-scroll) so the scroll
  // listener can ignore them and avoid an update feedback loop:
  //   messages update → scrollToBottom → scroll event → setAtBottom(false)
  //   → re-render → scrollToBottom skipped → async scroll completes →
  //   setAtBottom(true) → re-render → scrollToBottom → repeat →
  //   "Maximum update depth exceeded"
  const programmaticScrollRef = React.useRef(false);

  function scrollToBottom(smooth = false) {
    const el = scrollRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    // Reset the flag on the next frame so the scroll event from this
    // programmatic scroll is ignored.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      });
    } else {
      setTimeout(() => { programmaticScrollRef.current = false; }, 60);
    }
  }

  // Auto-scroll on new content. We intentionally depend only on primitive
  // counts (number of messages + number of segments in the last message)
  // rather than the `messages` array itself — the array reference changes
  // on every coalesced flush during streaming, which would otherwise fire
  // this effect dozens of times per second and re-trigger the scroll loop.
  const messagesLen = messages.length;
  const lastMsgSegmentsLen =
    messages[messages.length - 1]?.segments.length ?? 0;
  const lastContentLen = React.useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return 0;
    let total = 0;
    for (const seg of last.segments) {
      if (seg.type === "content" || seg.type === "thinking") {
        total += seg.content.length;
      }
    }
    return total;
  }, [messagesLen, lastMsgSegmentsLen, messages]);

  React.useEffect(() => {
    if (!atBottomRef.current) return;
    // Use rAF so the scroll happens before paint (no layout thrash) and
    // is batched with other rAF work.
    if (typeof requestAnimationFrame === "function") {
      const raf = requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (!atBottomRef.current) return;
        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            programmaticScrollRef.current = false;
          });
        });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      const el = scrollRef.current;
      if (el) {
        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
        setTimeout(() => { programmaticScrollRef.current = false; }, 60);
      }
    }
  }, [messagesLen, lastMsgSegmentsLen, lastContentLen]);

  function onScroll() {
    // Ignore scrolls triggered by our own scrollToBottom to break the loop.
    if (programmaticScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const next = distance < 80;
    if (next !== atBottomRef.current) {
      atBottomRef.current = next;
      setAtBottom(next);
    }
  }

  if (messages.length === 0) {
    return <EmptyChat />;
  }

  // Determine whether the LAST message is an assistant message — we render
  // the Regenerate action only for that case, and only while not streaming.
  const lastMsg = messages[messages.length - 1];
  const showRegenerate = !isStreaming && lastMsg?.role === "assistant";

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
          {showRegenerate && (
            <div className="flex justify-start">
              <Button
                variant="ghost"
                size="sm"
                onClick={triggerRegenerate}
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Regenerate last response"
              >
                <RefreshCw className="size-3.5" />
                Regenerate
              </Button>
            </div>
          )}
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

// Memoized MessageItem — only re-renders when its own `message` reference
// changes (or `streaming` changes). This is the KEY performance fix for the
// "stuck on thinking" visual lag: without memo, EVERY MessageItem re-renders
// on every text delta (because the `messages` array reference changes in the
// parent). With memo, only the streaming message re-renders; all other
// messages skip re-rendering entirely, freeing the main thread to paint.
const MessageItem = React.memo(function MessageItem({
  message,
  streaming,
}: {
  message: Message;
  streaming: boolean;
}) {
  const openFile = useWorkspaceStore((s) => s.openTab);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);

  // Stable callbacks so child components (ToolCard, MarkdownContent) don't
  // re-render just because MessageItem re-rendered with a new inline fn.
  const handleOpenFile = React.useCallback(
    (path: string) => {
      setActiveFile(path);
      openFile(path);
    },
    [setActiveFile, openFile]
  );
  const handleOpenConsole = React.useCallback(() => {
    setConsoleOpen(true);
  }, [setConsoleOpen]);

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
        // Use the segment index as part of the key so legacy messages with
        // duplicate callIds (from before the runTag fix) don't collide.
        // New messages use unique `tc_<runTag>_<n>` callIds, but the index
        // keeps the key stable across re-renders within a single message.
        const segKey = `${i}-${seg.type === "tool_call" ? seg.callId : ""}`;
        if (seg.type === "thinking") {
          return (
            <ThinkingPanel
              key={segKey}
              content={seg.content}
              streaming={streaming && i === message.segments.length - 1}
            />
          );
        }
        if (seg.type === "content") {
          return (
            <div key={segKey} className="animate-fade-in">
              <MarkdownContent
                content={seg.content}
                onFileClick={handleOpenFile}
              />
            </div>
          );
        }
        if (seg.type === "tool_call") {
          return (
            <ToolCard
              key={segKey}
              seg={seg}
              onOpenFile={handleOpenFile}
              onOpenConsole={handleOpenConsole}
            />
          );
        }
        if (seg.type === "error") {
          return (
            <ErrorCard
              key={segKey}
              content={seg.content}
              onRetry={triggerRegenerate}
            />
          );
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
});

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
