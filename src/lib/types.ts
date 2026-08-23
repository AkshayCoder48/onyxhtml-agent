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
      // Raw streaming text of the arguments — filled in as the model streams
      // the tool call. Used for live display in the tool card before the
      // arguments JSON is complete.
      argumentsText?: string;
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

export type PreviewRefreshBehavior = "auto" | "onsave" | "manual";

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
  previewRefreshBehavior: PreviewRefreshBehavior;
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
  previewRefreshBehavior: "auto",
  autoReload: true,
  consoleVisible: true,
  errorOverlay: true,
  openLinksExternally: false,
};

// Streaming events normalized from providers
export type StreamEvent =
  | { type: "reasoning_content"; content: string }
  | { type: "content"; content: string }
  | {
      type: "tool_call";
      tool: string;
      arguments: Record<string, unknown>;
      argumentsText?: string;
      callId: string;
      label?: string;
      detail?: string;
      status?: "running" | "success" | "error" | "cancelled";
    }
  | {
      type: "tool_result";
      callId: string;
      status: "success" | "error" | "cancelled";
      result?: unknown;
      error?: string;
      label?: string;
      detail?: string;
    }
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
  | "move_file"
  | "replace_content"
  | "create_folder"
  | "search_files"
  // ---- New coding-agent tools ----
  | "read_file_lines"
  | "read_file_outline"
  | "get_file_symbols"
  | "find_symbol"
  | "get_file_stats"
  | "edit_css_rule"
  | "add_css_rule"
  | "remove_css_rule"
  | "rename_class"
  | "rename_id"
  | "extract_component"
  | "find_unused_css"
  | "find_broken_links"
  | "get_dependency_graph"
  | "validate_html"
  | "validate_css"
  | "batch_edit"
  | "batch_create"
  | "get_relevant_files"
  | "search_class_usage"
  | "get_html_structure"
  | "create_plan"
  | "update_plan"
  | "ask_user"
  | "checkpoint"
  | "list_checkpoints"
  | "restore_checkpoint"
  | "get_computed_styles"
  | "get_css_variables"
  | "take_element_screenshot"
  | "generate_qr"
  | "generate_palette"
  | "optimize_image"
  | "get_images_info"
  | "get_fonts_in_use"
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
  | "get_element"
  | "inspect_element"
  | "get_console_logs"
  | "get_page_errors"
  | "get_network_errors"
  | "take_screenshot"
  | "run_javascript"
  | "browser_execute_js"
  | "browser_read_page"
  | "run_test"
  | "terminal_exec"
  | "terminal_reset"
  | "check_page"
  | "check_console"
  | "check_links"
  // ---- Testing tools ----
  | "run_unit_tests"
  | "run_integration_tests"
  | "run_e2e_test"
  | "assert_text"
  | "assert_element"
  | "assert_url"
  | "assert_title"
  | "assert_attribute"
  | "assert_visible"
  | "assert_hidden"
  | "assert_enabled"
  | "assert_disabled"
  | "assert_screenshot"
  | "test_api_endpoint"
  | "test_form"
  | "test_navigation"
  | "test_responsive_layout"
  | "test_console"
  | "test_network"
  | "test_performance"
  | "run_qa_suite";

export const TOOL_LABELS: Record<ToolName, string> = {
  list_files: "List files",
  read_file: "Read file",
  create_file: "Create file",
  write_file: "Write file",
  edit_file: "Edit file",
  delete_file: "Delete file",
  rename_file: "Rename file",
  move_file: "Move file",
  replace_content: "Replace content",
  create_folder: "Create folder",
  search_files: "Search files",
  read_file_lines: "Read lines",
  read_file_outline: "Outline",
  get_file_symbols: "Symbols",
  find_symbol: "Find symbol",
  get_file_stats: "File stats",
  edit_css_rule: "Edit CSS rule",
  add_css_rule: "Add CSS rule",
  remove_css_rule: "Remove CSS rule",
  rename_class: "Rename class",
  rename_id: "Rename id",
  extract_component: "Extract component",
  find_unused_css: "Unused CSS",
  find_broken_links: "Broken links",
  get_dependency_graph: "Dependency graph",
  validate_html: "Validate HTML",
  validate_css: "Validate CSS",
  batch_edit: "Batch edit",
  batch_create: "Batch create",
  get_relevant_files: "Relevant files",
  search_class_usage: "Class usage",
  get_html_structure: "HTML structure",
  create_plan: "Create plan",
  update_plan: "Update plan",
  ask_user: "Ask user",
  checkpoint: "Checkpoint",
  list_checkpoints: "List checkpoints",
  restore_checkpoint: "Restore checkpoint",
  get_computed_styles: "Computed styles",
  get_css_variables: "CSS variables",
  take_element_screenshot: "Element screenshot",
  generate_qr: "Generate QR",
  generate_palette: "Generate palette",
  optimize_image: "Optimize image",
  get_images_info: "Images info",
  get_fonts_in_use: "Fonts in use",
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
  get_element: "Get element",
  inspect_element: "Inspect element",
  get_console_logs: "Get console logs",
  get_page_errors: "Get page errors",
  get_network_errors: "Get network errors",
  take_screenshot: "Take screenshot",
  run_javascript: "Run JavaScript",
  browser_execute_js: "Execute JS",
  browser_read_page: "Read page",
  run_test: "Run test",
  terminal_exec: "Terminal exec",
  terminal_reset: "Terminal reset",
  check_page: "Check page",
  check_console: "Check console",
  check_links: "Check links",
  run_unit_tests: "Run unit tests",
  run_integration_tests: "Run integration tests",
  run_e2e_test: "Run E2E test",
  assert_text: "Assert text",
  assert_element: "Assert element",
  assert_url: "Assert URL",
  assert_title: "Assert title",
  assert_attribute: "Assert attribute",
  assert_visible: "Assert visible",
  assert_hidden: "Assert hidden",
  assert_enabled: "Assert enabled",
  assert_disabled: "Assert disabled",
  assert_screenshot: "Assert screenshot",
  test_api_endpoint: "Test API endpoint",
  test_form: "Test form",
  test_navigation: "Test navigation",
  test_responsive_layout: "Test responsive layout",
  test_console: "Test console",
  test_network: "Test network",
  test_performance: "Test performance",
  run_qa_suite: "QA suite",
};
