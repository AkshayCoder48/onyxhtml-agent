// ============================================================================
// In-memory file tool executor for the Web Worker.
//
// Mirrors executeFileTool from src/lib/ai/tools.ts but operates on a plain
// files map instead of the database. After each tool call the worker sends
// the updated files back to the main thread, which persists them to
// localStorage and updates the workspace store.
// ============================================================================

import { safePath } from "@/lib/files";

export type WorkerFile = { path: string; content: string; isBinary: boolean };

export type FileOpResult = {
  result: unknown;
  files: WorkerFile[]; // full snapshot after mutation
};

function toSnapshot(files: Map<string, WorkerFile>): WorkerFile[] {
  return Array.from(files.values());
}

export function executeFileToolInMemory(
  name: string,
  args: Record<string, unknown>,
  files: Map<string, WorkerFile>
): FileOpResult {
  switch (name) {
    case "list_files": {
      return {
        result: { paths: Array.from(files.keys()).sort() },
        files: toSnapshot(files),
      };
    }
    case "read_file": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      return {
        result: {
          path,
          content: file.content,
          lines: file.content.split("\n").length,
        },
        files: toSnapshot(files),
      };
    }
    case "create_file":
    case "write_file": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const content = String(args.content ?? "");
      files.set(path, { path, content, isBinary: false });
      return { result: { path }, files: toSnapshot(files) };
    }
    case "edit_file": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const oldContent = String(args.oldContent ?? "");
      const newContent = String(args.newContent ?? "");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const idx = file.content.indexOf(oldContent);
      if (idx === -1) {
        throw new Error(
          `oldContent not found in ${path}. Make sure it matches exactly (including whitespace).`
        );
      }
      const next =
        file.content.slice(0, idx) +
        newContent +
        file.content.slice(idx + oldContent.length);
      files.set(path, { ...file, content: next });
      return { result: { path, replaced: 1 }, files: toSnapshot(files) };
    }
    case "delete_file": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const prefix = path.endsWith("/") ? path : path + "/";
      for (const key of Array.from(files.keys())) {
        if (key === path || key.startsWith(prefix)) files.delete(key);
      }
      return { result: { path }, files: toSnapshot(files) };
    }
    case "rename_file":
    case "move_file": {
      const from = safePath(String(args.from ?? ""));
      const to = safePath(String(args.to ?? ""));
      if (!from || !to) throw new Error("Invalid path");
      if (from === to) throw new Error("Source and destination are the same");
      const existing = files.get(from);
      const children: [string, WorkerFile][] = [];
      for (const [k, v] of files) {
        if (k.startsWith(from + "/")) children.push([k, v]);
      }
      if (!existing && children.length === 0) {
        throw new Error(`File or folder not found: ${from}`);
      }
      if (files.has(to)) throw new Error(`Destination already exists: ${to}`);
      if (children.length > 0 && (to + "/").startsWith(from + "/")) {
        throw new Error("Cannot move a folder into itself");
      }
      if (existing) {
        files.set(to, { ...existing, path: to });
        files.delete(from);
      }
      for (const [childPath, child] of children) {
        const newPath = to + childPath.slice(from.length);
        files.set(newPath, { ...child, path: newPath });
        files.delete(childPath);
      }
      return { result: { from, to }, files: toSnapshot(files) };
    }
    case "replace_content": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const find = String(args.find ?? "");
      if (!find) throw new Error("`find` must not be empty");
      const replace = String(args.replace ?? "");
      const all = args.all !== false;
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      let count = 0;
      let next: string;
      if (all) {
        const parts = file.content.split(find);
        count = parts.length - 1;
        next = parts.join(replace);
      } else {
        const idx = file.content.indexOf(find);
        if (idx === -1) throw new Error(`Text not found in ${path}`);
        next =
          file.content.slice(0, idx) +
          replace +
          file.content.slice(idx + find.length);
        count = 1;
      }
      if (count === 0) throw new Error(`Text not found in ${path}`);
      files.set(path, { ...file, content: next });
      return { result: { path, replaced: count }, files: toSnapshot(files) };
    }
    case "create_folder": {
      const folder = safePath(String(args.path ?? ""));
      if (!folder) throw new Error("Invalid path");
      const keepPath = folder.endsWith("/")
        ? folder + ".gitkeep"
        : folder + "/.gitkeep";
      if (!files.has(keepPath)) {
        files.set(keepPath, { path: keepPath, content: "", isBinary: false });
      }
      return { result: { path: folder }, files: toSnapshot(files) };
    }
    case "search_files": {
      const query = String(args.query ?? "").toLowerCase();
      if (!query) return { result: { matches: [] }, files: toSnapshot(files) };
      const matches: { path: string; line: number; text: string }[] = [];
      outer: for (const f of files.values()) {
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query)) {
            matches.push({
              path: f.path,
              line: i + 1,
              text: lines[i].trim().slice(0, 200),
            });
            if (matches.length >= 50) break outer;
          }
        }
      }
      return { result: { matches }, files: toSnapshot(files) };
    }
    default:
      throw new Error(`Unknown file tool: ${name}`);
  }
}
