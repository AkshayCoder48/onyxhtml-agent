"use client";
import * as React from "react";
import { Hash, Code2, Search, FileText, Tag, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { extractSymbols, outlineHtml } from "@/lib/ai/tools/code-intel";
import { Button } from "@/components/ui/button";

export function SymbolExplorer() {
  const files = useWorkspaceStore((s) => s.files);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const [filter, setFilter] = React.useState("");
  const [symbols, setSymbols] = React.useState<{ classes: string[]; ids: string[]; tags: string[]; functions: string[]; outline: any[] } | null>(null);

  React.useEffect(() => {
    if (!activeFile) { setSymbols(null); return; }
    const content = files[activeFile]?.content;
    if (!content) { setSymbols(null); return; }
    const sym = extractSymbols(content, activeFile);
    const outline = outlineHtml(content);
    setSymbols({
      classes: sym.classes,
      ids: sym.ids,
      tags: sym.tags,
      functions: sym.functions,
      outline: outline.slice(0, 100),
    });
  }, [activeFile, files]);

  const filtered = React.useMemo(() => {
    if (!symbols || !filter) return symbols;
    const f = filter.toLowerCase();
    return {
      ...symbols,
      classes: symbols.classes.filter((c) => c.toLowerCase().includes(f)),
      ids: symbols.ids.filter((c) => c.toLowerCase().includes(f)),
      tags: symbols.tags.filter((c) => c.toLowerCase().includes(f)),
      functions: symbols.functions.filter((c) => c.toLowerCase().includes(f)),
    };
  }, [symbols, filter]);

  if (!activeFile) {
    return <div className="p-4 text-xs text-muted-foreground">Open a file to see symbols</div>;
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 items-center gap-2 border-b px-3">
        <Code2 className="size-4 text-muted-foreground" />
        <span className="text-[13px] font-semibold">Symbols</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{activeFile}</span>
      </div>
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter classes, ids, tags…" className="h-8 rounded-full pl-8 text-xs" />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {!filtered ? <div className="text-xs text-muted-foreground">No symbols</div> : (
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Hash className="size-3" /> Classes ({filtered.classes.length})</div>
              <div className="flex flex-wrap gap-1">
                {filtered.classes.map((c) => (
                  <Button key={c} size="sm" variant="secondary" className="h-6 rounded-full text-[11px]" onClick={() => window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: `Edit class .${c} in ${activeFile}` }))}>.{c}</Button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Tag className="size-3" /> IDs ({filtered.ids.length})</div>
              <div className="flex flex-wrap gap-1">
                {filtered.ids.map((c) => (
                  <Button key={c} size="sm" variant="outline" className="h-6 rounded-full text-[11px]" onClick={() => window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: `Edit #${c} in ${activeFile}` }))}>#{c}</Button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><FileText className="size-3" /> Outline</div>
              <div className="space-y-1">
                {filtered.outline.map((o, i) => (
                  <div key={i} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted text-xs">
                    <span className="font-mono text-[10px] text-muted-foreground">{o.line}</span>
                    <span className="truncate">{o.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
