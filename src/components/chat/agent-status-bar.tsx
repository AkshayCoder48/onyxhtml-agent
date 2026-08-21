"use client";

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
  Sparkles,
  Layers,
  Activity,
  Zap,
} from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import type { AgentStatus } from "@/lib/streaming/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  AgentStatus,
  { icon: React.ElementType; label: string; color: string; bg: string; spin: boolean }
> = {
  idle: { icon: Activity, label: "Idle", color: "text-muted-foreground", bg: "bg-muted", spin: false },
  planning: { icon: PenLine, label: "Planning", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", spin: false },
  inspecting: { icon: Search, label: "Inspecting", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", spin: false },
  executing: { icon: Wrench, label: "Editing", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", spin: true },
  testing: { icon: FlaskConical, label: "Testing", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10", spin: true },
  verifying: { icon: ShieldCheck, label: "Verifying", color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10", spin: true },
  summarizing: { icon: FileText, label: "Summarizing", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", spin: false },
  completed: { icon: CheckCircle2, label: "Completed", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", spin: false },
  failed: { icon: XCircle, label: "Failed", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", spin: false },
  cancelled: { icon: Ban, label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted", spin: false },
};

const STUCK_THRESHOLD_MS = 30_000;

export function AgentStatusBar() {
  const agentStatus = useChatStore((s) => s.agentStatus);
  const agentStatusMessage = useChatStore((s) => s.agentStatusMessage);
  const agentStatusAction = useChatStore((s) => s.agentStatusAction);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const lastHeartbeatAt = useChatStore((s) => s.lastHeartbeatAt);

  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!isStreaming && agentStatus === "idle") return null;

  const config = STATUS_CONFIG[agentStatus] ?? STATUS_CONFIG.idle;
  const Icon = config.icon;

  const now = Date.now();
  const heartbeatAge = lastHeartbeatAt ? now - lastHeartbeatAt : 0;
  const isStuck =
    isStreaming &&
    (agentStatus === "planning" || agentStatus === "inspecting" || agentStatus === "executing" || agentStatus === "testing" || agentStatus === "verifying" || agentStatus === "summarizing") &&
    heartbeatAge > STUCK_THRESHOLD_MS;

  const displayMessage = agentStatusMessage || config.label;

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 shadow-sm" role="status" aria-live="polite" aria-label={`Agent status: ${displayMessage}`}>
      <div className={cn("flex size-8 items-center justify-center rounded-lg border", config.bg, config.color)}>
        <Icon className={cn("size-4", (config.spin || isStreaming) && agentStatus !== "completed" && agentStatus !== "failed" && agentStatus !== "cancelled" && "animate-spin")} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-[13px] font-semibold", config.color)}>{config.label}</span>
          {isStreaming && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}
        </div>
        <div className="truncate text-xs text-muted-foreground">{displayMessage}</div>
      </div>
      {agentStatusAction && <Badge variant="outline" className="h-5 rounded-full font-mono text-[10px]">{agentStatusAction}</Badge>}
      {isStuck && (
        <Badge variant="outline" className="gap-1 rounded-full border-amber-500/20 bg-amber-500/10 text-amber-700">
          <WifiOff className="size-3" /> Connection may be lost
        </Badge>
      )}
    </div>
  );
}

export function AgentStatusInline() {
  const agentStatus = useChatStore((s) => s.agentStatus);
  const agentStatusMessage = useChatStore((s) => s.agentStatusMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);

  if (!isStreaming) return null;

  const config = STATUS_CONFIG[agentStatus] ?? STATUS_CONFIG.planning;
  const Icon = config.icon;
  const msg = agentStatusMessage || config.label;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-sm">
      <div className={cn("flex size-7 items-center justify-center rounded-lg", config.bg)}>
        <Icon className={cn("size-3.5", config.color, "animate-spin")} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-xs font-medium", config.color)}>{config.label}</span>
          <div className="flex gap-0.5">
            <span className="typing-dot size-1 rounded-full bg-muted-foreground" />
            <span className="typing-dot size-1 rounded-full bg-muted-foreground" />
            <span className="typing-dot size-1 rounded-full bg-muted-foreground" />
          </div>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{msg}</div>
      </div>
    </div>
  );
}
