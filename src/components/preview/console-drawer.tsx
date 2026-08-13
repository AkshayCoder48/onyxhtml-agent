"use client";

import * as React from "react";
import { Terminal, Trash2, ChevronDown, ChevronUp, X, AlertTriangle, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
    <div className="flex h-full flex-col border-t bg-background">
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
        <Tabs value={tab} onValueChange={setTab} className="flex-1">
          <TabsList className="h-7 bg-transparent p-0">
            <TabsTrigger
              value="console"
              className="h-7 rounded-md px-2 text-xs data-[state=active]:bg-accent"
            >
              <Terminal className="mr-1 size-3" /> Console
              {messages.length > 0 && (
                <span className="ml-1 rounded bg-muted px-1 text-[10px]">
                  {messages.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="errors"
              className="h-7 rounded-md px-2 text-xs data-[state=active]:bg-accent"
            >
              <AlertTriangle className="mr-1 size-3" /> Errors
              {errors.length > 0 && (
                <span className="ml-1 rounded bg-destructive/15 px-1 text-[10px] text-destructive">
                  {errors.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="network"
              className="h-7 rounded-md px-2 text-xs data-[state=active]:bg-accent"
            >
              <Network className="mr-1 size-3" /> Network
              {network.length > 0 && (
                <span className="ml-1 rounded bg-muted px-1 text-[10px]">
                  {network.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onClear}
            aria-label="Clear"
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronUp className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onToggle}
            aria-label="Close"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
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
    return (
      <Empty text="No console messages" />
    );
  }
  return (
    <div className="divide-y">
      {messages.map((m, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-2 px-3 py-1.5 text-xs font-mono",
            m.level === "error" && "bg-destructive/5 text-destructive",
            m.level === "warn" && "bg-amber-500/5 text-amber-700 dark:text-amber-300",
            m.level === "info" && "text-foreground/80",
            m.level === "log" && "text-foreground/80"
          )}
        >
          <span className="shrink-0 text-muted-foreground">
            {new Date(m.time).toLocaleTimeString()}
          </span>
          <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">
            {m.args.join(" ")}
          </span>
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
    <div className="divide-y">
      {errors.map((e, i) => (
        <div key={i} className="flex gap-2 px-3 py-1.5 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="break-words text-destructive">{e.message}</div>
            {(e.filename || e.line) && (
              <div className="mt-0.5 text-muted-foreground">
                {e.filename}:{e.line}
                {e.col ? `:${e.col}` : ""}
              </div>
            )}
          </div>
          <span className="shrink-0 text-muted-foreground">
            {new Date(e.time).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function NetworkList({ entries }: { entries: PreviewNetworkEntry[] }) {
  if (entries.length === 0) return <Empty text="No network events" />;
  return (
    <div className="divide-y">
      {entries.map((n, i) => (
        <div key={i} className="flex gap-2 px-3 py-1.5 text-xs">
          <span className="rounded bg-muted px-1 font-mono text-[10px]">{n.type}</span>
          <span className="min-w-0 flex-1 truncate font-mono">{n.url}</span>
          {n.status !== undefined && (
            <span className="shrink-0 text-destructive">{n.status}</span>
          )}
          <span className="shrink-0 text-muted-foreground">
            {new Date(n.time).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center py-10 text-xs text-muted-foreground">
      {text}
    </div>
  );
}
