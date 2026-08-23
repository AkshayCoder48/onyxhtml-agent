"use client";
import * as React from "react";
import { Brain, ChevronDown, ChevronRight, Zap, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnyxReasoningTreeProps } from "./types";

export function OnyxReasoningTree({ goal, steps, title }: OnyxReasoningTreeProps) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/30">
        <Brain className="size-4 text-violet-600" />
        <span className="flex-1 text-[13px] font-semibold">{title || goal || "Reasoning"}</span>
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t bg-muted/[0.02] p-3">
          {goal && <div className="mb-3 rounded-lg bg-violet-500/10 px-3 py-2 text-[12px] font-medium text-violet-900 dark:text-violet-200">🎯 Goal: {goal}</div>}
          <div className="space-y-2">
            {steps?.map((s, i) => (
              <div key={i} className="flex gap-2 rounded-lg border bg-card p-2.5">
                <div className={cn("mt-0.5 size-5 shrink-0 rounded-full border flex items-center justify-center",
                  s.status === "done" && "bg-emerald-500 border-emerald-500 text-white",
                  s.status === "doing" && "bg-blue-500/10 border-blue-500/20",
                  !s.status && "bg-muted"
                )}>
                  {s.status === "done" ? <Check className="size-3" /> : s.status === "doing" ? <Zap className="size-3 animate-pulse" /> : <Clock className="size-3 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium">{s.title}</div>
                  {s.thought && <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.thought}</div>}
                  {s.tools && <div className="mt-1 flex flex-wrap gap-1">{s.tools.map((t) => <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">{t}</span>)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OnyxChecklist({ items, title }: { items: any[]; title?: string }) {
  const normalized = items.map((it) => typeof it === "string" ? { text: it, checked: false } : it);
  const [list, setList] = React.useState(normalized);
  const done = list.filter((i) => i.checked).length;
  return (
    <div className="my-3 rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold">{title || "Checklist"}</span>
        <span className="text-[11px] text-muted-foreground">{done}/{list.length}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / list.length) * 100}%` }} />
      </div>
      <div className="mt-3 space-y-2">
        {list.map((it, i) => (
          <label key={i} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 hover:bg-muted/40 cursor-pointer">
            <input type="checkbox" checked={!!it.checked} onChange={() => setList((prev) => prev.map((x, idx) => idx === i ? { ...x, checked: !x.checked } : x))} className="size-4" />
            <span className={`text-[12px] ${it.checked ? "line-through text-muted-foreground" : ""}`}>{it.text}</span>
            {it.file && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{it.file}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

export function OnyxCommands({ commands, title }: { commands: any[]; title?: string }) {
  const normalized = commands.map((c) => typeof c === "string" ? { label: c, prompt: c } : c);
  return (
    <div className="my-3 rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-2 text-[13px] font-semibold">{title || "Next Steps"}</div>
      <div className="flex flex-wrap gap-2">
        {normalized.map((c, i) => (
          <button key={i} onClick={() => window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: c.prompt }))} className="rounded-full border bg-muted px-3 py-1.5 text-xs hover:bg-accent transition-colors">{c.label}</button>
        ))}
      </div>
    </div>
  );
}
