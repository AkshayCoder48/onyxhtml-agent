"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AppSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { useTheme } from "next-themes";

export function useSettings() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const r = await api.getSettings();
      return r.settings;
    },
    initialData: DEFAULT_SETTINGS,
  });

  React.useEffect(() => {
    if (query.data?.theme) {
      // Apply theme: if system, use next-themes system; otherwise explicit.
      if (query.data.theme === "system") setTheme("system");
      else setTheme(query.data.theme);
    }
  }, [query.data?.theme, setTheme]);

  const patch = useMutation({
    mutationFn: async (p: Partial<AppSettings>) => api.patchSettings(p),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data.settings);
    },
  });

  return { settings: query.data, patch: patch.mutateAsync, isLoading: query.isLoading };
}
