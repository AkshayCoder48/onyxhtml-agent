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
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
  ArrowDownAZ,
  ArrowUpZA,
  EyeOff,
  Search,
  Sparkles,
  Layers,
  Hash,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { FileNode } from "@/lib/types";
import {
  buildFileTree,
  detectLanguage,
  isBinaryPath,
  joinPath,
  basename as pathBasename,
} from "@/lib/files";
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
  if (/\.(png|jpe?g|gif|svg|webp|ico|bmp)$/i.test(path)) return <ImageIcon className="size-3.5 text-purple-500" />;
  return <FileText className="size-3.5 text-muted-foreground" />;
}

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "html":
    case "htm":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
    case "mjs":
    case "jsx":
      return "text/javascript";
    case "ts":
    case "tsx":
      return "text/typescript";
    case "json":
      return "application/json";
    case "md":
    case "markdown":
      return "text/markdown";
    case "svg":
      return "image/svg+xml";
    case "xml":
      return "application/xml";
    case "txt":
      return "text/plain";
    default:
      return "text/plain";
  }
}

function transformTree(
  nodes: FileNode[],
  opts: { sortAsc: boolean; hideDotfiles: boolean }
): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (opts.hideDotfiles && node.name.startsWith(".")) continue;
    if (node.type === "folder") {
      const children = node.children ? transformTree(node.children, opts) : [];
      result.push({ ...node, children });
    } else {
      result.push(node);
    }
  }
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return opts.sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
  });
  return result;
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
  const renameFileStore = useWorkspaceStore((s) => s.renameFile);
  const aiEditingFiles = useWorkspaceStore((s) => s.aiEditingFiles);

  const queryClient = useQueryClient();

  const [sortAsc, setSortAsc] = React.useState(true);
  const [hideDotfiles, setHideDotfiles] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const { isLoading } = useQuery({
    queryKey: ["files", wsId],
    queryFn: async () => {
      if (!wsId) return null;
      const r = await api.listFiles(wsId);
      const current = useWorkspaceStore.getState().files;
      // Never clobber live editor/AI content if the workspace is already loaded.
      if (Object.keys(current).length === 0) {
        setFiles(r.files);
        setTree(r.tree);
      }
      return r;
    },
    enabled: !!wsId,
  });

  React.useEffect(() => {
    const paths = Object.keys(files);
    setTree(buildFileTree(paths));
  }, [files, setTree]);

  React.useEffect(() => {
    function onRefresh() {
      if (wsId) queryClient.invalidateQueries({ queryKey: ["files", wsId] });
    }
    function onNewFile() {
      setNewDialog({ kind: "file", parent: "" });
    }
    function onNewFolder() {
      setNewDialog({ kind: "folder", parent: "" });
    }
    window.addEventListener("files:refresh", onRefresh as EventListener);
    window.addEventListener("files:new-file", onNewFile as EventListener);
    window.addEventListener("files:new-folder", onNewFolder as EventListener);
    return () => {
      window.removeEventListener("files:refresh", onRefresh as EventListener);
      window.removeEventListener("files:new-file", onNewFile as EventListener);
      window.removeEventListener("files:new-folder", onNewFolder as EventListener);
    };
  }, [wsId, queryClient]);

  const visibleTree = React.useMemo(() => transformTree(tree, { sortAsc, hideDotfiles }), [tree, sortAsc, hideDotfiles]);

  const filteredTree = React.useMemo(() => {
    if (!search) return visibleTree;
    function filterNodes(nodes: FileNode[]): FileNode[] {
      const out: FileNode[] = [];
      for (const node of nodes) {
        if (node.type === "folder") {
          const filteredChildren = node.children ? filterNodes(node.children) : [];
          if (filteredChildren.length > 0 || node.name.toLowerCase().includes(search.toLowerCase())) {
            out.push({ ...node, children: filteredChildren });
          }
        } else {
          if (node.name.toLowerCase().includes(search.toLowerCase()) || node.path.toLowerCase().includes(search.toLowerCase())) {
            out.push(node);
          }
        }
      }
      return out;
    }
    return filterNodes(visibleTree);
  }, [visibleTree, search]);

  const [newDialog, setNewDialog] = React.useState<{ kind: "file" | "folder"; parent: string } | null>(null);
  const [renameDialog, setRenameDialog] = React.useState<{ path: string } | null>(null);
  const [dragOverPath, setDragOverPath] = React.useState<string | null>(null);

  async function createNode(name: string, kind: "file" | "folder", parent: string) {
    if (!wsId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const fullPath = joinPath(parent, trimmed);
    if (kind === "folder") {
      const keep = joinPath(fullPath, ".keep");
      try {
        await api.createFile(wsId, { path: keep, content: "" });
        addFile(keep, "", false);
        await queryClient.invalidateQueries({ queryKey: ["files", wsId] });
        toast.success("Folder created");
      } catch (e) {
        toast.error("Failed to create folder", { description: e instanceof Error ? e.message : undefined });
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
      toast.error("Failed to create file", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function renameNode(from: string, to: string) {
    if (!wsId) return;
    const trimmedTo = to.trim();
    if (!trimmedTo || trimmedTo === from) return;
    try {
      const r = await api.renameFile(wsId, from, trimmedTo);
      renameFileStore(from, r.file.path);
      await queryClient.invalidateQueries({ queryKey: ["files", wsId] });
      toast.success("Renamed");
    } catch (e) {
      toast.error("Rename failed", { description: e instanceof Error ? e.message : undefined });
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
      toast.error("Delete failed", { description: e instanceof Error ? e.message : undefined });
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
      toast.error("Duplicate failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function openInNewTab(path: string) {
    if (!wsId) return;
    const entry = files[path];
    const binary = entry?.isBinary || isBinaryPath(path);
    if (binary) {
      toast.info("Cannot open binary file in tab");
      return;
    }
    try {
      const r = await api.getFile(wsId, path);
      const mime = mimeForPath(path);
      const blob = new Blob([r.file.content], { type: mime });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        toast.error("Pop-up blocked", { description: "Allow pop-ups to open files in a new tab." });
        URL.revokeObjectURL(url);
        return;
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error("Failed to open file", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function moveNode(source: string, destFolder: string) {
    if (!wsId) return;
    const src = source.trim();
    if (!src) return;
    const base = pathBasename(src);
    const newPath = joinPath(destFolder, base);
    if (newPath === src) return;
    if (destFolder === src || destFolder.startsWith(src + "/")) {
      toast.error("Cannot move a folder into itself");
      return;
    }
    try {
      const r = await api.renameFile(wsId, src, newPath);
      renameFileStore(src, r.file.path);
      await queryClient.invalidateQueries({ queryKey: ["files", wsId] });
      toast.success("Moved", { description: `${src} → ${newPath}` });
    } catch (e) {
      toast.error("Move failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  function copyPath(path: string) {
    navigator.clipboard?.writeText(path).catch(() => {});
    toast.success("Path copied", { description: path });
  }

  function refresh() {
    if (wsId) queryClient.invalidateQueries({ queryKey: ["files", wsId] });
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-1 border-b bg-card/30 px-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
            <Layers className="size-4 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold">Explorer</span>
          <Badge variant="secondary" className="h-5 rounded-full text-[10px]">
            {Object.keys(files).length}
          </Badge>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => setNewDialog({ kind: "file", parent: "" })} aria-label="New file">
            <FilePlus2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => setNewDialog({ kind: "folder", parent: "" })} aria-label="New folder">
            <FolderPlus className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 rounded-full" aria-label="More">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onSelect={refresh} className="gap-2">
                <RefreshCw className="size-4" /> Refresh
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSortAsc((v) => !v)} className="gap-2">
                {sortAsc ? <ArrowDownAZ className="size-4" /> : <ArrowUpZA className="size-4" />}
                {sortAsc ? "Sort A → Z" : "Sort Z → A"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHideDotfiles((v) => !v)} className="gap-2">
                <EyeOff className="size-4" /> {hideDotfiles ? "Show dotfiles" : "Hide dotfiles"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("files:find-in-files"))} className="gap-2">
                <Search className="size-4" /> Find in files
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files..." className="h-8 rounded-full pl-8 text-xs" />
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin py-2"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/plain")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("text/plain")) return;
          e.preventDefault();
          const source = e.dataTransfer.getData("text/plain");
          if (source) void moveNode(source, "");
          setDragOverPath(null);
        }}
      >
        {isLoading ? (
          <div className="space-y-2 px-3 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Folder className="size-6 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium">{search ? "No matches" : "No files yet"}</div>
              <div className="mt-1 text-xs text-muted-foreground">{search ? `No files match "${search}"` : "Create your first HTML file"}</div>
            </div>
            {!search && (
              <Button size="sm" variant="outline" onClick={() => setNewDialog({ kind: "file", parent: "" })} className="mt-1 rounded-full">
                <FilePlus2 className="size-4" /> New File
              </Button>
            )}
          </div>
        ) : (
          <Tree
            nodes={filteredTree}
            depth={0}
            activeFile={activeFile}
            dragOverPath={dragOverPath}
            aiEditingFiles={aiEditingFiles}
            onSelect={(path) => {
              setActiveFile(path);
              openTab(path);
            }}
            onNew={(kind, parent) => setNewDialog({ kind, parent })}
            onRename={(path) => setRenameDialog({ path })}
            onDelete={deleteNode}
            onDuplicate={duplicateNode}
            onCopyPath={copyPath}
            onOpenInNewTab={openInNewTab}
            onDragOverChange={setDragOverPath}
            onDrop={moveNode}
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
  dragOverPath,
  aiEditingFiles,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onDuplicate,
  onCopyPath,
  onOpenInNewTab,
  onDragOverChange,
  onDrop,
}: {
  nodes: FileNode[];
  depth: number;
  activeFile: string | null;
  dragOverPath: string | null;
  aiEditingFiles: Set<string>;
  onSelect: (path: string) => void;
  onNew: (kind: "file" | "folder", parent: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onDuplicate: (path: string) => void;
  onCopyPath: (path: string) => void;
  onOpenInNewTab: (path: string) => void;
  onDragOverChange: (path: string | null) => void;
  onDrop: (source: string, destFolder: string) => void;
}) {
  return (
    <div className="space-y-0.5 px-1">
      {nodes.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={depth}
          activeFile={activeFile}
          dragOverPath={dragOverPath}
          aiEditingFiles={aiEditingFiles}
          onSelect={onSelect}
          onNew={onNew}
          onRename={onRename}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onCopyPath={onCopyPath}
          onOpenInNewTab={onOpenInNewTab}
          onDragOverChange={onDragOverChange}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  activeFile,
  dragOverPath,
  aiEditingFiles,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onDuplicate,
  onCopyPath,
  onOpenInNewTab,
  onDragOverChange,
  onDrop,
}: {
  node: FileNode;
  depth: number;
  activeFile: string | null;
  dragOverPath: string | null;
  aiEditingFiles: Set<string>;
  onSelect: (path: string) => void;
  onNew: (kind: "file" | "folder", parent: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onDuplicate: (path: string) => void;
  onCopyPath: (path: string) => void;
  onOpenInNewTab: (path: string) => void;
  onDragOverChange: (path: string | null) => void;
  onDrop: (source: string, destFolder: string) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const isActive = node.type === "file" && node.path === activeFile;
  const isAiEditing = node.type === "file" && aiEditingFiles.has(node.path);
  const pad = 8 + depth * 14;
  const isDropTarget = node.type === "folder" && dragOverPath === node.path;

  function handleDragStart(e: React.DragEvent<HTMLButtonElement>) {
    e.dataTransfer.setData("text/plain", node.path);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent<HTMLButtonElement>) {
    if (node.type !== "folder") return;
    if (e.dataTransfer.types.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverPath !== node.path) onDragOverChange(node.path);
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLButtonElement>) {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    if (dragOverPath === node.path) onDragOverChange(null);
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    if (node.type !== "folder") return;
    if (!e.dataTransfer.types.includes("text/plain")) return;
    e.preventDefault();
    e.stopPropagation();
    const source = e.dataTransfer.getData("text/plain");
    if (source) onDrop(source, node.path);
    onDragOverChange(null);
  }

  if (node.type === "folder") {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              draggable
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "group flex w-full items-center gap-1.5 rounded-full py-1.5 pr-2 text-left text-xs font-medium transition-colors focus:outline-none",
                isDropTarget ? "ring-2 ring-violet-500/60 bg-violet-500/10" : "hover:bg-accent"
              )}
              style={{ paddingLeft: pad }}
            >
              {open ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
              {open ? <FolderOpen className="size-4 shrink-0 text-amber-500" /> : <Folder className="size-4 shrink-0 text-amber-500/70" />}
              <span className="truncate">{node.name}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="rounded-xl">
            <ContextMenuItem onSelect={() => onNew("file", node.path)} className="gap-2">
              <FilePlus2 className="size-4" /> New File
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onNew("folder", node.path)} className="gap-2">
              <FolderPlus className="size-4" /> New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onRename(node.path)} className="gap-2">
              <Pencil className="size-4" /> Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCopyPath(node.path)} className="gap-2">
              <Copy className="size-4" /> Copy Path
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onDelete(node.path)} className="gap-2 text-destructive focus:text-destructive">
              <Trash2 className="size-4" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {open && node.children && (
          <Tree
            nodes={node.children}
            depth={depth + 1}
            activeFile={activeFile}
            dragOverPath={dragOverPath}
            aiEditingFiles={aiEditingFiles}
            onSelect={onSelect}
            onNew={onNew}
            onRename={onRename}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onCopyPath={onCopyPath}
            onOpenInNewTab={onOpenInNewTab}
            onDragOverChange={onDragOverChange}
            onDrop={onDrop}
          />
        )}
      </>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          draggable
          onDragStart={handleDragStart}
          onClick={() => onSelect(node.path)}
          className={cn(
            "group flex w-full items-center gap-1.5 rounded-full py-1.5 pr-2 text-left text-xs transition-all",
            isActive ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent",
            isAiEditing && !isActive && "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/20"
          )}
          style={{ paddingLeft: pad + 16 }}
        >
          {isAiEditing ? <Sparkles className="size-3.5 animate-pulse-soft" /> : <FileIcon path={node.path} />}
          <span className="truncate font-mono text-[12px]">{node.name}</span>
          {isAiEditing && <span className="ml-auto size-1.5 animate-pulse rounded-full bg-violet-500" />}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="rounded-xl">
        <ContextMenuItem onSelect={() => onSelect(node.path)} className="gap-2">
          <FileSymlink className="size-4" /> Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onOpenInNewTab(node.path)} className="gap-2">
          <ExternalLink className="size-4" /> Open in New Tab
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onRename(node.path)} className="gap-2">
          <Pencil className="size-4" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDuplicate(node.path)} className="gap-2">
          <Copy className="size-4" /> Duplicate
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyPath(node.path)} className="gap-2">
          <Hash className="size-4" /> Copy Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onDelete(node.path)} className="gap-2 text-destructive focus:text-destructive">
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
      <DialogContent className="max-w-sm rounded-2xl">
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
            className="rounded-xl"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} className="rounded-full">
            Cancel
          </Button>
          <Button onClick={() => onSubmit(value)} disabled={!value.trim()} className="rounded-full">
            {title.includes("Rename") ? "Rename" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
