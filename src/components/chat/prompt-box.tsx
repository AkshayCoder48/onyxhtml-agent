"use client";

import * as React from "react";
import {
  ArrowUp,
  Square,
  Paperclip,
  AtSign,
  Settings as SettingsIcon,
  Loader2,
  Sparkles,
  Command,
  FileText,
  Hash,
  Zap,
  Plus,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useChatStore } from "@/stores/chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUIStore } from "@/stores/ui-store";
import { useProviders } from "@/hooks/use-providers";
import { useProviderStore, isProviderUsable, activeModelLabel } from "@/stores/provider-store";
import { cn } from "@/lib/utils";

export function ChatPromptBox({
  onSend,
  onStop,
  isStreaming,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}) {
  const [value, setValue] = React.useState("");
  const [attachedFiles, setAttachedFiles] = React.useState<string[]>([]);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const openSettings = useUIStore((s) => s.openSettings);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const files = useWorkspaceStore((s) => s.files);

  useProviders();
  const providers = useProviderStore((s) => s.providers);
  const activeProvider = useProviderStore((s) => s.activeProvider);
  const setActiveProvider = useProviderStore((s) => s.setActiveProvider);
  const usable = isProviderUsable(activeProvider);

  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [value]);

  React.useEffect(() => {
    function onSetPrompt(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setValue((prev) => (prev ? prev + "\n" + detail : detail));
      taRef.current?.focus();
    }
    window.addEventListener("chat:set-prompt", onSetPrompt as EventListener);
    return () => window.removeEventListener("chat:set-prompt", onSetPrompt as EventListener);
  }, []);

  React.useEffect(() => {
    function onHomeSend(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      onSend(detail);
    }
    function onFocusPrompt() {
      taRef.current?.focus();
    }
    window.addEventListener("home:send", onHomeSend as EventListener);
    window.addEventListener("chat:focus-prompt", onFocusPrompt as EventListener);
    return () => {
      window.removeEventListener("home:send", onHomeSend as EventListener);
      window.removeEventListener("chat:focus-prompt", onFocusPrompt as EventListener);
    };
  }, [onSend]);

  function handleSend() {
    const v = value.trim();
    if (!v || isStreaming) return;
    onSend(v);
    setValue("");
    setAttachedFiles([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  function attachFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const fenced = `\n\n\`\`\`${file.name.split(".").pop() ?? ""} ${file.name}\n${text}\n\`\`\`\n`;
      setValue((v) => v + fenced);
      setAttachedFiles((prev) => [...prev, file.name]);
    };
    reader.readAsText(file);
  }

  return (
    <div className="border-t bg-card/30 p-3 backdrop-blur">
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((f) => (
            <Badge key={f} variant="secondary" className="gap-1 rounded-full pr-1 text-xs">
              <FileText className="size-3" /> {f}
              <button onClick={() => setAttachedFiles((prev) => prev.filter((x) => x !== f))} className="ml-1 rounded-full p-0.5 hover:bg-muted">
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className={cn("group relative rounded-[20px] border bg-card shadow-sm transition-all", "focus-within:shadow-md focus-within:ring-1 focus-within:ring-violet-500/20 focus-within:border-violet-500/30")}>
        <div className="absolute inset-0 rounded-[20px] bg-gradient-to-br from-violet-500/[0.02] to-blue-500/[0.02] opacity-0 transition-opacity group-focus-within:opacity-100" />
        <Textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={usable ? "Ask AI to edit your website…" : "Configure AI provider to start…"}
          className="relative min-h-[48px] resize-none border-0 bg-transparent px-4 py-3 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
        />

        <div className="relative flex items-center justify-between gap-1 px-2 pb-2">
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Attach">
                  <Paperclip className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="rounded-xl">
                <DropdownMenuItem
                  onSelect={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.onchange = () => {
                      const f = input.files?.[0];
                      if (f) attachFile(f);
                    };
                    input.click();
                  }}
                  className="gap-2"
                >
                  <FileText className="size-4" /> Upload file…
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    if (activeFile) {
                      const ext = activeFile.split(".").pop() ?? "";
                      const text = files[activeFile]?.content ?? "";
                      setValue((v) => v + `\n\n\`\`\`${ext} ${activeFile}\n${text}\n\`\`\`\n`);
                      setAttachedFiles((prev) => [...prev, activeFile]);
                    }
                  }}
                  disabled={!activeFile}
                  className="gap-2"
                >
                  <Hash className="size-4" /> Add {activeFile ? activeFile : "file"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Context">
                  <AtSign className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="rounded-xl">
                <DropdownMenuItem onSelect={() => { if (activeFile) setValue((v) => v + ` @file:${activeFile}`); }} disabled={!activeFile} className="gap-2">
                  <FileText className="size-4" /> Current file{activeFile ? ` (${activeFile})` : ""}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setValue((v) => v + " @workspace:all")} className="gap-2">
                  <Hash className="size-4" /> Entire workspace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Recent files</div>
                {Object.keys(files)
                  .slice(0, 6)
                  .map((p) => (
                    <DropdownMenuItem key={p} onSelect={() => setValue((v) => v + ` @file:${p}`)} className="gap-2 font-mono text-xs">
                      <FileText className="size-3" /> {p}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
                        <span className={cn("size-2 rounded-full", usable ? "bg-emerald-500" : "bg-amber-500")} />
                        <span className="max-w-[120px] truncate">{activeModelLabel(activeProvider)}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="rounded-xl">
                      {providers.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No providers configured</div>}
                      {providers.map((p) => (
                        <DropdownMenuItem key={p.id} onSelect={() => setActiveProvider(p)} className="flex items-center justify-between gap-2">
                          <span className="truncate">{p.name}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{p.model}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openSettings("providers")} className="gap-2">
                        <SettingsIcon className="size-4" /> Manage providers…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent>Model</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={() => openSettings("providers")} aria-label="AI settings">
                    <SettingsIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {isStreaming ? (
              <Button size="icon" variant="destructive" className="size-9 rounded-full shadow-md" onClick={onStop} aria-label="Stop">
                <Square className="size-4" />
              </Button>
            ) : (
              <Button size="icon" className="size-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 shadow-md hover:from-violet-700 hover:to-blue-700" onClick={handleSend} disabled={!value.trim()} aria-label="Send">
                <ArrowUp className="size-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Command className="size-3" />
        <span>⌘/Ctrl + Enter to send • Shift+Enter for new line</span>
      </div>
    </div>
  );
}
