// ============================================================================
// In-memory file tool executor for the Web Worker.
//
// Mirrors executeFileTool from src/lib/ai/tools.ts but operates on a plain
// files map instead of the database. After each tool call the worker sends
// the updated files back to the main thread, which persists them to
// localStorage and updates the workspace store.
// ============================================================================

import { safePath } from "@/lib/files";
import {
  getLines,
  outlineHtml,
  extractSymbols,
  findSymbolAcrossFiles,
  findUnusedCss,
  getDependencyGraph,
  validateHtml,
  editCssRule,
  addCssRule,
  removeCssRule,
  renameClassAcrossFiles,
  getRelevantFiles,
} from "./tools/code-intel";

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
    case "read_file_lines": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const start = Number(args.startLine ?? 1);
      const end = Number(args.endLine ?? start + 50);
      const { lines, total } = getLines(file.content, start, end);
      return { result: { path, lines, startLine: start, endLine: Math.min(end, total), totalLines: total }, files: toSnapshot(files) };
    }
    case "read_file_outline": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const outline = outlineHtml(file.content);
      const symbols = extractSymbols(file.content, path);
      return { result: { path, outline, symbols }, files: toSnapshot(files) };
    }
    case "get_file_symbols": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      return { result: { path, symbols: extractSymbols(file.content, path) }, files: toSnapshot(files) };
    }
    case "find_symbol": {
      const symbol = String(args.symbol ?? "").trim();
      if (!symbol) throw new Error("symbol required");
      const map = new Map<string, { content: string }>();
      for (const f of files.values()) map.set(f.path, { content: f.content });
      const matches = findSymbolAcrossFiles(map, symbol);
      return { result: { symbol, matches }, files: toSnapshot(files) };
    }
    case "get_file_stats": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const lines = file.content.split("\n").length;
      const size = file.content.length;
      const todos = (file.content.match(/TODO|FIXME/gi) || []).length;
      return { result: { path, lines, size, todos }, files: toSnapshot(files) };
    }
    case "edit_css_rule": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const selector = String(args.selector ?? "");
      const property = String(args.property ?? "");
      const value = String(args.value ?? "");
      const next = editCssRule(file.content, selector, property, value);
      files.set(path, { ...file, content: next });
      return { result: { path, selector, property, value }, files: toSnapshot(files) };
    }
    case "add_css_rule": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const selector = String(args.selector ?? "");
      const declarations = String(args.declarations ?? "");
      const next = addCssRule(file.content, selector, declarations);
      files.set(path, { ...file, content: next });
      return { result: { path, selector }, files: toSnapshot(files) };
    }
    case "remove_css_rule": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const selector = String(args.selector ?? "");
      const next = removeCssRule(file.content, selector);
      files.set(path, { ...file, content: next });
      return { result: { path, selector }, files: toSnapshot(files) };
    }
    case "rename_class": {
      const oldName = String(args.oldName ?? "").trim();
      const newName = String(args.newName ?? "").trim();
      if (!oldName || !newName) throw new Error("oldName and newName required");
      const map = new Map<string, { content: string; path: string }>();
      for (const f of files.values()) map.set(f.path, { content: f.content, path: f.path });
      const updates = renameClassAcrossFiles(map, oldName, newName);
      for (const u of updates) {
        const existing = files.get(u.path);
        if (existing) files.set(u.path, { ...existing, content: u.newContent });
      }
      return { result: { oldName, newName, changedFiles: updates.map((u) => u.path) }, files: toSnapshot(files) };
    }
    case "rename_id": {
      const oldName = String(args.oldName ?? "").trim();
      const newName = String(args.newName ?? "").trim();
      if (!oldName || !newName) throw new Error("oldName and newName required");
      const changed: string[] = [];
      for (const [path, file] of files) {
        let next = file.content;
        next = next.replace(new RegExp(`id\\s*=\\s*[\"']${oldName}[\"']`, "g"), `id=\"${newName}\"`);
        next = next.replace(new RegExp(`#${oldName}\\b`, "g"), `#${newName}`);
        if (next !== file.content) {
          files.set(path, { ...file, content: next });
          changed.push(path);
        }
      }
      return { result: { oldName, newName, changedFiles: changed }, files: toSnapshot(files) };
    }
    case "find_unused_css": {
      const map = new Map<string, { content: string }>();
      for (const f of files.values()) map.set(f.path, { content: f.content });
      const unused = findUnusedCss(map);
      return { result: { unused }, files: toSnapshot(files) };
    }
    case "get_dependency_graph": {
      const map = new Map<string, { content: string }>();
      for (const f of files.values()) map.set(f.path, { content: f.content });
      return { result: getDependencyGraph(map), files: toSnapshot(files) };
    }
    case "validate_html": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const errors = validateHtml(file.content);
      return { result: { path, errors, valid: errors.length === 0 }, files: toSnapshot(files) };
    }
    case "batch_edit": {
      const edits = (args.edits as { path: string; oldContent: string; newContent: string }[]) ?? [];
      const edited: string[] = [];
      const failed: { path: string; error: string }[] = [];
      for (const e of edits) {
        try {
          const path = safePath(String(e.path ?? ""));
          if (!path) throw new Error("Invalid path");
          const file = files.get(path);
          if (!file) throw new Error(`File not found: ${path}`);
          const idx = file.content.indexOf(e.oldContent);
          if (idx === -1) throw new Error("oldContent not found");
          const next = file.content.slice(0, idx) + e.newContent + file.content.slice(idx + e.oldContent.length);
          files.set(path, { ...file, content: next });
          edited.push(path);
        } catch (err) {
          failed.push({ path: String((e as any).path ?? ""), error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { result: { edited, failed }, files: toSnapshot(files) };
    }
    case "batch_create": {
      const fileList = (args.files as { path: string; content: string }[]) ?? [];
      const created: string[] = [];
      for (const f of fileList) {
        const path = safePath(String(f.path ?? ""));
        if (!path) continue;
        const content = String(f.content ?? "");
        files.set(path, { path, content, isBinary: false });
        created.push(path);
      }
      return { result: { created }, files: toSnapshot(files) };
    }
    case "get_relevant_files": {
      const query = String(args.query ?? "");
      const limit = Number(args.limit ?? 5);
      const map = new Map<string, { content: string }>();
      for (const f of files.values()) map.set(f.path, { content: f.content });
      const relevant = getRelevantFiles(map, query, limit);
      return { result: { query, relevant }, files: toSnapshot(files) };
    }
    case "search_class_usage": {
      const className = String(args.className ?? "").trim();
      if (!className) throw new Error("className required");
      const matches: { path: string; line: number; text: string }[] = [];
      for (const f of files.values()) {
        if (!f.path.endsWith(".html")) continue;
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(className)) {
            matches.push({ path: f.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (matches.length >= 50) break;
          }
        }
        if (matches.length >= 50) break;
      }
      return { result: { className, matches }, files: toSnapshot(files) };
    }
    case "get_html_structure": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const structure = outlineHtml(file.content);
      return { result: { path, structure }, files: toSnapshot(files) };
    }
    case "create_plan": {
      const title = String(args.title ?? "Plan");
      const steps = (args.steps as any[]) ?? [];
      return { result: { title, steps, createdAt: new Date().toISOString() }, files: toSnapshot(files) };
    }
    case "ask_user": {
      const question = String(args.question ?? "");
      const options = (args.options as string[]) ?? [];
      return { result: { question, options, requiresUserInput: true }, files: toSnapshot(files) };
    }
    case "checkpoint": {
      const message = String(args.message ?? "Checkpoint");
      return { result: { message, timestamp: new Date().toISOString(), checkpoint: true, fileCount: files.size }, files: toSnapshot(files) };
    }
    case "generate_palette": {
      const mood = String(args.mood ?? "modern");
      const palettes: Record<string, string[]> = {
        "coffee shop": ["#3c2415", "#a47551", "#f5e6d3", "#d4a574", "#2c1810"],
        minimal: ["#0f172a", "#f8fafc", "#e2e8f0", "#94a3b8", "#3b82f6"],
        cyberpunk: ["#ff00ff", "#00ffff", "#0f0f0f", "#ffea00", "#ff0055"],
        ocean: ["#0a192f", "#64ffda", "#8892b0", "#112240", "#e6f1ff"],
        sunset: ["#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1", "#5f27cd"],
        forest: ["#2d5016", "#618b25", "#a4be7b", "#e5d3b3", "#285430"],
        default: ["#7c3aed", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b"],
      };
      const key = mood.toLowerCase();
      const palette = palettes[key] || palettes["default"];
      const count = Math.min(Math.max(Number(args.count ?? 5), 2), 10);
      return { result: { mood, palette: palette.slice(0, count), name: mood }, files: toSnapshot(files) };
    }
    case "generate_qr": {
      const text = String(args.text ?? "");
      const outPath = safePath(String(args.path ?? "assets/qr.svg")) || "assets/qr.svg";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><rect x="10" y="10" width="40" height="40" fill="black"/><rect x="150" y="10" width="40" height="40" fill="black"/><rect x="10" y="150" width="40" height="40" fill="black"/><text x="100" y="100" text-anchor="middle" font-size="8" font-family="monospace">${text.slice(0, 20)}</text></svg>`;
      files.set(outPath, { path: outPath, content: svg, isBinary: false });
      return { result: { path: outPath, text, placeholder: true }, files: toSnapshot(files) };
    }
    default:
      throw new Error(`Unknown file tool: ${name}`);
  }
}
