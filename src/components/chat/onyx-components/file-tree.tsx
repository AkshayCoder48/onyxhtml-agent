"use client";
import * as React from "react";
import { Folder, FileText, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { OnyxFileTreeProps } from "./types";

export function OnyxFileTree({ files, title }: OnyxFileTreeProps) {
  const normalized = files.map((f) => typeof f === "string" ? { path: f } : f);
  const [checked, setChecked] = React.useState<Set<string>>(new Set(normalized.map((f) => f.path)));
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const toggle = (path: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleCreateAll = async () => {
    if (!workspaceId) return;
    const toCreate = normalized.filter((f) => checked.has(f.path));
    for (const f of toCreate) {
      try {
        const content = (f as any).content ?? "";
        await api.putFile(workspaceId, f.path, content);
        useWorkspaceStore.getState().upsertFile(f.path, content, false);
      } catch {}
    }
    toast.success(`Created ${toCreate.length} files`);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Folder className="size-4 text-violet-600" />
          <span className="text-[13px] font-semibold">{title || "Proposed Files"}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{checked.size}/{normalized.length} selected</span>
      </div>
      <div className="max-h-64 divide-y overflow-auto">
        {normalized.map((f) => {
          const isChecked = checked.has(f.path);
          const isFolder = f.path.endsWith("/");
          return (
            <label key={f.path} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
              <input type="checkbox" checked={isChecked} onChange={() => toggle(f.path)} className="size-4 rounded border" />
              <div className={`flex size-6 items-center justify-center rounded-md ${isFolder ? "bg-blue-500/10 text-blue-600" : "bg-muted text-muted-foreground"}`}>
                {isFolder ? <Folder className="size-3.5" /> : <FileText className="size-3.5" />}
              </div>
              <span className="flex-1 truncate font-mono text-[12px]">{f.path}</span>
              {isChecked && <Check className="size-3.5 text-emerald-600" />}
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-3 py-2">
        <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => setChecked(new Set(normalized.map((f) => f.path)))}>Select All</Button>
        <Button size="sm" className="h-7 gap-1 rounded-full bg-violet-600 text-xs hover:bg-violet-700" onClick={handleCreateAll}><Plus className="size-3" /> Create {checked.size} Files</Button>
      </div>
    </div>
  );
}
