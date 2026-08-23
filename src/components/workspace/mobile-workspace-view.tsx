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
import { useInstantFileSync } from "@/hooks/use-instant-file-sync";
import { cn } from "@/lib/utils";

function isAiView(view: string) {
  return view === "ai";
}

export function MobileWorkspaceView() {
  const mobileView = useUIStore((s) => s.mobileView);
  const activeSidebarView = useUIStore((s) => s.activeSidebarView);
  const consoleOpen = useUIStore((s) => s.consoleOpen);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  useInstantFileSync();

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

  const showAi = isAiView(mobileView);

  const sidePanel = (() => {
    switch (activeSidebarView) {
      case "browser":
        return <BrowserTestPanel />;
      case "history":
        return <ChatHistory />;
      case "search":
        return <ChatSearch />;
      default:
        return <FileExplorer />;
    }
  })();

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader />

      <div className="relative min-h-0 flex-1">
        {/* Files + Code + Preview stay mounted so edits, iframe, and tools survive tab switches. */}
        <div
          className={cn("absolute inset-0 flex flex-col", showAi && "pointer-events-none opacity-0")}
          aria-hidden={showAi}
        >
          <WorkspaceToolbar />
          <div className="h-[26%] min-h-[96px] shrink-0 border-b">{sidePanel}</div>
          <div className="min-h-0 flex-1">
            <CodeEditor />
          </div>
          <div className="h-[34%] min-h-[140px] shrink-0 border-t">
            <PreviewPane iframeRef={iframeRef} />
          </div>
        </div>

        {/* Chat stays mounted so a live stream is never torn down. */}
        <div
          className={cn("absolute inset-0", !showAi && "pointer-events-none opacity-0")}
          aria-hidden={!showAi}
        >
          <ChatPanel bridgeExecute={execute} />
        </div>
      </div>

      {consoleOpen && !showAi && (
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
