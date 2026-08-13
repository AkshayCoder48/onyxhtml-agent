// Shared types for the AI HTML Workspace Editor

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
};

export type WorkspaceSettings = {
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  minimap?: boolean;
  lineNumbers?: boolean;
  autoSave?: boolean;
  defaultViewport?: "desktop" | "tablet" | "mobile";
  autoReload?: boolean;
  consoleVisible?: boolean;
  errorOverlay?: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  activeFile: string | null;
  template: string;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
};

export type FileItem = {
  id: string;
  workspaceId: string;
  path: string;
  content: string;
  isBinary: boolean;
  updatedAt: string;
};

// Message segment model
export type MessageSegment =
  | { type: "thinking"; content: string }
  | { type: "content"; content: string }
  | {
      type: "tool_call";
      tool: string;
      arguments: Record<string, unknown>;
      callId: string;
      status: "running" | "success" | "error" | "cancelled";
      label?: string;
      detail?: string;
      result?: unknown;
      error?: string;
    }
  | { type: "error"; content: string };

export type Message = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  segments: MessageSegment[];
  createdAt: string;
};

export type Chat = {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: string;
};

export type Provider = {
  id: string;
  name: string;
  baseURL: string;
  hasApiKey: boolean;
  model: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderInput = {
  name: string;
  baseURL: string;
  apiKey?: string;
  model: string;
  isActive?: boolean;
};

export type AppSettings = {
  theme: "light" | "dark" | "system";
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  autoSave: boolean;
  formatOnSave: boolean;
  defaultViewport: "desktop" | "tablet" | "mobile";
  autoReload: boolean;
  consoleVisible: boolean;
  errorOverlay: boolean;
  openLinksExternally: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  minimap: false,
  lineNumbers: true,
  autoSave: true,
  formatOnSave: false,
  defaultViewport: "desktop",
  autoReload: true,
  consoleVisible: true,
  errorOverlay: true,
  openLinksExternally: false,
};

// Streaming events normalized from providers
export type StreamEvent =
  | { type: "reasoning_content"; content: string }
  | { type: "content"; content: string }
  | { type: "tool_call"; tool: string; arguments: Record<string, unknown>; callId: string; label?: string }
  | { type: "tool_result"; callId: string; status: "success" | "error" | "cancelled"; result?: unknown; error?: string; label?: string; detail?: string }
  | { type: "error"; content: string }
  | { type: "done" };

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const DEVICE_SIZES: Record<PreviewDevice, { width: number; height: number; label: string }> = {
  desktop: { width: 1280, height: 800, label: "Desktop" },
  tablet: { width: 768, height: 1024, label: "Tablet" },
  mobile: { width: 390, height: 844, label: "Mobile" },
};

// Tool registry types
export type ToolName =
  | "list_files"
  | "read_file"
  | "create_file"
  | "write_file"
  | "edit_file"
  | "delete_file"
  | "rename_file"
  | "create_folder"
  | "search_files"
  | "open_page"
  | "reload_page"
  | "click"
  | "type"
  | "press_key"
  | "scroll"
  | "hover"
  | "select"
  | "wait"
  | "get_dom"
  | "get_console_logs"
  | "get_page_errors"
  | "take_screenshot"
  | "run_javascript"
  | "check_page"
  | "check_console";

export const TOOL_LABELS: Record<ToolName, string> = {
  list_files: "List files",
  read_file: "Read file",
  create_file: "Create file",
  write_file: "Write file",
  edit_file: "Edit file",
  delete_file: "Delete file",
  rename_file: "Rename file",
  create_folder: "Create folder",
  search_files: "Search files",
  open_page: "Open page",
  reload_page: "Reload page",
  click: "Click element",
  type: "Type text",
  press_key: "Press key",
  scroll: "Scroll",
  hover: "Hover",
  select: "Select option",
  wait: "Wait",
  get_dom: "Get DOM",
  get_console_logs: "Get console logs",
  get_page_errors: "Get page errors",
  take_screenshot: "Take screenshot",
  run_javascript: "Run JavaScript",
  check_page: "Check page",
  check_console: "Check console",
};
