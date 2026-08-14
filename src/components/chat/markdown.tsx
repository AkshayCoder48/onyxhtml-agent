"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Check, Copy, FileText, AlertTriangle } from "lucide-react";
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
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border bg-muted/50">
      <pre
        ref={codeRef}
        className={cn("overflow-x-auto p-3 text-[12px] leading-relaxed", className)}
      >
        {children}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        onClick={copy}
        className="absolute right-1.5 top-1.5 size-6 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </Button>
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
  // useDeferredValue lets React render the markdown at LOW priority during
  // streaming. The store still updates on every delta (immediate), but the
  // expensive ReactMarkdown parse is deferred so it never blocks paint.
  // This is NOT stream throttling — it's render scheduling (PRD §8 allows
  // render scheduling; it forbids rAF/setTimeout as STREAM BATCHERS).
  //
  // Effect: during fast streaming, the raw text appears instantly (via the
  // store update), and the formatted markdown catches up a frame or two
  // later. The UI stays responsive — no "stuck on thinking" lag.
  const deferredContent = React.useDeferredValue(content);

  // Stable callback so the components prop doesn't change identity on every
  // render (which would force ReactMarkdown to re-render even when content
  // is unchanged).
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
        // Render file paths (relative, no protocol) as in-app file openers
        if (href && !/^https?:\/\//.test(href) && onFileClick) {
          return (
            <button
              className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[12px] hover:bg-accent"
              onClick={() => onFileClick(href)}
              {...props}
            >
              <FileText className="size-3" />
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
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
    <div className="my-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="size-4" /> Request failed
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{content}</div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 h-7 gap-1.5 text-xs"
        >
          Retry
        </Button>
      )}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(text);
          setCopied(true);
          toast.success("Copied");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {label}
    </Button>
  );
}
