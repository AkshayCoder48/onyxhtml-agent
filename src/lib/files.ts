import { FileNode } from "./types";

// Security: validate that a path stays within the workspace (no ../, no absolute)
export function safePath(path: string): string {
  if (!path) return "";
  // Normalize backslashes
  let p = path.replace(/\\/g, "/").trim();
  // Strip leading slashes
  p = p.replace(/^\/+/, "");
  // Strip any traversal segments
  const parts = p.split("/").filter((s) => s.length > 0 && s !== "." && s !== "..");
  return parts.join("/");
}

export function isPathSafe(path: string): boolean {
  if (!path) return false;
  if (/[\\]$/.test(path)) return false;
  const normalized = path.replace(/\\/g, "/");
  if (normalized.includes("..")) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return false;
  return true;
}

// Detect language from file extension
export function detectLanguage(path: string): "html" | "css" | "javascript" | "json" | "markdown" | "text" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "markdown":
      return "markdown";
    default:
      return "text";
  }
}

export function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext);
}

export function isBinaryPath(path: string): boolean {
  return isImageFile(path);
}

// Build a tree from a flat list of file paths
export function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode = { name: "", path: "", type: "folder", children: [] };

  for (const full of paths) {
    const parts = full.split("/").filter(Boolean);
    let current = root;
    let acc = "";
    parts.forEach((part, idx) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLast = idx === parts.length - 1;
      let child = current.children?.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          path: acc,
          type: isLast ? "file" : "folder",
          children: isLast ? undefined : [],
        };
        current.children?.push(child);
      } else if (isLast) {
        child.type = "file";
      }
      current = child;
    });
  }

  sortTree(root);
  return root.children ?? [];
}

function sortTree(node: FileNode) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

// Find the entry HTML file to preview (prefer index.html at root)
export function findEntryFile(paths: string[]): string | null {
  const set = new Set(paths);
  const candidates = ["index.html", "Index.html", "INDEX.HTML", "home.html", "main.html"];
  for (const c of candidates) {
    if (set.has(c)) return c;
  }
  const html = paths.find((p) => p.toLowerCase().endsWith(".html"));
  return html ?? null;
}

export function parentDir(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.substring(0, idx);
}

export function joinPath(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}
