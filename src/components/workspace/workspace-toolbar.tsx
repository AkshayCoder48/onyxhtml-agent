"use client";

import * as React from "react";
import {
  Code2,
  Eye,
  RefreshCw,
  MoreHorizontal,
  Sparkles,
  X,
  FileCode,
  Monitor,
  Tablet,
  Smartphone,
  Layers,
  Hash,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { basename, detectLanguage } from "@/lib/files";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FILE_ICON_COLORS: Record<string, string> = {
  html: "text-orange-500",
  css: "text-sky-500",
  javascript: "text-yellow-500",
  json: "text-emerald-500",
  markdown: "text-muted-foreground",
  text: "text-muted-foreground",
};

export function WorkspaceToolbar() {
  const previewMode = useWorkspaceStore((s) => s.previewMode);
  const setPreviewMode = useWorkspaceStore((s) => s.setPreviewMode);
  const openTabs = useWorkspaceStore((s) => s.openTabs);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const unsavedPaths = useWorkspaceStore((s) => s.unsavedPaths);
  const aiEditingFiles = useWorkspaceStore((s) => s.aiEditingFiles);
  const bumpPreview = useWorkspaceStore((s) => s.bumpPreview);

  function reload() {
    bumpPreview();
    toast.success("Preview reloaded");
  }

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b bg-card/30 px-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-full border bg-card p-1 shadow-sm">
          <button
            onClick={() => setPreviewMode("code")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
              previewMode === "code" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Code2 className="size-3.5" /> Code
          </button>
          <button
            onClick={() => setPreviewMode("preview")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
              previewMode === "preview" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="size-3.5" /> Preview
          </button>
        </div>

        {previewMode === "code" && openTabs.length > 0 && (
          <Badge variant="secondary" className="hidden h-5 rounded-full text-[11px] sm:flex">
            <Layers className="mr-1 size-3" /> {openTabs.length} files
          </Badge>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none px-2">
        {openTabs.length === 0 && <div className="px-2 text-xs text-muted-foreground">No files open</div>}
        {openTabs.map((path) => {
          const active = path === activeFile;
          const unsaved = unsavedPaths.has(path);
          const aiEditing = aiEditingFiles.has(path);
          const lang = detectLanguage(path);
          const dotColor = FILE_ICON_COLORS[lang] ?? "text-muted-foreground";
          return (
            <div
              key={path}
              onClick={() => setActiveFile(path)}
              className={cn(
                "group flex h-8 cursor-pointer shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-all",
                active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {aiEditing ? (
                <Sparkles className="size-3 animate-pulse" />
              ) : (
                <span className={cn("size-1.5 rounded-full bg-current", active ? "opacity-100" : "opacity-50")} />
              )}
              <span className={cn("font-mono text-[12px]", active && "font-medium")}>{basename(path)}</span>
              {unsaved && <span className={cn("ml-0.5 size-1.5 rounded-full", active ? "bg-white" : "bg-amber-500")} />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(path);
                }}
                className={cn("ml-1 rounded-full p-0.5 transition-colors", active ? "hover:bg-white/20" : "opacity-0 group-hover:opacity-100 hover:bg-accent")}
                aria-label={`Close ${path}`}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={reload} className="size-8 rounded-full" aria-label="Reload preview">
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload preview</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="More">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={reload} className="gap-2">
                <RefreshCw className="size-4" /> Reload preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreviewMode("code")} className="gap-2">
                <Code2 className="size-4" /> Switch to Code
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreviewMode("preview")} className="gap-2">
                <Eye className="size-4" /> Switch to Preview
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
      </div>
    </div>
  );
}
