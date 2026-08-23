"use client";
import * as React from "react";
import { Pause, Play, GitBranch, History, Undo2, Check, Zap, Settings2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useChatStore } from "@/stores/chat-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { usePlanStore } from "@/stores/plan-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function AgentControls() {
  const isStreaming = useChatStore((s) => s.isStreaming);
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const currentPlan = usePlanStore((s) => s.currentPlan);
  const approvePlan = usePlanStore((s) => s.approvePlan);
  const [autoFix, setAutoFix] = React.useState(true);
  const [stepThrough, setStepThrough] = React.useState(false);

  return (
    <div className="flex items-center gap-1.5 border-b bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={isStreaming ? "destructive" : "ghost"}
          className="h-7 gap-1 rounded-full text-xs"
          onClick={() => {
            if (isStreaming) {
              window.dispatchEvent(new CustomEvent("chat:stop"));
            } else {
              window.dispatchEvent(new CustomEvent("chat:regenerate"));
            }
          }}
        >
          {isStreaming ? <><Pause className="size-3" /> Stop</> : <><Play className="size-3" /> Regenerate</>}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-full text-xs">
              <History className="size-3" /> {checkpoints.length} checkpoints
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 rounded-xl">
            <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Checkpoints (auto every 5 edits)</div>
            {checkpoints.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No checkpoints yet</div>}
            {checkpoints.map((cp) => (
              <DropdownMenuItem key={cp.id} className="flex flex-col items-start gap-1" onSelect={() => {
                const files = cp.files;
                const ws = useWorkspaceStore.getState();
                Object.entries(files).forEach(([path, file]) => {
                  ws.upsertFile(path, file.content, file.isBinary);
                });
                toast.success(`Restored checkpoint: ${cp.message}`);
              }}>
                <span className="text-xs font-medium">{cp.message}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(cp.timestamp).toLocaleTimeString()} • {cp.fileCount} files</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => useCheckpointStore.getState().clear()}>Clear all</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {currentPlan && !currentPlan.approved && (
          <Button size="sm" className="h-7 gap-1 rounded-full bg-violet-600 text-xs" onClick={() => { approvePlan(); toast.success("Plan approved"); }}>
            <Check className="size-3" /> Approve Plan
          </Button>
        )}

        <Badge variant={autoFix ? "default" : "secondary"} className={`h-6 cursor-pointer rounded-full text-[10px] ${autoFix ? "bg-emerald-500" : ""}`} onClick={() => setAutoFix(!autoFix)}>
          <Zap className="size-3" /> Auto-fix {autoFix ? "ON" : "OFF"}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="size-7 rounded-full p-0"><Settings2 className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem onSelect={() => setStepThrough(!stepThrough)}>
              <Eye className="mr-2 size-4" /> Step-through: {stepThrough ? "ON" : "OFF"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("chat:clear"))}>
              Clear chat
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => {
              const files = useWorkspaceStore.getState().files;
              useCheckpointStore.getState().addCheckpoint("Manual checkpoint", files);
              toast.success("Checkpoint saved");
            }}>
              <History className="mr-2 size-4" /> Save checkpoint
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function UndoButton() {
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  if (checkpoints.length < 2) return null;
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-full text-xs" onClick={() => {
      const prev = checkpoints[1];
      if (!prev) return;
      const files = prev.files;
      Object.entries(files).forEach(([path, file]) => {
        useWorkspaceStore.getState().upsertFile(path, file.content, file.isBinary);
      });
      toast.success("Undid last change");
    }}>
      <Undo2 className="size-3" /> Undo
    </Button>
  );
}
