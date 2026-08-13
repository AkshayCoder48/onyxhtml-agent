"use client";

import * as React from "react";
import { RefreshCw, ExternalLink, Monitor, Tablet, Smartphone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSettings } from "@/hooks/use-settings";
import { findEntryFile } from "@/lib/files";
import { DEVICE_SIZES, type PreviewDevice } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PreviewConsoleMessage = {
  level: "log" | "warn" | "error" | "info";
  args: unknown[];
  time: number;
};

export type PreviewError = {
  message: string;
  filename?: string;
  line?: number;
  col?: number;
  time: number;
};

export type PreviewNetworkEntry = {
  url: string;
  status?: number;
  type: string;
  time: number;
};

const BRIDGE_SCRIPT = `
(function(){
  "use strict";
  const send = (msg) => { try { parent.postMessage(Object.assign({ source: "preview" }, msg), "*"); } catch(e){} };
  const logs = [];
  const errs = [];
  const wrap = (level) => function(...args){
    try {
      const safe = args.map((a) => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === "object") { try { return JSON.stringify(a); } catch(e){ return String(a); } }
        return String(a);
      });
      logs.push({ level, args: safe, time: Date.now() });
      send({ kind: "console", level, args: safe });
    } catch(e){}
    // call original
    return origConsole[level].apply(console, args);
  };
  const origConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };
  console.log = wrap("log");
  console.warn = wrap("warn");
  console.error = wrap("error");
  console.info = wrap("info");

  window.addEventListener("error", (e) => {
    const m = { message: e.message || "Error", filename: e.filename, line: e.lineno, col: e.colno, time: Date.now() };
    errs.push(m);
    send(Object.assign({ kind: "error" }, m));
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    const m = { message: "Unhandled promise rejection: " + reason, time: Date.now() };
    errs.push(m);
    send(Object.assign({ kind: "error" }, m));
  });
  // Capture failed resource loads
  window.addEventListener("error", (e) => {
    const tgt = e.target;
    if (tgt && tgt.tagName && (tgt.tagName === "LINK" || tgt.tagName === "SCRIPT" || tgt.tagName === "IMG")) {
      send({ kind: "network", url: tgt.src || tgt.href, type: tgt.tagName, status: 0, time: Date.now() });
    }
  }, true);

  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || data.source !== "workspace-host") return;
    if (data.action !== "browser-tool") return;
    const { tool, args, callId } = data;
    let result, error;
    try {
      const a = args || {};
      const $ = (sel) => document.querySelector(sel);
      switch (tool) {
        case "click": {
          const el = $(a.selector);
          if (!el) throw new Error("Element not found: " + a.selector);
          el.click();
          result = { ok: true };
          break;
        }
        case "type": {
          const el = $(a.selector);
          if (!el) throw new Error("Element not found: " + a.selector);
          el.focus();
          if (a.clear !== false) el.value = "";
          el.value = (el.value || "") + String(a.text ?? "");
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          result = { value: el.value };
          break;
        }
        case "press_key": {
          const key = String(a.key ?? "");
          const target = a.selector ? $(a.selector) : document.activeElement || document.body;
          if (!target) throw new Error("Target not found");
          const ev1 = new KeyboardEvent("keydown", { key, bubbles: true });
          const ev2 = new KeyboardEvent("keypress", { key, bubbles: true });
          const ev3 = new KeyboardEvent("keyup", { key, bubbles: true });
          target.dispatchEvent(ev1); target.dispatchEvent(ev2); target.dispatchEvent(ev3);
          result = { ok: true };
          break;
        }
        case "scroll": {
          if (a.selector) {
            const el = $(a.selector);
            if (el) el.scrollIntoView({ behavior: "smooth", block: a.block || "center" });
          } else {
            window.scrollBy({ top: Number(a.y ?? 0), left: Number(a.x ?? 0), behavior: "smooth" });
          }
          result = { ok: true, scrollX: window.scrollX, scrollY: window.scrollY };
          break;
        }
        case "hover": {
          const el = $(a.selector);
          if (!el) throw new Error("Element not found: " + a.selector);
          el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          setTimeout(() => {
            el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
            el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
          }, 50);
          result = { ok: true };
          break;
        }
        case "select": {
          const el = $(a.selector);
          if (!el) throw new Error("Element not found: " + a.selector);
          el.value = String(a.value ?? "");
          el.dispatchEvent(new Event("change", { bubbles: true }));
          result = { value: el.value };
          break;
        }
        case "get_dom": {
          const el = a.selector ? $(a.selector) : document.body;
          if (!el) throw new Error("Element not found: " + a.selector);
          result = { html: el.outerHTML };
          break;
        }
        case "run_javascript": {
          // eslint-disable-next-line no-eval
          const r = eval(String(a.code ?? ""));
          result = { value: typeof r === "object" ? JSON.parse(JSON.stringify(r, (k, v) => typeof v === "function" ? "[Function]" : v)) : r };
          break;
        }
        case "get_console_logs": {
          result = { logs };
          break;
        }
        case "get_page_errors": {
          result = { errors: errs };
          break;
        }
        case "take_screenshot": {
          result = { note: "Screenshots not supported in this preview environment.", ok: false };
          break;
        }
        case "wait": {
          result = { ok: true };
          break;
        }
        default:
          throw new Error("Unknown browser tool: " + tool);
      }
      send({ callId, result });
    } catch (err) {
      error = err && err.message ? err.message : String(err);
      send({ callId, error });
    }
  });
})();
`;

