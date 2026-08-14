"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Sparkles, FileText } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { detectLanguage } from "@/lib/files";
import { useSettings } from "@/hooks/use-settings";
import { EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { indentOnInput, indentUnit } from "@codemirror/language";
import { linter, lintGutter, lintKeymap, type Diagnostic } from "@codemirror/lint";
import { showMinimap } from "@replit/codemirror-minimap";
import * as prettier from "prettier/standalone";
import htmlPlugin from "prettier/plugins/html";
import postcssPlugin from "prettier/plugins/postcss";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";
import { api } from "@/lib/api";

// Prettier plugins are loaded as a static array so format-on-save doesn't
// pay an await-import cost on every save. These are ESM modules with a
// runtime default export (the .d.ts files only declare named exports, but
// the bundled .mjs ships `export default` — allowSyntheticDefaultImports
// from esModuleInterop lets us import them as defaults here).
const PRETTIER_HTML_PLUGINS = [htmlPlugin, postcssPlugin, babelPlugin, estreePlugin];
const PRETTIER_CSS_PLUGINS = [postcssPlugin];
const PRETTIER_BABEL_PLUGINS = [babelPlugin, estreePlugin];

// CodeMirror must be loaded only on the client.
const CodeMirror = dynamic(
  () => import("@uiw/react-codemirror").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading editor…
      </div>
    ),
  }
);

const htmlLang = () => import("@codemirror/lang-html").then((m) => m.html());
const cssLang = () => import("@codemirror/lang-css").then((m) => m.css());
const jsLang = () =>
  import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true }));
const jsonLang = () => import("@codemirror/lang-json").then((m) => m.json());

// Use string themes ("light"/"dark") handled natively by @uiw/react-codemirror.
// Dynamic theme objects caused "Unrecognized extension value" errors, so we
// rely on the built-in light/dark themes plus a small style override below.

// HTML void elements that don't need closing tags.
const HTML_VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

