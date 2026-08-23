// Host-side browser-tool executor.
//
// The preview iframe is same-origin (sandbox allow-same-origin + srcDoc), so
// we can drive document/window directly from the React host. That avoids the
// postMessage ready-handshake races that made tools spin forever or error
// the instant a file write rebuilt srcDoc.

export type BrowserToolOutcome = { result?: unknown; error?: string };

export type PreviewLog = {
  level: "log" | "warn" | "error" | "info";
  args: unknown[];
  time: number;
};

export type PreviewErr = {
  message: string;
  filename?: string;
  line?: number;
  col?: number;
  time: number;
};

export type PreviewNet = {
  url: string;
  status?: number;
  type: string;
  time: number;
};

export type PreviewCapture = {
  logs: PreviewLog[];
  errs: PreviewErr[];
  networkErrors: PreviewNet[];
};

export type IFrameWindow = Window & {
  __onyxEntry?: string;
  __onyxRunTool?: (
    tool: string,
    args: Record<string, unknown>,
    callId: string
  ) => Promise<BrowserToolOutcome>;
  __onyxPreview?: PreviewCapture;
  __term?: { vars: Record<string, unknown>; history: string[] };
  __longTasks?: Array<{ name: string; duration: number; startTime: number }>;
  term?: {
    set: (k: string, v: unknown) => unknown;
    get: (k: string) => unknown;
    has: (k: string) => boolean;
    keys: () => string[];
    del: (k: string) => void;
    reset: () => void;
  };
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getIframeWindow(iframe: HTMLIFrameElement): IFrameWindow | null {
  try {
    return (iframe.contentWindow as IFrameWindow | null) ?? null;
  } catch {
    return null;
  }
}

export function getIframeDocument(iframe: HTMLIFrameElement): Document | null {
  try {
    return iframe.contentDocument;
  } catch {
    return null;
  }
}

export function isPreviewDocumentReady(iframe: HTMLIFrameElement): boolean {
  const doc = getIframeDocument(iframe);
  const win = getIframeWindow(iframe);
  if (!doc || !win || !doc.documentElement) return false;
  if (doc.readyState === "loading") return false;
  return true;
}

/** Wait until the iframe document stops being replaced and is past "loading". */
export async function waitForStablePreviewDocument(
  iframe: HTMLIFrameElement,
  timeoutMs = 6000
): Promise<boolean> {
  const start = Date.now();
  let last: Document | null = null;
  let hits = 0;
  while (Date.now() - start < timeoutMs) {
    if (isPreviewDocumentReady(iframe)) {
      const doc = getIframeDocument(iframe);
      if (doc && doc === last) {
        hits++;
        if (hits >= 2) return true;
      } else {
        last = doc;
        hits = 1;
      }
    } else {
      last = null;
      hits = 0;
    }
    await sleep(40);
  }
  return isPreviewDocumentReady(iframe) || !!getIframeWindow(iframe);
}

export function readPreviewCapture(win: IFrameWindow | null): PreviewCapture {
  if (win?.__onyxPreview && Array.isArray(win.__onyxPreview.logs)) {
    return win.__onyxPreview;
  }
  return { logs: [], errs: [], networkErrors: [] };
}

function ser(v: unknown): unknown {
  try {
    if (typeof v === "object" && v !== null) {
      return JSON.parse(
        JSON.stringify(v, (_k, x) => (typeof x === "function" ? "[Function]" : x))
      );
    }
    return v;
  } catch {
    return String(v);
  }
}

function styleSummary(win: Window, el: Element): Record<string, string> {
  try {
    const cs = win.getComputedStyle(el);
    return {
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      position: cs.position,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
    };
  } catch {
    return {};
  }
}

function previewPageUrl(win: IFrameWindow): string {
  const entry = win.__onyxEntry || "index.html";
  const hash = win.location.hash || "";
  return `https://preview.local/${entry}${hash}`;
}

function $(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector);
  } catch {
    throw new Error(`Invalid selector: ${selector}`);
  }
}

function requireEl(doc: Document, selector: unknown, label = "Element"): Element {
  const sel = String(selector ?? "");
  if (!sel) throw new Error(`${label} selector is required`);
  const el = $(doc, sel);
  if (!el) throw new Error(`${label} not found: ${sel}`);
  return el;
}

type PageEvalFn = (code: string) => unknown;

function pageEval(win: IFrameWindow, code: string): unknown {
  // eval in the iframe global so document/window/globals bind to the page.
  const ev = (win as unknown as { eval: PageEvalFn }).eval.bind(win);
  return ev(code);
}

function pageAsyncFunction(win: IFrameWindow): FunctionConstructor {
  const ev = (win as unknown as { eval: PageEvalFn }).eval.bind(win);
  return ev("(async function(){}).constructor") as FunctionConstructor;
}

function isVisible(win: Window, el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const cs = win.getComputedStyle(el);
  return !(
    cs.display === "none" ||
    cs.visibility === "hidden" ||
    cs.opacity === "0" ||
    rect.width <= 0 ||
    rect.height <= 0
  );
}

function matchString(actual: string, expected: string, mode: string, caseSensitive = true): boolean {
  if (mode === "exact") return actual === expected;
  if (mode === "prefix") return actual.startsWith(expected);
  if (mode === "suffix") return actual.endsWith(expected);
  if (mode === "regex") return new RegExp(expected).test(actual);
  if (mode === "exists") return true;
  if (!caseSensitive) {
    return actual.toLowerCase().includes(expected.toLowerCase());
  }
  return actual.includes(expected);
}

