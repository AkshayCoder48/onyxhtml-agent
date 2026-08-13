"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Sparkles, FileText } from "lucide-react";
import { useTheme } from "next-themes";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { detectLanguage } from "@/lib/files";
import { useSettings } from "@/hooks/use-settings";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { api } from "@/lib/api";

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

  const extensions: Extension[] = [
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.selectionSet || u.docChanged) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        setCursor({ line: line.number, col: head - line.from + 1 });
      }
    }),
  ];
  if (langExt) extensions.unshift(langExt);

  return (
    <div className="relative flex h-full flex-col bg-background">
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
            tabSize: settings.tabSize ?? 2,
          }}
          onChange={(val) => updateFileContent(activeFile, val)}
          className="h-full"
          style={{ fontSize: `${settings.fontSize ?? 14}px`, height: "100%" }}
        />
      </div>
      <StatusBar
        line={cursor.line}
        col={cursor.col}
        language={detectLanguage(activeFile).toUpperCase()}
        tabSize={settings.tabSize ?? 2}
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
