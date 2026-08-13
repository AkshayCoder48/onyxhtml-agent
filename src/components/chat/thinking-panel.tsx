"use client";

import * as React from "react";
import { Brain, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThinkingPanel({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const [open, setOpen] = React.useState(streaming);

  // Auto-collapse when streaming ends; auto-expand when streaming starts.
  React.useEffect(() => {
    if (streaming) setOpen(true);
    else if (content.trim()) {
      // Collapse after a short delay
      const t = setTimeout(() => setOpen(false), 400);
      return () => clearTimeout(t);
    }
  }, [streaming, content]);

  if (!content.trim() && !streaming) return null;

  return (
    <div className="my-1.5 rounded-lg border bg-muted/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground"
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <Brain className={cn("size-3.5", streaming && "animate-pulse-soft text-accent-strong")} />
        {streaming ? "Thinking…" : "Thought process"}
        <span className="ml-auto text-[10px] text-muted-foreground/70">
          {content.length} chars
        </span>
      </button>
      {open && (
        <div className="border-t px-3 py-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {content || "…"}
        </div>
      )}
    </div>
  );
}
