"use client";

import * as React from "react";

type Shortcut = {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  // Allow in input/textarea/contentEditable
  allowInInput?: boolean;
};

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  );
}

function matches(e: KeyboardEvent, s: Shortcut): boolean {
  const k = e.key.toLowerCase();
  const sk = s.key.toLowerCase();
  if (k !== sk) return false;
  const wantCtrl = s.ctrl ?? false;
  const wantMeta = s.meta ?? false;
  const wantShift = s.shift ?? false;
  const wantAlt = s.alt ?? false;
  const hasCtrl = e.ctrlKey;
  const hasMeta = e.metaKey;
  const hasShift = e.shiftKey;
  const hasAlt = e.altKey;
  // Treat ctrl/cmd as interchangeable for cross-platform
  const mod = (c: boolean, m: boolean) => c || m;
  if (wantCtrl && !mod(hasCtrl, hasMeta)) return false;
  if (!wantCtrl && !wantMeta && mod(hasCtrl, hasMeta) && (wantShift || wantAlt)) {
    // could still be a multi-modifier combo
  }
  if (wantMeta && !mod(hasCtrl, hasMeta)) return false;
  if (wantShift !== hasShift) return false;
  if (wantAlt !== hasAlt) return false;
  return true;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutsRef = React.useRef(shortcuts);
  React.useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      for (const s of shortcutsRef.current) {
        if (matches(e, s)) {
          if (isEditableTarget(e) && !s.allowInInput) continue;
          e.preventDefault();
          s.handler();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

// Helper: returns true if ctrl or meta is pressed (cross-platform).
export function isMod(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}
