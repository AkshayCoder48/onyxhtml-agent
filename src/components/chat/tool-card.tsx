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
  FileCode,
  FolderOpen,
  Search,
  Globe,
  MousePointer,
  Keyboard,
  Eye,
  Code2,
  Braces,
  Copy,
  ExternalLink,
  Clock,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  list_files: FolderOpen,
  read_file: FileText,
  create_file: FileCode,
  write_file: FileCode,
  edit_file: FileCode,
  delete_file: FileText,
  rename_file: FileText,
  move_file: FileText,
  replace_content: Braces,
  create_folder: FolderOpen,
  search_files: Search,
  open_page: Globe,
  reload_page: Globe,
  click: MousePointer,
  type: Keyboard,
  press_key: Keyboard,
  scroll: MousePointer,
  hover: MousePointer,
  select: MousePointer,
  wait: Clock,
  get_dom: Code2,
  get_element: Eye,
  inspect_element: Eye,
  get_console_logs: Terminal,
  get_page_errors: AlertTriangle,
  get_network_errors: Globe,
  take_screenshot: Eye,
  run_javascript: Code2,
  run_test: Zap,
  terminal_exec: Terminal,
  terminal_reset: Terminal,
  check_page: Eye,
  check_console: Terminal,
  check_links: Globe,
};

const STATE_LABEL: Record<ToolCardState, string> = {
  generating: "Generating",
  ready: "Ready",
  executing: "Executing",
  streaming: "Streaming",
  success: "Success",
  error: "Error",
  cancelled: "Cancelled",
};

