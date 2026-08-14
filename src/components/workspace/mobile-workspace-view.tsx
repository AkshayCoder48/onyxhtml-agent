"use client";

import * as React from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUIStore } from "@/stores/ui-store";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceToolbar } from "./workspace-toolbar";
import { FileExplorer } from "@/components/editor/file-explorer";
import { CodeEditor } from "@/components/editor/code-editor";
import {
  PreviewPane,
  type PreviewConsoleMessage,
  type PreviewError,
  type PreviewNetworkEntry,
} from "@/components/preview/preview-pane";
import { ConsoleDrawer } from "@/components/preview/console-drawer";
import { ChatPanel } from "@/components/chat/chat-panel";
import { BrowserTestPanel } from "@/components/preview/browser-test-panel";
import { ChatHistory } from "@/components/chat/chat-history";
import { ChatSearch } from "@/components/chat/chat-search";
import { usePreviewBridge } from "@/hooks/use-preview-bridge";
import { cn } from "@/lib/utils";

// Mobile workspace view: shows one of Code / Preview / AI / Files at a time,
// with a bottom nav.
export function MobileWorkspaceView() {
  const mobileView = useUIStore((s) => s.mobileView);
  const activeSidebarView = useUIStore((s) => s.activeSidebarView);
  const consoleOpen = useUIStore((s) => s.consoleOpen);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  const previewMode = useWorkspaceStore((s) => s.previewMode);
  const setPreviewMode = useWorkspaceStore((s) => s.setPreviewMode);
  const setActiveSidebarView = useUIStore((s) => s.setActiveSidebarView);

  const [consoleMessages, setConsoleMessages] = React.useState<PreviewConsoleMessage[]>([]);
  const [pageErrors, setPageErrors] = React.useState<PreviewError[]>([]);
  const [network, setNetwork] = React.useState<PreviewNetworkEntry[]>([]);
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const { execute } = usePreviewBridge(
    iframeRef,
    (m) => setConsoleMessages((prev) => [...prev, m]),
    (e) => setPageErrors((prev) => [...prev, e]),
    (n) => setNetwork((prev) => [...prev, n])
  );

  const previewNonce = useWorkspaceStore((s) => s.previewNonce);
  React.useEffect(() => {
    setConsoleMessages([]);
    setPageErrors([]);
    setNetwork([]);
  }, [previewNonce]);

  // When mobile view changes, ensure related state is consistent
  React.useEffect(() => {
    if (mobileView === "code") setPreviewMode("code");
    if (mobileView === "preview") setPreviewMode("preview");
    if (mobileView === "files") setActiveSidebarView("files");
  }, [mobileView, setPreviewMode, setActiveSidebarView]);

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader />
      {(mobileView === "code" || mobileView === "preview") && <WorkspaceToolbar />}

      <div className="relative min-h-0 flex-1">
        {mobileView === "code" && (
          <div className="absolute inset-0">
            <CodeEditor />
          </div>
        )}
        {/*
          Preview pane — ALWAYS MOUNTED so the iframe + bridge script stay
          alive for browser-tool execution even when the user is on the Code
          or AI tab. We use opacity-0 + pointer-events-none (NOT display:none)
          because display:none can prevent the iframe's srcdoc from being
          parsed and the bridge script from executing in some browsers.
        */}
        <div
          className={cn(
            "absolute inset-0",
            mobileView !== "preview" && "opacity-0 pointer-events-none"
          )}
          aria-hidden={mobileView !== "preview"}
        >
          <PreviewPane iframeRef={iframeRef} />
        </div>
        {mobileView === "ai" && (
          <div className="absolute inset-0">
            <ChatPanel bridgeExecute={execute} />
          </div>
        )}
        {mobileView === "files" && (
          <div className="absolute inset-0">
            {activeSidebarView === "files" && <FileExplorer />}
            {activeSidebarView === "browser" && <BrowserTestPanel />}
            {activeSidebarView === "history" && <ChatHistory />}
            {activeSidebarView === "search" && <ChatSearch />}
          </div>
        )}
      </div>

      {consoleOpen && (mobileView === "code" || mobileView === "preview") && (
        <div className="h-44 shrink-0">
          <ConsoleDrawer
            open={consoleOpen}
            onToggle={() => setConsoleOpen(false)}
            messages={consoleMessages}
            errors={pageErrors}
            network={network}
            onClear={() => {
              setConsoleMessages([]);
              setPageErrors([]);
              setNetwork([]);
            }}
          />
        </div>
      )}
    </div>
  );
}
