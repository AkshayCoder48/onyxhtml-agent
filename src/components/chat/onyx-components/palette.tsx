"use client";
import * as React from "react";
import { Palette, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { OnyxPaletteProps } from "./types";

export function OnyxPalette({ name, colors, palette, mood }: OnyxPaletteProps) {
  const cols = colors ?? palette ?? [];
  const title = name ?? mood ?? "Palette";

  const applyToCssVars = () => {
    const cssVars = cols.map((c, i) => `  --color-${i + 1}: ${c};`).join("\n");
    const css = `:root {\n${cssVars}\n}`;
    window.dispatchEvent(new CustomEvent("onyx:apply-palette", { detail: { css, colors: cols } }));
    toast.success("Palette CSS copied — applying to style.css");
    navigator.clipboard.writeText(css);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10">
          <Palette className="size-4 text-violet-600" />
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[11px] text-muted-foreground">{cols.length} colors • Free</div>
        </div>
      </div>
      <div className="p-4">
        <div className="flex gap-2">
          {cols.map((c) => (
            <div key={c} className="group flex-1">
              <div className="h-16 w-full rounded-lg border shadow-sm transition-transform group-hover:scale-105" style={{ background: c }} />
              <div className="mt-1.5 text-center">
                <div className="font-mono text-[10px] font-medium">{c}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-muted p-2.5 font-mono text-[11px]">{cols.map((c, i) => `--color-${i + 1}: ${c};`).join(" ")}</div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-3 py-2">
        <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-full text-xs" onClick={() => { navigator.clipboard.writeText(cols.join(", ")); toast.success("Copied colors"); }}><Copy className="size-3" /> Copy Hex</Button>
        <Button size="sm" className="h-7 gap-1 rounded-full bg-violet-600 text-xs" onClick={applyToCssVars}><Check className="size-3" /> Apply to CSS Vars</Button>
      </div>
    </div>
  );
}

export function OnyxColorContrast({ fg, bg }: { fg: string; bg: string }) {
  // Simple luminance calc
  function luminance(hex: string) {
    const rgb = hex.replace("#", "").match(/.{2}/g)?.map((x) => parseInt(x, 16) / 255) ?? [0, 0, 0];
    const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(c1: string, c2: string) {
    try {
      const l1 = luminance(c1);
      const l2 = luminance(c2);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return ratio.toFixed(2);
    } catch { return "?"; }
  }
  const ratio = contrast(fg, bg);
  const pass = parseFloat(ratio) >= 4.5;
  return (
    <div className="my-3 flex items-center gap-3 rounded-xl border bg-card p-3">
      <div className="flex size-12 items-center justify-center rounded-lg border text-xs font-bold" style={{ background: bg, color: fg }}>Aa</div>
      <div>
        <div className="text-[12px] font-medium">Contrast {ratio}:1 {pass ? "✅ Pass AA" : "❌ Fail"}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{fg} on {bg}</div>
      </div>
    </div>
  );
}
