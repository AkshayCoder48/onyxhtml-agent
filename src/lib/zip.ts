import JSZip from "jszip";
import { safePath } from "./files";

export type ZipEntry = {
  path: string;
  content: string;
  isBinary: boolean;
};

const BINARY_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "pdf",
  "zip",
  "tar",
  "gz",
]);

export function isBinaryExt(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTS.has(ext);
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workspace";
}

// Build a ZIP buffer with all files under a top folder named after the workspace.
export async function createWorkspaceZip(
  folderName: string,
  files: ZipEntry[]
): Promise<Buffer> {
  const zip = new JSZip();
  const top = zip.folder(folderName) ?? zip;
  for (const f of files) {
    const safe = safePath(f.path);
    if (!safe) continue;
    if (f.isBinary) {
      try {
        const buf = Buffer.from(f.content, "base64");
        top.file(safe, buf);
      } catch {
        top.file(safe, f.content);
      }
    } else {
      top.file(safe, f.content);
    }
  }
  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return out as Buffer;
}

// Extract a ZIP buffer into a list of file entries, stripping the common top
// folder (if all entries share one). Rejects unsafe paths and OS metadata.
export async function extractZip(buffer: Buffer): Promise<ZipEntry[]> {
  const zip = await JSZip.loadAsync(buffer);
  const rawEntries = Object.values(zip.files).filter((e) => !e.dir);
  const safeEntries = rawEntries.filter((e) => isImportPathSafe(e.name));
  if (safeEntries.length === 0) return [];

  const stripped = safeEntries.map((e) => ({
    entry: e,
    relPath: stripCommonPrefix(safeEntries.map((x) => x.name), e.name),
  }));

  const out: ZipEntry[] = [];
  for (const { entry, relPath } of stripped) {
    const path = safePath(relPath);
    if (!path) continue;
    const isBinary = isBinaryExt(path);
    if (isBinary) {
      const b64 = await entry.async("base64");
      out.push({ path, content: b64, isBinary: true });
    } else {
      const text = await entry.async("string");
      out.push({ path, content: text, isBinary: false });
    }
  }
  return out;
}

function isImportPathSafe(p: string): boolean {
  if (!p) return false;
  const norm = p.replace(/\\/g, "/");
  if (norm.includes("..")) return false;
  if (/^[a-zA-Z]:/.test(norm)) return false;
  if (norm.startsWith("/")) return false;
  if (norm.startsWith("__MACOSX/")) return false;
  const base = norm.split("/").pop() ?? "";
  if (base.startsWith("._")) return false;
  if (base === ".DS_Store") return false;
  if (base === "Thumbs.db") return false;
  return true;
}

// If all entries share a common top folder (e.g. "myproj/index.html"), strip it.
function stripCommonPrefix(allPaths: string[], target: string): string {
  const firstSegs = allPaths
    .map((p) => p.split("/")[0])
    .filter(Boolean);
  if (firstSegs.length === 0) return target;
  const first = firstSegs[0];
  const allShareTop = firstSegs.every((s) => s === first);
  // Only strip if there's actually a top folder AND target has more than just that folder
  if (allShareTop && target.startsWith(first + "/")) {
    return target.slice(first.length + 1);
  }
  return target;
}
