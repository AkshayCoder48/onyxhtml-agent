"use client";

import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  FilePlus2,
  FolderPlus,
  FileCode2,
  FileText,
  FileJson,
  Image as ImageIcon,
  Folder,
  FolderOpen,
  Copy,
  Pencil,
  Trash2,
  FileSymlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useChatStore } from "@/stores/chat-store";
import type { FileNode } from "@/lib/types";
import { buildFileTree, detectLanguage, joinPath } from "@/lib/files";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function FileIcon({ path }: { path: string }) {
  const lang = detectLanguage(path);
  if (path.endsWith(".json")) return <FileJson className="size-3.5 text-emerald-500" />;
  if (lang === "html") return <FileCode2 className="size-3.5 text-orange-500" />;
  if (lang === "css") return <FileCode2 className="size-3.5 text-sky-500" />;
  if (lang === "javascript") return <FileCode2 className="size-3.5 text-yellow-500" />;
  if (lang === "markdown") return <FileText className="size-3.5 text-muted-foreground" />;
  if (/\.(png|jpe?g|gif|svg|webp|ico|bmp)$/i.test(path))
    return <ImageIcon className="size-3.5 text-purple-500" />;
  return <FileText className="size-3.5 text-muted-foreground" />;
}

export function FileExplorer() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const files = useWorkspaceStore((s) => s.files);
  const setFiles = useWorkspaceStore((s) => s.setFiles);
  const setTree = useWorkspaceStore((s) => s.setTree);
  const tree = useWorkspaceStore((s) => s.tree);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const addFile = useWorkspaceStore((s) => s.addFile);
  const removeFile = useWorkspaceStore((s) => s.removeFile);
  const renameFile = useWorkspaceStore((s) => s.renameFile);

  const queryClient = useQueryClient();

  const { isLoading } = useQuery({
    queryKey: ["files", wsId],
    queryFn: async () => {
      if (!wsId) return null;
      const r = await api.listFiles(wsId);
      setFiles(r.files);
      setTree(r.tree);
      return r;
    },
    enabled: !!wsId,
  });

  // Refresh tree when files map changes (local edits/adds/removes/renames)
  React.useEffect(() => {
    const paths = Object.keys(files);
    setTree(buildFileTree(paths));
  }, [files, setTree]);

  const [newDialog, setNewDialog] = React.useState<
    | { kind: "file" | "folder"; parent: string }
    | null
  >(null);
  const [renameDialog, setRenameDialog] = React.useState<{ path: string } | null>(null);

  async function createNode(name: string, kind: "file" | "folder", parent: string) {
    if (!wsId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const fullPath = joinPath(parent, trimmed);
    if (kind === "folder") {
      // create a placeholder .gitkeep-like file to ensure the folder exists
      const keep = joinPath(fullPath, ".keep");
      try {
        await api.createFile(wsId, { path: keep, content: "" });
        addFile(keep, "", false);
        await queryClient.invalidateQueries({ queryKey: ["files", wsId] });
        toast.success("Folder created");
      } catch (e) {
        toast.error("Failed to create folder", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
      return;
    }
    try {
      await api.createFile(wsId, { path: fullPath, content: "" });
      addFile(fullPath, "", false);
      openTab(fullPath);
      await queryClient.invalidateQueries({ queryKey: ["files", wsId] });
      toast.success("File created", { description: fullPath });
    } catch (e) {
      toast.error("Failed to create file", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function renameNode(from: string, to: string) {
    if (!wsId) return;
    const trimmedTo = to.trim();
    if (!trimmedTo || trimmedTo === from) return;
    try {
      const r = await api.renameFile(wsId, from, trimmedTo);
      renameFile(from, r.file.path);
      await queryClient.invalidateQueries({ queryKey: ["files", wsId] });
      toast.success("Renamed");
    } catch (e) {
      toast.error("Rename failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function deleteNode(path: string) {
    if (!wsId) return;
    try {
      await api.deleteFile(wsId, path);
      removeFile(path);
      await queryClient.invalidateQueries({ queryKey: ["files", wsId] });
      toast.success("Deleted", { description: path });
    } catch (e) {
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function duplicateNode(path: string) {
    if (!wsId) return;
    const dot = path.lastIndexOf(".");
    const ext = dot >= 0 ? path.slice(dot) : "";
    const base = dot >= 0 ? path.slice(0, dot) : path;
    const newPath = `${base}-copy${ext}`;
    const entry = files[path];
    try {
      await api.createFile(wsId, { path: newPath, content: entry?.content ?? "" });
      addFile(newPath, entry?.content ?? "", entry?.isBinary ?? false);
      await queryClient.invalidateQueries({ queryKey: ["files", wsId] });
      toast.success("Duplicated", { description: newPath });
    } catch (e) {
      toast.error("Duplicate failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  function copyPath(path: string) {
    navigator.clipboard?.writeText(path).catch(() => {});
    toast.success("Path copied", { description: path });
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Files
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label="New file">
              <FilePlus2 className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setNewDialog({ kind: "file", parent: "" })}>
              <FilePlus2 className="size-4" /> New File
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setNewDialog({ kind: "folder", parent: "" })}>
              <FolderPlus className="size-4" /> New Folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin py-1">
        {isLoading ? (
          <div className="space-y-1.5 px-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <Folder className="size-6 text-muted-foreground/50" />
            <div className="text-sm font-medium">No files yet</div>
            <div className="text-xs text-muted-foreground">
              Create your first HTML file.
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNewDialog({ kind: "file", parent: "" })}
              className="mt-1"
            >
              <FilePlus2 className="size-3.5" /> New File
            </Button>
          </div>
        ) : (
          <Tree
            nodes={tree}
            depth={0}
            activeFile={activeFile}
            onSelect={(path) => {
              setActiveFile(path);
              openTab(path);
            }}
            onNew={(kind, parent) => setNewDialog({ kind, parent })}
            onRename={(path) => setRenameDialog({ path })}
            onDelete={deleteNode}
            onDuplicate={duplicateNode}
            onCopyPath={copyPath}
          />
        )}
      </div>

      <NameDialog
        open={!!newDialog}
        title={newDialog?.kind === "folder" ? "New folder" : "New file"}
        label="Name"
        placeholder={newDialog?.kind === "folder" ? "folder-name" : "index.html"}
        initial=""
        onCancel={() => setNewDialog(null)}
        onSubmit={(v) => {
          if (newDialog) createNode(v, newDialog.kind, newDialog.parent);
          setNewDialog(null);
        }}
      />
      <NameDialog
        open={!!renameDialog}
        title="Rename"
        label="New path"
        placeholder="path/to/file"
        initial={renameDialog?.path ?? ""}
        onCancel={() => setRenameDialog(null)}
        onSubmit={(v) => {
          if (renameDialog) renameNode(renameDialog.path, v);
          setRenameDialog(null);
        }}
      />
    </div>
  );
}

function Tree({
  nodes,
  depth,
  activeFile,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onDuplicate,
  onCopyPath,
}: {
  nodes: FileNode[];
  depth: number;
  activeFile: string | null;
  onSelect: (path: string) => void;
  onNew: (kind: "file" | "folder", parent: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onDuplicate: (path: string) => void;
  onCopyPath: (path: string) => void;
}) {
  return (
    <div className={depth === 0 ? "" : ""}>
      {nodes.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={depth}
          activeFile={activeFile}
          onSelect={onSelect}
          onNew={onNew}
          onRename={onRename}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onCopyPath={onCopyPath}
        />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  activeFile,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onDuplicate,
  onCopyPath,
}: {
  node: FileNode;
  depth: number;
  activeFile: string | null;
  onSelect: (path: string) => void;
  onNew: (kind: "file" | "folder", parent: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onDuplicate: (path: string) => void;
  onCopyPath: (path: string) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const isActive = node.type === "file" && node.path === activeFile;
  const pad = 6 + depth * 12;

  if (node.type === "folder") {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "group flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-xs hover:bg-accent",
                "focus:outline-none"
              )}
              style={{ paddingLeft: pad }}
            >
              {open ? (
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
              )}
              {open ? (
                <FolderOpen className="size-3.5 shrink-0 text-amber-500" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-amber-500" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => onNew("file", node.path)}>
              <FilePlus2 className="size-4" /> New File
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onNew("folder", node.path)}>
              <FolderPlus className="size-4" /> New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onRename(node.path)}>
              <Pencil className="size-4" /> Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCopyPath(node.path)}>
              <Copy className="size-4" /> Copy Path
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => onDelete(node.path)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {open && node.children && (
          <Tree
            nodes={node.children}
            depth={depth + 1}
            activeFile={activeFile}
            onSelect={onSelect}
            onNew={onNew}
            onRename={onRename}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onCopyPath={onCopyPath}
          />
        )}
      </>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={() => onSelect(node.path)}
          className={cn(
            "group flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-xs",
            isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
          )}
          style={{ paddingLeft: pad + 14 }}
        >
          <FileIcon path={node.path} />
          <span className="truncate">{node.name}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onSelect(node.path)}>
          <FileSymlink className="size-4" /> Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onRename(node.path)}>
          <Pencil className="size-4" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDuplicate(node.path)}>
          <Copy className="size-4" /> Duplicate
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyPath(node.path)}>
          <Copy className="size-4" /> Copy Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onDelete(node.path)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="size-4" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NameDialog({
  open,
  title,
  label,
  placeholder,
  initial,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  placeholder: string;
  initial: string;
  onCancel: () => void;
  onSubmit: (v: string) => void;
}) {
  const [value, setValue] = React.useState(initial);
  React.useEffect(() => setValue(initial), [initial, open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="name">{label}</Label>
          <Input
            id="name"
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit(value);
              }
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(value)} disabled={!value.trim()}>
            {title.includes("Rename") ? "Rename" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