export function buildPreviewDoc(
  files: Record<string, { content: string; isBinary: boolean }>,
  entry: string
): string {
  const html = files[entry]?.content ?? "";
  if (!html) return "<!doctype html><html><body><p>No HTML to preview.</p></body></html>";

  const inlinable = new Set(Object.keys(files));

  // Inline <link rel="stylesheet" href="local.css">
  let out = html.replace(
    /<link\b[^>]*?rel=["']stylesheet["'][^>]*?>/gi,
    (tag) => {
      const m = tag.match(/href=["']([^"']+)["']/i);
      if (!m) return tag;
      const href = m[1];
      if (/^https?:\/\//i.test(href) || href.startsWith("//") || href.startsWith("data:"))
        return tag;
      const path = href.replace(/^\.?\//, "");
      if (!inlinable.has(path)) return tag;
      const css = files[path]?.content ?? "";
      return `<style data-src="${path}">\n${css}\n</style>`;
    }
  );

  // Inline <script src="local.js">
  out = out.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*?)><\/script>/gi, (tag, pre, src, post) => {
    if (/^https?:\/\//i.test(src) || src.startsWith("//") || src.startsWith("data:"))
      return tag;
    const path = src.replace(/^\.?\//, "");
    if (!inlinable.has(path)) return tag;
    const js = files[path]?.content ?? "";
    const attrs = `${pre}${post}`.replace(/\s+/g, " ").trim();
    return `<script ${attrs} data-src="${path}">\n${js}\n</script>`;
  });

  // Inline <img src="local.*"> for SVG / text (best-effort). For binary, we cannot
  // embed directly without base64 — skip; the broken image will be reported by the bridge.
  out = out.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (tag, pre, src, post) => {
    if (/^https?:\/\//i.test(src) || src.startsWith("//") || src.startsWith("data:"))
      return tag;
    const path = src.replace(/^\.?\//, "");
    if (!inlinable.has(path)) return tag;
    const f = files[path];
    if (!f || f.isBinary) return tag;
    // Text content: only SVG can be inlined as a data URL
    if (path.toLowerCase().endsWith(".svg")) {
      const data = `data:image/svg+xml;utf8,${encodeURIComponent(f.content)}`;
      return `<img ${pre} src="${data}" ${post} />`;
    }
    return tag;
  });

  // Inject bridge before </body> (or at the end of the document).
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `<script>${BRIDGE_SCRIPT}</script></body>`);
  } else {
    out = `${out}<script>${BRIDGE_SCRIPT}</script>`;
  }
  return out;
}

export function PreviewPane({
  iframeRef,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const files = useWorkspaceStore((s) => s.files);
  const device = useWorkspaceStore((s) => s.device);
  const setDevice = useWorkspaceStore((s) => s.setDevice);
  const previewNonce = useWorkspaceStore((s) => s.previewNonce);
  const { settings } = useSettings();

  const paths = React.useMemo(() => Object.keys(files), [files]);
  const entry = React.useMemo(() => findEntryFile(paths), [paths]);
  const doc = React.useMemo(
    () => (entry ? buildPreviewDoc(files, entry) : ""),
    [files, entry, previewNonce]
  );

  const size = DEVICE_SIZES[device];

  function openInNewTab() {
    if (!doc) return;
    const blob = new Blob([doc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function reload() {
    useWorkspaceStore.getState().bumpPreview();
  }

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-background px-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={reload} aria-label="Reload">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <Globe className="size-3.5 shrink-0" />
          <span className="truncate font-mono">
            https://preview.local/{entry ?? "—"}
          </span>
        </div>
        <div className="flex items-center rounded-md border p-0.5">
          <DeviceBtn
            active={device === "desktop"}
            onClick={() => setDevice("desktop")}
            label="Desktop"
          >
            <Monitor className="size-3.5" />
          </DeviceBtn>
          <DeviceBtn
            active={device === "tablet"}
            onClick={() => setDevice("tablet")}
            label="Tablet"
          >
            <Tablet className="size-3.5" />
          </DeviceBtn>
          <DeviceBtn
            active={device === "mobile"}
            onClick={() => setDevice("mobile")}
            label="Mobile"
          >
            <Smartphone className="size-3.5" />
          </DeviceBtn>
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={openInNewTab}
                aria-label="Open in new tab"
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in new tab</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Preview area */}
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin p-4">
        {!entry ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Add an <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">index.html</code>
            file to see the preview.
          </div>
        ) : device === "desktop" ? (
          <iframe
            ref={iframeRef}
            title="preview"
            srcDoc={doc}
            sandbox="allow-scripts"
            className="h-full w-full rounded-lg border bg-white"
          />
        ) : (
          <div className="flex h-full items-start justify-center">
            <div
              className={cn("device-frame", device)}
              style={{ width: size.width + 16, height: "100%", maxHeight: "100%" }}
            >
              <iframe
                ref={iframeRef}
                title="preview"
                srcDoc={doc}
                sandbox="allow-scripts"
                className="h-full w-full rounded-[20px] border-0 bg-white"
                style={{ width: size.width, height: "100%" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            aria-label={label}
            className={cn(
              "flex items-center justify-center rounded px-1.5 py-1 transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Re-export for the page-level preview builder
export { buildPreviewDoc as buildPreview };
