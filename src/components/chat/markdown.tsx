"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, FileText, AlertTriangle, ExternalLink, Code2, Palette, FileCode, Play, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { OnyxRenderer, parseOnyxBlock } from "./onyx-components/registry";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/lib/api";

function CodeBlock({ children, className, rawContent }: { children?: React.ReactNode; className?: string; rawContent?: string }) {
  const [copied, setCopied] = React.useState(false);
  const codeRef = React.useRef<HTMLPreElement>(null);

  async function copy() {
    const text = rawContent ?? codeRef.current?.innerText ?? "";
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      toast.success("Copied code");
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const lang = className?.replace("language-", "") ?? "";

  // Check for onyx: component
  if (lang.startsWith("onyx:")) {
    const parsed = parseOnyxBlock(lang, rawContent ?? "");
    if (parsed) {
      return <OnyxRenderer type={parsed.type} props={parsed.props} />;
    }
  }

  // Mermaid placeholder
  if (lang === "mermaid") {
    return (
      <div className="my-3 rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Eye className="size-3" /> Mermaid Diagram
        </div>
        <pre className="overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px]">{rawContent}</pre>
        <div className="mt-2 text-[11px] text-muted-foreground">Install mermaid to render: <code>npm i mermaid</code></div>
      </div>
    );
  }

  // Diff with apply button
  const isDiff = lang === "diff";
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border bg-zinc-950 shadow-md">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <Code2 className="size-3.5 text-zinc-400" />
          <span className="font-mono text-[11px] text-zinc-400">{lang || "code"}</span>
          {isDiff && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">diff</span>}
        </div>
        <div className="flex items-center gap-1">
          {isDiff && (
            <Button variant="ghost" size="sm" onClick={() => {
              toast.info("Diff apply: Use onyx:diff component for interactive apply");
            }} className="h-6 gap-1 rounded-full bg-white/5 px-2 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
              <FileCode className="size-3" /> Apply
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={copy} className="h-6 gap-1 rounded-full bg-white/5 px-2 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <pre ref={codeRef} className={cn("overflow-x-auto p-4 text-[12.5px] leading-relaxed text-zinc-100", className, isDiff && "bg-zinc-900")}>
        {children}
      </pre>
    </div>
  );
}

function ColorSwatch({ hex }: { hex: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px]">
      <span className="size-3 rounded-full border" style={{ background: hex }} />
      <span className="font-mono">{hex}</span>
    </span>
  );
}

export function MarkdownContent({
  content,
  onFileClick,
}: {
  content: string;
  onFileClick?: (path: string) => void;
}) {
  const deferredContent = React.useDeferredValue(content);

  // Extract onyx blocks before markdown to avoid double parsing? We'll handle in code component
  const components = React.useMemo(
    () => ({
      code({ className, children, ...props }: any) {
        const isInline = !className;
        if (isInline) {
          const text = String(children);
          // Inline color hex detection
          const hexMatch = text.match(/^#([0-9a-fA-F]{3,8})$/);
          if (hexMatch) {
            return <ColorSwatch hex={text} />;
          }
          return (
            <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[12px]", className)} {...props}>
              {children}
            </code>
          );
        }
        // For block code, children is array, need raw text
        const raw = (() => {
          try {
            const child = (props as any).children ?? children;
            if (typeof child === "string") return child;
            if (Array.isArray(child)) return child.join("");
            // react-markdown passes code as string in children prop
            const c = (props as any).node?.children?.[0]?.value ?? "";
            return String(c || children || "");
          } catch {
            return String(children || "");
          }
        })();
        // Better raw extraction: if children is string
        let actualRaw = raw;
        if (typeof children === "string") actualRaw = children;
        else if (Array.isArray(children) && typeof children[0] === "string") actualRaw = children[0] as string;
        else {
          // Fallback: use innerText from DOM later, but try props
          const maybe = (props as any).children;
          if (typeof maybe === "string") actualRaw = maybe;
        }

        return <CodeBlock className={className} rawContent={actualRaw}>{children}</CodeBlock>;
      },
      a({ children, href, ...props }: any) {
        if (href && !/^https?:\/\//.test(href) && onFileClick) {
          // Check if href contains line number e.g. index.html:12 or index.html:12-20
          const match = href.match(/^(.+):(\d+)(?:-(\d+))?$/);
          if (match) {
            const file = match[1];
            const line = match[2];
            return (
              <button className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-mono text-[12px] transition-colors hover:bg-accent" onClick={() => onFileClick(file)} {...props}>
                <FileText className="size-3" />
                {file}:{line}
              </button>
            );
          }
          return (
            <button className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-mono text-[12px] transition-colors hover:bg-accent" onClick={() => onFileClick(href)} {...props}>
              <FileText className="size-3" />
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2" {...props}>
            {children}
            <ExternalLink className="size-3" />
          </a>
        );
      },
      table({ children }: any) {
        return <div className="my-3 overflow-auto rounded-xl border"><table className="w-full text-[13px]">{children}</table></div>;
      },
      th({ children }: any) {
        return <th className="border-b bg-muted/50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">{children}</th>;
      },
      td({ children }: any) {
        return <td className="border-b px-3 py-2">{children}</td>;
      },
      blockquote({ children }: any) {
        // GitHub callout detection
        const text = React.Children.toArray(children).join("");
        if (text.includes("[!NOTE]") || text.includes("[!WARNING]") || text.includes("[!TIP]")) {
          const type = text.includes("[!WARNING]") ? "warning" : text.includes("[!TIP]") ? "tip" : "note";
          return (
            <div className={cn("my-3 rounded-xl border p-3 text-[13px]",
              type === "warning" && "border-amber-500/20 bg-amber-500/10",
              type === "note" && "border-blue-500/20 bg-blue-500/10",
              type === "tip" && "border-emerald-500/20 bg-emerald-500/10"
            )}>
              {children}
            </div>
          );
        }
        return <blockquote className="my-3 border-l-2 border-muted-foreground/20 pl-4 italic text-muted-foreground">{children}</blockquote>;
      },
    }),
    [onFileClick]
  );

  return (
    <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:my-0 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{deferredContent}</ReactMarkdown>
    </div>
  );
}

export function ErrorCard({
  content,
  onRetry,
}: {
  content: string;
  onRetry?: () => void;
}) {
  return (
    <div className="my-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4">
      <div className="flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-red-700 dark:text-red-300">Request failed</div>
          <div className="mt-1 text-xs leading-relaxed text-red-600/80 dark:text-red-400/80">{content}</div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 h-7 gap-1.5 rounded-full border-red-500/20 text-xs hover:bg-red-500/10">
              <Code2 className="size-3" /> Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 rounded-full border bg-card text-xs shadow-sm hover:bg-accent"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(text);
          setCopied(true);
          toast.success("Copied");
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {label}
    </Button>
  );
}
