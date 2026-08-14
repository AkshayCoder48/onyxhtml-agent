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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/stores/ui-store";
import { useSettings } from "@/hooks/use-settings";
import { useProviders } from "@/hooks/use-providers";
import { useProviderStore } from "@/stores/provider-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import type { Provider, ProviderInput } from "@/lib/types";

type Category =
  | "providers"
  | "appearance"
  | "editor"
  | "preview"
  | "general"
  | "shortcuts";

const CATEGORIES: { id: Category; label: string; short: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "providers", label: "AI Providers", short: "Providers", icon: Bot },
  { id: "appearance", label: "Appearance", short: "Theme", icon: Palette },
  { id: "editor", label: "Editor", short: "Editor", icon: Code2 },
  { id: "preview", label: "Preview", short: "Preview", icon: Eye },
  { id: "general", label: "General", short: "General", icon: SettingsIcon },
  { id: "shortcuts", label: "Keyboard", short: "Keys", icon: Keyboard },
];

export function SettingsDialog() {
  const open = useUIStore((s) => s.settingsOpen);
  const close = useUIStore((s) => s.closeSettings);
  const category = useUIStore((s) => s.settingsCategory) as Category;
  const openSettings = useUIStore((s) => s.openSettings);

  // On mobile we use a "list → detail" pattern. When a category is selected
  // we show its panel; a back button returns to the category list.
  // Only reset to "list" when the dialog OPENS (not on every category change,
  // which would defeat the panel switch).
  const [mobileView, setMobileView] = React.useState<"list" | "panel">("list");
  const prevOpenRef = React.useRef(open);
  React.useEffect(() => {
    // When the dialog transitions from closed → open, start at the list view.
    if (open && !prevOpenRef.current) {
      setMobileView("list");
    }
    prevOpenRef.current = open;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure the AI HTML Workspace Editor.</DialogDescription>
        </DialogHeader>
        {/* Mobile header (visible < sm) */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-3 sm:hidden">
          {mobileView === "panel" ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 px-2"
              onClick={() => setMobileView("list")}
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
          ) : (
            <span className="text-sm font-semibold">Settings</span>
          )}
          <span className="text-sm font-medium">
            {mobileView === "panel"
              ? CATEGORIES.find((c) => c.id === category)?.label
              : ""}
          </span>
          <Button variant="ghost" size="icon" className="size-8" onClick={close} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex h-[80vh] flex-col sm:h-[78vh] sm:flex-row">
          {/* Left nav — horizontal scrollable tabs on mobile, vertical list on desktop */}
          <nav
            className={cn(
              "flex shrink-0 gap-0.5 border-b bg-muted/30 p-1.5 sm:w-52 sm:flex-col sm:gap-0.5 sm:border-b-0 sm:border-r sm:p-2",
              mobileView === "panel" && "hidden sm:flex"
            )}
            aria-label="Settings categories"
          >
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
                    "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                    "sm:w-full sm:shrink",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="hidden sm:inline">{c.label}</span>
                  <span className="sm:hidden">{c.short}</span>
                </button>
              );
            })}
          </nav>

          {/* Right content */}
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col",
              mobileView === "list" && "hidden sm:flex"
            )}
          >
            {/* Desktop header with close button */}
            <div className="hidden h-12 shrink-0 items-center justify-between border-b px-4 sm:flex">
              <span className="text-sm font-medium">
                {CATEGORIES.find((c) => c.id === category)?.label}
              </span>
              <Button variant="ghost" size="icon" onClick={close} aria-label="Close">
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-5">
              {category === "providers" && <ProvidersPanel />}
              {category === "appearance" && <AppearancePanel />}
              {category === "editor" && <EditorPanel />}
              {category === "preview" && <PreviewPanel />}
              {category === "general" && <GeneralPanel />}
              {category === "shortcuts" && <ShortcutsPanel />}
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
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Provider | "new" | null>(null);

  async function handleSetActive(p: Provider) {
    try {
      await api.patchProvider(p.id, { isActive: true });
      setActiveProvider(p);
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast.success("Active provider set");
    } catch (e) {
      toast.error("Failed to set active provider", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleDelete(p: Provider) {
    if (!confirm(`Delete provider ${p.name}?`)) return;
    try {
      await api.deleteProvider(p.id);
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast.success("Provider deleted");
    } catch (e) {
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Configure AI providers. The active provider is used for all chats.
        </p>
        <Button size="sm" onClick={() => setEditing("new")} className="gap-1.5 self-start sm:self-auto">
          <Plus className="size-4" /> Add Provider
        </Button>
      </div>

      <div className="space-y-2">
        {providers.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No providers configured. Add one to enable AI chat.
          </div>
        )}
        {providers.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
              p.isActive && "border-accent-strong/40 bg-accent-strong/5"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                {p.isActive && (
                  <Badge variant="secondary" className="bg-accent-strong/10 text-accent-strong">
                    Active
                  </Badge>
                )}
                <Badge variant="outline" className="font-mono text-[10px]">
                  {p.model}
                </Badge>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {p.baseURL} · {p.hasApiKey ? "API key set" : "no API key"}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {!p.isActive && (
                <Button size="sm" variant="outline" onClick={() => handleSetActive(p)}>
                  Set active
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                Edit
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(p)}
                aria-label="Delete"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ProviderEditor
          provider={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProviderEditor({
  provider,
  onClose,
}: {
  provider: Provider | null;
  onClose: () => void;
}) {
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

  // Load models on demand (only for existing providers)
  const modelsQuery = useQuery({
    queryKey: ["provider-models", provider?.id],
    queryFn: async () => (provider ? (await api.listProviderModels(provider.id)).models : []),
    enabled: !!provider && models.length === 0,
  });

  React.useEffect(() => {
    if (modelsQuery.data) setModels(modelsQuery.data);
  }, [modelsQuery.data]);

  async function handleSave() {
    if (!name.trim() || !baseURL.trim() || !model.trim()) {
      toast.error("Please fill in name, base URL and model");
      return;
    }
    const body: ProviderInput = {
      name: name.trim(),
      baseURL: baseURL.trim(),
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
      toast.success("Provider saved");
      onClose();
    } catch (e) {
      toast.error("Save failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleTest() {
    if (!provider) {
      toast.error("Save the provider first, then test the connection.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // If API key changed, save first
      if (apiKey.trim()) {
        await api.patchProvider(provider.id, { apiKey: apiKey.trim() });
      }
      const r = await api.testProvider(provider.id);
      if (r.ok) {
        setTestResult({ ok: true, msg: r.model ? `Connected · model: ${r.model}` : "Connected" });
        toast.success("Connection successful");
      } else {
        setTestResult({ ok: false, msg: r.error ?? `HTTP ${r.status}` });
        toast.error("Connection failed", { description: r.error ?? undefined });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Failed" });
      toast.error("Connection failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setTesting(false);
    }
  }

  async function fetchModels() {
    if (!provider) return;
    setFetchingModels(true);
    try {
      const r = await api.listProviderModels(provider.id);
      setModels(r.models);
      toast.success(`Loaded ${r.models.length} models`);
    } catch (e) {
      toast.error("Could not load models", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setFetchingModels(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border bg-card p-4">
      <div className="mb-3 text-sm font-medium">
        {provider ? `Edit ${provider.name}` : "Add provider"}
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Provider Name</Label>
          <Input
            id="p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="OpenAI / Together / etc."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-base">Base URL</Label>
          <Input
            id="p-base"
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-key">API Key {provider && provider.hasApiKey && "(stored)"}</Label>
          <div className="flex gap-2">
            <Input
              id="p-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider?.hasApiKey ? "•••••••• (enter new to replace)" : "sk-…"}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide" : "Show"}
            >
              {showKey ? <EyeOff className="size-4" /> : <EyeIcon className="size-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Model</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full sm:flex-1">
                <SelectValue placeholder="Pick a model or type below" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchModels}
                disabled={fetchingModels}
                className="shrink-0"
              >
                {fetchingModels ? <Loader2 className="size-3.5 animate-spin" /> : "Fetch models"}
              </Button>
            )}
          </div>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="…or type a model name"
            className="font-mono text-xs"
          />
        </div>

        {testResult && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border p-2 text-xs",
              testResult.ok
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/5 text-destructive"
            )}
          >
            {testResult.ok ? (
              <Check className="size-3.5 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            )}
            <span className="break-words">{testResult.msg}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !provider}
            className="gap-1.5"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Test connection
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Appearance ----------------------------- */

function AppearancePanel() {
  const { settings, patch } = useSettings();
  const { setTheme } = useTheme();

  function setMode(mode: "light" | "dark" | "system") {
    setTheme(mode);
    void patch({ theme: mode });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-2 block">Theme</Label>
        {/* Use a grid of buttons instead of Tabs so they fit on any width */}
        <div className="grid grid-cols-3 gap-2 sm:max-w-xs">
          {(["light", "dark", "system"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm capitalize transition-colors",
                settings.theme === m
                  ? "border-accent-strong bg-accent-strong/10 text-accent-strong"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The theme applies immediately across the app.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- Editor -------------------------------- */

function EditorPanel() {
  const { settings, patch } = useSettings();
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Font size</Label>
          <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
        </div>
        <Slider
          value={[settings.fontSize]}
          min={10}
          max={24}
          step={1}
          onValueChange={([v]) => void patch({ fontSize: v })}
        />
      </div>
      <div>
        <Label className="mb-1.5 block">Tab size</Label>
        {/* Use a grid of buttons so they always fit on mobile */}
        <div className="grid grid-cols-3 gap-2 sm:max-w-xs">
          {([2, 4, 8] as const).map((n) => (
            <button
              key={n}
              onClick={() => void patch({ tabSize: n })}
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors",
                settings.tabSize === n
                  ? "border-accent-strong bg-accent-strong/10 text-accent-strong"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {n} spaces
            </button>
          ))}
        </div>
      </div>
      <SettingRow
        label="Word wrap"
        desc="Wrap long lines instead of horizontal scrolling."
        checked={settings.wordWrap}
        onChange={(v) => void patch({ wordWrap: v })}
      />
      <SettingRow
        label="Line numbers"
        desc="Show line numbers in the gutter."
        checked={settings.lineNumbers}
        onChange={(v) => void patch({ lineNumbers: v })}
      />
      <SettingRow
        label="Minimap"
        desc="Show a code minimap in the editor gutter."
        checked={settings.minimap}
        onChange={(v) => void patch({ minimap: v })}
      />
      <SettingRow
        label="Auto-save"
        desc="Save files automatically while editing (debounced)."
        checked={settings.autoSave}
        onChange={(v) => void patch({ autoSave: v })}
      />
      <SettingRow
        label="Format on save"
        desc="Format the file when saving."
        checked={settings.formatOnSave}
        onChange={(v) => void patch({ formatOnSave: v })}
      />
    </div>
  );
}

/* ------------------------------- Preview ------------------------------- */

function PreviewPanel() {
  const { settings, patch } = useSettings();
  return (
    <div className="space-y-5">
      <div>
        <Label className="mb-1.5 block">Default viewport</Label>
        <Select
          value={settings.defaultViewport}
          onValueChange={(v) => void patch({ defaultViewport: v as "desktop" | "tablet" | "mobile" })}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desktop">Desktop (1280×800)</SelectItem>
            <SelectItem value="tablet">Tablet (768×1024)</SelectItem>
            <SelectItem value="mobile">Mobile (390×844)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 block">Refresh behavior</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:max-w-lg">
          {([
            { v: "auto", label: "Auto", desc: "On file change" },
            { v: "onsave", label: "On save", desc: "When file is saved" },
            { v: "manual", label: "Manual", desc: "Reload button only" },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              onClick={() => void patch({ previewRefreshBehavior: opt.v })}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                (settings as { previewRefreshBehavior?: string }).previewRefreshBehavior === opt.v ||
                (!(settings as { previewRefreshBehavior?: string }).previewRefreshBehavior && opt.v === "auto")
                  ? "border-accent-strong bg-accent-strong/10 text-accent-strong"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-[11px] opacity-80">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
      <SettingRow
        label="Auto reload"
        desc="Reload the preview automatically when files change."
        checked={settings.autoReload}
        onChange={(v) => void patch({ autoReload: v })}
      />
      <SettingRow
        label="Console visible"
        desc="Show the console drawer by default."
        checked={settings.consoleVisible}
        onChange={(v) => void patch({ consoleVisible: v })}
      />
      <SettingRow
        label="Error overlay"
        desc="Show an inline overlay for runtime errors."
        checked={settings.errorOverlay}
        onChange={(v) => void patch({ errorOverlay: v })}
      />
      <SettingRow
        label="Open links externally"
        desc="Open links clicked in the preview in a new browser tab."
        checked={settings.openLinksExternally}
        onChange={(v) => void patch({ openLinksExternally: v })}
      />
    </div>
  );
}

/* ------------------------------- General ------------------------------- */

function GeneralPanel() {
  const queryClient = useQueryClient();
  const { patch } = useSettings();
  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3">
        <div className="text-sm font-medium">Reset settings</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Restore all editor, preview and appearance settings to their defaults.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={async () => {
            try {
              const { DEFAULT_SETTINGS } = await import("@/lib/types");
              await patch(DEFAULT_SETTINGS);
              await queryClient.invalidateQueries({ queryKey: ["settings"] });
              toast.success("Settings reset");
            } catch (e) {
              toast.error("Reset failed", {
                description: e instanceof Error ? e.message : undefined,
              });
            }
          }}
        >
          Reset to defaults
        </Button>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-sm font-medium">Storage</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Workspaces, files, chats, and provider settings are stored locally in the
          app database. Clearing your browser data will remove them.
        </p>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-sm font-medium">About</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Onyx HTML — an AI HTML workspace editor. Built with Next.js, TypeScript,
          Tailwind CSS and shadcn/ui.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">Next.js 16</Badge>
          <Badge variant="outline" className="text-[10px]">Turbopack</Badge>
          <Badge variant="outline" className="text-[10px]">Prisma</Badge>
          <Badge variant="outline" className="text-[10px]">shadcn/ui</Badge>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Shortcuts ------------------------------- */

function ShortcutsPanel() {
  const items: [string, string][] = [
    ["Save file", "⌘/Ctrl + S"],
    ["Quick file search", "⌘/Ctrl + P"],
    ["Focus AI prompt", "⌘/Ctrl + K"],
    ["Command palette", "⌘/Ctrl + Shift + P"],
    ["Toggle sidebar", "⌘/Ctrl + B"],
    ["Send message", "⌘/Ctrl + Enter"],
    ["Close dialog / panel", "Esc"],
  ];
  return (
    <div className="divide-y rounded-lg border">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span>{k}</span>
          <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {v}
          </kbd>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- shared -------------------------------- */

function SettingRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

// Settings dialog end
