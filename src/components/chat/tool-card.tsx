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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TOOL_LABELS, type MessageSegment } from "@/lib/types";
import { CopyButton } from "./markdown";

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

export function ToolCard({
  seg,
  onOpenFile,
  onOpenConsole,
}: {
  seg: ToolSeg;
  onOpenFile?: (path: string) => void;
  onOpenConsole?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);
  const label = TOOL_LABELS[seg.tool as keyof typeof TOOL_LABELS] ?? seg.tool;

  const status = seg.status ?? "running";
  const argFile = pickFileArg(seg.tool, seg.arguments);
  const argTarget = pickTargetArg(seg.tool, seg.arguments);
  const isFileTool = FILE_TOOLS.has(seg.tool);
  const isBrowserTool = BROWSER_TOOLS.has(seg.tool);

  // Auto-expand the card while the tool is streaming/running so the user
  // can watch the arguments being written.
  React.useEffect(() => {
    if (status === "running") {
      setOpen(true);
    } else if (status === "success" || status === "error" || status === "cancelled") {
      // Collapse after a short delay once finished.
      const t = setTimeout(() => setOpen(false), 300);
      return () => clearTimeout(t);
    }
  }, [status]);

  // The streaming raw text — used while the tool is running and the JSON
  // arguments may still be incomplete. Once the call completes we show the
  // parsed arguments instead.
  const streamingText = seg.argumentsText ?? "";
  const hasStreamingText = streamingText.length > 0;
  const showStreamingView = status === "running" && hasStreamingText;

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
        <StatusIcon status={status} />
        <span className="font-medium">{label}</span>
        {(seg.label || argFile || argTarget) && (
          <span className="truncate text-muted-foreground">
            {seg.label ?? argFile ?? argTarget}
          </span>
        )}
        {showStreamingView && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block size-1 animate-pulse-soft rounded-full bg-accent-strong" />
            streaming
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 border-t px-2.5 py-2 text-xs">
          {showStreamingView ? (
            // Live streaming view — show the raw arguments text as it's
            // written by the model. This is the "no instant preview" mode
            // the user asked for: the card builds up character by character.
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Loader2 className="size-2.5 animate-spin" />
                Writing arguments…
              </div>
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] font-mono whitespace-pre-wrap break-words">
                {streamingText}
                <span className="ml-0.5 inline-block h-3 w-1 animate-pulse-soft bg-accent-strong align-text-bottom" />
              </pre>
            </div>
          ) : (
            <KVTable
              rows={[
                ["Tool", label],
                ...(argFile ? ([["File", argFile]] as [string, string][]) : []),
                ...(argTarget ? ([["Target", argTarget]] as [string, string][]) : []),
                ["Status", status],
                ...(seg.detail ? ([["Detail", seg.detail]] as [string, string][]) : []),
              ]}
            />
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
            {isBrowserTool && status === "error" && onOpenConsole && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={onOpenConsole}
              >
                <Terminal className="size-3" /> Open console
              </Button>
            )}
            {seg.result !== undefined && (
              <CopyButton
                text={
                  typeof seg.result === "string"
                    ? seg.result
                    : JSON.stringify(seg.result, null, 2)
                }
                label="Copy result"
              />
            )}
          </div>

          {/* Error */}
          {seg.error && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-destructive">
              {seg.error}
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
                    {JSON.stringify(seg.arguments ?? {}, null, 2)}
                  </pre>
                </div>
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "running":
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
