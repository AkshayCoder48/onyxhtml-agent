"use client";
import * as React from "react";
import { GitBranch, FileText } from "lucide-react";

export function OnyxDependencyGraph({ nodes, edges, files }: { nodes?: any[]; edges?: any[]; files?: string[] }) {
  const fileList = files ?? nodes?.map((n) => n.id ?? n.path) ?? [];
  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10"><GitBranch className="size-4 text-indigo-600" /></div>
        <div className="flex-1"><div className="text-[13px] font-semibold">Dependency Graph</div><div className="text-[11px] text-muted-foreground">{fileList.length} files</div></div>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          {fileList.map((f: string) => (
            <div key={f} className="flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs">
              <FileText className="size-3" /> {f}
            </div>
          ))}
        </div>
        {edges && edges.length > 0 && (
          <div className="mt-3 space-y-1">
            {edges.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
                <span>{e.from}</span><span className="text-muted-foreground">→</span><span>{e.to}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OnyxFileStats({ path, lines, size, classes, ids }: { path: string; lines: number; size: number; classes?: number; ids?: number }) {
  return (
    <div className="my-3 rounded-xl border bg-card p-3">
      <div className="text-[13px] font-semibold">{path}</div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg bg-muted p-2"><div className="text-[10px] text-muted-foreground">Lines</div><div className="font-medium">{lines}</div></div>
        <div className="rounded-lg bg-muted p-2"><div className="text-[10px] text-muted-foreground">Size</div><div className="font-medium">{(size / 1024).toFixed(1)}KB</div></div>
        <div className="rounded-lg bg-muted p-2"><div className="text-[10px] text-muted-foreground">Classes</div><div className="font-medium">{classes ?? 0}</div></div>
        <div className="rounded-lg bg-muted p-2"><div className="text-[10px] text-muted-foreground">IDs</div><div className="font-medium">{ids ?? 0}</div></div>
      </div>
    </div>
  );
}
