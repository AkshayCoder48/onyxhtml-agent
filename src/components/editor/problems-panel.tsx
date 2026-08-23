"use client";
import * as React from "react";
import { AlertTriangle, Bug, Check, FileText, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { validateHtml } from "@/lib/ai/tools/code-intel";
import { findUnusedCss } from "@/lib/ai/tools/code-intel";

type Problem = {
  path: string;
  line: number;
  message: string;
  type: "error" | "warning" | "info";
  fix?: string;
};

export function ProblemsPanel() {
  const files = useWorkspaceStore((s) => s.files);
  const [problems, setProblems] = React.useState<Problem[]>([]);
  const [filter, setFilter] = React.useState<"all" | "error" | "warning">("all");

  React.useEffect(() => {
    const list: Problem[] = [];
    const fileMap = new Map<string, { content: string }>();
    Object.entries(files).forEach(([path, f]) => fileMap.set(path, { content: f.content }));

    for (const [path, file] of Object.entries(files)) {
      if (path.endsWith(".html")) {
        const errors = validateHtml(file.content);
        for (const e of errors) {
          list.push({ path, line: e.line, message: e.message, type: e.type === "unclosed" ? "error" : "warning" });
        }
      }
    }

    // Unused CSS
    const unused = findUnusedCss(fileMap);
    for (const u of unused.slice(0, 20)) {
      list.push({ path: u.path, line: 1, message: `Unused selector ${u.selector}`, type: "info", fix: `Remove ${u.selector}` });
    }

    // Console errors from preview? Could be passed via props, for now just file validation
    setProblems(list.slice(0, 100));
  }, [files]);

  const filtered = filter === "all" ? problems : problems.filter((p) => p.type === filter);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <Bug className="size-4 text-muted-foreground" />
          <span className="text-[13px] font-semibold">Problems</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{problems.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} className="h-6 rounded-full text-[11px]" onClick={() => setFilter("all")}>All</Button>
          <Button size="sm" variant={filter === "error" ? "secondary" : "ghost"} className="h-6 rounded-full text-[11px]" onClick={() => setFilter("error")}>Errors</Button>
          <Button size="sm" variant={filter === "warning" ? "secondary" : "ghost"} className="h-6 rounded-full text-[11px]" onClick={() => setFilter("warning")}>Warnings</Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="size-5 text-emerald-600" />
            </div>
            <div className="text-sm font-medium">No problems</div>
            <div className="text-xs text-muted-foreground">Your code looks good! Agent will auto-fix issues.</div>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((p, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/30 group">
                <div className={`mt-0.5 size-5 rounded-full flex items-center justify-center shrink-0 ${p.type === "error" ? "bg-red-500/10 text-red-600" : p.type === "warning" ? "bg-amber-500/10 text-amber-600" : "bg-blue-500/10 text-blue-600"}`}>
                  <AlertTriangle className="size-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] leading-relaxed">{p.message}</div>
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                    <FileText className="size-3" /> {p.path}:{p.line}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-6 gap-1 rounded-full text-[11px] opacity-0 group-hover:opacity-100" onClick={() => {
                  window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: `Fix problem in ${p.path}:${p.line} — ${p.message}` }));
                }}>
                  <Sparkles className="size-3" /> Fix via AI
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
