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
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettingsSync(patch: Partial<AppSettings>): AppSettings {
  const current = getSettingsSync();
  const next = { ...current, ...patch };
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
