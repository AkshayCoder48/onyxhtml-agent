"use client";

import * as React from "react";
import {
  ArrowLeft,
  Save,
  Download,
  MoreHorizontal,
  Check,
  CircleAlert,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";

export function WorkspaceHeader() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const unsavedPaths = useWorkspaceStore((s) => s.unsavedPaths);
  const markSaved = useWorkspaceStore((s) => s.markSaved);
  const files = useWorkspaceStore((s) => s.files);
  const setPreviewMode = useWorkspaceStore((s) => s.setPreviewMode);
  const bumpPreview = useWorkspaceStore((s) => s.bumpPreview);

  const [editingName, setEditingName] = React.useState(false);
  const [nameValue, setNameValue] = React.useState("");

  const fileUnsaved = activeFile ? unsavedPaths.has(activeFile) : false;

  async function saveActiveFile() {
    if (!workspace || !activeFile) return;
    const entry = files[activeFile];
    if (!entry) return;
    try {
      await api.putFile(workspace.id, activeFile, entry.content);
      markSaved(activeFile);
      // persist activeFile on workspace
      await api.patchWorkspace(workspace.id, { activeFile });
      toast.success("Saved", { description: activeFile });
    } catch (e) {
      toast.error("Save failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function downloadZip() {
    if (!workspace) return;
    try {
      const blob = await api.downloadWorkspace(workspace.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace.name.replace(/[^a-z0-9-_]+/gi, "-") || "workspace"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (e) {
      toast.error("Download failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function renameWorkspace() {
    if (!workspace) return;
    setNameValue(workspace.name);
    setEditingName(true);
  }

  async function commitName() {
    if (!workspace) return;
    const v = nameValue.trim();
    if (!v || v === workspace.name) {
      setEditingName(false);
      return;
    }
    try {
      const data = await api.patchWorkspace(workspace.id, { name: v });
      setWorkspace({ ...workspace, name: data.workspace.name });
      toast.success("Workspace renamed");
    } catch (e) {
      toast.error("Rename failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setEditingName(false);
    }
  }

  async function deleteWorkspace() {
    if (!workspace) return;
    if (!confirm(`Delete workspace "${workspace.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteWorkspace(workspace.id);
      toast.success("Workspace deleted");
      clearWorkspace();
    } catch (e) {
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function importZip() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = await api.importWorkspace(file);
        setWorkspace(data.workspace);
        toast.success("Workspace imported");
      } catch (e) {
        toast.error("Import failed", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    };
    input.click();
  }

  if (!workspace) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background px-2">
        {/* Left: back + editable name */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => clearWorkspace()}
                aria-label="Back to home"
              >
                <ArrowLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to home</TooltipContent>
          </Tooltip>

          {editingName ? (
            <Input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="h-7 w-[200px] text-sm"
            />
          ) : (
            <button
              onClick={renameWorkspace}
              className="truncate rounded-md px-2 py-1 text-sm font-medium hover:bg-accent"
              title="Click to rename"
            >
              {workspace.name}
            </button>
          )}
        </div>

        {/* Center: file name + status */}
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 sm:flex">
          {activeFile ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {activeFile}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  fileUnsaved
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                )}
              >
                {fileUnsaved ? (
                  <>
                    <CircleAlert className="size-3" /> Unsaved
                  </>
                ) : (
                  <>
                    <Check className="size-3" /> Saved
                  </>
                )}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No file open</span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={saveActiveFile}
                disabled={!activeFile}
                aria-label="Save (Ctrl+S)"
              >
                <Save className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save (⌘S)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={downloadZip}
                aria-label="Download ZIP"
              >
                <Download className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download ZIP</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={renameWorkspace}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadZip}>
                Export ZIP
              </DropdownMenuItem>
              <DropdownMenuItem onClick={importZip}>
                Import ZIP
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setPreviewMode("preview");
                  bumpPreview();
                }}
              >
                Open Preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={deleteWorkspace}
                className="text-destructive focus:text-destructive"
              >
                Delete workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </TooltipProvider>
  );
}
