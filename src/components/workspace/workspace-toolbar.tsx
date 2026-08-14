"use client";

import * as React from "react";
import {
  Code2,
  Eye,
  RefreshCw,
  MoreHorizontal,
  Sparkles,
  X,
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
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-background px-2">
      {/* Left: segmented control */}
      <div className="flex items-center gap-1">
        <div className="flex items-center rounded-md border p-0.5">
          <button
            onClick={() => setPreviewMode("code")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              previewMode === "code"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Code2 className="size-3.5" /> Code
          </button>
          <button
            onClick={() => setPreviewMode("preview")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              previewMode === "preview"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Eye className="size-3.5" /> Preview
          </button>
        </div>
      </div>

      {/* Center: tabs */}
      <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto scrollbar-none">
        {openTabs.length === 0 && (
          <div className="px-2 text-xs text-muted-foreground">No files open</div>
        )}
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
                "group flex h-9 cursor-pointer shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-2.5 text-xs",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {aiEditing ? (
                <Sparkles className="size-3 animate-pulse-soft text-accent-strong" />
              ) : (
                <span className={cn("size-1.5 rounded-full bg-current opacity-50", dotColor)} />
              )}
              <span className={cn("font-mono", active && "font-medium")}>{basename(path)}</span>
              {unsaved && (
                <span className="ml-0.5 size-1.5 rounded-full bg-amber-500" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(path);
                }}
                className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                aria-label={`Close ${path}`}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={reload}
                disabled={previewMode !== "preview"}
                aria-label="Reload preview"
              >
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload preview</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={reload}>Reload preview</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreviewMode("code")}>
                Switch to Code
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreviewMode("preview")}>
                Switch to Preview
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
      </div>
    </div>
  );
}
