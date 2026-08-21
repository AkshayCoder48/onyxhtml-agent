"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Check, Copy, FileText, AlertTriangle, ExternalLink, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const codeRef = React.useRef<HTMLPreElement>(null);

  async function copy() {
    const text = codeRef.current?.innerText ?? "";
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      toast.success("Copied code");
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const lang = className?.replace("language-", "") ?? "";

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border bg-zinc-950 shadow-md">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <Code2 className="size-3.5 text-zinc-400" />
          <span className="font-mono text-[11px] text-zinc-400">{lang || "code"}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={copy} className="h-6 gap-1 rounded-full bg-white/5 px-2 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre ref={codeRef} className={cn("overflow-x-auto p-4 text-[12.5px] leading-relaxed", className)}>
        {children}
      </pre>
    </div>
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

  const components = React.useMemo(
    () => ({
      code({ className, children, ...props }: any) {
        const isInline = !className;
        if (isInline) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        }
        return (
          <CodeBlock className={className}>
            <code className={className} {...props}>
              {children}
            </code>
          </CodeBlock>
        );
      },
      a({ children, href, ...props }: any) {
        if (href && !/^https?:\/\//.test(href) && onFileClick) {
          return (
            <button className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-mono text-[12px] transition-colors hover:bg-accent" onClick={() => onFileClick(href)} {...props}>
              <FileText className="size-3" />
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" {...props}>
            {children}
            <ExternalLink className="size-3" />
          </a>
        );
      },
    }),
    [onFileClick]
  );

  return (
    <div className="chat-markdown">
      <ReactMarkdown components={components}>{deferredContent}</ReactMarkdown>
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
