"use client";

import * as React from "react";
import {
  Bot,
  Palette,
  Code2,
  Eye,
  Settings as SettingsIcon,
  Keyboard,
  X,
  Plus,
  Loader2,
  Check,
  AlertTriangle,
  Eye as EyeIcon,
  EyeOff,
  Trash2,
  ChevronLeft,
  Sparkles,
  Globe,
  Key,
  Server,
  Cpu,
  Zap,
  Shield,
  ExternalLink,
  RefreshCw,
  Search,
  Copy,
  CheckCircle2,
  XCircle,
  Layers,
  Wand2,
  Database,
  Monitor,
  Sun,
  Moon,
  Laptop,
  FileCode,
  Terminal,
  Info,
  Link2,
  Braces,
  Cloud,
  Box,
  Activity,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/ui-store";
import { useSettings } from "@/hooks/use-settings";
import { useProviders } from "@/hooks/use-providers";
import { useProviderStore } from "@/stores/provider-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import type { Provider, ProviderInput, UITheme } from "@/lib/types";
import { UI_THEMES } from "@/lib/types";

type Category = "providers" | "appearance" | "editor" | "preview" | "general" | "shortcuts";

const CATEGORIES: {
  id: Category;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
}[] = [
  { id: "providers", label: "AI Providers", short: "AI", icon: Bot, desc: "Models & API keys" },
  { id: "appearance", label: "Appearance", short: "Theme", icon: Palette, desc: "Theme & colors" },
  { id: "editor", label: "Editor", short: "Editor", icon: Code2, desc: "Code editing" },
  { id: "preview", label: "Preview", short: "Preview", icon: Eye, desc: "Live preview" },
  { id: "general", label: "General", short: "General", icon: SettingsIcon, desc: "App settings" },
  { id: "shortcuts", label: "Keyboard", short: "Keys", icon: Keyboard, desc: "Shortcuts" },
];

// Preset providers for quick setup
const PROVIDER_PRESETS = [
  { name: "OpenAI", baseURL: "https://api.openai.com/v1", icon: Sparkles, color: "text-emerald-600", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini"] },
  { name: "Anthropic (OpenAI compat)", baseURL: "https://api.anthropic.com/v1", icon: Bot, color: "text-orange-600", models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"] },
  { name: "Groq", baseURL: "https://api.groq.com/openai/v1", icon: Zap, color: "text-amber-600", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"] },
  { name: "Together AI", baseURL: "https://api.together.xyz/v1", icon: Cloud, color: "text-blue-600", models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct"] },
  { name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", icon: Globe, color: "text-violet-600", models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash"] },
  { name: "Ollama (Local)", baseURL: "http://localhost:11434/v1", icon: Box, color: "text-zinc-600", models: ["llama3.2", "qwen2.5-coder", "deepseek-coder-v2"] },
  { name: "LM Studio (Local)", baseURL: "http://localhost:1234/v1", icon: Monitor, color: "text-cyan-600", models: ["local-model"] },
  { name: "Custom", baseURL: "", icon: Server, color: "text-muted-foreground", models: [] },
];

class SettingsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <div className="font-medium text-red-700 dark:text-red-300">Settings failed to render</div>
          <p className="mt-1 text-xs text-muted-foreground">{this.state.error.message}</p>
          <Button className="mt-3 rounded-full" size="sm" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SettingsDialog() {
  const open = useUIStore((s) => s.settingsOpen);
  const close = useUIStore((s) => s.closeSettings);
  const rawCategory = useUIStore((s) => s.settingsCategory);
  const category: Category = CATEGORIES.some((c) => c.id === rawCategory)
    ? (rawCategory as Category)
    : "appearance";
  const openSettings = useUIStore((s) => s.openSettings);

  const [mobileView, setMobileView] = React.useState<"list" | "panel">("list");
  const prevOpenRef = React.useRef(open);
  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      setMobileView("list");
    }
    prevOpenRef.current = open;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(92vh,820px)] w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[980px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure the AI HTML Workspace Editor.</DialogDescription>
        </DialogHeader>

        {/* Mobile header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b bg-muted/20 px-4 backdrop-blur sm:hidden">
          {mobileView === "panel" ? (
            <Button variant="ghost" size="sm" className="gap-1.5 rounded-full" onClick={() => setMobileView("list")}>
              <ChevronLeft className="size-4" /> Back
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <SettingsIcon className="size-4" />
              </div>
              <span className="text-sm font-semibold">Settings</span>
            </div>
          )}
          <span className="text-sm font-medium">{mobileView === "panel" ? CATEGORIES.find((c) => c.id === category)?.label : ""}</span>
          <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={close} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:h-[min(78vh,700px)] sm:flex-row">
          {/* Left nav */}
          <nav
            className={cn(
              "flex shrink-0 gap-1 border-b bg-muted/30 p-2 backdrop-blur sm:w-[240px] sm:flex-col sm:gap-1 sm:border-b-0 sm:border-r sm:p-3",
              mobileView === "panel" && "hidden sm:flex"
            )}
            aria-label="Settings categories"
          >
            <div className="hidden px-2 pb-3 pt-1 sm:block">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-md">
                  <SettingsIcon className="size-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Settings</div>
                  <div className="text-[11px] text-muted-foreground">Configure your workspace</div>
                </div>
              </div>
            </div>
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = c.id === category;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    openSettings(c.id);
                    setMobileView("panel");
                  }}
                  className={cn(
                    "group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all",
                    "sm:w-full sm:shrink",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg transition-colors",
                      active ? "bg-primary text-primary-foreground" : "bg-muted group-hover:bg-accent"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="hidden min-w-0 flex-1 sm:block">
                    <div className="truncate font-medium">{c.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{c.desc}</div>
                  </div>
                  <span className="sm:hidden">{c.short}</span>
                </button>
              );
            })}

            <div className="mt-auto hidden rounded-xl border bg-card p-3 sm:block">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-white">
                  <Sparkles className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">Onyx HTML</div>
                  <div className="text-[10px] text-muted-foreground">v0.2.1 • AI Workspace</div>
                </div>
              </div>
            </div>
          </nav>

          {/* Right content */}
          <div className={cn("flex min-w-0 flex-1 flex-col bg-background", mobileView === "list" && "hidden sm:flex")}>
            {/* Desktop header */}
            <div className="hidden h-14 shrink-0 items-center justify-between border-b bg-muted/10 px-6 backdrop-blur sm:flex">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-card shadow-sm ring-1 ring-border">
                  {React.createElement(CATEGORIES.find((c) => c.id === category)?.icon ?? SettingsIcon, { className: "size-4" })}
                </div>
                <div>
                  <div className="text-sm font-semibold">{CATEGORIES.find((c) => c.id === category)?.label}</div>
                  <div className="text-xs text-muted-foreground">{CATEGORIES.find((c) => c.id === category)?.desc}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={close} aria-label="Close">
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <div className="p-4 sm:p-6">
                <SettingsErrorBoundary>
                  {category === "providers" && <ProvidersPanel />}
                  {category === "appearance" && <AppearancePanel />}
                  {category === "editor" && <EditorPanel />}
                  {category === "preview" && <PreviewPanel />}
                  {category === "general" && <GeneralPanel />}
                  {category === "shortcuts" && <ShortcutsPanel />}
                </SettingsErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Providers ------------------------------ */

function ProvidersPanel() {
  useProviders();
  const providers = useProviderStore((s) => s.providers);
  const setActiveProvider = useProviderStore((s) => s.setActiveProvider);
  const activeProvider = useProviderStore((s) => s.activeProvider);
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Provider | "new" | null>(null);
  const [search, setSearch] = React.useState("");

  const filtered = providers.filter((p) => {
    if (!search) return true;
    return p.name.toLowerCase().includes(search.toLowerCase()) || p.model.toLowerCase().includes(search.toLowerCase()) || p.baseURL.toLowerCase().includes(search.toLowerCase());
  });

  async function handleSetActive(p: Provider) {
    try {
      await api.patchProvider(p.id, { isActive: true });
      setActiveProvider(p);
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast.success("Active provider updated", { description: `${p.name} is now active` });
    } catch (e) {
      toast.error("Failed to set active provider", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function handleDelete(p: Provider) {
    if (!confirm(`Delete provider "${p.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteProvider(p.id);
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast.success("Provider deleted");
    } catch (e) {
      toast.error("Delete failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">AI Providers</h2>
            <p className="mt-1 max-w-[520px] text-sm leading-relaxed text-muted-foreground">
              Connect any OpenAI-compatible API. Add your base URL, optional API key, and fetch available models. Your active provider powers all chat completions.
            </p>
          </div>
          <Button onClick={() => setEditing("new")} className="gap-2 rounded-full shadow-sm">
            <Plus className="size-4" /> Add Provider
          </Button>
        </div>

        {/* Search and stats */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search providers, models, URLs..." className="h-9 rounded-full pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              <Database className="mr-1 size-3" /> {providers.length} providers
            </Badge>
            {activeProvider && (
              <Badge className="rounded-full bg-emerald-600">
                <Activity className="mr-1 size-3" /> {activeProvider.name} active
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Providers grid */}
      <div className="grid gap-3">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Bot className="size-6 text-muted-foreground" />
            </div>
            <div className="mt-3 text-sm font-medium">No providers yet</div>
            <div className="mt-1 text-xs text-muted-foreground">Add an OpenAI-compatible provider to enable AI chat</div>
            <Button size="sm" className="mt-4 rounded-full" onClick={() => setEditing("new")}>
              <Plus className="mr-1 size-4" /> Add your first provider
            </Button>
          </div>
        )}

        {filtered.map((p) => (
          <div
            key={p.id}
            className={cn(
              "group relative overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:shadow-md",
              p.isActive && "ring-1 ring-emerald-500/30 border-emerald-500/30 bg-emerald-500/[0.02]"
            )}
          >
            {p.isActive && <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500" />}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border shadow-sm", p.isActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : "bg-muted border-border")}>
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold tracking-tight">{p.name}</span>
                    {p.isActive && (
                      <Badge className="h-5 rounded-full bg-emerald-500 px-2 text-[10px] font-medium text-white">
                        <CheckCircle2 className="mr-1 size-3" /> Active
                      </Badge>
                    )}
                    <Badge variant="outline" className="h-5 rounded-full font-mono text-[11px]">
                      <Cpu className="mr-1 size-3" /> {p.model}
                    </Badge>
                    {p.hasApiKey ? (
                      <Badge variant="secondary" className="h-5 rounded-full text-[10px]">
                        <Key className="mr-1 size-3" /> Key set
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="h-5 rounded-full text-[10px] text-muted-foreground">
                        No key
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Link2 className="size-3" />
                      <span className="truncate font-mono text-[11px]">{p.baseURL}</span>
                      <button
                        className="rounded p-0.5 hover:bg-muted"
                        onClick={() => {
                          navigator.clipboard.writeText(p.baseURL);
                          toast.success("Copied URL");
                        }}
                      >
                        <Copy className="size-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Created {new Date(p.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="font-mono">{p.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 self-start">
                {!p.isActive && (
                  <Button size="sm" className="h-8 rounded-full" onClick={() => handleSetActive(p)}>
                    <Check className="mr-1 size-3.5" /> Set active
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button size="icon" variant="ghost" className="size-8 rounded-full text-muted-foreground hover:text-destructive" onClick={() => handleDelete(p)} aria-label="Delete">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && <ProviderEditor provider={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProviderEditor({ provider, onClose }: { provider: Provider | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(provider?.name ?? "");
  const [baseURL, setBaseURL] = React.useState(provider?.baseURL ?? "https://api.openai.com/v1");
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState(provider?.model ?? "");
  const [showKey, setShowKey] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<null | { ok: boolean; msg: string }>(null);
  const [fetchingModels, setFetchingModels] = React.useState(false);
  const [models, setModels] = React.useState<string[]>([]);
  const [modelSearch, setModelSearch] = React.useState("");
  const [selectedPreset, setSelectedPreset] = React.useState<string | null>(null);

  // Load models for existing provider
  const modelsQuery = useQuery({
    queryKey: ["provider-models", provider?.id],
    queryFn: async () => (provider ? (await api.listProviderModels(provider.id)).models : []),
    enabled: !!provider,
  });

  React.useEffect(() => {
    if (modelsQuery.data) setModels(modelsQuery.data);
  }, [modelsQuery.data]);

  // Preset handling
  function applyPreset(preset: typeof PROVIDER_PRESETS[number]) {
    if (preset.name === "Custom") {
      setSelectedPreset("Custom");
      return;
    }
    setName(preset.name);
    setBaseURL(preset.baseURL);
    setSelectedPreset(preset.name);
    if (preset.models.length > 0 && !model) {
      setModel(preset.models[0]);
    }
    toast.success(`Applied ${preset.name} preset`, { description: preset.baseURL });
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Provider name is required");
      return;
    }
    if (!baseURL.trim()) {
      toast.error("Base URL is required");
      return;
    }
    if (!model.trim()) {
      toast.error("Model ID is required");
      return;
    }

    // Validate URL
    try {
      new URL(baseURL.trim());
    } catch {
      toast.error("Invalid base URL", { description: "Please enter a valid URL like https://api.openai.com/v1" });
      return;
    }

    const body: ProviderInput = {
      name: name.trim(),
      baseURL: baseURL.trim().replace(/\/+$/, ""),
      model: model.trim(),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };

    try {
      if (provider) {
        await api.patchProvider(provider.id, body);
      } else {
        await api.createProvider({ ...body, isActive: true });
      }
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast.success(provider ? "Provider updated" : "Provider created", { description: `${body.name} • ${body.model}` });
      onClose();
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function handleTest() {
    if (!baseURL.trim()) {
      toast.error("Enter a base URL first");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      let result;
      if (provider) {
        if (apiKey.trim()) {
          await api.patchProvider(provider.id, { apiKey: apiKey.trim() });
        }
        result = await api.testProvider(provider.id, apiKey.trim() ? { apiKey: apiKey.trim() } : undefined);
      } else {
        result = await api.testCustomConnection({ baseURL: baseURL.trim(), apiKey: apiKey.trim() || undefined, model: model.trim() || undefined });
      }

      if (result.ok) {
        setTestResult({ ok: true, msg: result.model ? `Connected • model: ${result.model}` : "Connected successfully" });
        toast.success("Connection successful");
      } else {
        setTestResult({ ok: false, msg: result.error ?? `HTTP ${result.status}` });
        toast.error("Connection failed", { description: result.error ?? undefined });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setTestResult({ ok: false, msg });
      toast.error("Connection failed", { description: msg });
    } finally {
      setTesting(false);
    }
  }

  async function fetchModels() {
    if (!baseURL.trim()) {
      toast.error("Enter a base URL first");
      return;
    }

    setFetchingModels(true);
    try {
      let result;
      if (provider) {
        result = await api.listProviderModels(provider.id);
      } else {
        result = await api.fetchModelsForCustom({ baseURL: baseURL.trim(), apiKey: apiKey.trim() || undefined });
      }

      const fetched = result.models ?? [];
      setModels(fetched);
      if (fetched.length > 0) {
        toast.success(`Found ${fetched.length} models`, { description: fetched.slice(0, 3).join(", ") + (fetched.length > 3 ? "…" : "") });
        if (!model && fetched.length > 0) {
          setModel(fetched[0]);
        }
      } else {
        toast.info("No models returned", { description: "You can still enter a model ID manually" });
      }
    } catch (e) {
      toast.error("Could not fetch models", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setFetchingModels(false);
    }
  }

  const filteredModels = models.filter((m) => !modelSearch || m.toLowerCase().includes(modelSearch.toLowerCase()));

  return (
    <div className="animate-scale-in mt-6 overflow-hidden rounded-2xl border bg-card shadow-lg">
      {/* Header */}
      <div className="border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow">
              <Bot className="size-5" />
            </div>
            <div>
              <div className="text-[15px] font-semibold">{provider ? `Edit ${provider.name}` : "Add OpenAI-compatible provider"}</div>
              <div className="text-xs text-muted-foreground">Configure base URL, API key, and model</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-6 p-5">
        {/* Presets */}
        {!provider && (
          <div className="space-y-3">
            <Label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
              <Wand2 className="size-3" /> Quick presets
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROVIDER_PRESETS.map((preset) => {
                const Icon = preset.icon;
                const active = selectedPreset === preset.name;
                return (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all hover:shadow-sm",
                      active ? "border-violet-500/50 bg-violet-500/5 ring-1 ring-violet-500/20" : "bg-card hover:bg-accent/50"
                    )}
                  >
                    <div className={cn("flex size-7 items-center justify-center rounded-lg border", active ? "bg-violet-500 text-white border-violet-500" : "bg-muted")}>
                      <Icon className={cn("size-4", !active && preset.color)} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{preset.name}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">{preset.baseURL || "Custom URL"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-name" className="flex items-center gap-1.5">
                <Layers className="size-3.5" /> Provider Name
              </Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI / Groq / Local" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-base" className="flex items-center gap-1.5">
                <Globe className="size-3.5" /> Base URL <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input id="p-base" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" className="h-10 rounded-xl pr-10 font-mono text-[13px]" />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex size-6 items-center justify-center rounded-full bg-muted">
                          <Info className="size-3 text-muted-foreground" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px]">
                        <p className="text-xs">OpenAI-compatible endpoint. Must support /chat/completions and optionally /models. Example: https://api.openai.com/v1</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-key" className="flex items-center gap-1.5">
              <Key className="size-3.5" /> API Key <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              {provider?.hasApiKey && <Badge variant="secondary" className="ml-1 h-4 rounded-full text-[10px]">Stored</Badge>}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input id="p-key" type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider?.hasApiKey ? "•••••••••••• (enter new to replace)" : "sk-... (leave empty for local models)"} className="h-10 rounded-xl pr-10 font-mono text-[13px]" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-8 -translate-y-1/2 rounded-full" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Hide" : "Show"}>
                  {showKey ? <EyeOff className="size-4" /> : <EyeIcon className="size-4" />}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">For local models (Ollama, LM Studio) you can leave this empty. Key is stored securely and never exposed to the client after saving.</p>
          </div>

          {/* Model section */}
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Cpu className="size-3.5" /> Model <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={fetchModels} disabled={fetchingModels} className="h-7 gap-1.5 rounded-full text-xs">
                  {fetchingModels ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  Fetch models
                </Button>
              </div>
            </div>

            {models.length > 0 && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Search models..." className="h-8 rounded-full pl-8 text-xs" />
                </div>
                <div className="max-h-[160px] overflow-y-auto rounded-xl border bg-card p-1 scrollbar-thin">
                  {filteredModels.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">No models match &quot;{modelSearch}&quot;</div>
                  ) : (
                    <div className="grid gap-1">
                      {filteredModels.slice(0, 50).map((m) => (
                        <button
                          key={m}
                          onClick={() => setModel(m)}
                          className={cn("flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent", model === m && "bg-primary text-primary-foreground")}
                        >
                          <span className="truncate font-mono">{m}</span>
                          {model === m && <Check className="size-3.5" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">{filteredModels.length} models • showing {Math.min(50, filteredModels.length)}</div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or enter manually</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o, claude-3-5-sonnet, llama-3.3-70b, etc." className="h-10 rounded-xl font-mono text-[13px]" />
              <p className="text-[11px] text-muted-foreground">Model ID as expected by your provider&apos;s API. For OpenAI use like gpt-4o, for Ollama use like llama3.2</p>
            </div>
          </div>

          {testResult && (
            <div className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-xs", testResult.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" : "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300")}>
              {testResult.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
              <span className="break-words font-medium">{testResult.msg}</span>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing} className="gap-1.5 rounded-full">
                {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
                Test connection
              </Button>
              {provider && (
                <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                  ID: {provider.id.slice(0, 8)}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} className="rounded-full bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow hover:from-violet-700 hover:to-blue-700">
                <Check className="mr-1 size-4" /> {provider ? "Save changes" : "Create provider"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Appearance ----------------------------- */

function AppearancePanel() {
  const { settings, patch } = useSettings();
  const { setTheme, theme } = useTheme();

  function setMode(mode: "light" | "dark" | "system") {
    setTheme(mode);
    void patch({ theme: mode });
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Palette className="size-4" /> Theme
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">Choose how Onyx looks. System follows your OS preference.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-[420px]">
          {[
            { id: "light", label: "Light", icon: Sun, desc: "Bright" },
            { id: "dark", label: "Dark", icon: Moon, desc: "Dark" },
            { id: "system", label: "System", icon: Laptop, desc: "Auto" },
          ].map((m) => {
            const Icon = m.icon;
            const active = settings.theme === m.id || (!settings.theme && m.id === "system");
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id as any)}
                className={cn(
                  "group relative flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all hover:shadow-md",
                  active ? "border-violet-500/50 bg-violet-500/5 ring-1 ring-violet-500/20" : "bg-card hover:bg-accent/50"
                )}
              >
                <div className={cn("flex size-10 items-center justify-center rounded-xl border shadow-sm transition-colors", active ? "bg-violet-600 text-white border-violet-600" : "bg-muted")}>
                  <Icon className="size-5" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground">{m.desc}</div>
                </div>
                {active && <div className="absolute right-2 top-2 size-2 rounded-full bg-violet-600" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-violet-500/[0.03] to-blue-500/[0.03] p-4">
        <div className="flex gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
            <Sparkles className="size-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Beautiful by default</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">Onyx uses a modern design system with OKLCH colors, smooth animations, and thoughtful details. Dark mode is carefully tuned for long coding sessions.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Editor -------------------------------- */

function EditorPanel() {
  const { settings, patch } = useSettings();
  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <FileCode className="size-3.5" /> Font size
            </Label>
            <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
              {settings.fontSize}px
            </Badge>
          </div>
          <Slider value={[Number(settings.fontSize) || 14]} min={10} max={24} step={1} onValueChange={([v]) => void patch({ fontSize: v })} />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>Small</span>
            <span>Large</span>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <Label className="mb-3 block flex items-center gap-1.5">
            <Braces className="size-3.5" /> Tab size
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {([2, 4, 8] as const).map((n) => (
              <button
                key={n}
                onClick={() => void patch({ tabSize: n })}
                className={cn("rounded-xl border px-3 py-2.5 text-sm font-medium transition-all", settings.tabSize === n ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300 shadow-sm" : "bg-card hover:bg-accent")}
              >
                {n} spaces
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1 rounded-2xl border bg-card p-2">
        <SettingRow label="Word wrap" desc="Wrap long lines instead of horizontal scrolling" checked={settings.wordWrap} onChange={(v) => void patch({ wordWrap: v })} icon={FileCode} />
        <SettingRow label="Line numbers" desc="Show line numbers in the gutter" checked={settings.lineNumbers} onChange={(v) => void patch({ lineNumbers: v })} icon={Layers} />
        <SettingRow label="Minimap" desc="Show a code minimap in the editor gutter" checked={settings.minimap} onChange={(v) => void patch({ minimap: v })} icon={Monitor} />
        <SettingRow label="Instant sync" desc="Every edit is written to localStorage immediately. Manual save is not needed." checked={true} onChange={() => {}} icon={CheckCircle2} />
        <SettingRow label="Format on save" desc="Format the file when saving" checked={settings.formatOnSave} onChange={(v) => void patch({ formatOnSave: v })} icon={Wand2} />
      </div>
    </div>
  );
}

/* ------------------------------- Preview ------------------------------- */

function PreviewPanel() {
  const { settings, patch } = useSettings();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Monitor className="size-3.5" /> Default viewport
          </Label>
          <Select value={settings.defaultViewport === "tablet" || settings.defaultViewport === "mobile" ? settings.defaultViewport : "desktop"} onValueChange={(v) => void patch({ defaultViewport: v as any })}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desktop">Desktop (1280×800)</SelectItem>
              <SelectItem value="tablet">Tablet (768×1024)</SelectItem>
              <SelectItem value="mobile">Mobile (390×844)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <RefreshCw className="size-3.5" /> Refresh behavior
          </Label>
          <Select value={settings.previewRefreshBehavior === "onsave" || settings.previewRefreshBehavior === "manual" ? settings.previewRefreshBehavior : "auto"} onValueChange={(v) => void patch({ previewRefreshBehavior: v as any })}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto — on file change</SelectItem>
              <SelectItem value="onsave">On save — when file is saved</SelectItem>
              <SelectItem value="manual">Manual — reload button only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1 rounded-2xl border bg-card p-2">
        <SettingRow label="Auto reload" desc="Reload the preview automatically when files change" checked={settings.autoReload} onChange={(v) => void patch({ autoReload: v })} icon={RefreshCw} />
        <SettingRow label="Console visible" desc="Show the console drawer by default" checked={settings.consoleVisible} onChange={(v) => void patch({ consoleVisible: v })} icon={Terminal} />
        <SettingRow label="Error overlay" desc="Show an inline overlay for runtime errors" checked={settings.errorOverlay} onChange={(v) => void patch({ errorOverlay: v })} icon={AlertTriangle} />
        <SettingRow label="Open links externally" desc="Open links clicked in the preview in a new browser tab" checked={settings.openLinksExternally} onChange={(v) => void patch({ openLinksExternally: v })} icon={ExternalLink} />
      </div>
    </div>
  );
}

/* ------------------------------- General ------------------------------- */

function GeneralPanel() {
  const queryClient = useQueryClient();
  const { patch } = useSettings();
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <RefreshCw className="size-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Reset settings</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Restore all editor, preview and appearance settings to their defaults. This does not affect your workspaces or AI providers.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 rounded-full"
              onClick={async () => {
                try {
                  const { DEFAULT_SETTINGS } = await import("@/lib/types");
                  await patch(DEFAULT_SETTINGS);
                  await queryClient.invalidateQueries({ queryKey: ["settings"] });
                  toast.success("Settings reset");
                } catch (e) {
                  toast.error("Reset failed", { description: e instanceof Error ? e.message : undefined });
                }
              }}
            >
              Reset to defaults
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
            <Database className="size-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Storage</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Workspaces, files, chats, and provider settings sync instantly to this browser&apos;s localStorage. Clearing site data will remove them. Export workspaces as ZIP for backup.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-violet-500/5 via-blue-500/5 to-cyan-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">About Onyx HTML</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">An AI-native HTML workspace editor. Build beautiful websites with an AI pair programmer that edits files, runs browser tests, and iterates with you.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="rounded-full text-[10px]">
                Next.js 16
              </Badge>
              <Badge variant="outline" className="rounded-full text-[10px]">
                Tailwind v4
              </Badge>
              <Badge variant="outline" className="rounded-full text-[10px]">
                Prisma
              </Badge>
              <Badge variant="outline" className="rounded-full text-[10px]">
                shadcn/ui
              </Badge>
              <Badge variant="outline" className="rounded-full text-[10px]">
                CodeMirror 6
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Shortcuts ------------------------------- */

function ShortcutsPanel() {
  const items: [string, string, string][] = [
    ["Files sync instantly", "auto", "Edits write to localStorage as you type"],
    ["Quick file search", "⌘/Ctrl + P", "Open file quickly"],
    ["Focus AI prompt", "⌘/Ctrl + K", "Jump to AI input"],
    ["Command palette", "⌘/Ctrl + Shift + P", "All commands"],
    ["Toggle sidebar", "⌘/Ctrl + B", "Collapse/expand sidebar"],
    ["Send message", "⌘/Ctrl + Enter", "Send AI message"],
    ["Close dialog", "Esc", "Close any dialog"],
  ];
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="divide-y">
          {items.map(([k, v, desc]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-sm font-medium">{k}</div>
                <div className="text-[11px] text-muted-foreground">{desc}</div>
              </div>
              <kbd className="shrink-0 rounded-full border bg-muted px-2.5 py-1 font-mono text-[11px] font-medium text-muted-foreground shadow-sm">{v}</kbd>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        <div className="flex gap-2">
          <Keyboard className="size-4 shrink-0" />
          <span>Most shortcuts work globally. Files sync to localStorage as you type. In chat, ⌘/Ctrl+Enter sends the message.</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- shared -------------------------------- */

function SettingRow({ label, desc, checked, onChange, icon: Icon }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-muted/40">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          {desc && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}
