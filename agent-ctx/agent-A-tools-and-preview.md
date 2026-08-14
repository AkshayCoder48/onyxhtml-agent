# Task agent-A — tools-and-preview

## Task
Add the missing AI tools (2 new file tools + 5 new browser tools) and enhance the preview pane toolbar, per the PRD.

## Files I own & edited
- `src/lib/types.ts` — extended `ToolName` union and `TOOL_LABELS` only.
- `src/lib/ai/tools.ts` — added new tool definitions + executors.
- `src/components/preview/preview-pane.tsx` — real `take_screenshot`, 5 new browser tools in the bridge, expanded toolbar.
- `src/components/chat/tool-card.tsx` — extended `BROWSER_TOOLS` / `FILE_TOOLS` Sets + `pickFileArg`.
- `src/components/preview/browser-test-panel.tsx` — extended `BROWSER_TOOLS` Set + `summarizeArgs`.

## What changed

### 1. `src/lib/types.ts`
Added 7 new entries to the `ToolName` union and `TOOL_LABELS`:
- File tools: `move_file` → "Move file", `replace_content` → "Replace content".
- Browser tools: `get_element` → "Get element", `inspect_element` → "Inspect element", `get_network_errors` → "Get network errors", `run_test` → "Run test", `check_links` → "Check links".

Total tool count is now 32 (was 25).

### 2. `src/lib/ai/tools.ts`
- `BROWSER_TOOLS` array now includes the 5 new browser tools. `move_file` and `replace_content` are NOT added (they stay file tools via the `!isBrowserTool` rule).
- `getToolDefinitions()`: added OpenAI function-calling specs for all 7 new tools with precise param schemas (e.g. `replace_content` has `all?: boolean` defaulting to true; `run_test` has `assertions: array<{label, code, expected?}>`).
- `getToolDetail`: added cases for `move_file` (from → to), `replace_content` (path), `get_element`/`inspect_element` (selector), `run_test` (name or "test"), `get_network_errors` ("network"), `check_links` ("links").
- `executeFileTool`:
  - `move_file`: shares the rename_file body via fallthrough (`case "rename_file": case "move_file": { ... }`). Same transactional logic — moves file or folder + children. Added an extra safety check that rejects moving a folder into itself.
  - `replace_content`: finds `find` in file content; replaces ALL occurrences when `all !== false` (default true), or only the first when `all === false`. Uses `String.split/join` for the all-occurrences path to avoid regex escaping issues. Throws on file-not-found or empty `find` or no matches. Returns `{ path, replaced: <count> }`.

### 3. `src/components/preview/preview-pane.tsx`
Rewrote the BRIDGE_SCRIPT and the toolbar.

**Bridge script changes:**
- Added a `networkErrors` array alongside `logs`/`errs`.
- The existing capture-phase resource-load error handler now ALSO pushes the entry into `networkErrors` (in addition to forwarding `kind: "network"` to the parent).
- Implemented a real `take_screenshot` using the SVG-foreignObject approach: clones `document.documentElement`, strips `<script>` tags, sets `xmlns="http://www.w3.org/1999/xhtml"`, wraps it in an `<svg><foreignObject>…</foreignObject></svg>`, and returns a `data:image/svg+xml;charset=utf-8,…` data URL. Returns `{ dataUrl, width, height, ok: true }`. On error returns `{ ok: false, note }`.
  - IMPORTANT: the BRIDGE_SCRIPT is a template literal in the React-component scope, so `${}` would interpolate at the host. The bridge internals use plain string concatenation only (`+`) — never `${}` — to avoid leaking host variables into the iframe.
- `get_element`: returns `{ outerHTML, tagName, computedStyle: { display, visibility, opacity, position, color, backgroundColor } }` for the first match.
- `inspect_element`: returns `{ tag, attributes, text (≤500 chars), rect: getBoundingClientRect(), computedStyle }` for the first match.
- `get_network_errors`: returns `{ errors: networkErrors }`.
- `run_test`: iterates `assertions` (each `{label, code, expected?}`), evals `code` inside the iframe, compares the stringified result to `expected` (when provided). Returns `{ name, passed, total, results: [{label, pass, actual, expected}] }`. Per-assertion try/catch — a thrown eval marks the assertion as failed with `actual: "Error: …"`.
- `check_links`: queries `document.querySelectorAll('a[href]')`, classifies each href as `absolute` (matches `^(https?:)?//`), `mailto`, `anchor` (starts with `#`), or `relative` (everything else). Returns `{ links, count }`.

