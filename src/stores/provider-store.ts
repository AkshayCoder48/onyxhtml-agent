"use client";

import { create } from "zustand";
import type { Provider } from "@/lib/types";

type ProviderState = {
  providers: Provider[];
  activeProvider: Provider | null;
  setProviders: (p: Provider[]) => void;
  setActiveProvider: (p: Provider | null) => void;
};

export const useProviderStore = create<ProviderState>((set) => ({
  providers: [],
  activeProvider: null,
  setProviders: (p) =>
    set({
      providers: p,
      activeProvider: p.find((x) => x.isActive) ?? p[0] ?? null,
    }),
  setActiveProvider: (p) => set({ activeProvider: p }),
}));

// A provider is usable if it has an API key OR is the built-in Z.ai provider.
export function isProviderUsable(p: Provider | null): boolean {
  if (!p) return false;
  if (p.hasApiKey) return true;
  // Built-in Z.ai provider — usable without an explicit API key
  return /z\.ai|zai|builtin|built-in|default/i.test(p.name) || /z\.ai/i.test(p.baseURL);
}

export function activeModelLabel(p: Provider | null): string {
  if (!p) return "Not configured";
  return `${p.name} · ${p.model}`;
}
