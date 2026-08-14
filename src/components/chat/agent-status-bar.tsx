"use client";

// ============================================================================
// AgentStatusBar (PRD §3, §23) — replaces the generic "Thinking…" indicator
// with a meaningful, real-time status derived from the agent's actual state.
//
// Instead of a perpetual spinner, the user sees:
//   "Reading AGENT.md & inspecting workspace…"
//   "Editing index.html…"
//   "Running terminal_exec…"
//   "Preparing summary…"
//   "Done"
//
// The status comes from agent.status events emitted by the server (PRD §7),
// NOT from a client-side isLoading flag. This means the UI reflects the real
// execution state, not a guess.
//
// Stuck-detection (PRD §4): if no heartbeat has been received for 30s while
// streaming, we show a "Connection may be lost…" warning so the user knows
// the agent might be stuck rather than working.
// ============================================================================

import * as React from "react";
import {
  Loader2,
  Search,
  PenLine,
  Wrench,
  FlaskConical,
  ShieldCheck,
  FileText,
  CheckCircle2,
  XCircle,
  Ban,
  AlertTriangle,
  WifiOff,
} from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import type { AgentStatus } from "@/lib/streaming/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  AgentStatus,
  { icon: React.ElementType; label: string; color: string; spin: boolean }
> = {
  idle: { icon: Loader2, label: "Idle", color: "text-muted-foreground", spin: false },
  planning: { icon: PenLine, label: "Planning", color: "text-blue-600 dark:text-blue-400", spin: false },
  inspecting: { icon: Search, label: "Inspecting", color: "text-blue-600 dark:text-blue-400", spin: false },
  executing: { icon: Wrench, label: "Editing", color: "text-amber-600 dark:text-amber-400", spin: false },
  testing: { icon: FlaskConical, label: "Testing", color: "text-purple-600 dark:text-purple-400", spin: false },
  verifying: { icon: ShieldCheck, label: "Verifying", color: "text-cyan-600 dark:text-cyan-400", spin: false },
  summarizing: { icon: FileText, label: "Summarizing", color: "text-blue-600 dark:text-blue-400", spin: false },
  completed: { icon: CheckCircle2, label: "Completed", color: "text-green-600 dark:text-green-400", spin: false },
  failed: { icon: XCircle, label: "Failed", color: "text-red-600 dark:text-red-400", spin: false },
  cancelled: { icon: Ban, label: "Cancelled", color: "text-muted-foreground", spin: false },
};

// 30 seconds without any heartbeat = potentially stuck/disconnected.
const STUCK_THRESHOLD_MS = 30_000;

export function AgentStatusBar() {
  const agentStatus = useChatStore((s) => s.agentStatus);
  const agentStatusMessage = useChatStore((s) => s.agentStatusMessage);
  const agentStatusAction = useChatStore((s) => s.agentStatusAction);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const lastHeartbeatAt = useChatStore((s) => s.lastHeartbeatAt);

  // Tick every 5s so we can detect a stale heartbeat. Without this, the
  // component would never re-evaluate whether the heartbeat is stale.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!isStreaming && agentStatus === "idle") return null;

  const config = STATUS_CONFIG[agentStatus] ?? STATUS_CONFIG.idle;
  const Icon = config.icon;

  // Stuck detection: if streaming and no heartbeat for 30s, warn the user.
  const now = Date.now();
  const heartbeatAge = lastHeartbeatAt ? now - lastHeartbeatAt : 0;
  const isStuck =
    isStreaming &&
    (agentStatus === "planning" ||
      agentStatus === "inspecting" ||
      agentStatus === "executing" ||
      agentStatus === "testing" ||
      agentStatus === "verifying" ||
      agentStatus === "summarizing") &&
    heartbeatAge > STUCK_THRESHOLD_MS;

  const displayMessage = agentStatusMessage || config.label;

  return (
    <div
      className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
      role="status"
      aria-live="polite"
      aria-label={`Agent status: ${displayMessage}`}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          config.color,
          (config.spin || isStreaming) &&
            agentStatus !== "completed" &&
            agentStatus !== "failed" &&
            agentStatus !== "cancelled" &&
            "animate-spin"
        )}
      />
      <span className={cn("font-medium", config.color)}>{config.label}</span>
      <span className="text-muted-foreground">·</span>
      <span className="flex-1 truncate text-muted-foreground">
        {displayMessage}
      </span>
      {agentStatusAction && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {agentStatusAction}
        </span>
      )}
      {isStuck && (
        <span className="flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400">
          <WifiOff className="size-3" />
          <span className="hidden sm:inline">Connection may be lost</span>
        </span>
      )}
    </div>
  );
}

// A compact variant for inline use (e.g. inside a message that has no
// segments yet). Replaces the old "Thinking…" dot+label.
export function AgentStatusInline() {
  const agentStatus = useChatStore((s) => s.agentStatus);
  const agentStatusMessage = useChatStore((s) => s.agentStatusMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);

  if (!isStreaming) return null;

  const config = STATUS_CONFIG[agentStatus] ?? STATUS_CONFIG.planning;
  const Icon = config.icon;
  const msg = agentStatusMessage || config.label;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          config.color,
          "animate-spin"
        )}
      />
      <span className={cn("font-medium", config.color)}>{config.label}</span>
      <span className="truncate">{msg}</span>
    </div>
  );
}
