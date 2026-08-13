"use client";

import * as React from "react";
import { Code2, Eye, Sparkles, FolderClosed } from "lucide-react";
import { useUIStore, type MobileView } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const VIEWS: { id: MobileView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "code", label: "Code", icon: Code2 },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "files", label: "Files", icon: FolderClosed },
];

export function MobileNav() {
  const mobileView = useUIStore((s) => s.mobileView);
  const setMobileView = useUIStore((s) => s.setMobileView);

  return (
    <nav className="flex h-14 shrink-0 items-stretch border-t bg-background lg:hidden">
      {VIEWS.map((v) => {
        const Icon = v.icon;
        const active = mobileView === v.id;
        return (
          <button
            key={v.id}
            onClick={() => setMobileView(v.id)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              active ? "text-accent-strong" : "text-muted-foreground"
            )}
            aria-label={v.label}
          >
            <Icon className={cn("size-5", active && "scale-105")} />
            {v.label}
          </button>
        );
      })}
    </nav>
  );
}
