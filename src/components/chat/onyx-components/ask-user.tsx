"use client";
import * as React from "react";
import { HelpCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnyxAskUserProps } from "./types";

export function OnyxAskUser({ question, options }: OnyxAskUserProps) {
  return (
    <div className="my-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
      <div className="flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
          <HelpCircle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">{question}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {options.map((opt) => (
              <Button
                key={opt}
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 rounded-full border-amber-500/20 bg-card text-xs hover:bg-amber-500/10 hover:border-amber-500/30"
                onClick={() => window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: opt }))}
              >
                {opt} <ArrowRight className="size-3" />
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
