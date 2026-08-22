"use client";

import * as React from "react";
import { Globe, MousePointerClick, ChevronRight, ChevronDown, Zap, Eye, Code2, Terminal } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import type { MessageSegment } from "@/lib/types";
import { TOOL_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
  "browser_execute_js",
  "browser_read_page",
  "run_test",
  "terminal_exec",
  "terminal_reset",
  "check_links",
  "check_page",
  "check_console",
  "check_page",
  "run_unit_tests",
  "run_integration_tests",
  "run_e2e_test",
  "assert_text",
  "assert_element",
  "assert_url",
  "assert_title",
  "assert_attribute",
  "assert_visible",
  "assert_hidden",
  "assert_enabled",
  "assert_disabled",
  "assert_screenshot",
  "test_api_endpoint",
  "test_form",
  "test_navigation",
  "test_responsive_layout",
  "test_console",
  "test_network",
  "test_performance",
  "open_page",
  "reload_page",
]);

export function BrowserTestPanel() {
  const messages = useChatStore((s) => s.messages);

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
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card/30 px-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
          <Globe className="size-4 text-muted-foreground" />
        </div>
        <span className="text-xs font-semibold">Browser</span>
        <Badge variant="secondary" className="ml-auto h-5 rounded-full text-[10px]">
          {items.length} actions
        </Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <MousePointerClick className="size-6 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium">No browser actions yet</div>
              <div className="mt-1 max-w-[200px] text-xs leading-relaxed text-muted-foreground">AI browser automation (click, type, screenshots) will appear here with live streaming</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
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
    <div className="overflow-hidden rounded-xl border bg-card transition-all hover:shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <div className="flex size-6 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-medium">#{idx}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">{TOOL_LABELS[seg.tool as keyof typeof TOOL_LABELS] ?? seg.tool}</span>
            <StatusDot status={status} />
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">{argSummary}</div>
        </div>
        <div className="rounded-full p-1 hover:bg-muted">{open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}</div>
      </button>
      {open && (
        <div className="space-y-2 border-t bg-muted/20 p-3 text-xs">
          {seg.detail && <div className="text-muted-foreground">{seg.detail}</div>}
          {seg.arguments && Object.keys(seg.arguments).length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Arguments</div>
              <pre className="overflow-x-auto rounded-lg border bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-100">{JSON.stringify(seg.arguments, null, 2)}</pre>
            </div>
          )}
          {seg.result !== undefined && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Result</div>
              <pre className="max-h-48 overflow-auto rounded-lg border bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-100">{typeof seg.result === "string" ? seg.result : JSON.stringify(seg.result, null, 2)}</pre>
            </div>
          )}
          {seg.error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-red-600">Error: {seg.error}</div>}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status?: string }) {
  const map: Record<string, { c: string; l: string }> = {
    running: { c: "bg-amber-500 animate-pulse", l: "Running" },
    success: { c: "bg-emerald-500", l: "Success" },
    error: { c: "bg-red-500", l: "Error" },
    cancelled: { c: "bg-zinc-400", l: "Cancelled" },
  };
  const s = map[status ?? "running"] ?? map.running;
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
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
    case "browser_execute_js":
      return String(a.code ?? "").split("\n")[0].slice(0, 60);
    case "browser_read_page":
    case "check_page":
    case "check_console":
      return "observe page";
    case "run_test":
      return typeof a.name === "string" && a.name.length > 0 ? a.name : Array.isArray(a.assertions) ? `${a.assertions.length} assertions` : "";
    case "open_page":
    case "reload_page":
      return String(a.url ?? "");
    case "check_links":
      return "links";
    case "run_unit_tests":
    case "run_integration_tests":
    case "run_e2e_test":
      return typeof a.name === "string" && a.name ? a.name : "tests";
    case "assert_text":
      return String(a.text ?? "").slice(0, 60);
    case "assert_element":
    case "assert_visible":
    case "assert_hidden":
    case "assert_enabled":
    case "assert_disabled":
      return String(a.selector ?? "");
    case "assert_url":
      return String(a.expected ?? "");
    case "assert_title":
      return String(a.expected ?? "");
    case "assert_attribute":
      return String(a.attribute ?? "");
    case "assert_screenshot":
      return "screenshot";
    case "test_api_endpoint":
      return `${String(a.method ?? "GET")} ${String(a.url ?? "")}`;
    case "test_form":
      return String(a.formSelector ?? "");
    case "test_navigation":
      return String(a.selector ?? "");
    case "test_responsive_layout":
      return "responsive";
    case "test_console":
      return String(a.level ?? "error");
    case "test_network":
      return "network";
    case "test_performance":
      return "performance";
    case "get_network_errors":
      return "network";
    default:
      return "";
  }
}
