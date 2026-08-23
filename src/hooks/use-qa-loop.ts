"use client";
import * as React from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useChatStore } from "@/stores/chat-store";
import { toast } from "sonner";

type ConsoleError = { message: string; source?: string; level: string };

export function useQaLoop() {
  const [enabled, setEnabled] = React.useState(true);
  const [lastFixAt, setLastFixAt] = React.useState<number>(0);

  React.useEffect(() => {
    function onConsoleError(e: Event) {
      const detail = (e as CustomEvent<{ errors: ConsoleError[] }>).detail;
      if (!enabled) return;
      if (!detail?.errors?.length) return;
      // Only auto-fix if we haven't fixed recently (5s cooldown)
      if (Date.now() - lastFixAt < 5000) return;
      const errorMessages = detail.errors.map((er) => er.message).join("\n");
      if (!errorMessages) return;

      // Heuristic: ignore certain non-fixable errors
      const ignorePatterns = ["ResizeObserver", "favicon", "404"];
      if (ignorePatterns.some((p) => errorMessages.includes(p))) return;

      // Auto-trigger fix prompt via chat
      setLastFixAt(Date.now());
      toast.error(`Console errors detected: ${detail.errors.length}`, {
        description: errorMessages.slice(0, 200),
        action: {
          label: "Auto-fix",
          onClick: () => {
            window.dispatchEvent(new CustomEvent("chat:set-prompt", {
              detail: `Fix these console errors:\n${errorMessages}\n\nUse qa_suite to verify.`
            }));
          },
        },
      });
    }

    window.addEventListener("preview:console-errors", onConsoleError as EventListener);
    return () => window.removeEventListener("preview:console-errors", onConsoleError as EventListener);
  }, [enabled, lastFixAt]);

  // Listen to checkpoint events from worker tools
  React.useEffect(() => {
    function onCheckpoint(e: Event) {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      toast.success(`Checkpoint: ${detail.message}`);
    }
    window.addEventListener("workspace:checkpoint", onCheckpoint as EventListener);
    return () => window.removeEventListener("workspace:checkpoint", onCheckpoint as EventListener);
  }, []);

  return { enabled, setEnabled };
}
