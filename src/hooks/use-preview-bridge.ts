"use client";

import * as React from "react";
import { useBrowserStore } from "@/stores/browser-store";
import { useToolStore } from "@/stores/tool-store";

// Bridge for sending browser-automation commands to the preview iframe and
// receiving results. Uses postMessage with request/response correlation by
// callId.

export type BridgeExecute = (
  tool: string,
  args: Record<string, unknown>,
  callId: string
) => Promise<{ result?: unknown; error?: string }>;

type ConsoleMessage = {
  level: "log" | "warn" | "error" | "info";
  args: unknown[];
  time: number;
};

type PageError = {
  message: string;
  filename?: string;
  line?: number;
  col?: number;
  time: number;
};

type NetworkEntry = {
  url: string;
  status?: number;
  type: string;
  time: number;
};

export function usePreviewBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onConsole?: (m: ConsoleMessage) => void,
  onError?: (e: PageError) => void,
  onNetwork?: (n: NetworkEntry) => void
) {
  const pendingRef = React.useRef<
    Map<string, (res: { result?: unknown; error?: string }) => void>
  >(new Map());

  // Stable callbacks
  const cbRef = React.useRef({ onConsole, onError, onNetwork });
  React.useEffect(() => {
    cbRef.current = { onConsole, onError, onNetwork };
  }, [onConsole, onError, onNetwork]);

  React.useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "preview") return;

      if (data.kind === "console") {
        // Route to the optional ConsoleDrawer callback (always).
        if (cbRef.current.onConsole) {
          cbRef.current.onConsole({
            level: data.level,
            args: data.args ?? [],
            time: Date.now(),
          });
        }
        // PRD §18: if the console message carries a callId (forwarded live
        // from terminal_exec / run_javascript), also push it into the
        // BrowserStore + ToolStore so the ToolCard renders live console
        // output as it happens.
        if (typeof data.callId === "string" && data.callId) {
          const args = Array.isArray(data.args)
            ? data.args.map((a: unknown) => String(a))
            : [];
          useBrowserStore.getState().add({
            toolCallId: data.callId,
            level: data.level,
            args,
            time: typeof data.time === "number" ? data.time : Date.now(),
          });
          useToolStore.getState().addConsoleLine(
            data.callId,
            data.level,
            args,
            typeof data.time === "number" ? data.time : Date.now()
          );
        }
      } else if (data.kind === "error" && cbRef.current.onError) {
        cbRef.current.onError({
          message: data.message,
          filename: data.filename,
          line: data.line,
          col: data.col,
          time: Date.now(),
        });
      } else if (data.kind === "network" && cbRef.current.onNetwork) {
        cbRef.current.onNetwork({
          url: data.url,
          status: data.status,
          type: data.type ?? "resource",
          time: Date.now(),
        });
      } else if (data.callId) {
        // tool result
        const resolver = pendingRef.current.get(data.callId);
        if (resolver) {
          pendingRef.current.delete(data.callId);
          resolver({ result: data.result, error: data.error });
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const execute = React.useCallback<BridgeExecute>(
    (tool, args, callId) => {
      return new Promise((resolve) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) {
          resolve({ error: "Preview iframe not available" });
          return;
        }
        // Set up a timeout in case the iframe never responds.
        const timeout = setTimeout(() => {
          if (pendingRef.current.has(callId)) {
            pendingRef.current.delete(callId);
            resolve({ error: `Tool '${tool}' timed out` });
          }
        }, 8000);

        pendingRef.current.set(callId, (res) => {
          clearTimeout(timeout);
          resolve(res);
        });

        iframe.contentWindow.postMessage(
          {
            source: "workspace-host",
            action: "browser-tool",
            tool,
            args,
            callId,
          },
          "*"
        );
      });
    },
    [iframeRef]
  );

  return { execute };
}