// ---------------------------------------------------------------------------
// Linter: heuristic checks for HTML / CSS / JS / JSON.
// Returns a CodeMirror 6 lint extension that runs on a 750ms debounce.
// ---------------------------------------------------------------------------
function buildLinter(activeFile: string | null): Extension {
  const source = (view: EditorView): Diagnostic[] => {
    if (!activeFile) return [];
    const lang = detectLanguage(activeFile);
    if (lang === "text" || lang === "markdown") return [];

    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc;
    const text = doc.toString();

    if (lang === "html") {
      // Heuristic: find an opening tag on a line whose closing tag does not
      // appear later on the same line. This catches the obvious cases
      // (forgot </div>, etc.) without a full HTML parser.
      const openRe = /<(\w+)([^>]*?)(\/?)>/g;
      const lineCount = doc.lines;
      for (let i = 1; i <= lineCount; i++) {
        const line = doc.line(i);
        const lineText = line.text;
        let m: RegExpExecArray | null;
        openRe.lastIndex = 0;
        while ((m = openRe.exec(lineText)) !== null) {
          const tag = m[1];
          const selfClose = m[3] === "/";
          if (selfClose) continue;
          if (HTML_VOID_TAGS.has(tag.toLowerCase())) continue;
          // Skip comments / doctype-ish matches (tag name must start with a letter)
          if (!/^[a-zA-Z]/.test(tag)) continue;
          // Skip <!-- comments  and <!doctype
          if (lineText.slice(m.index, m.index + 4) === "<!--") continue;
          if (lineText.slice(m.index, m.index + 2) === "<!") continue;
          const after = lineText.slice(m.index + m[0].length);
          const closeRe = new RegExp(`</${tag}\\s*>`, "i");
          if (!closeRe.test(after)) {
            const from = line.from + m.index;
            const to = from + m[0].length;
            diagnostics.push({
              from,
              to,
              severity: "warning",
              message: `Possibly unclosed <${tag}> tag`,
              source: "html-lint",
            });
          }
        }
      }
    } else if (lang === "css") {
      // Count braces globally; if unbalanced, flag the last unbalanced `{`.
      const opens: number[] = [];
      let depth = 0;
      let unbalancedFrom = -1;
      let unbalancedTo = -1;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "{") {
          opens.push(i);
          depth++;
        } else if (c === "}") {
          if (depth > 0) {
            opens.pop();
            depth--;
          } else {
            // stray `}` — flag it
            diagnostics.push({
              from: i,
              to: i + 1,
              severity: "warning",
              message: "Unexpected closing brace '}'",
              source: "css-lint",
            });
          }
        }
      }
      if (depth > 0 && opens.length > 0) {
        const last = opens[opens.length - 1];
        unbalancedFrom = last;
        unbalancedTo = last + 1;
        diagnostics.push({
          from: unbalancedFrom,
          to: unbalancedTo,
          severity: "warning",
          message: `Unbalanced braces: ${depth} unclosed '{'`,
          source: "css-lint",
        });
      }
    } else if (lang === "javascript") {
      const lineCount = doc.lines;
      for (let i = 1; i <= lineCount; i++) {
        const line = doc.line(i);
        const lineText = line.text;
        // Strip line comments and block-comment fragments on this line for
        // the string-balance check (simple heuristic).
        const codePart = lineText.replace(/\/\/.*$/, "");
        // console.log warning
        const cl = /console\s*\.\s*log\s*\(/.exec(codePart);
        if (cl) {
          const from = line.from + cl.index;
          const to = from + cl[0].length;
          diagnostics.push({
            from,
            to,
            severity: "warning",
            message: "console.log left in code",
            source: "js-lint",
          });
        }
        // Unclosed string literal heuristic — only single-line strings
        // (no template-literal multi-line awareness).
        const singleQuotes = (codePart.match(/(^|[^\\])'/g) ?? []).length;
        const doubleQuotes = (codePart.match(/(^|[^\\])"/g) ?? []).length;
        if (singleQuotes % 2 !== 0) {
          diagnostics.push({
            from: line.from,
            to: line.to,
            severity: "warning",
            message: "Possibly unclosed single-quote string",
            source: "js-lint",
          });
        } else if (doubleQuotes % 2 !== 0) {
          diagnostics.push({
            from: line.from,
            to: line.to,
            severity: "warning",
            message: "Possibly unclosed double-quote string",
            source: "js-lint",
          });
        }
      }
    }
    return diagnostics;
  };
  return linter(source, { delay: 750 });
}

// ---------------------------------------------------------------------------
// Format-on-save: uses prettier/standalone + statically-imported plugins.
// ---------------------------------------------------------------------------
type FormatLanguage = "html" | "css" | "javascript" | "json" | "other";

async function formatContent(
  content: string,
  language: FormatLanguage
): Promise<string> {
  if (!content.trim()) return content;
  if (language === "html") {
    return prettier.format(content, {
      parser: "html",
      plugins: PRETTIER_HTML_PLUGINS,
    });
  }
  if (language === "css") {
    return prettier.format(content, {
      parser: "css",
      plugins: PRETTIER_CSS_PLUGINS,
    });
  }
  if (language === "javascript") {
    return prettier.format(content, {
      parser: "babel",
      plugins: PRETTIER_BABEL_PLUGINS,
    });
  }
  if (language === "json") {
    return prettier.format(content, {
      parser: "json",
      plugins: PRETTIER_BABEL_PLUGINS,
    });
  }
  return content;
}

function mapLanguage(lang: string): FormatLanguage {
  if (lang === "html" || lang === "css" || lang === "javascript" || lang === "json") {
    return lang;
  }
  return "other";
}

export function CodeEditor() {
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const files = useWorkspaceStore((s) => s.files);
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const aiEditingFiles = useWorkspaceStore((s) => s.aiEditingFiles);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const unsavedPaths = useWorkspaceStore((s) => s.unsavedPaths);
  const markSaved = useWorkspaceStore((s) => s.markSaved);
  const { settings } = useSettings();
  const { resolvedTheme } = useTheme();

  const [langExt, setLangExt] = React.useState<Extension | null>(null);
  const [theme, setTheme] = React.useState<"light" | "dark">(
    resolvedTheme === "dark" ? "dark" : "light"
  );
  const [cursor, setCursor] = React.useState<{ line: number; col: number }>({
    line: 1,
    col: 1,
  });

  // Load language extension based on active file
  React.useEffect(() => {
    let cancelled = false;
    if (!activeFile) {
      setLangExt(null);
      return;
    }
    const lang = detectLanguage(activeFile);
    let p: Promise<Extension>;
    switch (lang) {
      case "html":
        p = htmlLang();
        break;
      case "css":
        p = cssLang();
        break;
      case "javascript":
        p = jsLang();
        break;
      case "json":
        p = jsonLang();
        break;
      default:
        p = Promise.resolve([] as unknown as Extension);
    }
    p.then((ext) => {
      if (!cancelled) setLangExt(ext);
    });
    return () => {
      cancelled = true;
    };
  }, [activeFile]);

  // Theme — use built-in light/dark string themes (robust, no dynamic imports).
  React.useEffect(() => {
    setTheme(resolvedTheme === "dark" ? "dark" : "light");
  }, [resolvedTheme]);

  // Debounced autosave
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!workspaceId || !activeFile) return;
    if (!settings.autoSave) return;
    if (!unsavedPaths.has(activeFile)) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const entry = files[activeFile];
        if (!entry) return;
        await api.putFile(workspaceId, activeFile, entry.content);
        markSaved(activeFile);
      } catch {
        // ignore — user can still press Ctrl+S
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [files, activeFile, workspaceId, settings.autoSave, unsavedPaths, markSaved]);

  // Lint extension — memoized on activeFile so we don't reset diagnostics
  // every render.
  const lintExtension = React.useMemo(
    () => buildLinter(activeFile),
    [activeFile]
  );

  // Save handler used by the Mod-s keymap. Performs format-on-save when
  // enabled, then PUTs the (possibly formatted) content to the API.
  const handleSave = React.useCallback(
    async (view: EditorView) => {
      if (!workspaceId || !activeFile) return;
      let content = view.state.doc.toString();
      const detected = detectLanguage(activeFile);
      const fmtLang = mapLanguage(detected);

      if (settings.formatOnSave && fmtLang !== "other") {
        try {
          const formatted = await formatContent(content, fmtLang);
          if (formatted !== content) {
            // Update the editor doc. This fires onChange synchronously,
            // which keeps the workspace store in sync.
            view.dispatch({
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: formatted,
              },
            });
            content = formatted;
          }
        } catch (e) {
          // Don't block the save — toast a warning and save the
          // unformatted content.
          toast.warning("Format failed", {
            description:
              e instanceof Error ? e.message : "Unknown formatting error",
          });
        }
      }

      try {
        await api.putFile(workspaceId, activeFile, content);
        markSaved(activeFile);
        await api.patchWorkspace(workspaceId, { activeFile });
        toast.success("Saved", { description: activeFile });
      } catch (e) {
        toast.error("Save failed", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [workspaceId, activeFile, settings.formatOnSave, markSaved]
  );

  // Save keymap — bound inside the editor so it works while CodeMirror has
  // focus (the global ⌘S handler in page.tsx skips editable targets, so
  // CodeMirror's contenteditable would otherwise swallow it).
  const saveKeymap = React.useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: (view) => {
            void handleSave(view);
            return true;
          },
        },
      ]),
    [handleSave]
  );

  if (!activeFile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background text-center">
        <FileText className="size-7 text-muted-foreground/50" />
        <div className="text-sm font-medium">No file open</div>
        <div className="text-xs text-muted-foreground">
          Select a file from the explorer to start editing.
        </div>
      </div>
    );
  }

  const entry = files[activeFile];
  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background text-center">
        <FileText className="size-7 text-muted-foreground/50" />
        <div className="text-sm">File not found: {activeFile}</div>
      </div>
    );
  }

  if (entry.isBinary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background text-center">
        <FileText className="size-7 text-muted-foreground/50" />
        <div className="text-sm">Binary file preview not available</div>
        <div className="text-xs text-muted-foreground">{activeFile}</div>
      </div>
    );
  }

  const aiEditing = aiEditingFiles.has(activeFile);
  const tabSize = settings.tabSize ?? 2;

  // Base extensions — always present.
  const extensions: Extension[] = [
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.selectionSet || u.docChanged) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        setCursor({ line: line.number, col: head - line.from + 1 });
      }
    }),
    indentOnInput(),
    indentUnit.of(" ".repeat(tabSize)),
    lintExtension,
    lintGutter(),
    keymap.of(lintKeymap),
    saveKeymap,
  ];

  // Minimap (only when enabled in settings).
  if (settings.minimap) {
    extensions.push(
      showMinimap.compute(["doc"], () => ({
        create: (_view: EditorView) => {
          const dom = document.createElement("div");
          return { dom };
        },
        showOverlay: "always",
        displayText: "blocks",
      }))
    );
  }

  if (langExt) extensions.unshift(langExt);

  return (
    <div className="relative flex h-full w-full flex-col bg-background">
      {aiEditing && (
        <div className="flex items-center gap-1.5 border-b bg-accent-strong/10 px-3 py-1.5 text-xs text-accent-strong">
          <Sparkles className="size-3 animate-pulse-soft" />
          AI is editing this file — read-only mode
        </div>
      )}
      <div className="min-h-0 flex-1">
        <CodeMirror
          value={entry.content}
          height="100%"
          theme={theme}
          extensions={extensions}
          editable={!aiEditing}
          readOnly={aiEditing}
          basicSetup={{
            lineNumbers: settings.lineNumbers !== false,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            foldGutter: settings.minimap !== true,
            searchKeymap: true,
            tabSize,
          }}
          onChange={(val) => updateFileContent(activeFile, val)}
          className="h-full w-full"
          style={{
            fontSize: `${settings.fontSize ?? 14}px`,
            height: "100%",
          }}
        />
      </div>
      <StatusBar
        line={cursor.line}
        col={cursor.col}
        language={detectLanguage(activeFile).toUpperCase()}
        tabSize={tabSize}
        unsaved={unsavedPaths.has(activeFile)}
      />
    </div>
  );
}

function StatusBar({
  line,
  col,
  language,
  tabSize,
  unsaved,
}: {
  line: number;
  col: number;
  language: string;
  tabSize: number;
  unsaved: boolean;
}) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t bg-muted/40 px-3 text-[10px] text-muted-foreground">
      <span>
        Ln {line}, Col {col}
      </span>
      <span className="font-mono">{language}</span>
      <span>UTF-8</span>
      <span>Spaces: {tabSize}</span>
      {unsaved && <span className="text-amber-600 dark:text-amber-400">● Unsaved</span>}
    </div>
  );
}
