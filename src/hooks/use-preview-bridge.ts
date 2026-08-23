"use client";

import * as React from "react";
import { useBrowserStore } from "@/stores/browser-store";
import { useToolStore } from "@/stores/tool-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  executeHostBrowserTool,
  getIframeWindow,
  sleep,
  waitForStablePreviewDocument,
  type IFrameWindow,
} from "@/lib/preview/host-browser-tools";

// Bridge for sending browser-automation commands to the preview iframe.
// Primary path: host-side execution against iframe.contentDocument (same-origin).
// That does not depend on a postMessage "ready" ping, so a missed handshake
// can no longer leave tools spinning for 8s or erroring immediately.

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
    });
  } else {
    await sleep(32);
  }
}

function forwardLiveConsole(callId: string, level: ConsoleMessage["level"], args: string[], time: number) {
  useBrowserStore.getState().add({
    toolCallId: callId,
    level,
    args,
    time,
  });
  useToolStore.getState().addConsoleLine(callId, level, args, time);
}
  time: number;
};

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

async function waitForAiEditingIdle(timeoutMs = 6000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (useWorkspaceStore.getState().aiEditingFiles.size === 0) break;
    await sleep(40);
  }
  // Two frames so React can commit a pending srcDoc / iframe remount.
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  } else {
    await sleep(32);
  }
}

function forwardLiveConsole(callId: string, level: ConsoleMessage["level"], args: string[], time: number) {
  useBrowserStore.getState().add({
    toolCallId: callId,
    level,
    args,
    time,
  });
  useToolStore.getState().addConsoleLine(callId, level, args, time);
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

  // A preview remount (file.complete / bumpPreview) gets a new document.
  // Increment the generation so in-flight waiters can distinguish "old ready"
  // from "new ready". Do NOT treat a missed ping as a hard failure — the host
  // executor only needs contentDocument.
  const previewNonce = useWorkspaceStore((s) => s.previewNonce);
  React.useEffect(() => {
    readyRef.current = false;
  }, [previewNonce]);

  const markReady = React.useCallback(() => {
    readyRef.current = true;
    const waiters = readyWaitersRef.current.splice(0);
    for (const w of waiters) w();
  }, []);

  const waitReady = React.useCallback(
    (timeoutMs = 8000): Promise<boolean> => {
      const iframe = iframeRef.current;
      if (iframe && isHostReady(iframe)) return Promise.resolve(true);
      if (readyRef.current && iframe?.contentWindow) return Promise.resolve(true);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const idx = readyWaitersRef.current.indexOf(onReady);
          if (idx >= 0) readyWaitersRef.current.splice(idx, 1);
          const el = iframeRef.current;
          resolve(!!(el && (isHostReady(el) || el.contentWindow)));
        }, timeoutMs);
        const onReady = () => {
          clearTimeout(timer);
          resolve(true);
        };
        readyWaitersRef.current.push(onReady);
      });
    },
    [iframeRef]
  );

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
          forwardLiveConsole(
            data.callId,
            data.level,
            args,
          const args = Array.isArray(data.args)
            ? data.args.map((a: unknown) => String(a))
            : [];
          forwardLiveConsole(
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
      } else if (data.callId) {
        const resolver = pendingRef.current.get(data.callId);
        if (resolver) {
          pendingRef.current.delete(data.callId);
        }
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
              "Preview iframe not available. Wait for the live preview to load, then retry.",
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
      if (tool === "wait") {
        const ms = Math.max(0, Math.min(Number(args.ms) || 0, 10_000));
        if (ms > 0) await sleep(ms);
        return { result: { ok: true, waited: ms } };
      }

      if (tool === "reload_page") {
        readyRef.current = false;
        useWorkspaceStore.getState().bumpPreview();
        await waitForAiEditingIdle(2000);
        const iframe = iframeRef.current;
        const ok = iframe ? await waitForStablePreviewDocument(iframe, 6000) : false;
        return {
          result: {
            ok,
            reloaded: true,
            note: ok
              ? "Preview reloaded."
              : "Reload requested; preview document was not ready in time.",
          },
        };
      }

      await waitForAiEditingIdle();

      const iframe = iframeRef.current;
      if (!iframe) {
        return {
          error:
            "Preview iframe not available. Wait for the live preview to load, then retry.",
        };
      }

      const stable = await waitForStablePreviewDocument(iframe, 6000);
      if (!stable && !iframe.contentWindow) {
        return {
          error:
            "Preview iframe not available. Wait for the live preview to load, then retry.",
        };
      }

      // Prefer a same-origin function the bridge may have installed, then
      // the host executor. postMessage is a last-resort fallback only.
      const win = getIframeWindow(iframe);
      const timeoutMs = timeoutForTool(tool, args);

      if (win && typeof win.__onyxRunTool === "function") {
        try {
          const out = await withTimeout(
            win.__onyxRunTool(tool, args, callId),
            timeoutMs,
            `Tool '${tool}' timed out after ${timeoutMs}ms.`
          );
          if (out && (out.result !== undefined || out.error)) return out;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("timed out")) {
            // Fall through to host executor.
          }
        }
      }

      const host = await withTimeout(
        executeHostBrowserTool(iframe, tool, args, callId, {
          onConsole: (level, lineArgs, time) => {
            forwardLiveConsole(callId, level, lineArgs, time);
            cbRef.current.onConsole?.({ level, args: lineArgs, time });
          },
        }),
        timeoutMs,
        `Tool '${tool}' timed out after ${timeoutMs}ms.`
      );
      if (!host.error || !String(host.error).startsWith("Unknown browser tool")) {
        return host;
      }

      return postToIframe(tool, args, callId, timeoutMs);
    },
    [iframeRef, postToIframe]
  );

  return { execute, waitReady };
}

function isHostReady(iframe: HTMLIFrameElement): boolean {
  try {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow as IFrameWindow | null;
    if (!doc || !win || !doc.documentElement) return false;
    if (doc.readyState === "loading") return false;
    return true;
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  }).catch((e) => {
    return { error: e instanceof Error ? e.message : String(e) } as T;
  });
}
