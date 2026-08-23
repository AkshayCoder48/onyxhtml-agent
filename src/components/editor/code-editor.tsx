"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Sparkles, FileText, FileCode, Check } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

const PRETTIER_HTML_PLUGINS = [htmlPlugin, postcssPlugin, babelPlugin, estreePlugin];
const PRETTIER_CSS_PLUGINS = [postcssPlugin];
const PRETTIER_BABEL_PLUGINS = [babelPlugin, estreePlugin];

const CodeMirror = dynamic(
  () => import("@uiw/react-codemirror").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
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

const HTML_VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function buildLinter(activeFile: string | null): Extension {
  const source = (view: EditorView): Diagnostic[] => {
    if (!activeFile) return [];
    const lang = detectLanguage(activeFile);
    if (lang === "text" || lang === "markdown") return [];

    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc;
    const text = doc.toString();

    if (lang === "html") {
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
          if (!/^[a-zA-Z]/.test(tag)) continue;
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
      const opens: number[] = [];
      let depth = 0;
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
        diagnostics.push({
          from: last,
          to: last + 1,
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
        const codePart = lineText.replace(/\/\/.*$/, "");
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

  React.useEffect(() => {
    setTheme(resolvedTheme === "dark" ? "dark" : "light");
  }, [resolvedTheme]);

  const lintExtension = React.useMemo(
    () => buildLinter(activeFile),
    [activeFile]
  );

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
          toast.warning("Format failed", {
            description:
              e instanceof Error ? e.message : "Unknown formatting error",
          });
        }
      }

      updateFileContent(activeFile, content);
      if (workspaceId) {
        await api.putFile(workspaceId, activeFile, content).catch(() => {});
        await api.patchWorkspace(workspaceId, { activeFile }).catch(() => {});
      }
    },
    [workspaceId, activeFile, settings.formatOnSave, updateFileContent]
  );

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
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
          <FileCode className="size-8 text-muted-foreground/50" />
        </div>
        <div>
          <div className="text-sm font-semibold">No file open</div>
          <div className="mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
            Select a file from the explorer to start editing. AI will open files automatically while working.
          </div>
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
        <div className="flex items-center gap-2 border-b bg-gradient-to-r from-violet-500/10 to-blue-500/10 px-3 py-2 text-xs font-medium text-violet-700 dark:text-violet-300">
          <div className="flex size-5 items-center justify-center rounded-full bg-violet-500/20">
            <Sparkles className="size-3 animate-pulse" />
          </div>
          AI is editing this file — read-only mode
          <div className="ml-auto flex gap-1">
            <span className="size-1 animate-pulse rounded-full bg-violet-500" />
            <span className="size-1 animate-pulse rounded-full bg-violet-500 [animation-delay:200ms]" />
            <span className="size-1 animate-pulse rounded-full bg-violet-500 [animation-delay:400ms]" />
          </div>
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
        aiEditing={aiEditing}
      />
    </div>
  );
}

function StatusBar({
  line,
  col,
  language,
  tabSize,
  aiEditing,
}: {
  line: number;
  col: number;
  language: string;
  tabSize: number;
  aiEditing?: boolean;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t bg-muted/30 px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="font-mono">
          Ln {line}, Col {col}
        </span>
        <Badge variant="outline" className="h-5 rounded-full font-mono text-[10px]">
          {language}
        </Badge>
        <span className="hidden sm:inline">UTF-8</span>
        <span className="hidden sm:inline">Spaces: {tabSize}</span>
      </div>
      <div className="flex items-center gap-2">
        {aiEditing && (
          <Badge className="h-5 gap-1 rounded-full bg-violet-500 text-[10px] text-white">
            <Sparkles className="size-3" /> AI editing
          </Badge>
        )}
        <Badge variant="outline" className="h-5 gap-1 rounded-full border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-700">
          <Check className="size-3" /> Synced
        </Badge>
      </div>
    </div>
  );
}
