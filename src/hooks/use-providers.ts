"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useProviderStore } from "@/stores/provider-store";
import type { Provider } from "@/lib/types";

// Providers live in localStorage. We expose them through react-query so the
// existing invalidateQueries({ queryKey: ["providers"] }) calls throughout
// the Settings dialog keep working, AND via a cross-tab storage listener so
// changes in another tab are reflected immediately.

async function loadProviders(): Promise<Provider[]> {
  const rows = await db.provider.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseURL: r.baseURL,
    hasApiKey: Boolean(r.apiKey && String(r.apiKey).length > 0),
    model: r.model,
    isActive: Boolean(r.isActive),
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt ?? new Date().toISOString()),
    updatedAt:
      r.updatedAt instanceof Date
        ? r.updatedAt.toISOString()
        : String(r.updatedAt ?? new Date().toISOString()),
  }));
}

export function useProviders() {
  const setProviders = useProviderStore((s) => s.setProviders);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["providers"],
    queryFn: loadProviders,
    staleTime: 0,
  });

  React.useEffect(() => {
    if (query.data) setProviders(query.data);
  }, [query.data, setProviders]);

  // Cross-tab sync.
  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key && e.key.startsWith("onyxhtml:")) {
        queryClient.invalidateQueries({ queryKey: ["providers"] });
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);

  return query;
}

export const providerMutations = {
  async create(input: {
    name: string;
    baseURL: string;
    model: string;
    apiKey?: string | null;
    isActive?: boolean;
  }): Promise<Provider> {
    const isActive = input.isActive !== false;
    if (isActive) {
      await db.provider.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }
    const created = await db.provider.create({
      data: {
        name: input.name,
        baseURL: input.baseURL.replace(/\/+$/, ""),
        apiKey: input.apiKey?.trim() || null,
        model: input.model,
        isActive,
      },
    });
    return rowToProvider(created);
  },

  async update(
    id: string,
    patch: Partial<{
      name: string;
      baseURL: string;
      model: string;
      apiKey: string | null;
      clearApiKey: boolean;
      isActive: boolean;
    }>
  ): Promise<Provider> {
    const data: Record<string, unknown> = {};
    if (typeof patch.name === "string" && patch.name.trim())
      data.name = patch.name.trim();
    if (typeof patch.baseURL === "string" && patch.baseURL.trim())
      data.baseURL = patch.baseURL.trim().replace(/\/+$/, "");
    if (typeof patch.model === "string" && patch.model.trim())
      data.model = patch.model.trim();
    if (typeof patch.apiKey === "string") {
      if (patch.apiKey.trim().length > 0) data.apiKey = patch.apiKey.trim();
      else if (patch.clearApiKey) data.apiKey = null;
    }
    if (patch.isActive === true) {
      await db.provider.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      data.isActive = true;
    } else if (patch.isActive === false) {
      data.isActive = false;
    }
    const updated = await db.provider.update({ where: { id }, data });
    return rowToProvider(updated);
  },

  async remove(id: string): Promise<void> {
    const existing = await db.provider.findUnique({ where: { id } });
    await db.provider.delete({ where: { id } });
    if (existing?.isActive) {
      const first = await db.provider.findFirst({ orderBy: { createdAt: "asc" } });
      if (first)
        await db.provider.update({
          where: { id: first.id },
          data: { isActive: true },
        });
    }
  },
};

function rowToProvider(r: {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string | null;
  model: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Provider {
  return {
    id: r.id,
    name: r.name,
    baseURL: r.baseURL,
    hasApiKey: Boolean(r.apiKey && r.apiKey.length > 0),
    model: r.model,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
