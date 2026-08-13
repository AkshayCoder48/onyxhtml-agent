"use client";

import * as React from "react";
import {
  ArrowUp,
  Square,
  Paperclip,
  AtSign,
  Settings as SettingsIcon,
  Loader2,
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
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const openSettings = useUIStore((s) => s.openSettings);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const files = useWorkspaceStore((s) => s.files);

  useProviders();
  const providers = useProviderStore((s) => s.providers);
  const activeProvider = useProviderStore((s) => s.activeProvider);
  const setActiveProvider = useProviderStore((s) => s.setActiveProvider);
  const usable = isProviderUsable(activeProvider);

  // Auto-grow textarea
  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [value]);

  // Listen for external prompt set events (suggestion buttons)
  React.useEffect(() => {
    function onSetPrompt(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setValue((prev) => (prev ? prev + "\n" + detail : detail));
      taRef.current?.focus();
    }
    window.addEventListener("chat:set-prompt", onSetPrompt as EventListener);
    return () => window.removeEventListener("chat:set-prompt", onSetPrompt as EventListener);
  }, []);

  // Listen for home-screen send event — fires when user sends from home screen
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
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      // Don't submit on plain Enter — let user add newlines.
      // Many chat UIs submit on Enter; we follow the spec which says Ctrl/Cmd+Enter sends.
    }
  }

  function attachFile(file: File) {
    // Read file content and inject as a code block reference
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const fenced = `\n\n\`\`\`${file.name.split(".").pop() ?? ""} ${file.name}\n${text}\n\`\`\`\n`;
      setValue((v) => v + fenced);
    };
    reader.readAsText(file);
  }

  return (
    <div className="border-t bg-background p-2.5">
      <div className="rounded-xl border bg-card p-1.5 shadow-sm">
        <Textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            usable
              ? "Ask AI to edit or test your website…"
              : "Configure an AI provider in Settings to start chatting…"
          }
          className="min-h-[44px] resize-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-1 px-1 pt-1">
          <div className="flex items-center gap-0.5">
            {/* Attach */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Attach">
                  <Paperclip className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
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
                >
                  Upload file…
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    if (activeFile) {
                      const ext = activeFile.split(".").pop() ?? "";
                      const text = files[activeFile]?.content ?? "";
                      setValue((v) =>
                        v + `\n\n\`\`\`${ext} ${activeFile}\n${text}\n\`\`\`\n`
                      );
                    }
                  }}
                  disabled={!activeFile}
                >
                  Add workspace file
                  {activeFile ? ` (${activeFile})` : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Context */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Context">
                  <AtSign className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => {
                    if (activeFile) {
                      setValue((v) =>
                        v + ` @file:${activeFile}`
                      );
                    }
                  }}
                  disabled={!activeFile}
                >
                  Current file{activeFile ? ` (${activeFile})` : ""}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setValue((v) => v + " @workspace:all")}
                >
                  Entire workspace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Recent files
                </div>
                {Object.keys(files)
                  .slice(0, 6)
                  .map((p) => (
                    <DropdownMenuItem
                      key={p}
                      onSelect={() => setValue((v) => v + ` @file:${p}`)}
                    >
                      {p}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Provider / model selector */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            usable ? "bg-emerald-500" : "bg-amber-500"
                          )}
                        />
                        <span className="max-w-[140px] truncate">
                          {activeModelLabel(activeProvider)}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {providers.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          No providers configured
                        </div>
                      )}
                      {providers.map((p) => (
                        <DropdownMenuItem
                          key={p.id}
                          onSelect={() => setActiveProvider(p)}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {p.model}
                          </span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openSettings("providers")}>
                        Manage providers…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent>Model</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-0.5">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => openSettings("providers")}
                    aria-label="AI settings"
                  >
                    <SettingsIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {isStreaming ? (
              <Button
                size="icon"
                variant="destructive"
                className="size-8 rounded-full"
                onClick={onStop}
                aria-label="Stop"
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="size-8 rounded-full"
                onClick={handleSend}
                disabled={!value.trim()}
                aria-label="Send"
              >
                {value.trim() ? (
                  <ArrowUp className="size-4" />
                ) : (
                  <Loader2 className="size-4 opacity-50" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground">
          ⌘/Ctrl + Enter to send
        </span>
      </div>
    </div>
  );
}
