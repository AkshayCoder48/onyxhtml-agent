"use client";

import * as React from "react";
import { useBrowserStore } from "@/stores/browser-store";
import { useToolStore } from "@/stores/tool-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

// Bridge for sending browser-automation commands to the preview iframe and
// receiving results. Uses postMessage with request/response correlation by
// callId. Waits for the iframe bridge to announce `kind: "ready"` so tools
// never fire into a half-loaded document (the old 8s timeout + no handshake
// is what made tools spin forever or instantly error).

export type BridgeExecute = (
  tool: string,
  args: Record<string, unknown>,
  callId: string
) => Promise<{ result?: unknown; error?: string }>;

export type PreviewBridge = {
  execute: BridgeExecute;
  waitReady: (timeoutMs?: number) => Promise<boolean>;
};

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutForTool(tool: string, args: Record<string, unknown>): number {
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  switch (tool) {
    case "wait":
      return Math.min(num(args.ms, 0), 10_000) + 2_000;
    case "run_e2e_test":
      return num(args.timeoutMs, 15_000) + 3_000;
    case "test_api_endpoint":
      return num(args.timeoutMs, 10_000) + 3_000;
    case "test_performance":
      return num(args.waitMs, 1_000) + 8_000;
    case "test_responsive_layout": {
      const widths = Array.isArray(args.widths) ? args.widths.length : 4;
      return widths * num(args.waitMs, 400) + 8_000;
    }
    case "test_form":
    case "test_navigation":
      return num(args.waitMs, 500) + 8_000;
    case "run_integration_tests":
    case "run_qa_suite":
      return 20_000;
    case "take_screenshot":
    case "assert_screenshot":
      return 15_000;
    default:
      return 12_000;
  }
}

export function usePreviewBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onConsole?: (m: ConsoleMessage) => void,
  onError?: (e: PageError) => void,
  onNetwork?: (n: NetworkEntry) => void
): PreviewBridge {
  const pendingRef = React.useRef<
    Map<string, (res: { result?: unknown; error?: string }) => void>
  >(new Map());

  const readyRef = React.useRef(false);
  const readyWaitersRef = React.useRef<Array<() => void>>([]);

  const cbRef = React.useRef({ onConsole, onError, onNetwork });
  React.useEffect(() => {
    cbRef.current = { onConsole, onError, onNetwork };
  }, [onConsole, onError, onNetwork]);

  // A preview reload (file write / bumpPreview) tears down the old document.
  // Forget "ready" so the next execute waits for the new bridge ping.
  const previewNonce = useWorkspaceStore((s) => s.previewNonce);
  React.useEffect(() => {
    readyRef.current = false;
  }, [previewNonce]);

  const markReady = React.useCallback(() => {
    readyRef.current = true;
    const waiters = readyWaitersRef.current.splice(0);
    for (const w of waiters) w();
  }, []);

  const waitReady = React.useCallback((timeoutMs = 8000): Promise<boolean> => {
    if (readyRef.current && iframeRef.current?.contentWindow) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = readyWaitersRef.current.indexOf(onReady);
        if (idx >= 0) readyWaitersRef.current.splice(idx, 1);
        resolve(readyRef.current && !!iframeRef.current?.contentWindow);
      }, timeoutMs);
      const onReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
      readyWaitersRef.current.push(onReady);
    });
  }, [iframeRef]);

  React.useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "preview") return;

      if (data.kind === "ready") {
        markReady();
        return;
      }

      if (data.kind === "console") {
        if (cbRef.current.onConsole) {
          cbRef.current.onConsole({
            level: data.level,
            args: data.args ?? [],
            time: Date.now(),
          });
        }
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
        const resolver = pendingRef.current.get(data.callId);
        if (resolver) {
          pendingRef.current.delete(data.callId);
          resolver({ result: data.result, error: data.error });
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [markReady]);

  const postToIframe = React.useCallback(
    (
      tool: string,
      args: Record<string, unknown>,
      callId: string,
      timeoutMs: number
    ): Promise<{ result?: unknown; error?: string }> => {
      return new Promise((resolve) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) {
          resolve({
            error:
              "Preview iframe not available. Switch to Preview so the page can load, then retry.",
          });
          return;
        }
        const timeout = setTimeout(() => {
          if (pendingRef.current.has(callId)) {
            pendingRef.current.delete(callId);
            resolve({
              error: `Tool '${tool}' timed out after ${timeoutMs}ms (preview did not respond).`,
            });
          }
        }, timeoutMs);

        pendingRef.current.set(callId, (res) => {
          clearTimeout(timeout);
          resolve(res);
        });

        try {
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
        } catch (e) {
          clearTimeout(timeout);
          pendingRef.current.delete(callId);
          resolve({
            error: e instanceof Error ? e.message : "Failed to reach preview",
          });
        }
      });
    },
    [iframeRef]
  );

  const execute = React.useCallback<BridgeExecute>(
    async (tool, args, callId) => {
      // Host-side tools — do not depend on the iframe script.
      if (tool === "wait") {
        const ms = Math.max(0, Math.min(Number(args.ms) || 0, 10_000));
        if (ms > 0) await sleep(ms);
        return { result: { ok: true, waited: ms } };
      }
      if (tool === "reload_page") {
        readyRef.current = false;
        useWorkspaceStore.getState().bumpPreview();
        const ok = await waitReady(8000);
        return {
          result: {
            ok,
            reloaded: true,
            note: ok
              ? "Preview reloaded."
              : "Reload requested; preview did not announce ready in time.",
          },
        };
      }

      // Give a just-written preview a moment to parse srcDoc + run the bridge.
      if (!readyRef.current) {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) {
          await sleep(150);
        }
        const ok = await waitReady(8000);
        if (!ok && (!iframeRef.current || !iframeRef.current.contentWindow)) {
          return {
            error:
              "Preview iframe not available. Switch to Preview so the page can load, then retry.",
          };
        }
      }

      const timeoutMs = timeoutForTool(tool, args);
      const first = await postToIframe(tool, args, callId, timeoutMs);
      if (!first.error || !String(first.error).includes("timed out")) {
        return first;
      }

      // One retry after the next ready ping — covers the race where we posted
      // into a document that was about to be replaced by a file-write reload.
      readyRef.current = false;
      const recovered = await waitReady(5000);
      if (!recovered) return first;
      return postToIframe(tool, args, `${callId}__retry`, timeoutMs);
    },
    [iframeRef, postToIframe, waitReady]
  );

  return { execute, waitReady };
}


