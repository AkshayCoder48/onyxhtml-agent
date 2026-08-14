"use client";

import * as React from "react";
import { Globe, MousePointerClick, ChevronRight, ChevronDown } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import type { MessageSegment } from "@/lib/types";
import { TOOL_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

type BrowserToolSeg = Extract<MessageSegment, { type: "tool_call" }>;

const BROWSER_TOOLS = new Set([
  "click",
  "type",
  "press_key",
  "scroll",
  "hover",
  "select",
  "get_dom",
  "get_element",
  "inspect_element",
  "get_console_logs",
  "get_page_errors",
  "get_network_errors",
  "take_screenshot",
  "run_javascript",
  "run_test",
  "terminal_exec",
  "terminal_reset",
  "check_links",
  "open_page",
  "reload_page",
]);

export function BrowserTestPanel() {
  const messages = useChatStore((s) => s.messages);

  // Collect all browser tool_call segments across assistant messages, in order.
  const items = React.useMemo(() => {
    const list: { messageId: string; seg: BrowserToolSeg }[] = [];
    for (const m of messages) {
      for (const seg of m.segments) {
        if (seg.type === "tool_call" && BROWSER_TOOLS.has(seg.tool)) {
          list.push({ messageId: m.id, seg: seg as BrowserToolSeg });
        }
      }
    }
    return list;
  }, [messages]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5">
        <Globe className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Browser / Test
        </span>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {items.length} actions
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin py-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <MousePointerClick className="size-5 text-muted-foreground/50" />
            <div className="text-xs text-muted-foreground">
              Browser automation actions performed by the AI will appear here.
            </div>
          </div>
        ) : (
          <div className="space-y-1 px-2">
            {items.map((it, idx) => (
              <BrowserItem key={it.seg.callId} idx={idx + 1} seg={it.seg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BrowserItem({ idx, seg }: { idx: number; seg: BrowserToolSeg }) {
  const [open, setOpen] = React.useState(false);
  const status = seg.status;
  const argSummary = summarizeArgs(seg.tool, seg.arguments);
  return (
    <div className="rounded-md border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-[10px] text-muted-foreground">#{idx}</span>
        <span className="font-medium">{TOOL_LABELS[seg.tool as keyof typeof TOOL_LABELS] ?? seg.tool}</span>
        <span className="truncate text-muted-foreground">{argSummary}</span>
        <StatusDot status={status} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t px-2.5 py-2 text-xs">
          {seg.detail && <div className="text-muted-foreground">{seg.detail}</div>}
          {seg.arguments && Object.keys(seg.arguments).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Arguments
              </div>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[11px] font-mono">
                {JSON.stringify(seg.arguments, null, 2)}
              </pre>
            </div>
          )}
          {seg.result !== undefined && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Result
              </div>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px] font-mono">
                {typeof seg.result === "string"
                  ? seg.result
                  : JSON.stringify(seg.result, null, 2)}
              </pre>
            </div>
          )}
          {seg.error && (
            <div className="text-destructive">Error: {seg.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status?: string }) {
  const map: Record<string, { c: string; l: string }> = {
    running: { c: "bg-amber-500 animate-pulse-soft", l: "Running" },
    success: { c: "bg-emerald-500", l: "Success" },
    error: { c: "bg-destructive", l: "Error" },
    cancelled: { c: "bg-muted-foreground/40", l: "Cancelled" },
  };
  const s = map[status ?? "running"] ?? map.running;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", s.c)} />
      {s.l}
    </span>
  );
}

function summarizeArgs(tool: string, args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const a = args as Record<string, unknown>;
  switch (tool) {
    case "click":
    case "hover":
    case "get_dom":
    case "get_element":
    case "inspect_element":
    case "scroll":
      return String(a.selector ?? "");
    case "type":
    case "select":
      return `${a.selector ?? ""} = ${JSON.stringify(a.value ?? a.text ?? "")}`;
    case "press_key":
      return String(a.key ?? "");
    case "run_javascript":
      return String(a.code ?? "")
        .split("\n")[0]
        .slice(0, 60);
    case "run_test":
      return typeof a.name === "string" && a.name.length > 0
        ? a.name
        : Array.isArray(a.assertions)
          ? `${a.assertions.length} assertions`
          : "";
    case "open_page":
    case "reload_page":
      return String(a.url ?? "");
    case "check_links":
      return "links";
    case "get_network_errors":
      return "network";
    default:
      return "";
  }
}