function svgScreenshot(win: Window, doc: Document, selector?: string, fullPage = false) {
  const target = selector ? $(doc, selector) : doc.documentElement;
  if (!target) throw new Error(selector ? `Element not found: ${selector}` : "No document");
  const clone = target.cloneNode(true) as Element;
  clone.querySelectorAll?.("script").forEach((s) => s.remove());
  if (clone.setAttribute) clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const w = Math.min(win.innerWidth || 1280, 1280);
  const h = fullPage
    ? Math.max(doc.body?.scrollHeight ?? 0, win.innerHeight || 800)
    : Math.min(win.innerHeight || 800, 800);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject width="100%" height="100%" style="overflow:hidden">` +
    (clone.outerHTML || "") +
    `</foreignObject></svg>`;
  return {
    dataUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
    domSnapshot: (doc.body ? doc.body.outerHTML : "").slice(0, 8000),
    width: w,
    height: h,
    ok: true,
  };
}

function ensureTerm(win: IFrameWindow) {
  if (!win.__term) {
    win.__term = { vars: {}, history: [] };
    win.term = {
      set: (k, v) => {
        win.__term!.vars[k] = v;
        return v;
      },
      get: (k) => win.__term!.vars[k],
      has: (k) => Object.prototype.hasOwnProperty.call(win.__term!.vars, k),
      keys: () => Object.keys(win.__term!.vars),
      del: (k) => {
        delete win.__term!.vars[k];
      },
      reset: () => {
        win.__term!.vars = {};
      },
    };
  }
  return win.__term;
}

function stringifyArgs(args: unknown[]): string[] {
  return args.map((a) => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === "object") {
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }
    return String(a);
  });
}

export type HostToolOptions = {
  onConsole?: (level: PreviewLog["level"], args: string[], time: number) => void;
};

export async function executeHostBrowserTool(
  iframe: HTMLIFrameElement,
  tool: string,
  args: Record<string, unknown>,
  callId: string,
  opts: HostToolOptions = {}
): Promise<BrowserToolOutcome> {
  const win = getIframeWindow(iframe);
  const doc = getIframeDocument(iframe);
  if (!win || !doc) {
    return {
      error:
        "Preview iframe not available. Wait for the live preview to load, then retry.",
    };
  }

  try {
    const result = await runTool(win, doc, iframe, tool, args, callId, opts);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function runTool(
  win: IFrameWindow,
  doc: Document,
  iframe: HTMLIFrameElement,
  tool: string,
  args: Record<string, unknown>,
  callId: string,
  opts: HostToolOptions
): Promise<unknown> {
  const capture = readPreviewCapture(win);

  switch (tool) {
    case "open_page": {
      const href = String(args.url || args.path || args.href || "");
      if (href) {
        try {
          win.parent.postMessage({ source: "preview", kind: "navigate", href, target: "" }, "*");
        } catch {
          // ignore
        }
      }
      return {
        ok: true,
        url: previewPageUrl(win),
        title: doc.title || "",
        ready: doc.readyState,
      };
    }

    case "reload_page":
      return {
        ok: true,
        note: "Reload is handled by the host (preview nonce).",
        title: doc.title || "",
      };

    case "wait": {
      const waitMs = Math.max(0, Math.min(Number(args.ms || 0), 10_000));
      if (waitMs > 0) await sleep(waitMs);
      return { ok: true, waited: waitMs };
    }

    case "click": {
      const el = requireEl(doc, args.selector) as HTMLElement;
      el.click();
      return { ok: true };
    }

    case "type": {
      const el = requireEl(doc, args.selector) as HTMLInputElement;
      el.focus();
      if (args.clear !== false) el.value = "";
      el.value = String(el.value || "") + String(args.text ?? "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { value: el.value };
    }

    case "press_key": {
      const key = String(args.key ?? "");
      const target = args.selector
        ? (requireEl(doc, args.selector) as HTMLElement)
        : ((doc.activeElement as HTMLElement | null) || doc.body);
      if (!target) throw new Error("Target not found");
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keypress", { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      return { ok: true };
    }

    case "scroll": {
      if (args.selector) {
        const el = $(doc, String(args.selector));
        if (el) el.scrollIntoView({ behavior: "smooth", block: (args.block as ScrollLogicalPosition) || "center" });
      } else {
        win.scrollBy({
          top: Number(args.y ?? 0),
          left: Number(args.x ?? 0),
          behavior: "smooth",
        });
      }
      return { ok: true, scrollX: win.scrollX, scrollY: win.scrollY };
    }

    case "hover": {
      const el = requireEl(doc, args.selector);
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      await sleep(50);
      el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      return { ok: true };
    }

    case "select": {
      const el = requireEl(doc, args.selector) as HTMLSelectElement;
      el.value = String(args.value ?? "");
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { value: el.value };
    }

    case "get_dom": {
      const el = args.selector ? requireEl(doc, args.selector) : doc.body || doc.documentElement;
      return { html: (el as HTMLElement).outerHTML };
    }

    case "get_element": {
      const el = requireEl(doc, args.selector);
      return {
        outerHTML: (el as HTMLElement).outerHTML,
        tagName: el.tagName,
        computedStyle: styleSummary(win, el),
      };
    }

    case "inspect_element": {
      const el = requireEl(doc, args.selector);
      const rect = el.getBoundingClientRect();
      const attributes: Record<string, string> = {};
      for (const at of Array.from(el.attributes)) attributes[at.name] = at.value;
      return {
        tag: el.tagName,
        attributes,
        text: (el.textContent || "").trim().slice(0, 500),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        computedStyle: styleSummary(win, el),
      };
    }

    case "run_javascript": {
      const r = pageEval(win, String(args.code ?? ""));
      return { value: ser(r) };
    }

    case "browser_read_page": {
      const bodyText =
        (doc.body && (doc.body.innerText != null ? doc.body.innerText : doc.body.textContent)) || "";
      const h1 = doc.querySelector("h1");
      const headings: string[] = [];
      doc.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h, i) => {
        if (i < 40) headings.push(`${h.tagName.toLowerCase()}: ${(h.textContent || "").trim().slice(0, 120)}`);
      });
      const controls: unknown[] = [];
      doc.querySelectorAll("input, textarea, select, button").forEach((ce, i) => {
        if (i >= 60) return;
        const el = ce as HTMLInputElement;
        controls.push({
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          name: el.name || "",
          id: el.id || "",
          placeholder: el.placeholder || "",
          text: (el.innerText || el.value || "").trim().slice(0, 80),
        });
      });
      const links: unknown[] = [];
      doc.querySelectorAll("a[href]").forEach((a, i) => {
        if (i >= 60) return;
        links.push({
          href: a.getAttribute("href") || "",
          text: (a.textContent || "").trim().slice(0, 80),
        });
      });
      return {
        url: previewPageUrl(win),
        title: doc.title || "",
        readyState: doc.readyState,
        text: bodyText.slice(0, 8000),
        textLength: bodyText.length,
        h1: h1 ? (h1.textContent || "").trim().slice(0, 200) : null,
        headings,
        controls,
        links,
        pageErrors: capture.errs.length,
        consoleLogs: capture.logs.length,
      };
    }

    case "browser_execute_js": {
      const code = String(args.code ?? "");
      if (!code.trim()) {
        return {
          success: false,
          result: null,
          url: win.location.href,
          title: doc.title || "",
          stdout: "",
          error: "No code provided",
        };
      }
      const captured: string[] = [];
      const restore = wrapConsole(win, (level, safe) => {
        captured.push(safe.join(" "));
        opts.onConsole?.(level, safe, Date.now());
      });
      try {
        const AsyncFunction = pageAsyncFunction(win);
        const fn = new AsyncFunction(code);
        const value = await fn();
        return {
          success: true,
          result: ser(value),
          url: win.location.href,
          title: doc.title || "",
          stdout: captured.join("\n"),
        };
      } catch (e) {
        return {
          success: false,
          result: null,
          url: win.location.href,
          title: doc.title || "",
          stdout: captured.join("\n"),
          error: e instanceof Error ? e.message : String(e),
        };
      } finally {
        restore();
      }
    }

    case "run_test": {
      const name = args.name != null ? String(args.name) : undefined;
      const assertions = Array.isArray(args.assertions) ? args.assertions : [];
      const results = assertions.map((ast) => {
        const item = (ast && typeof ast === "object" ? ast : {}) as {
          label?: string;
          code?: string;
          expected?: string;
        };
        const label = String(item.label || "assertion");
        const code = String(item.code || "");
        const expected = typeof item.expected === "string" ? item.expected : undefined;
        try {
          const r = pageEval(win, code);
          const actual = typeof r === "object" && r !== null ? JSON.stringify(r) : String(r);
          const pass = expected === undefined ? true : actual === expected;
          return { label, pass, actual, expected };
        } catch (e) {
          return {
            label,
            pass: false,
            actual: "Error: " + (e instanceof Error ? e.message : String(e)),
            expected,
          };
        }
      });
      return {
        name,
        passed: results.filter((r) => r.pass).length,
        total: results.length,
        results,
      };
    }

    case "check_links": {
      const links: { href: string; text: string; type: string }[] = [];
      doc.querySelectorAll("a[href]").forEach((el) => {
        const href = el.getAttribute("href") || "";
        const text = (el.textContent || "").trim().slice(0, 120);
        let type: string;
        if (/^(https?:)?\/\//i.test(href)) type = "absolute";
        else if (/^mailto:/i.test(href)) type = "mailto";
        else if (/^#/.test(href)) type = "anchor";
        else type = "relative";
        links.push({ href, text, type });
      });
      return { links, count: links.length };
    }

    case "get_computed_styles": {
      const el = requireEl(doc, args.selector);
      const cs = win.getComputedStyle(el as Element);
      const props = ["display","position","color","backgroundColor","fontSize","fontFamily","margin","padding","width","height","border","opacity","visibility","zIndex","flexDirection","justifyContent","alignItems","gap"];
      const computed: Record<string, string> = {};
      for (const p of props) {
        try { computed[p] = (cs as any)[p]; } catch {}
      }
      return { selector: String(args.selector), computed, full: { display: cs.display, color: cs.color, backgroundColor: cs.backgroundColor } };
    }

    case "get_css_variables": {
      const vars: Record<string, string> = {};
      try {
        const styles = doc.querySelectorAll("style");
        const re = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
        styles.forEach((s) => {
          let m: RegExpExecArray | null;
          while ((m = re.exec(s.textContent || "")) !== null) vars[`--${m[1]}`] = m[2].trim();
        });
        // computed
        const cs = win.getComputedStyle(doc.documentElement);
        for (let i = 0; i < cs.length; i++) {
          const prop = cs[i];
          if (prop.startsWith("--")) vars[prop] = cs.getPropertyValue(prop).trim();
        }
      } catch {}
      return { variables: vars, count: Object.keys(vars).length };
    }

    case "take_element_screenshot": {
      const sel = String(args.selector);
      return svgScreenshot(win, doc, sel, false);
    }

    case "get_images_info": {
      const images: { src: string; alt: string; width: number; height: number; naturalWidth: number; naturalHeight: number; broken: boolean }[] = [];
      doc.querySelectorAll("img").forEach((img) => {
        const el = img as HTMLImageElement;
        images.push({
          src: el.src || el.getAttribute("src") || "",
          alt: el.alt || "",
          width: el.width,
          height: el.height,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          broken: el.naturalWidth === 0 && el.src !== "",
        });
      });
      return { images, count: images.length };
    }

    case "get_fonts_in_use": {
      const fonts = new Set<string>();
      try {
        doc.querySelectorAll("*").forEach((el) => {
          const cs = win.getComputedStyle(el);
          if (cs.fontFamily) fonts.add(cs.fontFamily);
        });
      } catch {}
      return { fonts: Array.from(fonts).slice(0, 50), count: fonts.size };
    }

    case "generate_palette": {
      const mood = String(args.mood || "modern").toLowerCase();
      const palettes: Record<string, string[]> = {
        "coffee shop": ["#3c2415","#a47551","#f5e6d3","#d4a574","#2c1810"],
        minimal: ["#0f172a","#f8fafc","#e2e8f0","#94a3b8","#3b82f6"],
        cyberpunk: ["#ff00ff","#00ffff","#0f0f0f","#ffea00","#ff0055"],
        ocean: ["#0a192f","#64ffda","#8892b0","#112240","#e6f1ff"],
        sunset: ["#ff6b6b","#feca57","#48dbfb","#1dd1a1","#5f27cd"],
        forest: ["#2d5016","#618b25","#a4be7b","#e5d3b3","#285430"],
        default: ["#7c3aed","#3b82f6","#06b6d4","#10b981","#f59e0b"],
      };
      const palette = palettes[mood] || palettes["default"];
      return { mood, palette, name: mood };
    }

    case "generate_qr": {
      const text = String(args.text || "");
      // Return data for file creation, host will handle actual file creation via worker? But we can return SVG placeholder
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" font-size="10">${text.slice(0,20)}</text></svg>`;
      return { text, svg, dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
    }

    case "get_console_logs":
      return { logs: capture.logs };

    case "check_console":
      return { logs: capture.logs, errors: capture.errs };

    case "check_page":
      return {
        url: previewPageUrl(win),
        title: doc.title || "",
        readyState: doc.readyState,
        text: ((doc.body && doc.body.innerText) || "").slice(0, 4000),
        logs: capture.logs,
        errors: capture.errs,
      };

    case "get_page_errors":
      return { errors: capture.errs };

    case "get_network_errors":
      return { errors: capture.networkErrors };

    case "assert_text": {
      const needle0 = String(args.text ?? "");
      const contains = args.contains !== false;
      const caseSensitive = args.caseSensitive === true;
      const scope = args.selector ? requireEl(doc, args.selector) : doc.body;
      if (!scope) throw new Error("Element not found: " + String(args.selector));
      let hay = ((scope as HTMLElement).innerText != null
        ? (scope as HTMLElement).innerText
        : scope.textContent) || "";
      let text = needle0;
      if (!caseSensitive) {
        hay = hay.toLowerCase();
        text = text.toLowerCase();
      }
      const has = hay.includes(text);
      const pass = contains ? has : !has;
      return {
        pass,
        message: pass
          ? `PASS: expected text ${contains ? "" : "not "}present`
          : `FAIL: expected text ${contains ? "" : "not "}present: ${needle0.slice(0, 80)}`,
        found: has,
      };
    }

    case "assert_element": {
      let matches: NodeListOf<Element>;
      try {
        matches = doc.querySelectorAll(String(args.selector));
      } catch {
        throw new Error("Invalid selector: " + String(args.selector));
      }
      const count = matches.length;
      const pass =
        typeof args.count === "number"
          ? count === args.count
          : args.exists === false
            ? count === 0
            : count > 0;
      return {
        pass,
        count,
        message: pass
          ? `PASS: ${count} element(s) matching ${String(args.selector)}`
          : `FAIL: ${count} element(s) matching ${String(args.selector)} (expected ${
              typeof args.count === "number" ? args.count : args.exists === false ? "none" : "at least one"
            })`,
      };
    }

    case "assert_url": {
      const expected = String(args.expected ?? "");
      const mode = String(args.match || "contains");
      const actual = previewPageUrl(win);
      const pass = matchString(actual, expected, mode);
      return {
        pass,
        actual,
        expected,
        message: pass ? "PASS" : `FAIL: URL ${actual} did not match ${expected}`,
      };
    }

    case "assert_title": {
      const expected = String(args.expected ?? "");
      const mode = String(args.match || "contains");
      const actual = doc.title || "";
      const pass = matchString(actual, expected, mode, mode === "exact");
      return {
        pass,
        actual,
        message: pass ? "PASS" : `FAIL: title '${actual}' did not match '${expected}'`,
      };
    }

    case "assert_attribute": {
      const el = requireEl(doc, args.selector);
      const attr = String(args.attribute);
      const has = el.hasAttribute(attr);
      const actual = has ? el.getAttribute(attr) : null;
      const mode = String(args.match || "exact");
      let pass: boolean;
      if (mode === "exists") pass = has;
      else if (!has) pass = false;
      else pass = matchString(String(actual), String(args.expected ?? ""), mode);
      return {
        pass,
        attribute: attr,
        actual,
        message: pass ? "PASS" : `FAIL: ${attr} was ${JSON.stringify(actual)}`,
      };
    }

    case "assert_visible": {
      const el = $(doc, String(args.selector));
      if (!el) return { pass: false, message: "FAIL: element not found: " + String(args.selector) };
      const visible = isVisible(win, el);
      const rect = el.getBoundingClientRect();
      return {
        pass: visible,
        message: visible ? "PASS: element is visible" : "FAIL: element is not visible",
        rect: { w: rect.width, h: rect.height },
      };
    }

    case "assert_hidden": {
      const el = $(doc, String(args.selector));
      if (!el) return { pass: true, message: "PASS: element is absent from DOM" };
      const hidden = !isVisible(win, el);
      return {
        pass: hidden,
        message: hidden ? "PASS: element is hidden" : "FAIL: element is still visible",
      };
    }

    case "assert_enabled": {
      const el = requireEl(doc, args.selector) as HTMLButtonElement;
      const enabled = !el.disabled;
      return { pass: enabled, message: enabled ? "PASS: element is enabled" : "FAIL: element is disabled" };
    }

    case "assert_disabled": {
      const el = requireEl(doc, args.selector) as HTMLButtonElement;
      const disabled = !!el.disabled;
      return { pass: disabled, message: disabled ? "PASS: element is disabled" : "FAIL: element is enabled" };
    }

    case "assert_screenshot":
    case "take_screenshot": {
      try {
        const shot = svgScreenshot(win, doc, args.selector ? String(args.selector) : undefined, args.fullPage === true);
        if (tool === "take_screenshot") {
          const body = doc.body;
          const de = doc.documentElement;
          return {
            ...shot,
            scroll: {
              viewportWidth: win.innerWidth,
              viewportHeight: win.innerHeight,
              pageWidth: Math.max(body?.scrollWidth ?? 0, de?.scrollWidth ?? 0, win.innerWidth),
              pageHeight: Math.max(body?.scrollHeight ?? 0, de?.scrollHeight ?? 0, win.innerHeight),
              scrollX: win.scrollX,
              scrollY: win.scrollY,
              title: doc.title || "",
            },
          };
        }
        return shot;
      } catch (err) {
        return {
          ok: false,
          note: "Screenshot failed: " + (err instanceof Error ? err.message : String(err)),
          domSnapshot: (doc.body ? doc.body.outerHTML : "").slice(0, 8000),
        };
      }
    }

    case "test_api_endpoint": {
      const url = String(args.url);
      const method = String(args.method || "GET").toUpperCase();
      const headers = { ...((args.headers as Record<string, string>) || {}) };
      const fetchOpts: RequestInit = { method, headers };
      if (args.body != null && method !== "GET" && method !== "HEAD") {
        fetchOpts.body = String(args.body);
        if (!headers["Content-Type"] && !headers["content-type"]) {
          (fetchOpts.headers as Record<string, string>)["Content-Type"] = "application/json";
        }
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Number(args.timeoutMs || 10_000));
      fetchOpts.signal = controller.signal;
      try {
        const res = await win.fetch(url, fetchOpts);
        const text = await res.text();
        let bodyOut: unknown = text;
        if (args.expectJson) {
          try {
            bodyOut = JSON.parse(text);
          } catch {
            /* keep text */
          }
        }
        const pass = typeof args.expectStatus !== "number" || res.status === args.expectStatus;
        const hdrs: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          hdrs[k] = v;
        });
        return {
          pass,
          status: res.status,
          ok: res.ok,
          url: res.url || url,
          headers: hdrs,
          body: bodyOut,
          message: pass ? "PASS" : `FAIL: expected status ${args.expectStatus} got ${res.status}`,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }

    case "test_form": {
      const form = requireEl(doc, args.formSelector, "Form") as HTMLFormElement;
      const fields = Array.isArray(args.fields) ? args.fields : [];
      const fillLog: unknown[] = [];
      for (const raw of fields) {
        const f = (raw && typeof raw === "object" ? raw : {}) as { selector?: string; value?: unknown };
        const input = (form.querySelector(String(f.selector || "")) ||
          (f.selector ? $(doc, String(f.selector)) : null)) as HTMLInputElement | null;
        if (!input) {
          fillLog.push({ selector: f.selector, ok: false, error: "not found" });
          continue;
        }
        if (f.value === true || f.value === false) {
          if ("checked" in input) {
            input.checked = Boolean(f.value);
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        } else if (input.tagName === "SELECT") {
          input.value = String(f.value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          input.focus();
          input.value = String(f.value ?? "");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        fillLog.push({ selector: f.selector, ok: true });
      }
      let submitted = false;
      if (args.submit !== false) {
        if (typeof form.requestSubmit === "function") {
          try {
            form.requestSubmit();
            submitted = true;
          } catch {
            form.submit();
            submitted = true;
          }
        } else {
          form.submit();
          submitted = true;
        }
      }
      const waitMs = Number(args.waitMs || 300);
      if (waitMs > 0) await sleep(waitMs);
      return { filled: fillLog, submitted, url: win.location.href, title: doc.title };
    }

    case "test_navigation": {
      const el = requireEl(doc, args.selector) as HTMLElement;
      const before = { url: previewPageUrl(win), title: doc.title };
      el.click();
      const waitMs = Number(args.waitMs || 500);
      if (waitMs > 0) await sleep(waitMs);
      const after = { url: previewPageUrl(win), title: doc.title };
      const urlPass = !args.expectUrl || after.url.includes(String(args.expectUrl));
      const titlePass =
        !args.expectTitle || (after.title || "").toLowerCase().includes(String(args.expectTitle).toLowerCase());
      return { before, after, pass: urlPass && titlePass, urlPass, titlePass };
    }

    case "test_responsive_layout": {
      const widths =
        Array.isArray(args.widths) && args.widths.length > 0
          ? (args.widths as number[])
          : [390, 768, 1024, 1280];
      const height = Number(args.height || 800);
      const waitMs = Number(args.waitMs || 250);
      const srcDoc = iframe.srcdoc || iframe.getAttribute("srcdoc") || "";
      const reports: unknown[] = [];
      for (const w of widths) {
        reports.push(await probeWidth(srcDoc, w, height, waitMs));
      }
      const anyOverflow = reports.some((r) => (r as { horizontalOverflow?: boolean }).horizontalOverflow);
      return {
        pass: !anyOverflow,
        reports,
        message: anyOverflow ? "FAIL: horizontal overflow at some widths" : "PASS",
      };
    }

    case "test_console": {
      const level = String(args.level || "error");
      let messages = level === "any" ? capture.logs.slice() : capture.logs.filter((l) => l.level === level);
      if (args.contains) {
        const needle = String(args.contains).toLowerCase();
        messages = messages.filter((l) => (l.args || []).join(" ").toLowerCase().includes(needle));
      } else if (args.regex) {
        const re = new RegExp(String(args.regex));
        messages = messages.filter((l) => re.test((l.args || []).join(" ")));
      }
      const count = messages.length;
      const pass = typeof args.maxCount !== "number" || count <= Number(args.maxCount);
      return {
        pass,
        level,
        matching: messages.slice(-20),
        total: count,
        message: pass
          ? `PASS: ${count} matching message(s)`
          : `FAIL: ${count} matching messages (max ${args.maxCount})`,
      };
    }

    case "test_network": {
      let failures = capture.networkErrors.slice();
      if (args.urlContains) {
        const needle = String(args.urlContains);
        failures = failures.filter((f) => String(f.url || "").includes(needle));
      }
      const pass = !(args.expectNone && failures.length > 0);
      return {
        pass,
        failures,
        count: failures.length,
        message: pass ? "PASS" : `FAIL: ${failures.length} network failure(s)`,
      };
    }

    case "test_performance": {
      const waitMs = Number(args.waitMs || 1000);
      await sleep(waitMs);
      const longTasks = (win.__longTasks || []).slice();
      const nav = win.performance?.getEntriesByType?.("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      const paints: Record<string, number> = {};
      try {
        for (const p of win.performance.getEntriesByType("paint")) {
          paints[p.name] = p.startTime;
        }
      } catch {
        /* ignore */
      }
      const metrics = {
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
        loadEventEnd: nav ? nav.loadEventEnd : null,
        transferSize: nav ? nav.transferSize : null,
        firstPaint: paints["first-paint"] ?? null,
        firstContentfulPaint: paints["first-contentful-paint"] ?? null,
        longTaskCount: longTasks.length,
        resources: win.performance?.getEntriesByType ? win.performance.getEntriesByType("resource").length : 0,
      };
      const failures: string[] = [];
      if (
        typeof args.maxLoadMs === "number" &&
        metrics.loadEventEnd != null &&
        metrics.loadEventEnd > Number(args.maxLoadMs)
      ) {
        failures.push(`loadEventEnd ${Math.round(metrics.loadEventEnd)}ms > ${args.maxLoadMs}ms`);
      }
      if (typeof args.maxLongTasks === "number" && metrics.longTaskCount > Number(args.maxLongTasks)) {
        failures.push(`${metrics.longTaskCount} long tasks > ${args.maxLongTasks}`);
      }
      const pass = failures.length === 0;
      return { pass, metrics, failures, message: pass ? "PASS" : `FAIL: ${failures.join("; ")}` };
    }

    case "run_unit_tests": {
      const tests = Array.isArray(args.tests) ? args.tests : [];
      const results: unknown[] = [];
      let passed = 0;
      for (const raw of tests) {
        const t = (raw && typeof raw === "object" ? raw : {}) as { name?: string; code?: string };
        try {
          const val = pageEval(win, String(t.code || ""));
          const ok = val === undefined ? true : !!val;
          if (ok) passed++;
          results.push({
            name: t.name,
            pass: ok,
            actual: typeof val === "object" ? JSON.stringify(val) : String(val),
          });
        } catch (e) {
          results.push({
            name: t.name,
            pass: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return {
        passed,
        failed: results.length - passed,
        total: results.length,
        results,
        pass: passed === results.length,
      };
    }

    case "run_integration_tests": {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      const stepResults: unknown[] = [];
      let allPass = true;
      const AsyncFunction = pageAsyncFunction(win);
      for (const raw of steps) {
        const step = (raw && typeof raw === "object" ? raw : {}) as {
          name?: string;
          action?: string;
          assert?: string;
          waitMs?: number;
        };
        try {
          if (step.action) {
            await new AsyncFunction(String(step.action))();
          }
          if (Number(step.waitMs || 100) > 0) await sleep(Number(step.waitMs || 100));
          let ok = true;
          if (step.assert) ok = !!pageEval(win, String(step.assert));
          if (!ok) allPass = false;
          stepResults.push({ name: step.name, pass: ok });
        } catch (e) {
          allPass = false;
          stepResults.push({
            name: step.name,
            pass: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return {
        name: args.name || "integration",
        pass: allPass,
        steps: stepResults,
        passed: stepResults.filter((s) => (s as { pass?: boolean }).pass).length,
        total: stepResults.length,
      };
    }

    case "run_e2e_test": {
      const scriptText = String(args.script || "");
      const e2eSteps: { pass: boolean; message: string }[] = [];
      const assertFn = (cond: unknown, msg?: string) => {
        const pass = !!cond;
        e2eSteps.push({ pass, message: msg || (pass ? "assertion passed" : "assertion failed") });
        if (!pass) throw new Error(msg || "Assertion failed");
      };
      try {
        const AsyncFunction = pageAsyncFunction(win);
        const fn = new AsyncFunction(
          "assert",
          "document",
          "window",
          `return (async () => { ${scriptText} })();`
        );
        const timeoutMs = Number(args.timeoutMs || 15_000);
        await Promise.race([
          fn(assertFn, doc, win),
          new Promise((_, reject) => setTimeout(() => reject(new Error("E2E script timed out")), timeoutMs)),
        ]);
        return { pass: true, name: args.name || "e2e", steps: e2eSteps };
      } catch (e) {
        return {
          pass: false,
          name: args.name || "e2e",
          steps: e2eSteps,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    case "terminal_exec": {
      const code = String(args.code ?? "");
      if (!code.trim()) return { ok: true, value: undefined, stdout: "" };
      const term = ensureTerm(win);
      term.history.push(code);
      const captured: string[] = [];
      const restore = wrapConsole(win, (level, safe) => {
        captured.push(safe.join(" "));
        opts.onConsole?.(level, safe, Date.now());
      });
      let value: unknown;
      let isError = false;
      let errMsg = "";
      try {
        value = pageEval(win, code);
      } catch (e) {
        isError = true;
        errMsg = e instanceof Error ? e.message : String(e);
        value = undefined;
      } finally {
        restore();
      }
      return {
        ok: !isError,
        value: ser(value),
        stdout: captured.join("\n"),
        error: isError ? errMsg : undefined,
        historyLen: term.history.length,
        varsKeys: Object.keys(term.vars),
      };
    }

    case "terminal_reset": {
      if (win.__term) {
        win.__term.vars = {};
        win.__term.history = [];
      }
      return { ok: true, cleared: true };
    }

    case "run_qa_suite":
      return runQaSuite(win, doc, capture, args);

    default:
      throw new Error("Unknown browser tool: " + tool);
  }
}

function wrapConsole(
  win: IFrameWindow,
  onLine: (level: PreviewLog["level"], args: string[]) => void
): () => void {
  const c = (win as unknown as { console: Console }).console;
  const orig = {
    log: c.log.bind(c),
    info: c.info.bind(c),
    warn: c.warn.bind(c),
    error: c.error.bind(c),
  };
  const grab = (level: PreviewLog["level"], origFn: (...a: unknown[]) => void) =>
    function wrapped(this: unknown, ...a: unknown[]) {
      try {
        onLine(level, stringifyArgs(a));
      } catch {
        /* ignore */
      }
      return origFn.apply(c, a);
    };
  c.log = grab("log", orig.log) as typeof c.log;
  c.info = grab("info", orig.info) as typeof c.info;
  c.warn = grab("warn", orig.warn) as typeof c.warn;
  c.error = grab("error", orig.error) as typeof c.error;
  return () => {
    c.log = orig.log;
    c.info = orig.info;
    c.warn = orig.warn;
    c.error = orig.error;
  };
}

function probeWidth(
  srcDoc: string,
  w: number,
  height: number,
  waitMs: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({ width: w, error: "no document" });
      return;
    }
    const probe = document.createElement("iframe");
    probe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    probe.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${height}px;border:0;visibility:hidden;pointer-events:none;`;
    probe.srcdoc = srcDoc || "<!doctype html><title></title>";
    const finish = (report: Record<string, unknown>) => {
      try {
        probe.remove();
      } catch {
        /* ignore */
      }
      resolve(report);
    };
    const timer = window.setTimeout(() => {
      try {
        const pdoc = probe.contentDocument;
        const body = pdoc?.body;
        const de = pdoc?.documentElement;
        const scrollW = Math.max(body?.scrollWidth ?? w, de?.scrollWidth ?? w, w);
        finish({
          width: w,
          height,
          horizontalOverflow: scrollW > w + 2,
          scrollWidth: scrollW,
          interactiveCount: pdoc ? pdoc.querySelectorAll("button, a").length : 0,
        });
      } catch (e) {
        finish({ width: w, error: e instanceof Error ? e.message : String(e) });
      }
    }, Math.max(80, waitMs));
    probe.onerror = () => {
      window.clearTimeout(timer);
      finish({ width: w, error: "iframe load failed" });
    };
    document.body.appendChild(probe);
  });
}

function runQaSuite(
  win: IFrameWindow,
  doc: Document,
  capture: PreviewCapture,
  args: Record<string, unknown>
) {
  const checks: { id: string; pass: boolean; message: string }[] = [];
  const push = (id: string, pass: boolean, message: string) => {
    checks.push({ id, pass: !!pass, message: String(message) });
  };
  const body = doc.body;
  const text = (body && (body.innerText != null ? body.innerText : body.textContent) || "").trim();
  push("ready", doc.readyState === "complete" || doc.readyState === "interactive", `document.readyState=${doc.readyState}`);
  push("has_body", !!body, body ? "body present" : "missing body");
  push("has_content", text.length > 0, text.length > 0 ? `visible text ${text.length} chars` : "page has no visible text");
  const title = doc.title || "";
  push("has_title", title.trim().length > 0, title ? `title: ${title}` : "missing document title");
  const headings = doc.querySelectorAll("h1,h2,h3").length;
  push("has_heading", headings > 0, `${headings} heading(s)`);
  const viewport = doc.querySelector("meta[name=viewport]");
  push("viewport_meta", !!viewport, viewport ? "viewport meta present" : "missing viewport meta");
  push("no_page_errors", capture.errs.length === 0, capture.errs.length === 0 ? "no uncaught exceptions" : `${capture.errs.length} page error(s)`);
  const consoleErrs = capture.logs.filter((l) => l.level === "error");
  push("no_console_errors", consoleErrs.length === 0, consoleErrs.length === 0 ? "no console.error" : `${consoleErrs.length} console error(s)`);
  push(
    "no_network_errors",
    capture.networkErrors.length === 0,
    capture.networkErrors.length === 0 ? "no failed resources" : `${capture.networkErrors.length} failed resource(s)`
  );
  const imgs = doc.querySelectorAll("img");
  let missingAlt = 0;
  imgs.forEach((img) => {
    if (!img.hasAttribute("alt")) missingAlt++;
  });
  push("images_alt", missingAlt === 0, missingAlt === 0 ? `${imgs.length} image(s) ok` : `${missingAlt} image(s) missing alt`);
  let unlabeled = 0;
  doc.querySelectorAll("input, textarea, select").forEach((raw) => {
    const inp = raw as HTMLInputElement;
    const qtype = String(inp.type || "").toLowerCase();
    if (qtype === "hidden" || qtype === "submit" || qtype === "button" || qtype === "image") return;
    const qid = inp.id;
    const hasLabel = !!(
      inp.getAttribute("aria-label") ||
      inp.getAttribute("aria-labelledby") ||
      inp.placeholder ||
      (qid && doc.querySelector(`label[for="${qid}"]`)) ||
      inp.closest("label")
    );
    if (!hasLabel) unlabeled++;
  });
  push("form_labels", unlabeled === 0, unlabeled === 0 ? "form controls labeled" : `${unlabeled} unlabeled control(s)`);
  let overflow = false;
  try {
    overflow = doc.documentElement.scrollWidth > win.innerWidth + 2;
  } catch {
    /* ignore */
  }
  push("no_h_overflow", !overflow, overflow ? "horizontal overflow" : "no horizontal overflow");

  const sels = Array.isArray(args.requiredSelectors) ? args.requiredSelectors : [];
  for (const raw of sels) {
    const qsel = String(raw);
    let found = false;
    try {
      found = !!doc.querySelector(qsel);
    } catch {
      found = false;
    }
    push("selector:" + qsel, found, found ? `found ${qsel}` : `missing ${qsel}`);
  }
  const needles = Array.isArray(args.requiredText) ? args.requiredText : [];
  const hay = text.toLowerCase();
  for (const raw of needles) {
    const needle = String(raw);
    const has = hay.includes(needle.toLowerCase());
    push("text:" + needle, has, has ? `found text ${needle}` : `missing text ${needle}`);
  }

  const failed = checks.filter((c) => !c.pass);
  const passed = checks.filter((c) => c.pass);
  const suggestions: string[] = [];
  for (const qfail of failed) {
    if (qfail.id === "has_title") suggestions.push("Add a descriptive title in the document head.");
    else if (qfail.id === "has_heading") suggestions.push("Add at least one heading (h1-h3).");
    else if (qfail.id === "viewport_meta")
      suggestions.push("Add a viewport meta tag (width=device-width, initial-scale=1).");
    else if (qfail.id === "no_page_errors" || qfail.id === "no_console_errors")
      suggestions.push("Fix the JS error(s) listed in errors.");
    else if (qfail.id === "no_network_errors") suggestions.push("Fix broken script/link/img src paths.");
    else if (qfail.id === "images_alt") suggestions.push("Add alt attributes to images.");
    else if (qfail.id === "form_labels") suggestions.push("Associate a label or aria-label with each input.");
    else if (qfail.id === "no_h_overflow") suggestions.push("Fix horizontal overflow (fixed widths, large images).");
    else if (qfail.id === "has_content")
      suggestions.push("The page rendered empty — check HTML structure and CSS display.");
    else suggestions.push("Fix: " + qfail.message);
  }

  return {
    pass: failed.length === 0,
    score: checks.length ? Math.round((100 * passed.length) / checks.length) : 0,
    passed: passed.length,
    failed: failed.length,
    total: checks.length,
    checks,
    failedChecks: failed,
    errors: {
      page: capture.errs.slice(-10),
      console: consoleErrs.slice(-10),
      network: capture.networkErrors.slice(-10),
    },
    title,
    url: win.location.href,
    textPreview: text.slice(0, 500),
    suggestions,
    report:
      (failed.length === 0 ? "PASS" : "FAIL") +
      ` ${passed.length}/${checks.length} checks.` +
      (failed.length ? " " + failed.map((f) => f.message).join("; ") : " All good."),
  };
}
