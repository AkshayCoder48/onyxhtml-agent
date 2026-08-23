import { db } from "@/lib/db";
import { safePath } from "@/lib/files";
import { TOOL_LABELS, ToolName } from "@/lib/types";
import {
  getLines,
  outlineHtml,
  extractSymbols,
  findSymbolAcrossFiles,
  findUnusedCss,
  getDependencyGraph,
  validateHtml,
  editCssRule,
  addCssRule,
  removeCssRule,
  renameClassAcrossFiles,
  getRelevantFiles,
} from "./tools/code-intel";

// OpenAI function-calling tool spec
export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

const BROWSER_TOOLS: ToolName[] = [
  "open_page",
  "reload_page",
  "click",
  "type",
  "press_key",
  "scroll",
  "hover",
  "select",
  "wait",
  "get_dom",
  "get_element",
  "inspect_element",
  "get_console_logs",
  "get_page_errors",
  "get_network_errors",
  "take_screenshot",
  "run_javascript",
  "browser_execute_js",
  "browser_read_page",
  "run_test",
  "terminal_exec",
  "terminal_reset",
  "check_page",
  "check_console",
  "check_links",
  "get_computed_styles",
  "get_css_variables",
  "take_element_screenshot",
  "get_images_info",
  "get_fonts_in_use",
  "generate_qr",
  "generate_palette",
  // ---- Testing tools (executed client-side in the preview iframe) ----
  "run_unit_tests",
  "run_integration_tests",
  "run_e2e_test",
  "assert_text",
  "assert_element",
  "assert_url",
  "assert_title",
  "assert_attribute",
  "assert_visible",
  "assert_hidden",
  "assert_enabled",
  "assert_disabled",
  "assert_screenshot",
  "test_api_endpoint",
  "test_form",
  "test_navigation",
  "test_responsive_layout",
  "test_console",
  "test_network",
  "test_performance",
  "run_qa_suite",
];

export function isBrowserTool(name: string): boolean {
  return (BROWSER_TOOLS as string[]).includes(name);
}

export function isFileTool(name: string): boolean {
  return !isBrowserTool(name);
}