const STATE_CONFIG: Record<ToolCardState, { color: string; bg: string; dot: string; pulse?: boolean }> = {
  generating: { color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", dot: "bg-violet-500", pulse: true },
  ready: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-500", pulse: true },
  executing: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", dot: "bg-blue-500", pulse: true },
  streaming: { color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", dot: "bg-cyan-500", pulse: true },
  success: { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500" },
  error: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border-red-500/20", dot: "bg-red-500" },
  cancelled: { color: "text-zinc-500", bg: "bg-zinc-500/10 border-zinc-500/20", dot: "bg-zinc-500" },
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
  const liveTool = useTool(seg.callId);
  const consoleLines = useBrowserConsole(seg.callId);

  const [open, setOpen] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);
  const [copiedArg, setCopiedArg] = React.useState(false);

  const tool = liveTool?.tool ?? seg.tool;
  const label = TOOL_LABELS[tool as keyof typeof TOOL_LABELS] ?? tool;
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
  const ToolIcon = TOOL_ICONS[tool] ?? Wrench;
  const stateCfg = STATE_CONFIG[state];

  React.useEffect(() => {
    if (state === "generating" || state === "executing" || state === "streaming" || state === "ready") {
      setOpen(true);
    } else if (state === "success" || state === "error" || state === "cancelled") {
      const t = setTimeout(() => setOpen(false), 800);
      return () => clearTimeout(t);
    }
  }, [state]);

  const hasStreamingText = rawArguments.length > 0;
  const showStreamingView =
    (state === "generating" || state === "executing" || state === "streaming") && hasStreamingText;

  const isConsoleTool = tool === "terminal_exec" || tool === "run_javascript" || tool === "run_test";

  const isStreaming = state === "generating" || state === "executing" || state === "streaming" || state === "ready";

  return (
    <div
      className={cn(
        "group relative my-2 overflow-hidden rounded-xl border bg-card transition-all duration-300",
        "hover:shadow-md hover:border-border/80",
        isStreaming && "tool-card-streaming streaming-border shadow-sm",
        state === "success" && "border-emerald-500/20",
        state === "error" && "border-red-500/20",
        open && "shadow-md"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/30"
      >
        <div className={cn("flex size-8 items-center justify-center rounded-lg border transition-colors", stateCfg.bg)}>
          <ToolIcon className={cn("size-4", stateCfg.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight">{label}</span>
            {isStreaming ? (
              <span className="flex items-center gap-1">
                <span className={cn("size-1.5 animate-pulse rounded-full", stateCfg.dot)} />
                <span className={cn("text-[10px] font-medium uppercase tracking-wider", stateCfg.color)}>
                  {STATE_LABEL[state]}
                </span>
              </span>
            ) : (
              <StateBadge state={state} />
            )}
          </div>
          {(argFile || argTarget) && (
            <div className="mt-0.5 flex items-center gap-1.5 truncate">
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {argFile ?? argTarget}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isStreaming && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <div className={cn("rounded-md p-1 transition-colors group-hover:bg-muted", open && "bg-muted")}>
            {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {/* Progress bar for streaming */}
      {isStreaming && typeof progress === "number" && (
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      {/* Content */}
      {open && (
        <div className="animate-fade-in space-y-3 border-t bg-muted/[0.02] px-3.5 py-3">
          {/* Live streaming arguments */}
          {showStreamingView ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3 animate-pulse-soft text-violet-500" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Generating arguments
                  </span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-violet-500/20 to-transparent" />
              </div>
              <div className="relative overflow-hidden rounded-lg border bg-zinc-950 p-3 shadow-inner">
                <div className="absolute right-2 top-2 flex gap-1">
                  <div className="size-2 animate-pulse rounded-full bg-violet-500" />
                  <div className="size-2 animate-pulse rounded-full bg-blue-500 [animation-delay:200ms]" />
                  <div className="size-2 animate-pulse rounded-full bg-cyan-500 [animation-delay:400ms]" />
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-100">
                  {rawArguments}
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-violet-400 align-text-bottom" />
                </pre>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <KVTable
                rows={[
                  ["Tool", label],
                  ...(argFile ? ([["File", argFile]] as [string, string][]) : []),
                  ...(argTarget ? ([["Target", argTarget]] as [string, string][]) : []),
                  ["State", STATE_LABEL[state]],
                  ...((liveTool?.detail || seg.detail) ? ([["Detail", liveTool?.detail ?? seg.detail!]] as [string, string][]) : []),
                ]}
              />
            </div>
          )}

          {/* Progress message */}
          {(state === "executing" || state === "streaming") && (progressMessage || typeof progress === "number") && (
            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-center gap-2 text-[12px]">
                <div className="flex size-5 items-center justify-center rounded-full bg-blue-500/10">
                  <Loader2 className="size-3 animate-spin text-blue-500" />
                </div>
                <span className="font-medium text-foreground">{progressMessage ?? "Working…"}</span>
              </div>
              {typeof progress === "number" && (
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Live console output */}
          {isConsoleTool && consoleLines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Terminal className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Live output</span>
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{consoleLines.length}</Badge>
              </div>
              <div className="max-h-56 overflow-auto rounded-lg border bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100 shadow-inner">
                {consoleLines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2 whitespace-pre-wrap break-words py-0.5",
                      line.level === "error" && "text-red-400",
                      line.level === "warn" && "text-amber-300",
                      line.level === "info" && "text-sky-300"
                    )}
                  >
                    <span className="mt-0.5 select-none text-[10px] text-zinc-500">
                      {line.level === "error" ? "✗" : line.level === "warn" ? "⚠" : "›"}
                    </span>
                    <span className="flex-1">{line.args.join(" ")}</span>
                  </div>
                ))}
                {(state === "executing" || state === "streaming") && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="size-1 animate-pulse rounded-full bg-emerald-400" />
                    <span className="size-1 animate-pulse rounded-full bg-emerald-400 [animation-delay:200ms]" />
                    <span className="size-1 animate-pulse rounded-full bg-emerald-400 [animation-delay:400ms]" />
                  </div>
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
                className="h-7 gap-1.5 rounded-full border-border/50 bg-card text-xs font-medium shadow-sm hover:bg-accent"
                onClick={() => onOpenFile(argFile.split(" → ")[0])}
              >
                <FileText className="size-3" /> Open file
              </Button>
            )}
            {isBrowserTool && (state === "error" || isConsoleTool) && onOpenConsole && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 rounded-full text-xs"
                onClick={onOpenConsole}
              >
                <Terminal className="size-3" /> Console
              </Button>
            )}
            {result !== undefined && (
              <CopyButton
                text={typeof result === "string" ? result : JSON.stringify(result, null, 2)}
                label="Copy result"
              />
            )}
            {parsedArgs && Object.keys(parsedArgs).length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 rounded-full text-xs"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(parsedArgs, null, 2));
                    setCopiedArg(true);
                    setTimeout(() => setCopiedArg(false), 1500);
                  } catch {}
                }}
              >
                {copiedArg ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copiedArg ? "Copied" : "Copy args"}
              </Button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-red-700 dark:text-red-300">Error</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-[12px] text-red-600/80 dark:text-red-400/80">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Advanced details */}
          <div className="rounded-lg border border-dashed bg-muted/20">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              {showDetails ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              <Braces className="size-3" />
              Developer details
            </button>
            {showDetails && (
              <div className="space-y-3 border-t p-3">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span>Arguments</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <pre className="overflow-x-auto rounded-lg border bg-zinc-950 p-3 font-mono text-[11px] text-zinc-100">
                    {JSON.stringify(parsedArgs ?? {}, null, 2)}
                  </pre>
                </div>
                {result !== undefined && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Result</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-lg border bg-zinc-950 p-3 font-mono text-[11px] text-zinc-100">
                      {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
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

function stateFromSegStatus(status: "running" | "success" | "error" | "cancelled" | undefined): ToolCardState {
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

function StateBadge({ state }: { state: ToolCardState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", cfg.bg, cfg.color)}>
      <span className={cn("size-1 rounded-full", cfg.dot, cfg.pulse && "animate-pulse")} />
      {STATE_LABEL[state]}
    </span>
  );
}

function KVTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {rows.map(([k, v], i) => (
        <div key={i} className={cn("flex items-start gap-3 px-3 py-2 text-[12px]", i % 2 === 0 && "bg-muted/30", i !== rows.length - 1 && "border-b")}>
          <span className="w-16 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k}</span>
          <span className="min-w-0 flex-1 break-words font-mono text-[12px]">{v}</span>
        </div>
      ))}
    </div>
  );
}

function pickFileArg(tool: string, args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  const a = args as Record<string, unknown>;
  if (tool === "rename_file" || tool === "move_file") return `${a.from ?? ""} → ${a.to ?? ""}`;
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
    return String(a.code ?? "").split("\n")[0].slice(0, 60);
  }
  return undefined;
}
