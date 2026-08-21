"use client";

import * as React from "react";
import { Terminal, Trash2, ChevronDown, ChevronUp, X, AlertTriangle, Network, Activity, Bug, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  PreviewConsoleMessage,
  PreviewError,
  PreviewNetworkEntry,
} from "./preview-pane";

export function ConsoleDrawer({
  open,
  onToggle,
  messages,
  errors,
  network,
  onClear,
}: {
  open: boolean;
  onToggle: () => void;
  messages: PreviewConsoleMessage[];
  errors: PreviewError[];
  network: PreviewNetworkEntry[];
  onClear: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [tab, setTab] = React.useState("console");

  React.useEffect(() => {
    if (open) setExpanded(true);
  }, [open]);

  if (!open) return null;

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-10 shrink-0 items-center justify-between border-b bg-muted/20 px-3">
        <Tabs value={tab} onValueChange={setTab} className="flex-1">
          <TabsList className="h-8 rounded-full bg-muted p-1">
            <TabsTrigger value="console" className="h-6 gap-1 rounded-full px-3 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Terminal className="size-3" /> Console
              {messages.length > 0 && <Badge variant="secondary" className="ml-1 h-4 rounded-full px-1 text-[10px]">{messages.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="errors" className="h-6 gap-1 rounded-full px-3 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Bug className="size-3" /> Errors
              {errors.length > 0 && <Badge className="ml-1 h-4 rounded-full bg-destructive px-1 text-[10px] text-white">{errors.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="network" className="h-6 gap-1 rounded-full px-3 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Globe className="size-3" /> Network
              {network.length > 0 && <Badge variant="secondary" className="ml-1 h-4 rounded-full px-1 text-[10px]">{network.length}</Badge>}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={onClear} aria-label="Clear">
            <Trash2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse" : "Expand"}>
            {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={onToggle} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin bg-zinc-950">
          {tab === "console" && <ConsoleList messages={messages} />}
          {tab === "errors" && <ErrorList errors={errors} />}
          {tab === "network" && <NetworkList entries={network} />}
        </div>
      )}
    </div>
  );
}

function ConsoleList({ messages }: { messages: PreviewConsoleMessage[] }) {
  if (messages.length === 0) {
    return <Empty text="No console messages" />;
  }
  return (
    <div className="divide-y divide-white/5">
      {messages.map((m, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-2 px-3 py-2 font-mono text-xs",
            m.level === "error" && "bg-red-500/10 text-red-400",
            m.level === "warn" && "bg-amber-500/10 text-amber-300",
            m.level === "info" && "text-sky-300",
            m.level === "log" && "text-zinc-300"
          )}
        >
          <span className="shrink-0 text-[11px] text-zinc-500">{new Date(m.time).toLocaleTimeString()}</span>
          <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{m.args.join(" ")}</span>
        </div>
      ))}
    </div>
  );
}

function ErrorList({ errors }: { errors: PreviewError[] }) {
  if (errors.length === 0) {
    return <Empty text="No runtime errors" />;
  }
  return (
    <div className="divide-y divide-white/5">
      {errors.map((e, i) => (
        <div key={i} className="flex gap-2 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <div className="break-words text-red-300">{e.message}</div>
            {(e.filename || e.line) && (
              <div className="mt-1 font-mono text-[11px] text-zinc-500">
                {e.filename}:{e.line}
                {e.col ? `:${e.col}` : ""}
              </div>
            )}
          </div>
          <span className="shrink-0 font-mono text-[11px] text-zinc-500">{new Date(e.time).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

function NetworkList({ entries }: { entries: PreviewNetworkEntry[] }) {
  if (entries.length === 0) return <Empty text="No network events" />;
  return (
    <div className="divide-y divide-white/5">
      {entries.map((n, i) => (
        <div key={i} className="flex gap-2 px-3 py-2 font-mono text-xs text-zinc-300">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{n.type}</span>
          <span className="min-w-0 flex-1 truncate">{n.url}</span>
          {n.status !== undefined && <span className="shrink-0 text-red-400">{n.status}</span>}
          <span className="shrink-0 text-[11px] text-zinc-500">{new Date(n.time).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-white/5">
        <Activity className="size-5 text-zinc-500" />
      </div>
      <div className="text-xs text-zinc-500">{text}</div>
    </div>
  );
}
