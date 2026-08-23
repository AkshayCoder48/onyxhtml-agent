"use client";
import * as React from "react";
import { Check, X, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/lib/api";
import type { OnyxDiffProps } from "./types";

export function OnyxDiff({ path, old, new: newContent, oldContent, newContent: newC, language }: OnyxDiffProps) {
  const oldText = old ?? oldContent ?? "";
  const newText = newContent ?? newC ?? "";
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const updateFile = useWorkspaceStore((s) => s.updateFileContent);

  const handleAccept = async () => {
    if (!workspaceId) return;
    try {
      // Try surgical edit if old exists
      if (oldText && newText) {
        const files = useWorkspaceStore.getState().files;
        const current = files[path]?.content;
        if (current && current.includes(oldText)) {
          const next = current.replace(oldText, newText);
          updateFile(path, next);
          await api.putFile(workspaceId, path, next);
          toast.success(`Applied diff to ${path}`);
          return;
        }
      }
      // Fallback write
      updateFile(path, newText);
      await api.putFile(workspaceId, path, newText);
      toast.success(`Wrote ${path}`);
    } catch (e) {
      toast.error("Failed to apply diff", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="font-mono text-[12px] font-medium">{path}</span>
          {language && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{language}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-full text-xs" onClick={async () => {
            await navigator.clipboard.writeText(newText);
            toast.success("Copied new content");
          }}>
            <Copy className="size-3" /> Copy
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x max-h-80 overflow-auto">
        <div className="bg-red-500/[0.04]">
          <div className="sticky top-0 bg-red-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-red-700">Old</div>
          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-red-900/80">{oldText || "(empty)"}</pre>
        </div>
        <div className="bg-emerald-500/[0.04]">
          <div className="sticky top-0 bg-emerald-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-700">New</div>
          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-emerald-900/80">{newText || "(empty)"}</pre>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-3 py-2">
        <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={() => toast.info("Rejected diff")}><X className="size-3" /> Reject</Button>
        <Button size="sm" className="h-7 gap-1 rounded-full bg-emerald-600 text-xs hover:bg-emerald-700" onClick={handleAccept}><Check className="size-3" /> Accept & Apply</Button>
      </div>
    </div>
  );
}

export function OnyxMultiDiff({ diffs }: { diffs: OnyxDiffProps[] }) {
  const [active, setActive] = React.useState(0);
  return (
    <div className="my-3 rounded-xl border bg-card shadow-sm">
      <div className="flex gap-1 overflow-x-auto border-b bg-muted/20 p-1">
        {diffs.map((d, i) => (
          <button key={i} onClick={() => setActive(i)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${i === active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{d.path}</button>
        ))}
      </div>
      <OnyxDiff {...diffs[active]} />
    </div>
  );
}
