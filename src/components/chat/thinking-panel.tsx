"use client";

import * as React from "react";
import { Brain, ChevronRight, ChevronDown, Sparkles, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThinkingPanel({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const [open, setOpen] = React.useState(streaming);

  React.useEffect(() => {
    if (streaming) setOpen(true);
    else if (content.trim()) {
      const t = setTimeout(() => setOpen(false), 600);
      return () => clearTimeout(t);
    }
  }, [streaming, content]);

  if (!content.trim() && !streaming) return null;

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border bg-gradient-to-br from-violet-500/[0.03] to-blue-500/[0.03] transition-all",
        streaming && "border-violet-500/20 shadow-sm"
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <div
          className={cn(
            "flex size-7 items-center justify-center rounded-lg border transition-colors",
            streaming ? "bg-violet-500/10 border-violet-500/20 text-violet-600" : "bg-muted border-border text-muted-foreground"
          )}
        >
          <Brain className={cn("size-4", streaming && "animate-pulse")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium">{streaming ? "Thinking…" : "Thought process"}</span>
            {streaming && (
              <div className="flex gap-0.5">
                <span className="typing-dot size-1 rounded-full bg-violet-500" />
                <span className="typing-dot size-1 rounded-full bg-violet-500" />
                <span className="typing-dot size-1 rounded-full bg-violet-500" />
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">{content.length} chars • {streaming ? "live" : "collapsed"}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {streaming && <Sparkles className="size-3.5 animate-pulse-soft text-violet-500" />}
          <div className="rounded-md p-1 hover:bg-muted">
            {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          </div>
        </div>
      </button>
      {open && (
        <div className="animate-fade-in border-t bg-card/50 px-3.5 py-3">
          <div className="flex gap-2">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{content || "…"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
