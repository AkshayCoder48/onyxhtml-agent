"use client";

import * as React from "react";
import {
  RefreshCw,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  Globe,
  ArrowLeft,
  ArrowRight,
  MoreVertical,
  Maximize,
  Search as SearchIcon,
  Terminal,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

// Bridge script injected into the preview iframe. Runs inside the iframe's
// window context. Captures console/error/network events and forwards them to
// the parent, and handles browser-tool commands posted from the host.
//
// NOTE: This is a template literal in the React component scope, so we must
// NOT use ${...} here (it would be interpolated by the host). All string
// building inside the iframe uses string concatenation.
const BRIDGE_SCRIPT = `
(function(){
  "use strict";
  var send = function(msg){ try { var m = msg || {}; m.source = "preview"; parent.postMessage(m, "*"); } catch(e){} };
  var logs = [];
  var errs = [];
  var networkErrors = [];
  var wrap = function(level){ return function(){
    try {
      var args = Array.prototype.slice.call(arguments);
      var safe = args.map(function(a){
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === "object") { try { return JSON.stringify(a); } catch(e){ return String(a); } }
        return String(a);
      });
      var entry = { level: level, args: safe, time: Date.now() };
      logs.push(entry);
      send(Object.assign({ kind: "console" }, entry));
    } catch(e){}
    return origConsole[level].apply(console, arguments);
  }; };
  var origConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };
  console.log = wrap("log");
  console.warn = wrap("warn");
  console.error = wrap("error");
  console.info = wrap("info");

  window.addEventListener("error", function(e) {
    var m = { message: e.message || "Error", filename: e.filename, line: e.lineno, col: e.colno, time: Date.now() };
    errs.push(m);
    send(Object.assign({ kind: "error" }, m));
  });
  window.addEventListener("unhandledrejection", function(e) {
    var reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    var m = { message: "Unhandled promise rejection: " + reason, time: Date.now() };
    errs.push(m);
    send(Object.assign({ kind: "error" }, m));
  });
  // Capture failed resource loads (LINK / SCRIPT / IMG)
  window.addEventListener("error", function(e) {
    var tgt = e.target;
    if (tgt && tgt.tagName && (tgt.tagName === "LINK" || tgt.tagName === "SCRIPT" || tgt.tagName === "IMG")) {
      var entry = { url: tgt.src || tgt.href, type: tgt.tagName, status: 0, time: Date.now() };
      networkErrors.push(entry);
      send(Object.assign({ kind: "network" }, entry));
    }
  }, true);

  function styleSummary(el) {
    try {
      var cs = window.getComputedStyle(el);
      return {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        color: cs.color,
        backgroundColor: cs.backgroundColor
      };
    } catch (e) {
      return {};
    }
  }

  window.addEventListener("message", function(ev) {
    var data = ev.data;
    if (!data || data.source !== "workspace-host") return;
    if (data.action !== "browser-tool") return;
    var tool = data.tool, args = data.args || {}, callId = data.callId;
    var result, error;
    try {
      var $ = function(sel){ return document.querySelector(sel); };
      switch (tool) {
        case "click": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          el.click();
          result = { ok: true };
          break;
        }
        case "type": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          el.focus();
          if (args.clear !== false) el.value = "";
          el.value = (el.value || "") + String(args.text != null ? args.text : "");
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          result = { value: el.value };
          break;
        }
        case "press_key": {
          var key = String(args.key != null ? args.key : "");
          var target = args.selector ? $(args.selector) : (document.activeElement || document.body);
          if (!target) throw new Error("Target not found");
          target.dispatchEvent(new KeyboardEvent("keydown", { key: key, bubbles: true }));
          target.dispatchEvent(new KeyboardEvent("keypress", { key: key, bubbles: true }));
          target.dispatchEvent(new KeyboardEvent("keyup", { key: key, bubbles: true }));
          result = { ok: true };
          break;
        }
        case "scroll": {
          if (args.selector) {
            var el = $(args.selector);
            if (el) el.scrollIntoView({ behavior: "smooth", block: args.block || "center" });
          } else {
            window.scrollBy({ top: Number(args.y != null ? args.y : 0), left: Number(args.x != null ? args.x : 0), behavior: "smooth" });
          }
          result = { ok: true, scrollX: window.scrollX, scrollY: window.scrollY };
          break;
        }
        case "hover": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          setTimeout(function(){
            el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
            el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
          }, 50);
          result = { ok: true };
          break;
        }
        case "select": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          el.value = String(args.value != null ? args.value : "");
          el.dispatchEvent(new Event("change", { bubbles: true }));
          result = { value: el.value };
          break;
        }
        case "get_dom": {
          var el = args.selector ? $(args.selector) : document.body;
          if (!el) throw new Error("Element not found: " + args.selector);
          result = { html: el.outerHTML };
          break;
        }
        case "get_element": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          result = { outerHTML: el.outerHTML, tagName: el.tagName, computedStyle: styleSummary(el) };
          break;
        }
        case "inspect_element": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          var rect = el.getBoundingClientRect();
          var attrs = {};
          for (var i = 0; i < el.attributes.length; i++) {
            var at = el.attributes[i];
            attrs[at.name] = at.value;
          }
          result = {
            tag: el.tagName,
            attributes: attrs,
            text: (el.textContent || "").trim().slice(0, 500),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
            computedStyle: styleSummary(el)
          };
          break;
        }
        case "run_javascript": {
          // eslint-disable-next-line no-eval
          var r = eval(String(args.code != null ? args.code : ""));
          var serialized;
          try {
            serialized = (typeof r === "object" && r !== null)
              ? JSON.parse(JSON.stringify(r, function(k, v){ return typeof v === "function" ? "[Function]" : v; }))
              : r;
          } catch (e) {
            serialized = String(r);
          }
          result = { value: serialized };
          break;
        }
        case "run_test": {
          var name = args.name != null ? String(args.name) : undefined;
          var assertions = Array.isArray(args.assertions) ? args.assertions : [];
          var results = assertions.map(function(ast){
            var label = String((ast && ast.label) || "assertion");
            var code = String((ast && ast.code) || "");
            var expected = (ast && typeof ast.expected === "string") ? ast.expected : undefined;
            var actual;
            try {
              // eslint-disable-next-line no-eval
              var r = eval(code);
              actual = (typeof r === "object" && r !== null) ? JSON.stringify(r) : String(r);
              var pass = (expected === undefined) ? true : (actual === expected);
              return { label: label, pass: pass, actual: actual, expected: expected };
            } catch (e) {
              return { label: label, pass: false, actual: "Error: " + (e && e.message ? e.message : String(e)), expected: expected };
            }
          });
          var passed = results.filter(function(r){ return r.pass; }).length;
          result = { name: name, passed: passed, total: results.length, results: results };
          break;
        }
        case "check_links": {
          var nodes = document.querySelectorAll("a[href]");
          var links = [];
          for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var href = el.getAttribute("href") || "";
            var text = (el.textContent || el.innerText || "").trim().slice(0, 120);
            var type;
            if (/^(https?:)?\\/\\//i.test(href)) type = "absolute";
            else if (/^mailto:/i.test(href)) type = "mailto";
            else if (/^#/.test(href)) type = "anchor";
            else type = "relative";
            links.push({ href: href, text: text, type: type });
          }
          result = { links: links, count: links.length };
          break;
        }
        case "get_console_logs": {
          result = { logs: logs };
          break;
        }
        case "get_page_errors": {
          result = { errors: errs };
          break;
        }
        case "get_network_errors": {
          result = { errors: networkErrors };
          break;
        }
        case "take_screenshot": {
          try {
            var body = document.body;
            var de = document.documentElement;
            var width = Math.max(body ? body.scrollWidth : 0, de ? de.scrollWidth : 0, window.innerWidth);
            var height = Math.max(body ? body.scrollHeight : 0, de ? de.scrollHeight : 0, window.innerHeight);
            var clone = document.documentElement.cloneNode(true);
            // Remove script tags from the clone so they don't re-execute if the
            // SVG is ever rendered back into a document.
            var scripts = clone.querySelectorAll("script");
            for (var i = 0; i < scripts.length; i++) scripts[i].remove();
            clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
            var svg =
              '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
              '<foreignObject width="100%" height="100%">' +
              clone.outerHTML +
              '</foreignObject></svg>';
            var dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
            result = { dataUrl: dataUrl, width: width, height: height, ok: true };
          } catch (err) {
            result = { ok: false, note: "Screenshot failed: " + (err && err.message ? err.message : String(err)) };
          }
          break;
        }
        case "wait": {
          result = { ok: true };
          break;
        }
        default:
          throw new Error("Unknown browser tool: " + tool);
      }
      send({ callId: callId, result: result });
    } catch (err) {
      error = err && err.message ? err.message : String(err);
      send({ callId: callId, error: error });
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

type CustomSize = { width: number; height: number };

export function PreviewPane({
  iframeRef,
  onOpenConsole,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onOpenConsole?: () => void;
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

  // Local custom-device state (not in the store — the segmented control still
  // drives `device`; `useCustom` overrides the size when true).
  const [useCustom, setUseCustom] = React.useState(false);
  const [customSize, setCustomSize] = React.useState<CustomSize>({ width: 1024, height: 768 });
  const [customOpen, setCustomOpen] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const presetSize = DEVICE_SIZES[device];
  const activeSize = useCustom ? customSize : presetSize;

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

  function handleInspect() {
    toast.info("Inspect mode — click an element in the preview");
    // Dispatch an event so other components (or a future inspector) can react.
    window.dispatchEvent(new CustomEvent("preview:inspect-mode"));
    // Also notify the iframe in case its bridge wants to enter pick mode.
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        { source: "workspace-host", action: "inspect-mode" },
        "*"
      );
    }
  }

  function handleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        toast.error("Fullscreen not available");
      });
    }
  }

  function handleOpenConsole() {
    if (onOpenConsole) {
      onOpenConsole();
    } else {
      window.dispatchEvent(new CustomEvent("preview:open-console"));
    }
  }

  function applyCustom() {
    if (!customSize.width || !customSize.height) {
      toast.error("Enter a valid width and height");
      return;
    }
    setUseCustom(true);
    setCustomOpen(false);
  }

  // Render the iframe element (shared across device modes).
  const renderIframe = (className?: string, style?: React.CSSProperties) => (
    <iframe
      ref={iframeRef}
      title="preview"
      srcDoc={doc}
      sandbox="allow-scripts"
      className={cn("bg-white", className)}
      style={style}
    />
  );

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-muted/30">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2">
        {/* Back / Forward — placeholder nav buttons (no history yet). */}
        <div className="hidden items-center gap-0.5 sm:flex">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled
            aria-label="Back"
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled
            aria-label="Forward"
          >
            <ArrowRight className="size-3.5" />
          </Button>
        </div>

        {/* Reload */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={reload}
                aria-label="Reload preview"
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload preview</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* URL display — hidden on small screens to save space. */}
        <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground md:flex">
          <Globe className="size-3.5 shrink-0" />
          <span className="truncate font-mono">
            https://preview.local/{entry ?? "—"}
          </span>
        </div>
        {/* Spacer on mobile so the right-side cluster stays right-aligned. */}
        <div className="flex-1 md:hidden" />

        {/* Device segmented control + Custom */}
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border p-0.5">
            <DeviceBtn
              active={device === "desktop" && !useCustom}
              onClick={() => {
                setUseCustom(false);
                setDevice("desktop");
              }}
              label="Desktop"
            >
              <Monitor className="size-3.5" />
            </DeviceBtn>
            <DeviceBtn
              active={device === "tablet" && !useCustom}
              onClick={() => {
                setUseCustom(false);
                setDevice("tablet");
              }}
              label="Tablet"
            >
              <Tablet className="size-3.5" />
            </DeviceBtn>
            <DeviceBtn
              active={device === "mobile" && !useCustom}
              onClick={() => {
                setUseCustom(false);
                setDevice("mobile");
              }}
              label="Mobile"
            >
              <Smartphone className="size-3.5" />
            </DeviceBtn>
          </div>

          {/* Custom device size popover */}
          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Custom device size"
                      className={cn(
                        "flex items-center justify-center rounded-md border p-1.5 transition-colors",
                        useCustom
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <SlidersHorizontal className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Custom size</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-56" align="end">
              <div className="space-y-2">
                <div className="text-xs font-medium">Custom device size</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Width</span>
                    <Input
                      type="number"
                      min={1}
                      max={4096}
                      value={customSize.width}
                      onChange={(e) =>
                        setCustomSize((s) => ({
                          ...s,
                          width: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Height</span>
                    <Input
                      type="number"
                      min={1}
                      max={4096}
                      value={customSize.height}
                      onChange={(e) =>
                        setCustomSize((s) => ({
                          ...s,
                          height: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={applyCustom}
                  >
                    Apply
                  </Button>
                  {useCustom && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setUseCustom(false);
                        setCustomOpen(false);
                      }}
                    >
                      Reset
                    </Button>
                  )}
                </div>
                {useCustom && (
                  <div className="text-[10px] text-muted-foreground">
                    Active: {customSize.width} × {customSize.height}px
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* More dropdown */}
        <DropdownMenu>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="More actions"
                  >
                    <MoreVertical className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleInspect}>
              <SearchIcon className="mr-2 size-3.5" /> Inspect
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleFullscreen}>
              <Maximize className="mr-2 size-3.5" /> Fullscreen
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenConsole}>
              <Terminal className="mr-2 size-3.5" /> Open console
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Open in new tab */}
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
        ) : useCustom ? (
          // Custom device: render at the explicit pixel size, centered.
          <div className="flex h-full items-start justify-center">
            <div
              className="device-frame custom shrink-0 rounded-lg border bg-white"
              style={{
                width: Math.min(activeSize.width + 16, 4096),
                height: "100%",
                maxHeight: "100%",
              }}
            >
              {renderIframe("h-full w-full rounded-lg border-0", {
                width: activeSize.width,
                height: "100%",
              })}
            </div>
          </div>
        ) : device === "desktop" ? (
          renderIframe("h-full w-full rounded-lg border")
        ) : (
          <div className="flex h-full items-start justify-center">
            <div
              className={cn("device-frame", device)}
              style={{ width: activeSize.width + 16, height: "100%", maxHeight: "100%" }}
            >
              {renderIframe("h-full w-full rounded-[20px] border-0", {
                width: activeSize.width,
                height: "100%",
              })}
            </div>
          </div>
        )}
      </div>

      {/* Screen reader-only announcement of preview size for accessibility. */}
      <span className="sr-only" aria-live="polite">
        Preview size: {activeSize.width} by {activeSize.height} pixels
      </span>
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
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
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