**Toolbar changes:**
- Added Back (`ArrowLeft`) / Forward (`ArrowRight`) buttons as disabled placeholders, hidden on mobile (`hidden sm:flex`).
- Kept the existing Reload button.
- Added a "More" `DropdownMenu` (trigger = `MoreVertical` icon) with three items:
  - **Inspect**: shows a sonner toast "Inspect mode — click an element in the preview", dispatches a `preview:inspect-mode` window event, and posts `{source: "workspace-host", action: "inspect-mode"}` to the iframe.
  - **Fullscreen**: calls `containerRef.current.requestFullscreen()` on the preview container (or `document.exitFullscreen()` if already fullscreen).
  - **Open console**: calls `props.onOpenConsole` if provided, else dispatches a `preview:open-console` window event.
- Kept the URL display (now `hidden md:flex` so it disappears on small screens, replaced by a `flex-1` spacer to keep the right cluster right-aligned).
- Kept the Desktop / Tablet / Mobile segmented control.
- Added a new "Custom" device button (`SlidersHorizontal` icon) that opens a `Popover` with two `Input` fields (Width / Height) and an Apply / Reset button pair. Local state: `useCustom` (boolean) + `customSize` (`{width, height}`) + `customOpen`. When `useCustom` is true, the iframe renders inside a `device-frame custom` wrapper at the explicit pixel size. Clicking any of the three preset device buttons sets `useCustom=false` and updates `device`.
- Kept the Open-in-new-tab button.
- All toolbar buttons remain `size-7` (28px) — touch target compliant.

**New optional prop:**
- `onOpenConsole?: () => void` — passed through to `PreviewPane`. If not provided, the More → "Open console" item dispatches a window event. WorkspaceView does not currently pass it, so the event-bus path is used by default.

**Accessibility:**
- Added `aria-pressed={active}` to the device buttons.
- Added a screen-reader-only `aria-live="polite"` span announcing the active preview size.

### 4. `src/components/chat/tool-card.tsx`
- Extended `BROWSER_TOOLS` Set: added `get_element`, `inspect_element`, `get_network_errors`, `run_test`, `check_links`.
- Extended `FILE_TOOLS` Set: added `move_file`, `replace_content`.
- `pickFileArg`: `move_file` is treated like `rename_file` (`from → to`); `replace_content` returns `args.path`. Component logic otherwise unchanged.

### 5. `src/components/preview/browser-test-panel.tsx`
- Extended its local `BROWSER_TOOLS` Set with the 5 new browser tools.
- Extended `summarizeArgs` to handle the new tools:
  - `get_element` / `inspect_element` show the selector (alongside `click`/`hover`/`get_dom`/`scroll`).
  - `run_test` shows the `name` or `"<n> assertions"`.
  - `check_links` shows "links".
  - `get_network_errors` shows "network".

## Verification
- `bun run lint` → exit 0 (no errors, no warnings).
- `npx tsc --noEmit` → zero errors in any of the 5 files I own. (Other agents' files have pre-existing TS errors that predate my changes — not my responsibility per the ownership matrix.)
- `dev.log` shows successful recompilations (`✓ Compiled in 460ms / 152ms / 164ms`) and HTTP 200 responses. No new runtime errors in my files.

## Notes / decisions
- Did NOT touch `AppSettings` / `DEFAULT_SETTINGS` / `PreviewRefreshBehavior` in `src/lib/types.ts` (already finalized by the main agent).
- Did NOT touch any file owned by Agents B, C, or D.
- The Custom device size is stored as component-local React state, NOT in the workspace store — this avoids extending `PreviewDevice` (which would ripple into `AppSettings.defaultViewport`). The segmented control still drives the global `device` value; `useCustom` overrides the rendered size locally only.
- The `take_screenshot` returns an SVG data URL (not a PNG) because the iframe is sandboxed with `sandbox="allow-scripts"` (no `allow-same-origin`), so we cannot draw to a canvas and call `toDataURL('image/png')`. The SVG foreignObject approach works without same-origin access and is the standard workaround for sandboxed previews.
- For `replace_content`, used `String.split/join` for the all-occurrences path instead of `String.replaceAll` to avoid needing to escape special regex characters. Also handles the `find === replace` edge case as a no-op that still reports the match count.
- For `move_file`, used a switch-case fallthrough into the existing `rename_file` body — same transactional logic, plus an extra check that rejects moving a folder into itself (would otherwise create a cyclic prefix).
