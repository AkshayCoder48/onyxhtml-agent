import { AppSettings, DEFAULT_SETTINGS } from "./types";

// ============================================================================
// Settings persistence — browser localStorage only (no database).
// ============================================================================

const SETTINGS_KEY = "onyxhtml:settings:v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getSettingsSync(): AppSettings {
  if (!isBrowser()) return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged: AppSettings = { ...DEFAULT_SETTINGS, ...parsed };
    if (typeof merged.fontSize !== "number" || !Number.isFinite(merged.fontSize)) {
      merged.fontSize = DEFAULT_SETTINGS.fontSize;
    }
    if (typeof merged.tabSize !== "number" || !Number.isFinite(merged.tabSize)) {
      merged.tabSize = DEFAULT_SETTINGS.tabSize;
    }
    if (merged.theme !== "light" && merged.theme !== "dark" && merged.theme !== "system") {
      merged.theme = DEFAULT_SETTINGS.theme;
    }
    if (
      merged.defaultViewport !== "desktop" &&
      merged.defaultViewport !== "tablet" &&
      merged.defaultViewport !== "mobile"
    ) {
      merged.defaultViewport = DEFAULT_SETTINGS.defaultViewport;
    }
    if (
      merged.previewRefreshBehavior !== "auto" &&
      merged.previewRefreshBehavior !== "onsave" &&
      merged.previewRefreshBehavior !== "manual"
    ) {
      merged.previewRefreshBehavior = DEFAULT_SETTINGS.previewRefreshBehavior;
    }
    merged.wordWrap = Boolean(merged.wordWrap);
    merged.minimap = Boolean(merged.minimap);
    merged.lineNumbers = Boolean(merged.lineNumbers);
    merged.autoSave = true;
    merged.formatOnSave = Boolean(merged.formatOnSave);
    merged.autoReload = Boolean(merged.autoReload);
    merged.consoleVisible = Boolean(merged.consoleVisible);
    merged.errorOverlay = Boolean(merged.errorOverlay);
    merged.openLinksExternally = Boolean(merged.openLinksExternally);
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettingsSync(patch: Partial<AppSettings>): AppSettings {
  const current = getSettingsSync();
  const next = { ...current, ...patch, autoSave: true };
  if (isBrowser()) {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("[settings] Failed to save:", e);
    }
  }
  return next;
}

export async function getSettings(): Promise<AppSettings> {
  return getSettingsSync();
}

export async function saveSettings(
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  return saveSettingsSync(patch);
}

// JSON helpers (kept for backwards compatibility with existing imports)
export function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJSON(value: unknown): string {
  return JSON.stringify(value);
}
