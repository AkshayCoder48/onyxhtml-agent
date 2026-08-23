"use client";
import * as React from "react";
import { Check, Clock, Loader2, AlertTriangle, FileText, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OnyxPlanProps, OnyxPlanStep } from "./types";

export function OnyxPlan({ title, steps }: OnyxPlanProps) {
  const [localSteps, setLocalSteps] = React.useState<OnyxPlanStep[]>(steps);
  React.useEffect(() => setLocalSteps(steps), [steps]);

  const done = localSteps.filter((s) => s.status === "done").length;
  const total = localSteps.length;
  const progress = total ? (done / total) * 100 : 0;

  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10">
            <FileText className="size-4 text-violet-600" />
          </div>
          <div>
            <div className="text-[13px] font-semibold">{title || "Plan"}</div>
            <div className="text-[11px] text-muted-foreground">{done}/{total} steps • {Math.round(progress)}%</div>
          </div>
        </div>
        <Badge variant="secondary" className="rounded-full text-[10px]">{total} steps</Badge>
      </div>
      <div className="h-1 w-full bg-muted">
        <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="divide-y">
        {localSteps.map((step) => {
          const status = step.status || "todo";
          return (
            <div key={step.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <div className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                status === "done" && "bg-emerald-500 border-emerald-500 text-white",
                status === "doing" && "bg-blue-500/10 border-blue-500/20",
                status === "todo" && "bg-muted border",
                status === "error" && "bg-red-500/10 border-red-500/20 text-red-600"
              )}>
                {status === "done" && <Check className="size-3" />}
                {status === "doing" && <Loader2 className="size-3 animate-spin" />}
                {status === "todo" && <Clock className="size-3 text-muted-foreground" />}
                {status === "error" && <AlertTriangle className="size-3" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{step.title}</span>
                  {step.file && <span className="truncate rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{step.file}</span>}
                </div>
                {step.description && <div className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{step.description}</div>}
              </div>
              {status === "todo" && (
                <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={() => {
                  setLocalSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, status: "doing" } : s));
                  window.dispatchEvent(new CustomEvent("onyx:run-step", { detail: step }));
                }}>
                  <Play className="size-3" /> Run
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground">Agent plan • Click Run to execute step</span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: `Approve plan: ${title}` }))}>Approve Plan</Button>
        </div>
      </div>
    </div>
  );
}
