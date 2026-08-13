import { db } from "@/lib/db";
import { safePath } from "@/lib/files";
import { TOOL_LABELS, ToolName } from "@/lib/types";

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
  "get_console_logs",
  "get_page_errors",
  "take_screenshot",
  "run_javascript",
  "check_page",
  "check_console",
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
        return String(args.path ?? "");
      case "rename_file":
        return `${args.from ?? ""} → ${args.to ?? ""}`;
      case "search_files":
        return String(args.query ?? "");
      case "open_page":
        return typeof args.url === "string" ? args.url : "preview";
      case "reload_page":
        return "reload";
      case "click":
      case "hover":
      case "get_dom":
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
      case "get_console_logs":
        return "console";
      case "get_page_errors":
        return "errors";
      case "check_page":
        return "page";
      case "check_console":
        return "console";
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
    case "rename_file": {
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
    default:
      throw new Error(`Unknown file tool: ${name}`);
  }
}