// Get the OpenAI-format tool definitions passed to the provider.
export function getToolDefinitions(): ToolDefinition[] {
  return [
    // ---------- File tools ----------
    {
      type: "function",
      function: {
        name: "list_files",
        description:
          "List all file paths in the current workspace. Returns an array of relative paths. Use this to see what files exist before reading or editing.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description:
          "Read the full text content of a file in the workspace. Use this to inspect existing HTML, CSS, or JS before editing.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Relative path of the file, e.g. 'index.html' or 'assets/app.js'. Must not contain '..' or start with '/'.",
            },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_file",
        description:
          "Create a NEW file with the given content. If a file at the path already exists it will be overwritten. Use write_file or edit_file to modify existing files.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Relative path for the new file, e.g. 'pages/about.html'.",
            },
            content: {
              type: "string",
              description: "The full text content to write.",
            },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description:
          "Overwrite an existing file's content entirely. Use edit_file for targeted changes; use this only when replacing the whole file.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path of the file to overwrite." },
            content: { type: "string", description: "The new full content." },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "edit_file",
        description:
          "Replace the first occurrence of `oldContent` with `newContent` inside an existing file. Use this for precise, surgical edits. The oldContent must match exactly (including whitespace).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path of the file to edit." },
            oldContent: {
              type: "string",
              description: "The exact text to find (must match exactly, including indentation).",
            },
            newContent: {
              type: "string",
              description: "The text to replace it with.",
            },
          },
          required: ["path", "oldContent", "newContent"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_file",
        description:
          "Delete a file or a folder (folder deletion removes all files whose path starts with the folder prefix).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path of the file or folder to delete." },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "rename_file",
        description: "Rename or move a file from `from` to `to`. Both paths must be relative.",
        parameters: {
          type: "object",
          properties: {
            from: { type: "string", description: "Current relative path." },
            to: { type: "string", description: "New relative path." },
          },
          required: ["from", "to"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "move_file",
        description:
          "Move a file or folder from `from` to `to`. Equivalent to rename_file: when `from` is a folder, all of its children are moved as well. Both paths must be relative.",
        parameters: {
          type: "object",
          properties: {
            from: { type: "string", description: "Current relative path of the file or folder." },
            to: { type: "string", description: "New relative path." },
          },
          required: ["from", "to"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "replace_content",
        description:
          "Replace occurrences of `find` with `replace` inside an existing file. By default replaces ALL occurrences (all=true). Set all=false to replace only the first occurrence. Returns the count of replacements made.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path of the file to edit." },
            find: { type: "string", description: "The exact text to find (must not be empty)." },
            replace: { type: "string", description: "The text to substitute for each match." },
            all: {
              type: "boolean",
              description: "If true (default), replace every occurrence. If false, replace only the first.",
            },
          },
          required: ["path", "find", "replace"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_folder",
        description:
          "Create a folder by placing a `.gitkeep` file inside it. Folders are implicit in the workspace; this just ensures the folder shows up in the tree.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path of the folder to create." },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_files",
        description:
          "Search file contents for a case-insensitive query. Returns up to 50 matches with path, 1-based line number, and the matching line text.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The text to search for." },
          },
          required: ["query"],
        },
      },
    },
    // ---------- New coding-agent file tools (free, local) ----------
    {
      type: "function",
      function: {
        name: "read_file_lines",
        description:
          "Read a specific line range from a file. Use this to save tokens — read 20 lines at a time instead of the whole file. Returns {path, lines[], startLine, endLine, totalLines}.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path" },
            startLine: { type: "number", description: "1-based start line (default 1)" },
            endLine: { type: "number", description: "1-based end line inclusive (default start+50)" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file_outline",
        description:
          "Get a lightweight outline of an HTML/CSS/JS file: tag tree for HTML, selectors for CSS, functions for JS. Much smaller than full file, ideal for planning. Returns {path, outline}.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_file_symbols",
        description:
          "Extract all symbols from a file: ids, classes, tags, functions, variables, selectors, imports. Free local AST via regex. Returns {path, symbols}.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "find_symbol",
        description:
          "Find where a symbol (class, id, function, text) is used across all workspace files. Returns up to 100 matches with path, line, text, type.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Symbol to search, e.g. 'hero', 'btn-primary'" },
          },
          required: ["symbol"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_file_stats",
        description: "Get stats for a file: lines, size, TODO count, complexity hint.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "edit_css_rule",
        description:
          "Surgically edit a CSS rule: set property=value for a selector. If selector doesn't exist, it will be appended. Free, no token waste. Use instead of edit_file for CSS.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "CSS file path" },
            selector: { type: "string", description: "CSS selector, e.g. '.hero', '#app', 'h1'" },
            property: { type: "string", description: "CSS property, e.g. 'color', 'background'" },
            value: { type: "string", description: "CSS value, e.g. 'red', '16px'" },
          },
          required: ["path", "selector", "property", "value"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_css_rule",
        description: "Append a new CSS rule to a CSS file.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "CSS file path" },
            selector: { type: "string", description: "Selector" },
            declarations: { type: "string", description: "Declarations inside, e.g. 'color: red; font-size: 16px;'" },
          },
          required: ["path", "selector", "declarations"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "remove_css_rule",
        description: "Remove a CSS rule by selector from a CSS file.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "CSS file path" },
            selector: { type: "string", description: "Selector to remove" },
          },
          required: ["path", "selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "rename_class",
        description:
          "Rename a CSS class across ALL files (HTML, CSS, JS). One tool call renames everywhere. Returns list of changed files.",
        parameters: {
          type: "object",
          properties: {
            oldName: { type: "string", description: "Old class name without dot" },
            newName: { type: "string", description: "New class name without dot" },
          },
          required: ["oldName", "newName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "rename_id",
        description: "Rename an ID across all files.",
        parameters: {
          type: "object",
          properties: {
            oldName: { type: "string", description: "Old id without #" },
            newName: { type: "string", description: "New id" },
          },
          required: ["oldName", "newName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "find_unused_css",
        description:
          "Find unused CSS selectors by comparing HTML classes/ids vs CSS. Free local analysis. Returns {unused: [{path, selector, type}]}.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_dependency_graph",
        description: "Get dependency graph of files: nodes and edges (which HTML imports which CSS/JS). Returns {nodes, edges}.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "validate_html",
        description: "Validate HTML file for unclosed tags, duplicate ids, mismatched tags. Returns {path, errors[]}.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "HTML file path" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "batch_edit",
        description:
          "Apply multiple surgical edits atomically. Each edit is {path, oldContent, newContent}. More efficient than multiple edit_file calls. Returns {edited, failed}.",
        parameters: {
          type: "object",
          properties: {
            edits: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  oldContent: { type: "string" },
                  newContent: { type: "string" },
                },
                required: ["path", "oldContent", "newContent"],
              },
            },
          },
          required: ["edits"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "batch_create",
        description: "Create multiple files at once. Returns {created}.",
        parameters: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  content: { type: "string" },
                },
                required: ["path", "content"],
              },
            },
          },
          required: ["files"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_relevant_files",
        description:
          "Find most relevant files for a query using keyword scoring (free, local). Returns top 5 files with score. Use to reduce context.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Query, e.g. 'hero section'" },
            limit: { type: "number", description: "Max results, default 5" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_class_usage",
        description: "Search where a CSS class is used across HTML files. Returns matches.",
        parameters: {
          type: "object",
          properties: {
            className: { type: "string", description: "Class name without dot" },
          },
          required: ["className"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_html_structure",
        description: "Get HTML file structure as JSON tree (tag, id, classes, line, children). Lightweight, token-efficient.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "HTML file path" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_plan",
        description:
          "Create a plan before coding. Returns plan object that UI renders as interactive checklist (onyx:plan). Steps: [{id, title, file, status}]. Use this to show user what you will do and get approval.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Plan title" },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  file: { type: "string", description: "File to edit" },
                  status: { type: "string", enum: ["todo", "doing", "done", "error"], description: "Default todo" },
                  description: { type: "string" },
                },
                required: ["id", "title"],
              },
            },
          },
          required: ["title", "steps"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "ask_user",
        description:
          "Ask user a clarification question with options. UI renders as buttons (onyx:ask-user). Use when intent is ambiguous. Returns user choice via next message.",
        parameters: {
          type: "object",
          properties: {
            question: { type: "string", description: "Question to ask" },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Options, e.g. ['Minimal','Bold','Playful']",
            },
          },
          required: ["question", "options"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "checkpoint",
        description: "Save current workspace as a checkpoint version with message. Enables rollback.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "Checkpoint message" },
          },
          required: ["message"],
        },
      },
    },
    // ---------- Browser tools (executed client-side) ----------
    {
      type: "function",
      function: {
        name: "open_page",
        description:
          "Open a URL in the preview iframe. If `url` is omitted, opens the workspace entry HTML file. Use this to navigate to a specific page in the preview.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Optional URL or relative path to open. Defaults to the entry file (index.html).",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reload_page",
        description: "Reload the current preview page.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "click",
        description:
          "Click an element matched by a CSS selector in the preview. Use a specific selector to avoid ambiguity.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of the element to click." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "type",
        description: "Type text into an input or textarea element matched by a CSS selector.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of the input element." },
            text: { type: "string", description: "Text to type into the field." },
          },
          required: ["selector", "text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "press_key",
        description:
          "Press a keyboard key (e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown'). Dispatches a keydown+keyup event.",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "Key name, e.g. 'Enter', 'Escape', 'a'." },
          },
          required: ["key"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "scroll",
        description:
          "Scroll the page (or a specific element) by x,y pixels. If no selector is provided, scrolls the window.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "Optional CSS selector of the scroll container." },
            x: { type: "number", description: "Horizontal pixels to scroll." },
            y: { type: "number", description: "Vertical pixels to scroll." },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "hover",
        description: "Hover an element matched by a CSS selector (dispatches mouseenter + mouseover).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of the element to hover." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "select",
        description: "Select an option by value in a <select> element matched by a CSS selector.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of the <select> element." },
            value: { type: "string", description: "The option value to select." },
          },
          required: ["selector", "value"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "wait",
        description: "Wait for a fixed number of milliseconds before continuing (useful for animations or async ops).",
        parameters: {
          type: "object",
          properties: {
            ms: { type: "number", description: "Milliseconds to wait (max 10000)." },
          },
          required: ["ms"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_dom",
        description:
          "Return the serialized HTML of the document (or of the first element matching the selector). Useful for inspecting the rendered DOM.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "Optional CSS selector. If omitted, returns the full document HTML." },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_element",
        description:
          "Return the outerHTML of the first element matching the given CSS selector, along with a summary of its computed style (display, visibility, opacity, position, color, background).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of the element to retrieve." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "inspect_element",
        description:
          "Inspect a single element matched by a CSS selector. Returns tag name, attributes, text content, bounding client rect, and key computed style properties (display, visibility, opacity, position, color, backgroundColor).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of the element to inspect." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_console_logs",
        description: "Return the list of console messages captured from the preview (log/info/warn/error).",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_page_errors",
        description: "Return the list of runtime page errors (uncaught exceptions and resource load failures).",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_network_errors",
        description:
          "Return the list of failed resource loads captured by the preview (LINK, SCRIPT, IMG that failed to load). Each entry has url, type, status=0, and a timestamp.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "take_screenshot",
        description: "Capture a screenshot of the preview as a base64 PNG data URL.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "run_javascript",
        description:
          "Run arbitrary JavaScript inside the preview iframe. The code runs in the page's window context. Return values are JSON-serialized. Use this to inspect state or test behavior.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "JavaScript code to evaluate inside the preview." },
          },
          required: ["code"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "browser_execute_js",
        description:
          "Execute AI-generated JavaScript in the page context of the live preview and return a structured result. This is the primary browser-automation tool: click elements, fill and submit forms, scroll, wait for elements, read state, extract structured data, call page functions, or verify UI. The code runs with `document`, `window`, and all page globals in scope; `await`/promises are supported and `return` sends a value back. Console output (log/info/warn/error) is captured into `stdout`. Returns `{ success, result, url, title, stdout, error? }`. Prefer a `return` statement so the value lands in `result`.",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description:
                "JavaScript to run in the page. May be async (`await` is supported). Use `return` to return a result; the value is JSON-serialized into `result`.",
            },
          },
          required: ["code"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "browser_read_page",
        description:
          "Observe the current preview page without changing it. Returns the page URL, title, readyState, visible text (up to 8000 chars), the main <h1>, a list of headings, form controls (input/textarea/select/button with type/name/id/placeholder), links (href + text), and counts of captured page errors and console logs. Use this as the 'observe' step of observe → execute → verify before and after browser_execute_js actions.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "run_test",
        description:
          "Run a small test suite against the preview. Each assertion evaluates `code` inside the preview and compares the result (stringified) to `expected` when provided. Returns an array of { label, pass, actual, expected }.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Optional name for the test run." },
            assertions: {
              type: "array",
              description: "List of assertions to evaluate inside the preview.",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Human-readable label for the assertion." },
                  code: { type: "string", description: "JavaScript expression to evaluate." },
                  expected: { type: "string", description: "Optional expected value (stringified). If omitted, the assertion passes as long as code does not throw." },
                },
                required: ["label", "code"],
              },
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "terminal_exec",
        description:
          "Execute JavaScript code in the browser preview as if typed into a dev-tools console (a real terminal). Use this to interactively inspect the page state, run debugging commands, evaluate expressions, call site functions, read variables, and chain multi-step REPL sessions. State persists across calls: use `term.set(\"x\", value)` to save a value and `term.get(\"x\")` to retrieve it later. `document`, `window`, and all globals are in scope. The return value is the last evaluated expression; captured console.log/info/warn/error output is returned in `stdout`. Prefer this over `run_javascript` when you want a conversational terminal-style debugging flow.",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript code to evaluate in the preview's global scope. Multiple statements are allowed; the value of the last expression is returned.",
            },
          },
          required: ["code"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "terminal_reset",
        description:
          "Clear the terminal session state in the preview (drops all variables saved via `term.set(...)` and the command history). Use this to start a fresh debugging session without leftover state.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "check_page",
        description:
          "Convenience tool: open the entry page (if not already), wait briefly, then return a summary of the visible text and console logs. Use to verify a page renders without errors.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "check_console",
        description: "Convenience tool: return both console logs and page errors in a single call.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "check_links",
        description:
          "Collect every <a href> element in the preview and return its href, trimmed text, and type (absolute, relative, anchor, or mailto). Useful for auditing navigation and dead links.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_computed_styles",
        description: "Get computed styles for an element matched by selector. Returns display, color, background, etc.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector" },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_css_variables",
        description: "Get all CSS variables (:root and computed) from the page. Returns {variables}.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "take_element_screenshot",
        description: "Take a screenshot of a single element via SVG foreignObject. Returns dataUrl and dimensions.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of element to capture" },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_images_info",
        description: "Get info about all images on page: src, alt, size, broken. Returns {images[]}.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_fonts_in_use",
        description: "Get list of fonts in use on the page. Returns {fonts[]}.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_qr",
        description:
          "Generate a QR code SVG file in workspace for given text. Free, local. Returns {path, dataUrl}. Uses qrcode library via canvas-free generation.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text/URL to encode" },
            path: { type: "string", description: "Output path, e.g. 'assets/qr.svg' (default 'assets/qr.svg')" },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_palette",
        description:
          "Generate a color palette from a mood or base color. Free, local. Returns {palette: string[], name}. Can be applied to CSS variables.",
        parameters: {
          type: "object",
          properties: {
            mood: { type: "string", description: "Mood e.g. 'coffee shop', 'cyberpunk', 'minimal'" },
            baseColor: { type: "string", description: "Optional base hex color" },
            count: { type: "number", description: "Number of colors, default 5" },
          },
          required: ["mood"],
        },
      },
    },
    // =========================================================
    // Testing tools
    // =========================================================
    {
      type: "function",
      function: {
        name: "assert_text",
        description:
          "Assert that the page contains (or does not contain) the given text. Returns { pass, message, actual? }. Use after an interaction to verify visible UI state.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text to look for." },
            selector: {
              type: "string",
              description:
                "Optional CSS selector to scope the search to a single element (e.g. 'h1', '.toast'). If omitted, searches the whole document body.",
            },
            contains: {
              type: "boolean",
              description:
                "If true (default), pass when the text IS present. If false, pass when the text is ABSENT.",
            },
            caseSensitive: {
              type: "boolean",
              description: "Whether the match is case-sensitive. Default false.",
            },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_element",
        description:
          "Assert that an element matching the CSS selector exists (or does not exist). Returns { pass, message, count }.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector to test." },
            exists: {
              type: "boolean",
              description:
                "If true (default), pass when at least one element matches. If false, pass when NO element matches.",
            },
            count: {
              type: "number",
              description:
                "Optional exact number of matching elements expected. If provided, `exists` is ignored.",
            },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_url",
        description:
          "Assert that the current page URL matches the expected value. Match can be 'exact', 'contains', 'prefix', 'suffix', or 'regex'. Returns { pass, message, actual }.",
        parameters: {
          type: "object",
          properties: {
            expected: { type: "string", description: "Expected URL or pattern." },
            match: {
              type: "string",
              enum: ["exact", "contains", "prefix", "suffix", "regex"],
              description: "How to compare. Default 'contains'.",
            },
          },
          required: ["expected"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_title",
        description:
          "Assert that document.title matches the expected value. Supports exact/contains/regex matching.",
        parameters: {
          type: "object",
          properties: {
            expected: { type: "string", description: "Expected title or pattern." },
            match: {
              type: "string",
              enum: ["exact", "contains", "regex"],
              description: "Comparison mode. Default 'contains'.",
            },
          },
          required: ["expected"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_attribute",
        description:
          "Assert that an element's attribute equals (or contains) an expected value. Returns { pass, message, actual }.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector." },
            attribute: { type: "string", description: "Attribute name, e.g. 'href', 'aria-label', 'disabled'." },
            expected: { type: "string", description: "Expected value." },
            match: {
              type: "string",
              enum: ["exact", "contains", "exists", "regex"],
              description:
                "'exists' passes as long as the attribute is present (value ignored). Default 'exact'.",
            },
          },
          required: ["selector", "attribute"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_visible",
        description:
          "Assert that the element matching the selector is visible (in the DOM, not display:none, not visibility:hidden, and has non-zero size).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_hidden",
        description:
          "Assert that the element matching the selector is hidden (not in DOM, display:none, visibility:hidden, or zero size).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_enabled",
        description:
          "Assert that the element (typically a button or input) is enabled (does not have the `disabled` property/attribute).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_disabled",
        description:
          "Assert that the element (typically a button or input) is disabled (has the `disabled` property/attribute).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "assert_screenshot",
        description:
          "Capture a viewport screenshot (SVG + DOM snapshot) for visual verification. This is a non-throwing observation tool — it returns the dataUrl and a text DOM snapshot so you (or a human) can compare it. Pair with take_screenshot for before/after.",
        parameters: {
          type: "object",
          properties: {
            selector: {
              type: "string",
              description:
                "Optional CSS selector; if provided, captures only that element's outerHTML in the snapshot.",
            },
            fullPage: {
              type: "boolean",
              description: "If true, include the full document height. Default false (viewport only).",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_api_endpoint",
        description:
          "Issue a fetch() from the preview context and return status, headers, and a parsed/stringified body. Use to test REST/JSON endpoints the page talks to. Relative URLs resolve against the preview origin.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "Absolute or relative URL." },
            method: { type: "string", description: "HTTP method. Default 'GET'." },
            headers: {
              type: "object",
              description: "Optional request headers as key/value pairs.",
              additionalProperties: { type: "string" },
            },
            body: { type: "string", description: "Optional request body (string)." },
            expectStatus: {
              type: "number",
              description: "If provided, the test fails when the response status does not equal this.",
            },
            expectJson: {
              type: "boolean",
              description: "If true, attempt to JSON-parse the response body and return it.",
            },
            timeoutMs: { type: "number", description: "Request timeout in ms (default 10000)." },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_form",
        description:
          "Programmatically fill a form's fields, optionally submit it, and return validation/submission results. Fields is an array of { selector, value }.",
        parameters: {
          type: "object",
          properties: {
            formSelector: { type: "string", description: "CSS selector for the <form>." },
            fields: {
              type: "array",
              description: "Fields to fill.",
              items: {
                type: "object",
                properties: {
                  selector: { type: "string", description: "CSS selector for the input/textarea/select." },
                  value: {
                    description: "Value to set. For checkboxes use true/false; for <select> use the option value.",
                  },
                },
                required: ["selector"],
              },
            },
            submit: {
              type: "boolean",
              description: "If true (default), call form.requestSubmit() after filling. If false, only fill fields.",
            },
            waitMs: {
              type: "number",
              description: "Milliseconds to wait after submit before collecting state (default 300).",
            },
          },
          required: ["formSelector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_navigation",
        description:
          "Click a link/button and verify the resulting URL/title. Returns before/after URL and title, plus whether the expected destination was reached.",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector for the link/button to click." },
            expectUrl: { type: "string", description: "Expected URL after click (substring match)." },
            expectTitle: { type: "string", description: "Optional expected title after click (substring match)." },
            waitMs: { type: "number", description: "Wait after click (default 500ms)." },
          },
          required: ["selector"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_responsive_layout",
        description:
          "Evaluate layout at multiple viewport sizes WITHOUT changing the real window. Uses a hidden iframe at each width to load the current page and reports overflow, horizontal scroll, and visible element counts. Returns one report per breakpoint.",
        parameters: {
          type: "object",
          properties: {
            widths: {
              type: "array",
              items: { type: "number" },
              description: "Viewport widths in px to test. Default [390, 768, 1024, 1280].",
            },
            height: { type: "number", description: "Viewport height (default 800)." },
            url: { type: "string", description: "Optional URL to load; defaults to current location.href." },
            waitMs: { type: "number", description: "Per-size settle time in ms (default 400)." },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_console",
        description:
          "Assert the preview's captured console output. Filter by level (log/info/warn/error) and an optional substring/regex. Returns { pass, matching[], total }.",
        parameters: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["error", "warn", "log", "info", "any"],
              description: "Only consider messages at this level. Default 'error'.",
            },
            contains: { type: "string", description: "Only count messages whose text contains this substring." },
            regex: { type: "string", description: "Only count messages matching this regex string." },
            maxCount: {
              type: "number",
              description:
                "If provided, pass only when the number of matching messages is <= this value (use 0 to assert no errors).",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_network",
        description:
          "Return the captured failed network requests (resource load errors + failed fetches). Optionally assert that no failures occurred, or that failures do not match a URL pattern.",
        parameters: {
          type: "object",
          properties: {
            expectNone: { type: "boolean", description: "If true, fail when ANY failed request exists." },
            urlContains: {
              type: "string",
              description:
                "If provided (along with expectNone), only failures whose URL contains this substring fail the assertion.",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_performance",
        description:
          "Collect browser performance metrics via the PerformanceObserver / Navigation Timing API: domContentLoaded, loadEventEnd, transferSize, number of long tasks (>50ms), and basic paint timings (first-paint, first-contentful-paint when available).",
        parameters: {
          type: "object",
          properties: {
            waitMs: {
              type: "number",
              description: "How long to observe long tasks before reading, in ms (default 1000).",
            },
            maxLoadMs: {
              type: "number",
              description: "If provided, fail if loadEventEnd > maxLoadMs.",
            },
            maxLongTasks: {
              type: "number",
              description: "If provided, fail if more than this many long tasks occurred.",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_unit_tests",
        description:
          "Run an array of inline unit-test assertions. Each item is { name, code } where `code` is a JavaScript expression evaluated in the page. If an expression throws or returns false, the test fails; otherwise it passes. Returns a structured { passed, failed, total, results } report. Use this for pure-function / component-level checks.",
        parameters: {
          type: "object",
          properties: {
            tests: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  code: {
                    type: "string",
                    description:
                      "JS expression. Return true/undefined for pass, throw or return false for fail.",
                  },
                },
                required: ["name", "code"],
              },
            }
          },
          required: ["tests"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_integration_tests",
        description:
          "Run multi-step integration scenarios. Each step is { name, action, assert }. `action` is JS code executed first (e.g. click a button), then `assert` is a JS expression that must return true. Steps run in order with an optional wait between them. Returns pass/fail per step plus the overall result.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Optional suite name." },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  action: { type: "string", description: "JS code to run (statement(s)). May be async." },
                  assert: {
                    type: "string",
                    description: "JS expression that must return a truthy value.",
                  },
                  waitMs: { type: "number", description: "Wait before the assert (default 100)." },
                },
                required: ["name"],
              },
            },
          },
          required: ["steps"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_e2e_test",
        description:
          "Run a complete end-to-end user-flow script. `script` is an async JavaScript function body (no `function` wrapper) executed in the page context; it can use `await`, click elements, fill forms, and call the global `assert(condition, message)` helper that throws on failure. Returns { pass, error?, steps[] } with each assertion's result.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Optional flow name." },
            script: {
              type: "string",
              description:
                "Async function body. Use `await`, `document.querySelector(...)`, etc. Call `assert(cond, msg)` to record assertions. Return value is ignored.",
            },
            timeoutMs: { type: "number", description: "Overall timeout in ms (default 15000)." },
          },
          required: ["script"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_qa_suite",
        description:
          "Run the built-in web-dev QA suite against the live preview and return a structured report. Checks: document ready, visible content, title, headings, viewport meta, page/console/network errors, image alt, form labels, horizontal overflow, plus any requiredSelectors / requiredText you pass. Returns { pass, score, passed, failed, total, checks[], failedChecks[], errors, suggestions[], report }. Call this after every meaningful change (TEST phase). If pass is false, AUTO-FIX using suggestions then re-run this tool.",
        parameters: {
          type: "object",
          properties: {
            requiredSelectors: {
              type: "array",
              items: { type: "string" },
              description: "CSS selectors that must exist (e.g. ['h1', 'nav', 'footer']).",
            },
            requiredText: {
              type: "array",
              items: { type: "string" },
              description: "Visible text snippets that must appear on the page.",
            },
          },
          required: [],
        },
      },
    },
  ];
}

// Build a short human hint for a tool call, used in tool_call/tool_result events.
export function getToolDetail(name: string, args: Record<string, unknown>): string {
  try {
    switch (name) {
      case "list_files":
        return "all files";
      case "read_file":
      case "create_file":
      case "write_file":
      case "edit_file":
      case "delete_file":
      case "create_folder":
      case "read_file_lines":
      case "read_file_outline":
      case "get_file_symbols":
      case "get_file_stats":
      case "validate_html":
      case "get_html_structure":
        return String(args.path ?? "");
      case "rename_file":
      case "move_file":
        return `${args.from ?? ""} → ${args.to ?? ""}`;
      case "replace_content":
        return String(args.path ?? "");
      case "search_files":
      case "find_symbol":
      case "search_class_usage":
      case "get_relevant_files":
        return String(args.query ?? args.symbol ?? args.className ?? "");
      case "edit_css_rule":
      case "add_css_rule":
      case "remove_css_rule":
        return `${String(args.path ?? "")} ${String(args.selector ?? "")}`;
      case "rename_class":
      case "rename_id":
        return `${args.oldName ?? ""} → ${args.newName ?? ""}`;
      case "find_unused_css":
      case "get_dependency_graph":
        return "analysis";
      case "batch_edit":
        return `${Array.isArray(args.edits) ? args.edits.length : 0} edits`;
      case "batch_create":
        return `${Array.isArray(args.files) ? args.files.length : 0} files`;
      case "create_plan":
        return String(args.title ?? "plan");
      case "ask_user":
        return String(args.question ?? "").slice(0, 60);
      case "checkpoint":
        return String(args.message ?? "checkpoint");
      case "open_page":
        return typeof args.url === "string" ? args.url : "preview";
      case "reload_page":
        return "reload";
      case "click":
      case "hover":
      case "get_dom":
      case "get_element":
      case "inspect_element":
        return String(args.selector ?? "");
      case "type":
        return String(args.selector ?? "");
      case "press_key":
        return String(args.key ?? "");
      case "scroll":
        return args.selector ? String(args.selector) : "window";
      case "select":
        return String(args.selector ?? "");
      case "wait":
        return `${args.ms ?? 0}ms`;
      case "take_screenshot":
        return "screenshot";
      case "run_javascript":
        return "JS";
      case "browser_execute_js":
        return String(args.code ?? "")
          .split("\n")[0]
          .slice(0, 60);
      case "browser_read_page":
        return "page";
      case "run_test":
        return typeof args.name === "string" ? args.name : "test";
      case "terminal_exec":
        // Show the first line of the code as the detail (truncated).
        return String(args.code ?? "")
          .split("\n")[0]
          .slice(0, 60);
      case "terminal_reset":
        return "clear";
      case "get_console_logs":
        return "console";
      case "get_page_errors":
        return "errors";
      case "get_network_errors":
        return "network";
      case "check_page":
        return "page";
      case "check_console":
        return "console";
      case "check_links":
        return "links";
      // ---- Testing tools ----
      case "run_unit_tests":
        return "unit tests";
      case "run_integration_tests":
        return "integration";
      case "run_e2e_test":
        return "e2e";
      case "assert_text":
        return String(args.text ?? "").slice(0, 60);
      case "assert_element":
        return String(args.selector ?? "");
      case "assert_url":
        return String(args.expected ?? "");
      case "assert_title":
        return String(args.expected ?? "");
      case "assert_attribute":
        return `${String(args.attribute ?? "")} of ${String(args.selector ?? "")}`;
      case "assert_visible":
      case "assert_hidden":
      case "assert_enabled":
      case "assert_disabled":
        return String(args.selector ?? "");
      case "assert_screenshot":
        return "screenshot";
      case "test_api_endpoint":
        return `${String(args.method ?? "GET")} ${String(args.url ?? "")}`;
      case "test_form":
        return String(args.formSelector ?? "");
      case "test_navigation":
        return String(args.selector ?? "");
      case "test_responsive_layout":
        return "responsive";
      case "test_console":
        return String(args.level ?? "error");
      case "test_network":
        return "network";
      case "test_performance":
        return "performance";
      case "run_qa_suite":
        return "qa suite";
      default:
        return "";
    }
  } catch {
    return "";
  }
}

export function getToolLabel(name: string): string {
  return (TOOL_LABELS as Record<string, string>)[name] ?? name;
}

// ---------- Server-side file tool executor ----------

export async function executeFileTool(
  name: string,
  args: Record<string, unknown>,
  workspaceId: string
): Promise<unknown> {
  switch (name) {
    case "list_files": {
      const files = await db.file.findMany({
        where: { workspaceId },
        select: { path: true },
        orderBy: { path: "asc" },
      });
      return { paths: files.map((f) => f.path) };
    }
    case "read_file": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = await db.file.findUnique({
        where: { workspaceId_path: { workspaceId, path } },
      });
      if (!file) throw new Error(`File not found: ${path}`);
      const lines = file.content.split("\n").length;
      return { path: file.path, content: file.content, lines };
    }
    case "create_file":
    case "write_file": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const content = String(args.content ?? "");
      const isBinary = false;
      const file = await db.file.upsert({
        where: { workspaceId_path: { workspaceId, path } },
        update: { content, isBinary },
        create: { workspaceId, path, content, isBinary },
      });
      return { path: file.path };
    }
    case "edit_file": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const oldContent = String(args.oldContent ?? "");
      const newContent = String(args.newContent ?? "");
      const file = await db.file.findUnique({
        where: { workspaceId_path: { workspaceId, path } },
      });
      if (!file) throw new Error(`File not found: ${path}`);
      const idx = file.content.indexOf(oldContent);
      if (idx === -1) {
        throw new Error(
          `oldContent not found in ${path}. Make sure it matches exactly (including whitespace).`
        );
      }
      const next =
        file.content.slice(0, idx) + newContent + file.content.slice(idx + oldContent.length);
      await db.file.update({
        where: { id: file.id },
        data: { content: next },
      });
      return { path, replaced: 1 };
    }
    case "delete_file": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const prefix = path.endsWith("/") ? path : path + "/";
      await db.file.deleteMany({
        where: {
          workspaceId,
          OR: [{ path }, { path: { startsWith: prefix } }],
        },
      });
      return { path };
    }
    case "rename_file":
    case "move_file": {
      const from = safePath(String(args.from ?? ""));
      const to = safePath(String(args.to ?? ""));
      if (!from || !to) throw new Error("Invalid path");
      if (from === to) throw new Error("Source and destination are the same");
      const existing = await db.file.findUnique({
        where: { workspaceId_path: { workspaceId, path: from } },
      });
      const children = await db.file.findMany({
        where: { workspaceId, path: { startsWith: from + "/" } },
      });
      if (!existing && children.length === 0) {
        throw new Error(`File or folder not found: ${from}`);
      }
      const destExists = await db.file.findUnique({
        where: { workspaceId_path: { workspaceId, path: to } },
      });
      if (destExists) throw new Error(`Destination already exists: ${to}`);
      // If `from` is a folder, also reject if `to` is inside `from` (would create a cycle).
      if (children.length > 0 && (to + "/").startsWith(from + "/")) {
        throw new Error("Cannot move a folder into itself");
      }

      await db.$transaction(async (tx) => {
        if (existing) {
          await tx.file.update({
            where: { id: existing.id },
            data: { path: to },
          });
        }
        for (const child of children) {
          const newChildPath = to + child.path.slice(from.length);
          await tx.file.update({
            where: { id: child.id },
            data: { path: newChildPath },
          });
        }
      });
      return { from, to };
    }
    case "replace_content": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const find = String(args.find ?? "");
      if (!find) throw new Error("`find` must not be empty");
      const replace = String(args.replace ?? "");
      const all = args.all !== false; // default true
      const file = await db.file.findUnique({
        where: { workspaceId_path: { workspaceId, path } },
      });
      if (!file) throw new Error(`File not found: ${path}`);
      const content = file.content;
      let count = 0;
      let next: string;
      if (all) {
        if (find === replace) {
          // No-op but still count occurrences for the response.
          count = content.split(find).length - 1;
          next = content;
        } else {
          // Use split/join to replace all occurrences without regex escaping concerns.
          const parts = content.split(find);
          count = parts.length - 1;
          next = parts.join(replace);
        }
      } else {
        const idx = content.indexOf(find);
        if (idx === -1) {
          throw new Error(
            `Text not found in ${path}. Make sure \`find\` matches exactly (including whitespace).`
          );
        }
        next = content.slice(0, idx) + replace + content.slice(idx + find.length);
        count = 1;
      }
      if (count === 0) {
        throw new Error(
          `Text not found in ${path}. Make sure \`find\` matches exactly (including whitespace).`
        );
      }
      await db.file.update({
        where: { id: file.id },
        data: { content: next },
      });
      return { path, replaced: count };
    }
    case "create_folder": {
      const folder = safePath(String(args.path ?? ""));
      if (!folder) throw new Error("Invalid path");
      const keepPath = folder.endsWith("/") ? folder + ".gitkeep" : folder + "/.gitkeep";
      await db.file.upsert({
        where: { workspaceId_path: { workspaceId, path: keepPath } },
        update: {},
        create: { workspaceId, path: keepPath, content: "", isBinary: false },
      });
      return { path: folder };
    }
    case "search_files": {
      const query = String(args.query ?? "").toLowerCase();
      if (!query) return { matches: [] };
      const files = await db.file.findMany({
        where: { workspaceId },
        select: { path: true, content: true },
      });
      const matches: { path: string; line: number; text: string }[] = [];
      outer: for (const f of files) {
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query)) {
            matches.push({
              path: f.path,
              line: i + 1,
              text: lines[i].trim().slice(0, 200),
            });
            if (matches.length >= 50) break outer;
          }
        }
      }
      return { matches };
    }
    case "read_file_lines": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      const start = Number(args.startLine ?? 1);
      const end = Number(args.endLine ?? start + 50);
      const { lines, total } = getLines(file.content, start, end);
      return { path, lines, startLine: start, endLine: Math.min(end, total), totalLines: total };
    }
    case "read_file_outline": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      const outline = outlineHtml(file.content);
      const symbols = extractSymbols(file.content, path);
      return { path, outline, symbols };
    }
    case "get_file_symbols": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      return { path, symbols: extractSymbols(file.content, path) };
    }
    case "find_symbol": {
      const symbol = String(args.symbol ?? "").trim();
      if (!symbol) throw new Error("symbol required");
      const files = await db.file.findMany({ where: { workspaceId }, select: { path: true, content: true } });
      const map = new Map<string, { content: string }>();
      for (const f of files) map.set(f.path, { content: f.content });
      const matches = findSymbolAcrossFiles(map, symbol);
      return { symbol, matches };
    }
    case "get_file_stats": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      const lines = file.content.split("\n").length;
      const size = file.content.length;
      const todos = (file.content.match(/TODO|FIXME/gi) || []).length;
      return { path, lines, size, todos };
    }
    case "edit_css_rule": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const selector = String(args.selector ?? "");
      const property = String(args.property ?? "");
      const value = String(args.value ?? "");
      if (!selector || !property) throw new Error("selector and property required");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      const next = editCssRule(file.content, selector, property, value);
      await db.file.update({ where: { id: file.id }, data: { content: next } });
      return { path, selector, property, value };
    }
    case "add_css_rule": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const selector = String(args.selector ?? "");
      const declarations = String(args.declarations ?? "");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      const next = addCssRule(file.content, selector, declarations);
      await db.file.update({ where: { id: file.id }, data: { content: next } });
      return { path, selector };
    }
    case "remove_css_rule": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const selector = String(args.selector ?? "");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      const next = removeCssRule(file.content, selector);
      await db.file.update({ where: { id: file.id }, data: { content: next } });
      return { path, selector };
    }
    case "rename_class": {
      const oldName = String(args.oldName ?? "").trim();
      const newName = String(args.newName ?? "").trim();
      if (!oldName || !newName) throw new Error("oldName and newName required");
      const files = await db.file.findMany({ where: { workspaceId } });
      const map = new Map<string, { content: string; path: string }>();
      for (const f of files) map.set(f.path, { content: f.content, path: f.path });
      const updates = renameClassAcrossFiles(map, oldName, newName);
      for (const u of updates) {
        const existing = files.find((f) => f.path === u.path);
        if (existing) await db.file.update({ where: { id: existing.id }, data: { content: u.newContent } });
      }
      return { oldName, newName, changedFiles: updates.map((u) => u.path) };
    }
    case "rename_id": {
      const oldName = String(args.oldName ?? "").trim();
      const newName = String(args.newName ?? "").trim();
      if (!oldName || !newName) throw new Error("oldName and newName required");
      const files = await db.file.findMany({ where: { workspaceId } });
      const changed: string[] = [];
      for (const f of files) {
        let next = f.content;
        next = next.replace(new RegExp(`id\\s*=\\s*["']${oldName}["']`, "g"), `id="${newName}"`);
        next = next.replace(new RegExp(`#${oldName}\\b`, "g"), `#${newName}`);
        if (next !== f.content) {
          await db.file.update({ where: { id: f.id }, data: { content: next } });
          changed.push(f.path);
        }
      }
      return { oldName, newName, changedFiles: changed };
    }
    case "find_unused_css": {
      const files = await db.file.findMany({ where: { workspaceId }, select: { path: true, content: true } });
      const map = new Map<string, { content: string }>();
      for (const f of files) map.set(f.path, { content: f.content });
      const unused = findUnusedCss(map);
      return { unused };
    }
    case "get_dependency_graph": {
      const files = await db.file.findMany({ where: { workspaceId }, select: { path: true, content: true } });
      const map = new Map<string, { content: string }>();
      for (const f of files) map.set(f.path, { content: f.content });
      return getDependencyGraph(map);
    }
    case "validate_html": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      const errors = validateHtml(file.content);
      return { path, errors, valid: errors.length === 0 };
    }
    case "batch_edit": {
      const edits = (args.edits as { path: string; oldContent: string; newContent: string }[]) ?? [];
      const edited: string[] = [];
      const failed: { path: string; error: string }[] = [];
      for (const e of edits) {
        try {
          const path = safePath(String(e.path ?? ""));
          if (!path) throw new Error("Invalid path");
          const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
          if (!file) throw new Error(`File not found: ${path}`);
          const idx = file.content.indexOf(e.oldContent);
          if (idx === -1) throw new Error("oldContent not found");
          const next = file.content.slice(0, idx) + e.newContent + file.content.slice(idx + e.oldContent.length);
          await db.file.update({ where: { id: file.id }, data: { content: next } });
          edited.push(path);
        } catch (err) {
          failed.push({ path: String((e as any).path ?? ""), error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { edited, failed };
    }
    case "batch_create": {
      const files = (args.files as { path: string; content: string }[]) ?? [];
      const created: string[] = [];
      for (const f of files) {
        const path = safePath(String(f.path ?? ""));
        if (!path) continue;
        const content = String(f.content ?? "");
        await db.file.upsert({
          where: { workspaceId_path: { workspaceId, path } },
          update: { content, isBinary: false },
          create: { workspaceId, path, content, isBinary: false },
        });
        created.push(path);
      }
      return { created };
    }
    case "get_relevant_files": {
      const query = String(args.query ?? "");
      const limit = Number(args.limit ?? 5);
      const files = await db.file.findMany({ where: { workspaceId }, select: { path: true, content: true } });
      const map = new Map<string, { content: string }>();
      for (const f of files) map.set(f.path, { content: f.content });
      const relevant = getRelevantFiles(map, query, limit);
      return { query, relevant };
    }
    case "search_class_usage": {
      const className = String(args.className ?? "").trim();
      if (!className) throw new Error("className required");
      const files = await db.file.findMany({ where: { workspaceId }, select: { path: true, content: true } });
      const matches: { path: string; line: number; text: string }[] = [];
      for (const f of files) {
        if (!f.path.endsWith(".html")) continue;
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(className)) {
            matches.push({ path: f.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (matches.length >= 50) break;
          }
        }
        if (matches.length >= 50) break;
      }
      return { className, matches };
    }
    case "get_html_structure": {
      const path = safePath(String(args.path ?? ""));
      if (!path) throw new Error("Invalid path");
      const file = await db.file.findUnique({ where: { workspaceId_path: { workspaceId, path } } });
      if (!file) throw new Error(`File not found: ${path}`);
      const structure = outlineHtml(file.content);
      return { path, structure };
    }
    case "create_plan": {
      const title = String(args.title ?? "Plan");
      const steps = (args.steps as any[]) ?? [];
      return { title, steps, createdAt: new Date().toISOString() };
    }
    case "ask_user": {
      const question = String(args.question ?? "");
      const options = (args.options as string[]) ?? [];
      return { question, options, requiresUserInput: true };
    }
    case "checkpoint": {
      const message = String(args.message ?? "Checkpoint");
      // In server executor, we don't have file snapshot here, but return marker
      // Real checkpoint logic is handled in worker and via workspace store
      return { message, timestamp: new Date().toISOString(), checkpoint: true };
    }
    case "generate_palette": {
      const mood = String(args.mood ?? "modern");
      const palettes: Record<string, string[]> = {
        "coffee shop": ["#3c2415", "#a47551", "#f5e6d3", "#d4a574", "#2c1810"],
        minimal: ["#0f172a", "#f8fafc", "#e2e8f0", "#94a3b8", "#3b82f6"],
        cyberpunk: ["#ff00ff", "#00ffff", "#0f0f0f", "#ffea00", "#ff0055"],
        ocean: ["#0a192f", "#64ffda", "#8892b0", "#112240", "#e6f1ff"],
        sunset: ["#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1", "#5f27cd"],
        forest: ["#2d5016", "#618b25", "#a4be7b", "#e5d3b3", "#285430"],
        default: ["#7c3aed", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b"],
      };
      const key = mood.toLowerCase();
      const palette = palettes[key] || palettes["default"];
      const count = Math.min(Math.max(Number(args.count ?? 5), 2), 10);
      return { mood, palette: palette.slice(0, count), name: mood };
    }
    case "generate_qr": {
      const text = String(args.text ?? "");
      const outPath = safePath(String(args.path ?? "assets/qr.svg")) || "assets/qr.svg";
      // Simple QR placeholder SVG (real QR would need lib, but we generate a placeholder that still works as free tool)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><rect x="10" y="10" width="40" height="40" fill="black"/><rect x="150" y="10" width="40" height="40" fill="black"/><rect x="10" y="150" width="40" height="40" fill="black"/><text x="100" y="100" text-anchor="middle" font-size="8" font-family="monospace">${text.slice(0, 20)}</text></svg>`;
      await db.file.upsert({
        where: { workspaceId_path: { workspaceId, path: outPath } },
        update: { content: svg, isBinary: false },
        create: { workspaceId, path: outPath, content: svg, isBinary: false },
      });
      return { path: outPath, text, placeholder: true, note: "Install qrcode.js in preview for real QR: <script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></script>" };
    }
    default:
      throw new Error(`Unknown file tool: ${name}`);
  }
}
