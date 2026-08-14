// ============================================================================
// Canonical streaming event types — the single source of truth for the new
// event-driven streaming architecture (PRD §11).
//
// Every event carries a stable `messageId` (PRD §10) so stores can route it
// to the correct assistant message without rebuilding message lists.
//
// Tool / file / browser events also carry a stable `toolCallId` so they can
// be routed to fine-grained per-tool / per-file subscriptions.
// ============================================================================

export type MessageId = string;
export type ToolCallId = string;
export type FilePath = string;

// ---------- Text ----------

export type TextDeltaEvent = {
  type: "text.delta";
  messageId: MessageId;
  delta: string;
};

export type ThinkingDeltaEvent = {
  type: "thinking.delta";
  messageId: MessageId;
  delta: string;
};

// ---------- Tool lifecycle ----------

export type ToolStartEvent = {
  type: "tool.start";
  messageId: MessageId;
  toolCallId: ToolCallId;
  tool: string;
  label?: string;
};

export type ToolArgumentsDeltaEvent = {
  type: "tool.arguments.delta";
  messageId: MessageId;
  toolCallId: ToolCallId;
  delta: string;
};

export type ToolExecuteEvent = {
  type: "tool.execute";
  messageId: MessageId;
  toolCallId: ToolCallId;
};

export type ToolProgressEvent = {
  type: "tool.progress";
  messageId: MessageId;
  toolCallId: ToolCallId;
  message?: string;
  progress?: number; // 0..1, optional
};

export type ToolResultEvent = {
  type: "tool.result";
  messageId: MessageId;
  toolCallId: ToolCallId;
  status: "success" | "error" | "cancelled";
  result?: unknown;
  error?: string;
  label?: string;
  detail?: string;
};

export type ToolCompleteEvent = {
  type: "tool.complete";
  messageId: MessageId;
  toolCallId: ToolCallId;
};

// ---------- File streaming ----------

export type FileStartEvent = {
  type: "file.start";
  messageId: MessageId;
  toolCallId: ToolCallId;
  path: FilePath;
  operation: "create" | "write" | "append" | "replace" | "patch" | "delete";
};

export type FileDeltaEvent = {
  type: "file.delta";
  messageId: MessageId;
  toolCallId: ToolCallId;
  path: FilePath;
  delta: string;
};

export type FileCompleteEvent = {
  type: "file.complete";
  messageId: MessageId;
  toolCallId: ToolCallId;
  path: FilePath;
  bytes: number;
};

// ---------- Browser console ----------

export type BrowserConsoleEvent = {
  type: "browser.console";
  messageId: MessageId;
  toolCallId: ToolCallId;
  level: "log" | "info" | "warn" | "error";
  args: string[];
  time: number;
};

// ---------- Stream lifecycle ----------

export type StreamStartEvent = {
  type: "stream.start";
  messageId: MessageId;
};

export type StreamCompleteEvent = {
  type: "stream.complete";
  messageId: MessageId;
};

export type StreamErrorEvent = {
  type: "stream.error";
  messageId: MessageId;
  content: string;
};

export type BrowserToolsPendingEvent = {
  type: "browser.tools_pending";
  messageId: MessageId;
  callIds: ToolCallId[];
};

// ---------- Union ----------

export type StreamEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolStartEvent
  | ToolArgumentsDeltaEvent
  | ToolExecuteEvent
  | ToolProgressEvent
  | ToolResultEvent
  | ToolCompleteEvent
  | FileStartEvent
  | FileDeltaEvent
  | FileCompleteEvent
  | BrowserConsoleEvent
  | StreamStartEvent
  | StreamCompleteEvent
  | StreamErrorEvent
  | BrowserToolsPendingEvent;

// ---------- Tool card states (PRD §15) ----------

export type ToolCardState =
  | "generating" // arguments still streaming in
  | "ready" // arguments complete, about to execute
  | "executing" // tool is running
  | "streaming" // tool is producing incremental output
  | "success"
  | "error"
  | "cancelled";

// ---------- File stream state (PRD §22) ----------

export type FileStreamState = {
  path: FilePath;
  operation: "create" | "write" | "append" | "replace" | "patch" | "delete";
  content: string; // accumulated content so far
  status: "writing" | "complete" | "error";
  bytes: number;
  startedAt: number;
  toolCallId: ToolCallId;
};

// ---------- Tool state ----------

export type ToolState = {
  toolCallId: ToolCallId;
  messageId: MessageId;
  tool: string;
  label?: string;
  detail?: string;
  rawArguments: string; // partial JSON as received (PRD §16)
  parsedArguments?: Record<string, unknown>; // set once JSON is complete
  state: ToolCardState;
  progressMessage?: string;
  progress?: number;
  result?: unknown;
  error?: string;
  consoleLines: { level: "log" | "info" | "warn" | "error"; args: string[]; time: number }[];
  startedAt: number;
  completedAt?: number;
};
