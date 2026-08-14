"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProviderStore } from "@/stores/provider-store";

export function useProviders() {
  const setProviders = useProviderStore((s) => s.setProviders);
  const query = useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const r = await api.listProviders();
      return r.providers;
    },
  });
  React.useEffect(() => {
    if (query.data) setProviders(query.data);
  }, [query.data, setProviders]);
  return query;
}
