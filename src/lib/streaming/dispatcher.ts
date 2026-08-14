// ============================================================================
// EventDispatcher (PRD §35).
//
// The single authoritative dispatcher for all StreamEvents. No component
// parses provider chunks independently. The dispatcher routes events to the
// appropriate stores (ChatStore / ToolStore / FileStreamStore / BrowserStore)
// using IMMEDIATE state updates — no rAF coalescing, no debounce, no throttle
// (PRD §8). Browser's own React batching protects against pathological rates.
//
// The dispatcher owns no state itself; it only calls store mutators. This
// keeps ownership clear and makes the stores the single source of truth.
// ============================================================================

import type { StreamEvent } from "./types";

export type DispatcherHandlers = {
  onTextDelta: (messageId: string, delta: string) => void;
  onThinkingDelta: (messageId: string, delta: string) => void;
  onToolStart: (ev: Extract<StreamEvent, { type: "tool.start" }>) => void;
  onToolArgumentsDelta: (
    ev: Extract<StreamEvent, { type: "tool.arguments.delta" }>
  ) => void;
  onToolExecute: (toolCallId: string) => void;
  onToolProgress: (
    toolCallId: string,
    message: string | undefined,
    progress: number | undefined
  ) => void;
  onToolResult: (ev: Extract<StreamEvent, { type: "tool.result" }>) => void;
  onToolComplete: (toolCallId: string) => void;
  onFileStart: (ev: Extract<StreamEvent, { type: "file.start" }>) => void;
  onFileDelta: (ev: Extract<StreamEvent, { type: "file.delta" }>) => void;
  onFileComplete: (ev: Extract<StreamEvent, { type: "file.complete" }>) => void;
  onBrowserConsole: (
    ev: Extract<StreamEvent, { type: "browser.console" }>
  ) => void;
  onStreamStart: (messageId: string) => void;
  onStreamComplete: (messageId: string) => void;
  onStreamError: (messageId: string, content: string) => void;
  onBrowserToolsPending: (messageId: string, callIds: string[]) => void;
};

export class EventDispatcher {
  constructor(private handlers: DispatcherHandlers) {}

  dispatch(ev: StreamEvent): void {
    switch (ev.type) {
      case "text.delta":
        this.handlers.onTextDelta(ev.messageId, ev.delta);
        break;
      case "thinking.delta":
        this.handlers.onThinkingDelta(ev.messageId, ev.delta);
        break;
      case "tool.start":
        this.handlers.onToolStart(ev);
        break;
      case "tool.arguments.delta":
        this.handlers.onToolArgumentsDelta(ev);
        break;
      case "tool.execute":
        this.handlers.onToolExecute(ev.toolCallId);
        break;
      case "tool.progress":
        this.handlers.onToolProgress(ev.toolCallId, ev.message, ev.progress);
        break;
      case "tool.result":
        this.handlers.onToolResult(ev);
        break;
      case "tool.complete":
        this.handlers.onToolComplete(ev.toolCallId);
        break;
      case "file.start":
        this.handlers.onFileStart(ev);
        break;
      case "file.delta":
        this.handlers.onFileDelta(ev);
        break;
      case "file.complete":
        this.handlers.onFileComplete(ev);
        break;
      case "browser.console":
        this.handlers.onBrowserConsole(ev);
        break;
      case "stream.start":
        this.handlers.onStreamStart(ev.messageId);
        break;
      case "stream.complete":
        this.handlers.onStreamComplete(ev.messageId);
        break;
      case "stream.error":
        this.handlers.onStreamError(ev.messageId, ev.content);
        break;
      case "browser.tools_pending":
        this.handlers.onBrowserToolsPending(ev.messageId, ev.callIds);
        break;
    }
  }
}
