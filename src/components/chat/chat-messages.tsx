"use client";

import * as React from "react";
import { ArrowDown, RefreshCw, Sparkles, MessageSquare, Zap, Bot, User, Wand2, Lightbulb, Palette } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUIStore } from "@/stores/ui-store";
import type { Message, MessageSegment } from "@/lib/types";
import { ThinkingPanel } from "./thinking-panel";
import { ToolCard } from "./tool-card";
import { MarkdownContent, ErrorCard } from "./markdown";
import { AgentStatusInline } from "./agent-status-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function triggerRegenerate() {
  window.dispatchEvent(new CustomEvent("chat:regenerate"));
}

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottomRef = React.useRef(true);
  const [atBottom, setAtBottom] = React.useState(true);
  const programmaticScrollRef = React.useRef(false);

  function scrollToBottom(smooth = false) {
    const el = scrollRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      });
    } else {
      setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 60);
    }
  }

  const messagesLen = messages.length;
  const lastMsgSegmentsLen = messages[messages.length - 1]?.segments.length ?? 0;
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
        setTimeout(() => {
          programmaticScrollRef.current = false;
        }, 60);
      }
    }
  }, [messagesLen, lastMsgSegmentsLen, lastContentLen]);

  function onScroll() {
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

  const lastMsg = messages[messages.length - 1];
  const showRegenerate = !isStreaming && lastMsg?.role === "assistant";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
          {messages.map((m, idx) => (
            <MessageItem key={m.id} message={m} streaming={isStreaming && idx === messages.length - 1} />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 py-2">
              <div className="flex size-6 items-center justify-center rounded-full bg-violet-500/10">
                <div className="size-2 animate-pulse rounded-full bg-violet-500" />
              </div>
              <div className="flex gap-1">
                <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
                <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
                <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
          {showRegenerate && (
            <div className="flex justify-start">
              <Button variant="ghost" size="sm" onClick={triggerRegenerate} className="h-8 gap-1.5 rounded-full border bg-card text-xs shadow-sm hover:bg-accent">
                <RefreshCw className="size-3.5" /> Regenerate
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
          className="absolute bottom-4 left-1/2 size-8 -translate-x-1/2 rounded-full border bg-card shadow-lg backdrop-blur"
          aria-label="Jump to latest"
        >
          <ArrowDown className="size-4" />
        </Button>
      )}
    </div>
  );
}

const MessageItem = React.memo(function MessageItem({ message, streaming }: { message: Message; streaming: boolean }) {
  const openFile = useWorkspaceStore((s) => s.openTab);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);

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
    const content = message.segments
      .filter((s): s is Extract<MessageSegment, { type: "content" }> => s.type === "content")
      .map((s) => s.content)
      .join("");
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[85%] rounded-[20px] rounded-br-[8px] bg-gradient-to-br from-violet-600 to-blue-600 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-md">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="size-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Group tool calls for better visual hierarchy
  const segments = message.segments;
  const groupedSegments: (typeof segments[number] | { type: "tool_group"; tools: Extract<MessageSegment, { type: "tool_call" }>[] })[] = [];
  let currentToolGroup: Extract<MessageSegment, { type: "tool_call" }>[] = [];

  for (const seg of segments) {
    if (seg.type === "tool_call") {
      currentToolGroup.push(seg);
    } else {
      if (currentToolGroup.length > 0) {
        if (currentToolGroup.length === 1) {
          groupedSegments.push(currentToolGroup[0]);
        } else {
          groupedSegments.push({ type: "tool_group", tools: [...currentToolGroup] });
        }
        currentToolGroup = [];
      }
      groupedSegments.push(seg);
    }
  }
  if (currentToolGroup.length > 0) {
    if (currentToolGroup.length === 1) {
      groupedSegments.push(currentToolGroup[0]);
    } else {
      groupedSegments.push({ type: "tool_group", tools: [...currentToolGroup] });
    }
  }

  return (
    <div className="flex gap-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/10 to-blue-500/10 ring-1 ring-violet-500/10">
        <Bot className="size-4 text-violet-600" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {groupedSegments.map((seg, i) => {
          if ((seg as any).type === "tool_group") {
            const group = seg as { type: "tool_group"; tools: Extract<MessageSegment, { type: "tool_call" }>[] };
            return (
              <div key={`group-${i}`} className="space-y-2 rounded-xl border bg-muted/20 p-2">
                <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Zap className="size-3" /> {group.tools.length} tools
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {group.tools.map((toolSeg, j) => (
                    <ToolCard key={`${i}-${j}-${toolSeg.callId}`} seg={toolSeg} onOpenFile={handleOpenFile} onOpenConsole={handleOpenConsole} />
                  ))}
                </div>
              </div>
            );
          }

          const segKey = `${i}-${seg.type === "tool_call" ? (seg as any).callId : ""}`;
          if (seg.type === "thinking") {
            return <ThinkingPanel key={segKey} content={seg.content} streaming={streaming && i === groupedSegments.length - 1} />;
          }
          if (seg.type === "content") {
            return (
              <div key={segKey} className="animate-fade-in">
                <MarkdownContent content={seg.content} onFileClick={handleOpenFile} />
              </div>
            );
          }
          if (seg.type === "tool_call") {
            return <ToolCard key={segKey} seg={seg} onOpenFile={handleOpenFile} onOpenConsole={handleOpenConsole} />;
          }
          if (seg.type === "error") {
            return <ErrorCard key={segKey} content={seg.content} onRetry={triggerRegenerate} />;
          }
          return null;
        })}
        {message.segments.length === 0 && streaming && <AgentStatusInline />}
      </div>
    </div>
  );
});

function EmptyChat() {
  const suggestions = [
    { icon: Wand2, title: "Create landing page", desc: "Modern hero, features, pricing", prompt: "Create a modern landing page with hero section, features grid, and pricing" },
    { icon: Palette, title: "Fix mobile layout", desc: "Responsive improvements", prompt: "Make the current page fully responsive for mobile devices" },
    { icon: Sparkles, title: "Add dark mode", desc: "Theme toggle & styles", prompt: "Add a dark mode toggle with smooth transitions" },
    { icon: Lightbulb, title: "Improve design", desc: "Polish & animations", prompt: "Improve the design with better spacing, animations, and modern styling" },
  ];
  const setPrompt = useSetExternalPrompt();

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-500/20">
        <Sparkles className="size-7" />
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight">What should we build?</h2>
      <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted-foreground text-balance">Describe a feature or change and the AI will edit your files. You can iterate in the chat with live preview.</p>

      <div className="mt-8 grid w-full max-w-[480px] grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.title} onClick={() => setPrompt(s.prompt)} className="group flex items-start gap-3 rounded-2xl border bg-card p-3.5 text-left transition-all hover:shadow-md hover:border-violet-500/20 hover:-translate-y-0.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:bg-violet-500/10 transition-colors">
                <Icon className="size-4 text-muted-foreground group-hover:text-violet-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{s.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{s.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-1.5">
        <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[11px] text-muted-foreground">AI ready • OpenAI-compatible • Streaming tools</span>
      </div>
    </div>
  );
}

function useSetExternalPrompt() {
  return React.useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: text }));
  }, []);
}
