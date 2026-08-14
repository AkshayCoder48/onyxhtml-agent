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

  // Reset console when preview is reloaded
  const previewNonce = useWorkspaceStore((s) => s.previewNonce);
  React.useEffect(() => {
    setConsoleMessages([]);
    setPageErrors([]);
    setNetwork([]);
  }, [previewNonce]);

  // Initial console visibility from settings
  React.useEffect(() => {
    if (settings.consoleVisible !== undefined) {
      if (useUIStore.getState().consoleOpen === false && settings.consoleVisible) {
        setConsoleOpen(true);
      }
    }
  }, [settings.consoleVisible, setConsoleOpen]);

  // The left panel of the workspace area switches based on activeSidebarView.
  // In preview mode we hide the left panel entirely so the preview gets full width.
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
    <ResizablePanelGroup direction="horizontal" className="h-full w-full">
      {/* Workspace area (header + toolbar + editor/preview + console) */}
      <ResizablePanel defaultSize={68} minSize={35}>
        <div className="flex h-full flex-col">
          <WorkspaceHeader />
          <WorkspaceToolbar />
          <div className="min-h-0 flex-1">
            {showLeftPanel ? (
              <ResizablePanelGroup direction="horizontal">
                <ResizablePanel defaultSize={22} minSize={12} maxSize={40}>
                  {leftPanelContent}
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={78} minSize={30}>
                  <CodeEditor />
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <PreviewPane iframeRef={iframeRef} />
            )}
          </div>
          {consoleOpen && (
            <div className="h-56 shrink-0">
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
      <ResizableHandle />

      {/* Chat panel */}
      <ResizablePanel defaultSize={32} minSize={20} maxSize={50}>
        <ChatPanel bridgeExecute={execute} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export type { BridgeExecute };
