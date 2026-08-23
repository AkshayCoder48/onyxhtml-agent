"use client";

import * as React from "react";
import { Layers, Sparkles } from "lucide-react";
import { useUIStore, type MobileView } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const VIEWS: { id: MobileView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "workspace", label: "Workspace", icon: Layers },
  { id: "ai", label: "AI", icon: Sparkles },
];

export function MobileNav() {
  const mobileView = useUIStore((s) => s.mobileView);
  const setMobileView = useUIStore((s) => s.setMobileView);
  const active = mobileView === "ai" ? "ai" : "workspace";

  return (
    <nav className="flex h-14 shrink-0 items-stretch border-t bg-background lg:hidden">
      {VIEWS.map((v) => {
        const Icon = v.icon;
        const isActive = active === v.id;
        return (
          <button
            key={v.id}
            onClick={() => setMobileView(v.id)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              isActive ? "text-accent-strong" : "text-muted-foreground"
            )}
            aria-label={v.label}
          >
            <Icon className={cn("size-5", isActive && "scale-105")} />
            {v.label}
          </button>
        );
      })}
    </nav>
  );
}
