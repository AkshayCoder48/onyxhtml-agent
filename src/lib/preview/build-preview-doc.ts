import { dirname } from "@/lib/files";

export function isRemoteAsset(href: string): boolean {
  const s = href.trim();
  return (
    /^https?:\/\//i.test(s) ||
    s.startsWith("//") ||
    s.startsWith("data:") ||
    s.startsWith("blob:") ||
    s.startsWith("mailto:") ||
    s.startsWith("tel:") ||
    s.startsWith("javascript:")
  );
}

export function resolveLocalPath(
  href: string,
  files: Record<string, { content: string; isBinary: boolean }>,
  fromDir: string
): string | null {
  if (!href) return null;
  const cleaned = href.split("#")[0].split("?")[0].trim();
  if (!cleaned || isRemoteAsset(cleaned)) return null;
  const stripped = cleaned.replace(/^\.\//, "").replace(/^\//, "");
  const joined = fromDir ? `${fromDir}/${stripped}`.replace(/\/+/g, "/") : stripped;
  const candidates = [stripped, joined];
  try {
    candidates.push(decodeURIComponent(stripped));
    candidates.push(decodeURIComponent(joined));
  } catch {
    // ignore
  }
  for (const c of candidates) {
    const norm = c.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "");
    if (files[norm]) return norm;
    const lower = norm.toLowerCase();
    for (const k of Object.keys(files)) {
      if (k.toLowerCase() === lower) return k;
    }
  }
  return null;
}

function inlineCssImports(
  css: string,
  files: Record<string, { content: string; isBinary: boolean }>,
  fromDir: string,
  seen: Set<string>
): string {
  return css.replace(
    /@import\s+(?:url\(\s*)?['"]?([^'")\s]+)['"]?\s*\)?\s*;/gi,
    (full, href: string) => {
      const path = resolveLocalPath(href, files, fromDir);
      if (!path || seen.has(path)) return full;
      seen.add(path);
      const nested = files[path]?.content ?? "";
      return `/* inlined ${path} */\n${inlineCssImports(nested, files, dirname(path), seen)}\n`;
    }
  );
}

export function assemblePreviewHtml(
  files: Record<string, { content: string; isBinary: boolean }>,
  entry: string,
  bridgeScript: string
): string {
  const html = files[entry]?.content ?? "";
  if (!html) {
    return "<!doctype html><html><body><p>No HTML to preview.</p></body></html>";
  }

  const entryDir = dirname(entry);
  const used = new Set<string>([entry]);

  let out = html.replace(/<link\b[^>]*?>/gi, (tag) => {
    if (!/rel\s*=\s*["']?stylesheet["']?/i.test(tag)) return tag;
    const m = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!m) return tag;
    const path = resolveLocalPath(m[1], files, entryDir);
    if (!path) return tag;
    used.add(path);
    const css = inlineCssImports(files[path]?.content ?? "", files, dirname(path), new Set([path]));
    return `<style data-src="${path}">\n${css}\n</style>`;
  });

  out = out.replace(
    /<script\b([^>]*?)src\s*=\s*["']([^"']+)["']([^>]*?)>\s*<\/script>/gi,
    (tag, pre: string, src: string, post: string) => {
      const path = resolveLocalPath(src, files, entryDir);
      if (!path) return tag;
      used.add(path);
      const js = files[path]?.content ?? "";
      const attrs = `${pre}${post}`.replace(/\s+/g, " ").trim();
      return `<script ${attrs} data-src="${path}">\n${js}\n</script>`;
    }
  );

  out = out.replace(/<img\b([^>]*?)src\s*=\s*["']([^"']+)["']([^>]*?)>/gi, (tag, pre: string, src: string, post: string) => {
    const path = resolveLocalPath(src, files, entryDir);
    if (!path) return tag;
    const f = files[path];
    if (!f || f.isBinary) return tag;
    if (!path.toLowerCase().endsWith(".svg")) return tag;
    used.add(path);
    const data = `data:image/svg+xml;utf8,${encodeURIComponent(f.content)}`;
    return `<img ${pre} src="${data}" ${post} />`;
  });

  const extras: string[] = [];
  for (const [path, f] of Object.entries(files)) {
    if (used.has(path) || f.isBinary) continue;
    if (path === "AGENT.md" || /\.md$/i.test(path)) continue;
    if (/\.css$/i.test(path)) {
      used.add(path);
      const css = inlineCssImports(f.content, files, dirname(path), new Set([path]));
      extras.push(`<style data-src="${path}">\n${css}\n</style>`);
    } else if (/\.(m?js|cjs)$/i.test(path)) {
      used.add(path);
      extras.push(`<script data-src="${path}">\n${f.content}\n</script>`);
    }
  }

  const entryBoot = `<script>window.__onyxEntry=${JSON.stringify(entry)};</script>`;
  const extrasHtml = extras.join("\n");
  const tail = `${extrasHtml}${entryBoot}<script>${bridgeScript}</script>`;

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${tail}</body>`);
  } else {
    out = `${out}${tail}`;
  }
  return out;
}

export function findWorkspaceHtml(
  path: string,
  files: Record<string, { content: string; isBinary: boolean }>
): string | null {
  const cleaned = path.replace(/^\.\//, "").replace(/^\//, "").replace(/\/+$/, "");
  const cands = [cleaned, cleaned ? `${cleaned}/index.html` : "index.html"];
  if (!/\.[a-z0-9]+$/i.test(cleaned)) cands.push(`${cleaned}.html`);
  for (const c of cands) {
    if (!c) continue;
    if (files[c]) return c;
    const lower = c.toLowerCase();
    for (const k of Object.keys(files)) {
      if (k.toLowerCase() === lower) return k;
    }
  }
  return null;
}

export function isHostAppPath(path: string): boolean {
  const p = path.replace(/^\//, "");
  if (!p) return true;
  if (p.startsWith("_next") || p.startsWith("api/")) return true;
  if (!p.includes(".")) return true;
  return false;
}

export function resolvePreviewNavigate(
  href: string,
  files: Record<string, { content: string; isBinary: boolean }>,
  currentEntry: string
): { entry?: string; hash?: string; external?: string; samePageHash?: string } {
  const raw = href.trim();
  if (!raw) return {};

  if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) {
    try {
      const u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
      if (typeof window !== "undefined" && u.origin === window.location.origin) {
        const path = u.pathname.replace(/^\//, "");
        const hash = u.hash || undefined;
        if (!path || path === currentEntry || isHostAppPath(path)) {
          return { samePageHash: hash };
        }
        const found = findWorkspaceHtml(path, files);
        if (found) return { entry: found, hash };
        return { samePageHash: hash };
      }
      return { external: u.href };
    } catch {
      return {};
    }
  }

  const hashIdx = raw.indexOf("#");
  const hash = hashIdx >= 0 ? raw.slice(hashIdx) : "";
  const path = (hashIdx >= 0 ? raw.slice(0, hashIdx) : raw).split("?")[0].replace(/^\.\//, "").replace(/^\//, "");
  if (!path) return { samePageHash: hash || undefined };
  const found = findWorkspaceHtml(path, files);
  if (found) return { entry: found, hash: hash || undefined };
  return { samePageHash: hash || undefined };
}

export function scrollPreviewToHash(iframe: HTMLIFrameElement | null, hash?: string) {
  if (!iframe) return;
  try {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) return;
    if (!hash || hash === "#") {
      win.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    const el =
      doc.getElementById(id) ||
      doc.querySelector(`[name="${CSS.escape(id)}"]`) ||
      doc.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      win.location.hash = hash;
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}
