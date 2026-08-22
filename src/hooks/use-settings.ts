"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import type { AppSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { getSettingsSync, saveSettingsSync } from "@/lib/settings";

// Settings are stored in localStorage and exposed via a simple subscription
// so all components see updates instantly (no React Query / API round-trip).

const listeners = new Set<() => void>();
let cache: AppSettings = DEFAULT_SETTINGS;
let initialized = false;

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  cache = getSettingsSync();
  // Keep multiple tabs in sync.
  window.addEventListener("storage", (e) => {
    if (e.key === "onyxhtml:settings:v1") {
      cache = getSettingsSync();
      listeners.forEach((l) => l());
    }
  });
}

function subscribe(listener: () => void) {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AppSettings {
  init();
  return cache;
}

export function useSettings() {
  const { theme, setTheme } = useTheme();
  const settings = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    if (settings?.theme) {
      if (settings.theme === "system") setTheme("system");
      else setTheme(settings.theme);
    }
  }, [settings?.theme, setTheme]);

  const patch = React.useCallback(
    async (p: Partial<AppSettings>): Promise<AppSettings> => {
      cache = saveSettingsSync(p);
      listeners.forEach((l) => l());
      return cache;
    },
    []
  );

  const update = React.useCallback(
    (p: Partial<AppSettings>) => {
      cache = saveSettingsSync(p);
      listeners.forEach((l) => l());
    },
    []
  );

  return { settings, patch, update, isLoading: false };
}
