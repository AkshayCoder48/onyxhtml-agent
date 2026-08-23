"use client";

import * as React from "react";
import {
  ArrowUp,
  Square,
  Paperclip,
  AtSign,
  Settings as SettingsIcon,
  Command,
  FileText,
  Hash,
  X,
  Mic,
  MicOff,
  Zap,
  Palette,
  Bug,
  Wand2,
  Layout,
  Search,
  QrCode,
  Image as ImageIcon,
  Sparkles,
  Code2,
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
import { toast } from "sonner";

const SLASH_COMMANDS = [
  { cmd: "/fix", label: "Fix errors", desc: "Auto-fix console & QA errors", prompt: "Fix all console errors and QA issues. Run qa_suite after." },
  { cmd: "/responsive", label: "Make responsive", desc: "Fix mobile layout", prompt: "Make the current page fully responsive. Check with test_responsive_layout and fix overflow." },
  { cmd: "/a11y", label: "Fix accessibility", desc: "Run a11y audit & fix", prompt: "Run accessibility audit and fix all issues: missing alt, labels, contrast." },
  { cmd: "/seo", label: "Fix SEO", desc: "Add meta, OG, headings", prompt: "Audit SEO: title, meta description, headings, alt tags, OG tags. Fix all." },
  { cmd: "/plan", label: "Create plan", desc: "Plan before coding", prompt: "Create a plan for the next task using create_plan tool before coding." },
  { cmd: "/palette", label: "Generate palette", desc: "Generate color palette", prompt: "Generate a color palette for this project using generate_palette and apply to CSS variables." },
  { cmd: "/qr", label: "Add QR code", desc: "Generate QR code", prompt: "Generate a QR code for the site URL using generate_qr and add to page." },
  { cmd: "/outline", label: "Outline file", desc: "Get file outline", prompt: "Use read_file_outline to show me the structure of the current file." },
  { cmd: "/symbols", label: "List symbols", desc: "Find classes/ids", prompt: "Use get_file_symbols to list all classes, ids, and symbols in current file." },
  { cmd: "/unused", label: "Find unused CSS", desc: "Dead code check", prompt: "Find unused CSS with find_unused_css and remove it." },
  { cmd: "/validate", label: "Validate HTML", desc: "Check for errors", prompt: "Validate current HTML file with validate_html and fix errors." },
  { cmd: "/deps", label: "Dependency graph", desc: "Show file dependencies", prompt: "Show dependency graph using get_dependency_graph." },
  { cmd: "/checkpoint", label: "Save checkpoint", desc: "Save version", prompt: "Save a checkpoint with checkpoint tool." },
  { cmd: "/ask", label: "Ask user", desc: "Clarify intent", prompt: "If my request is vague, use ask_user tool to clarify." },
];

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
  const [showSlash, setShowSlash] = React.useState(false);
  const [slashFilter, setSlashFilter] = React.useState("");
  const [isListening, setIsListening] = React.useState(false);
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

  // Slash command detection
  React.useEffect(() => {
    if (value.startsWith("/") && value.length <= 20) {
      const filter = value.slice(1).toLowerCase();
      setSlashFilter(filter);
      setShowSlash(true);
    } else {
      setShowSlash(false);
    }
  }, [value]);

  function handleSend() {
    const v = value.trim();
    if (!v || isStreaming) return;
    onSend(v);
    setValue("");
    setAttachedFiles([]);
    setShowSlash(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && showSlash) {
      setShowSlash(false);
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

  const toggleVoice = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      toast.error("Voice input not supported in this browser");
      return;
    }
    if (isListening) {
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setValue((prev) => prev + (prev ? " " : "") + transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  const filteredSlash = SLASH_COMMANDS.filter((c) => !slashFilter || c.cmd.includes(slashFilter) || c.label.toLowerCase().includes(slashFilter));

  return (
    <div className="relative border-t bg-card/30 p-3 backdrop-blur">
      {showSlash && filteredSlash.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-2 max-h-64 overflow-auto rounded-xl border bg-popover shadow-lg">
          <div className="p-2">
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Slash commands • {filteredSlash.length}</div>
            {filteredSlash.map((c) => (
              <button
                key={c.cmd}
                onClick={() => {
                  setValue(c.prompt);
                  setShowSlash(false);
                  taRef.current?.focus();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent transition-colors"
              >
                <div className="flex size-7 items-center justify-center rounded-md bg-muted">
                  <Zap className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-medium">{c.cmd}</span>
                    <span className="text-[12px]">{c.label}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{c.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
          placeholder={usable ? "Ask AI to edit… or type / for commands" : "Configure AI provider to start…"}
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
              <DropdownMenuContent align="start" className="rounded-xl w-56">
                <DropdownMenuItem
                  onSelect={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".html,.css,.js,.json,.md,.txt";
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
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" onSelect={() => setValue((v) => v + " Use read_file_outline to get outline.")}>
                  <Search className="size-4" /> Outline current file
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={() => setValue((v) => v + " Use find_unused_css to find dead CSS.")}>
                  <Code2 className="size-4" /> Find unused CSS
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
                  <Button variant="ghost" size="icon" className={cn("size-8 rounded-full", isListening && "bg-red-500/10 text-red-600")} onClick={toggleVoice} aria-label="Voice input">
                    {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isListening ? "Stop listening" : "Voice input (free, Web Speech API)"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
                  <Zap className="size-3" /> Free Tools
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="rounded-xl w-56">
                <DropdownMenuItem className="gap-2" onSelect={() => setValue("Generate a color palette for coffee shop mood using generate_palette")}>
                  <Palette className="size-4" /> Generate palette
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={() => setValue("Generate a QR code for https://example.com using generate_qr")}>
                  <QrCode className="size-4" /> Generate QR
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={() => setValue("Validate HTML file index.html using validate_html")}>
                  <Bug className="size-4" /> Validate HTML
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={() => setValue("Find unused CSS and remove it using find_unused_css")}>
                  <Wand2 className="size-4" /> Clean unused CSS
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={() => setValue("Show dependency graph using get_dependency_graph")}>
                  <Layout className="size-4" /> Dependency graph
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={() => setValue("Get images info and fonts in use using get_images_info and get_fonts_in_use")}>
                  <ImageIcon className="size-4" /> Audit assets
                </DropdownMenuItem>
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
        <span>⌘/Ctrl + Enter to send • / for commands • 🎤 voice</span>
      </div>
    </div>
  );
}
