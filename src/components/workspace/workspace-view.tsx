"use client";

import * as React from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
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
import { usePreviewBridge, type BridgeExecute } from "@/hooks/use-preview-bridge";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

export function WorkspaceView() {
  const activeSidebarView = useUIStore((s) => s.activeSidebarView);
  const consoleOpen = useUIStore((s) => s.consoleOpen);
  const setConsoleOpen = useUIStore((s) => s.setConsoleOpen);
  const previewMode = useWorkspaceStore((s) => s.previewMode);
  const { settings } = useSettings();

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

  React.useEffect(() => {
    if (settings.consoleVisible !== undefined) {
      if (useUIStore.getState().consoleOpen === false && settings.consoleVisible) {
        setConsoleOpen(true);
      }
    }
  }, [settings.consoleVisible, setConsoleOpen]);

  const showLeftPanel = previewMode === "code";
  const leftPanelContent = (() => {
    switch (activeSidebarView) {
      case "files":
        return <FileExplorer />;
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
    <ResizablePanelGroup direction="horizontal" className="h-full w-full bg-background">
      <ResizablePanel defaultSize={68} minSize={35} className="bg-background">
        <div className="flex h-full flex-col bg-background">
          <WorkspaceHeader />
          <WorkspaceToolbar />
          <div className="relative min-h-0 flex-1 bg-background">
            {showLeftPanel && (
              <div className="absolute inset-0">
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <ResizablePanel defaultSize={22} minSize={12} maxSize={40} className="bg-card/30">
                    {leftPanelContent}
                  </ResizablePanel>
                  <ResizableHandle withHandle className="w-1 bg-border/50 hover:bg-violet-500/20 transition-colors" />
                  <ResizablePanel defaultSize={78} minSize={30} className="bg-background">
                    <CodeEditor />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            )}
            <div className={cn("absolute inset-0 bg-muted/10", showLeftPanel && "opacity-0 pointer-events-none")} aria-hidden={showLeftPanel}>
              <PreviewPane iframeRef={iframeRef} />
            </div>
          </div>
          {consoleOpen && (
            <div className="h-56 shrink-0 border-t bg-card">
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
      </ResizablePanel>
      <ResizableHandle withHandle className="w-1.5 bg-border/30 hover:bg-violet-500/20 transition-colors data-[resize-handle-active]:bg-violet-500/30" />
      <ResizablePanel defaultSize={32} minSize={20} maxSize={50} className="bg-background">
        <ChatPanel bridgeExecute={execute} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export type { BridgeExecute };
