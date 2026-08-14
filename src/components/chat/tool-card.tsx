"use client";

import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Check,
  AlertTriangle,
  CircleSlash,
  FileText,
  Terminal,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TOOL_LABELS, type MessageSegment } from "@/lib/types";
import { CopyButton } from "./markdown";
import { useTool } from "@/stores/tool-store";
import { useBrowserConsole } from "@/stores/browser-store";
import type { ToolCardState } from "@/lib/streaming/types";

type ToolSeg = Extract<MessageSegment, { type: "tool_call" }>;

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

const FILE_TOOLS = new Set([
  "read_file",
  "create_file",
  "write_file",
  "edit_file",
  "delete_file",
  "rename_file",
  "move_file",
  "replace_content",
  "list_files",
  "search_files",
  "create_folder",
]);

// Map the ToolStore's ToolCardState to a human label + color (PRD §15).
const STATE_LABEL: Record<ToolCardState, string> = {
  generating: "Generating",
  ready: "Ready",
  executing: "Executing",
  streaming: "Streaming",
  success: "Success",
  error: "Error",
  cancelled: "Cancelled",
};

export function ToolCard({
  seg,
  onOpenFile,
  onOpenConsole,
}: {
  seg: ToolSeg;
  onOpenFile?: (path: string) => void;
  onOpenConsole?: () => void;
}) {
  // Subscribe to the live ToolStore state for this specific callId. Only this
  // card re-renders when arguments stream in — not every tool in the message
  // (PRD §36 React Performance Requirements). Falls back to the persisted
  // segment when the tool isn't in the store (e.g. a hydrated message after
  // refresh, or a legacy message).
  const liveTool = useTool(seg.callId);
  const consoleLines = useBrowserConsole(seg.callId);

  const [open, setOpen] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  // Derive display values: prefer live ToolStore, fall back to persisted seg.
  const tool = liveTool?.tool ?? seg.tool;
  const label =
    TOOL_LABELS[tool as keyof typeof TOOL_LABELS] ?? tool;
  const rawArguments = liveTool?.rawArguments ?? seg.argumentsText ?? "";
  const parsedArgs = liveTool?.parsedArguments ?? seg.arguments ?? {};
  const state: ToolCardState = liveTool?.state ?? stateFromSegStatus(seg.status);
  const result = liveTool?.result ?? seg.result;
  const error = liveTool?.error ?? seg.error;
  const progressMessage = liveTool?.progressMessage;
  const progress = liveTool?.progress;

  const argFile = pickFileArg(tool, parsedArgs);
  const argTarget = pickTargetArg(tool, parsedArgs);
  const isFileTool = FILE_TOOLS.has(tool);
  const isBrowserTool = BROWSER_TOOLS.has(tool);

  // Auto-expand while generating/executing so the user watches args stream in.
  React.useEffect(() => {
    if (state === "generating" || state === "executing" || state === "streaming") {
      setOpen(true);
    } else if (state === "success" || state === "error" || state === "cancelled") {
      const t = setTimeout(() => setOpen(false), 400);
      return () => clearTimeout(t);
    }
  }, [state]);

  // The streaming raw text — shown while arguments are still arriving.
  const hasStreamingText = rawArguments.length > 0;
  const showStreamingView =
    (state === "generating" || state === "executing" || state === "streaming") &&
    hasStreamingText;

  // Is this a terminal/browser-console tool that should show live console output?
  const isConsoleTool =
    tool === "terminal_exec" || tool === "run_javascript" || tool === "run_test";

  return (
    <div className="my-1.5 rounded-lg border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <StateIcon state={state} />
        <span className="font-medium">{label}</span>
        {(argFile || argTarget) && (
          <span className="truncate text-muted-foreground">
            {argFile ?? argTarget}
          </span>
        )}
        <span className="ml-auto">
          <StateBadge state={state} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-2.5 py-2 text-xs">
          {/* Live streaming arguments view (PRD §14, §16) */}
          {showStreamingView ? (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Loader2 className="size-2.5 animate-spin" />
                Writing arguments…
              </div>
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] font-mono whitespace-pre-wrap break-words">
                {rawArguments}
                <span className="ml-0.5 inline-block h-3 w-1 animate-pulse-soft bg-accent-strong align-text-bottom" />
              </pre>
            </div>
          ) : (
            <KVTable
              rows={[
                ["Tool", label],
                ...(argFile ? ([["File", argFile]] as [string, string][]) : []),
                ...(argTarget ? ([["Target", argTarget]] as [string, string][]) : []),
                ["State", STATE_LABEL[state]],
                ...((liveTool?.detail || seg.detail)
                  ? ([["Detail", liveTool?.detail ?? seg.detail!]] as [string, string][])
                  : []),
              ]}
            />
          )}

          {/* Progress (PRD §39) */}
          {(state === "executing" || state === "streaming") &&
            (progressMessage || typeof progress === "number") && (
              <div className="rounded border bg-muted/40 p-2">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {progressMessage ?? "Working…"}
                </div>
                {typeof progress === "number" && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-accent-strong transition-all"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

          {/* Live browser console output (PRD §18) */}
          {isConsoleTool && consoleLines.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Terminal className="size-2.5" />
                Console output
              </div>
              <div className="max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[10.5px] leading-relaxed text-zinc-100">
                {consoleLines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "whitespace-pre-wrap break-words",
                      line.level === "error" && "text-red-400",
                      line.level === "warn" && "text-amber-300",
                      line.level === "info" && "text-sky-300"
                    )}
                  >
                    <span className="mr-1 select-none text-zinc-500">
                      {line.level === "error" ? "✗" : line.level === "warn" ? "⚠" : "›"}
                    </span>
                    {line.args.join(" ")}
                  </div>
                ))}
                {(state === "executing" || state === "streaming") && (
                  <div className="mt-0.5 inline-block h-3 w-1.5 animate-pulse-soft bg-emerald-400 align-text-bottom" />
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isFileTool && argFile && onOpenFile && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => onOpenFile(argFile)}
              >
                <FileText className="size-3" /> Open file
              </Button>
            )}
            {isBrowserTool && (state === "error" || isConsoleTool) && onOpenConsole && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={onOpenConsole}
              >
                <Terminal className="size-3" /> Open console
              </Button>
            )}
            {result !== undefined && (
              <CopyButton
                text={
                  typeof result === "string"
                    ? result
                    : JSON.stringify(result, null, 2)
                }
                label="Copy result"
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-destructive">
              {error}
            </div>
          )}

          {/* Advanced details */}
          <div>
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {showDetails ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              View details
            </button>
            {showDetails && (
              <div className="mt-1.5 space-y-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Arguments
                  </div>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[11px] font-mono">
                    {JSON.stringify(parsedArgs ?? {}, null, 2)}
                  </pre>
                </div>
                {result !== undefined && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Result
                    </div>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px] font-mono">
                      {typeof result === "string"
                        ? result
                        : JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Map a persisted segment status to the richer ToolCardState for display.
function stateFromSegStatus(
  status: "running" | "success" | "error" | "cancelled" | undefined
): ToolCardState {
  switch (status) {
    case "running":
      return "executing";
    case "success":
      return "success";
    case "error":
      return "error";
    case "cancelled":
      return "cancelled";
    default:
      return "generating";
  }
}

function StateIcon({ state }: { state: ToolCardState }) {
  switch (state) {
    case "generating":
    case "executing":
    case "streaming":
    case "ready":
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-amber-500" />;
    case "success":
      return <Check className="size-3.5 shrink-0 text-emerald-500" />;
    case "error":
      return <AlertTriangle className="size-3.5 shrink-0 text-destructive" />;
    case "cancelled":
      return <CircleSlash className="size-3.5 shrink-0 text-muted-foreground" />;
    default:
      return <Loader2 className="size-3.5 shrink-0 animate-spin" />;
  }
}

function StateBadge({ state }: { state: ToolCardState }) {
  const color =
    state === "success"
      ? "text-emerald-600 bg-emerald-500/10"
      : state === "error"
      ? "text-destructive bg-destructive/10"
      : state === "cancelled"
      ? "text-muted-foreground bg-muted"
      : state === "generating"
      ? "text-violet-600 bg-violet-500/10"
      : "text-amber-600 bg-amber-500/10";
  const showPlay = state === "executing" || state === "streaming" || state === "ready";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        color
      )}
    >
      {showPlay && <Play className="size-2" />}
      {STATE_LABEL[state]}
    </span>
  );
}

function KVTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded border">
      {rows.map(([k, v], i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-2 px-2 py-1 text-xs",
            i % 2 === 0 && "bg-muted/30"
          )}
        >
          <span className="w-20 shrink-0 text-muted-foreground">{k}</span>
          <span className="min-w-0 flex-1 break-words font-mono">{v}</span>
        </div>
      ))}
    </div>
  );
}

function pickFileArg(tool: string, args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  const a = args as Record<string, unknown>;
  if (tool === "rename_file" || tool === "move_file")
    return `${a.from ?? ""} → ${a.to ?? ""}`;
  if (tool === "replace_content") return (a.path as string) ?? undefined;
  return (a.path ?? a.file ?? a.filename) as string | undefined;
}

function pickTargetArg(tool: string, args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  const a = args as Record<string, unknown>;
  if (BROWSER_TOOLS.has(tool)) {
    return (a.selector as string) ?? undefined;
  }
  if (tool === "run_javascript" || tool === "terminal_exec") {
    return String(a.code ?? "")
      .split("\n")[0]
      .slice(0, 60);
  }
  return undefined;
}
