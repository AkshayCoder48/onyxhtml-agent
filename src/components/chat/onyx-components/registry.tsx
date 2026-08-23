"use client";
import * as React from "react";
import { OnyxPlan } from "./plan";
import { OnyxDiff, OnyxMultiDiff } from "./diff";
import { OnyxFileTree } from "./file-tree";
import { OnyxAskUser } from "./ask-user";
import { OnyxPalette, OnyxColorContrast } from "./palette";
import { OnyxReasoningTree, OnyxChecklist, OnyxCommands } from "./reasoning-tree";

export type OnyxComponentType =
  | "plan"
  | "diff"
  | "multi-diff"
  | "file-tree"
  | "ask-user"
  | "palette"
  | "color-palette"
  | "color-contrast"
  | "reasoning-tree"
  | "reasoning"
  | "checklist"
  | "commands"
  | "todo"
  | "kanban"
  | "symbols"
  | "dependency-graph"
  | "css-audit"
  | "html-outline"
  | "file-stats"
  | "broken-links"
  | "test-report"
  | "qr"
  | "chart"
  | "table";

export const ONYX_REGISTRY: Record<string, React.ComponentType<any>> = {
  plan: OnyxPlan,
  diff: OnyxDiff,
  "multi-diff": OnyxMultiDiff,
  "file-tree": OnyxFileTree,
  "ask-user": OnyxAskUser,
  palette: OnyxPalette,
  "color-palette": OnyxPalette,
  "color-contrast": OnyxColorContrast,
  "reasoning-tree": OnyxReasoningTree,
  reasoning: OnyxReasoningTree,
  checklist: OnyxChecklist,
  todo: OnyxChecklist,
  commands: OnyxCommands,
  "command-suggestions": OnyxCommands,
};

export function parseOnyxBlock(lang: string, jsonStr: string): { type: string; props: any } | null {
  if (!lang.startsWith("onyx:")) return null;
  const type = lang.slice(5).trim() as OnyxComponentType;
  try {
    // Try JSON parse, fallback to YAML-ish simple parse
    const props = JSON.parse(jsonStr);
    return { type, props };
  } catch {
    // Try to extract JSON from markdown that might have extra text
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const props = JSON.parse(jsonMatch[0]);
        return { type, props };
      } catch {}
    }
    // For non-JSON, return raw
    return { type, props: { raw: jsonStr } };
  }
}

export function OnyxRenderer({ type, props }: { type: string; props: any }) {
  const Comp = ONYX_REGISTRY[type];
  if (!Comp) {
    return (
      <div className="my-3 rounded-xl border border-dashed bg-muted/30 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Unknown onyx:{type}</div>
        <pre className="mt-2 overflow-auto rounded bg-zinc-950 p-2 text-[11px] text-zinc-100">{JSON.stringify(props, null, 2)}</pre>
      </div>
    );
  }
  return <Comp {...props} />;
}
