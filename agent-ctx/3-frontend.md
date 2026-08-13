# Task ID: 3 — Frontend (AI HTML Workspace Editor)

Agent: frontend
Task: Build the complete frontend of the AI HTML Workspace Editor — home screen, three-zone desktop IDE layout, mobile bottom-nav layout, CodeMirror editor, file explorer, preview iframe with bridge, console drawer, AI chat with SSE streaming + tool cards + thinking panels, settings dialog, command palette, keyboard shortcuts. Implement Zustand stores, TanStack Query data hooks, typed API client, and the SSE/browser-bridge protocols.

## File ownership (only touched these)

- `src/app/page.tsx` — main route. Picks between HomeScreen / MobileWorkspaceView / desktop WorkspaceView based on state. Registers global keyboard shortcuts.
- `src/app/layout.tsx` — adds `<Providers>` (TanStack Query + next-themes + Sonner toaster). Updated metadata.
- `src/app/globals.css` — full theme tokens (light + dark with emerald accent), custom scrollbar styling, animations (pulse-soft, shimmer, fade-in, slide-up), CodeMirror tweaks, chat markdown styles, device frame styling.
- `src/components/providers.tsx` — QueryClientProvider + ThemeProvider + Sonner Toaster wrapper.
- `src/lib/api.ts` — typed fetch wrappers for all API routes + an SSE async-generator parser (`parseSSE`) used by the streaming endpoints.
- `src/stores/workspace-store.ts` — Zustand: current workspace, files map, tree, activeFile, openTabs, unsavedPaths Set, previewMode, device, aiEditingFiles Set, previewNonce (reloads), plus mutation actions.
- `src/stores/chat-store.ts` — chatId, messages[], isStreaming, streamingMessageId, pendingBrowserTools; segment helpers (`appendToSegment`, `upsertToolCallSegment`, `setToolResult`, `addErrorSegment`) that update streaming segments in place by `callId`.
- `src/stores/ui-store.ts` — sidebar collapse, activeSidebarView, settings open/category, command palette + quick-file open, console open, mobile view.
- `src/stores/provider-store.ts` — providers list, active provider cache; helpers `isProviderUsable` (treats built-in Z.ai provider as usable without an API key) and `activeModelLabel`.
- `src/hooks/use-chat-stream.ts` — `sendMessage(content)` POSTs to `/api/chats/:id/messages`, reads the SSE response via `api.streamMessage` (async generator), accumulates segments into the live assistant message, handles `browser_tools_pending` by executing each tool against the preview iframe bridge and then POSTing results to `/api/chats/:id/messages/continue`. `stop()` aborts the controller.
- `src/hooks/use-preview-bridge.ts` — `usePreviewBridge(iframeRef, onConsole, onError, onNetwork)` registers a `message` listener that routes `{source:"preview", kind:"console"|"error"|"network", callId}` posts from the iframe; `execute(tool, args, callId)` postMessages the action to the iframe and resolves on the matching `callId` reply (8s timeout).
- `src/hooks/use-keyboard-shortcuts.ts` — declarative shortcut registration. Treats Ctrl/Cmd as interchangeable; skips editable targets unless `allowInInput`.
- `src/hooks/use-providers.ts`, `src/hooks/use-settings.ts` — TanStack Query wrappers that hydrate the stores and apply theme.
- `src/components/workspace/home-screen.tsx` — centered hero, large prompt box, "Blank Workspace" + "Recent Workspaces" buttons, recent-workspaces grid, template-picker dialog, recent dialog. Sending a prompt creates a workspace + chat, then dispatches a `home:send` window event the prompt box listens for to send the first message.
- `src/components/workspace/sidebar.tsx` — 260px / 60px collapsible sidebar with brand, New Workspace button, nav groups (WORKSPACE/CHAT/PROJECT/SYSTEM), Recent Workspaces list, connection-status footer ("● Connected" / "○ AI not configured"). Tooltips when collapsed.
- `src/components/workspace/workspace-header.tsx` — back button, click-to-edit workspace name, file name + Saved/Unsaved chip, Save / Download / More (Rename, Export ZIP, Import ZIP, Open Preview, Delete) icon buttons with tooltips.
- `src/components/workspace/workspace-toolbar.tsx` — segmented [Code|Preview], open file tabs (active indicator + unsaved dot + AI-editing sparkles + close X on hover), Reload / More dropdown.
- `src/components/workspace/workspace-view.tsx` — desktop three-zone layout. Outer `ResizablePanelGroup` splits [WorkspaceArea | ChatPanel]; WorkspaceArea internally splits [FileExplorer/BrowserTest/History/Search | Editor] when in code mode, or shows PreviewPane full-width in preview mode; ConsoleDrawer slides up at the bottom.
- `src/components/workspace/mobile-workspace-view.tsx` — single-view-at-a-time layout driven by `uiStore.mobileView` (code / preview / ai / files). Used below the `lg` breakpoint.
- `src/components/workspace/mobile-nav.tsx` — bottom tab bar [Code|Preview|AI|Files].
- `src/components/workspace/command-palette.tsx` — shadcn Command dialog with two modes (regular command palette + quick file switcher). Searches files, workspaces, and commands.
- `src/components/editor/file-explorer.tsx` — collapsible tree (folders expand/collapse), per-type file icons, context menu (Open / Rename / Duplicate / Delete / Copy Path; folders get New File / New Folder / Rename / Delete / Copy Path), dropdown "New File / New Folder" header, empty state.
- `src/components/editor/code-editor.tsx` — `@uiw/react-codemirror` with dynamic language extension per `detectLanguage`. GitHub light/dark themes via `@uiw/codemirror-theme-github`. Settings-driven: font size, tab size, word wrap, line numbers, fold gutter. Debounced 800 ms autosave → PUT. EditorView listener tracks cursor Ln/Col. Read-only + "✦ AI editing" banner when the file is in `aiEditingFiles`.
- `src/components/preview/preview-pane.tsx` — preview iframe (`sandbox="allow-scripts"`, `srcDoc`) with toolbar (reload / URL display / Desktop|Tablet|Mobile segmented / open-in-new-tab), device-frame styling for tablet/mobile. `buildPreviewDoc(files, entry)` inlines `<link rel=stylesheet>`, `<script src>`, and SVG `<img src>` from the workspace files, then injects the bridge script before `</body>`.
- `src/components/preview/console-drawer.tsx` — bottom drawer with Tabs (Console / Errors / Network), clear/expand/close buttons, empty states.
- `src/components/preview/browser-test-panel.tsx` — timeline of all browser tool_call segments across the chat (collapsible rows, status dot, arguments + result JSON in details).
- `src/components/chat/chat-panel.tsx` — chat header (Sparkles + model label + New Chat / More), messages list, prompt box. Auto-creates a chat when the workspace has none. Loads messages when `chatId` changes. Wires `useChatStream` to the bridge.
- `src/components/chat/chat-messages.tsx` — scrollable message list with auto-scroll + "jump to latest" button. User messages = compact right-aligned bubble. Assistant messages render segments in order: ThinkingPanel, MarkdownContent, ToolCard, ErrorCard. Empty state with suggestion buttons.
- `src/components/chat/thinking-panel.tsx` — collapsible "🧠 Thinking" panel; auto-expands while streaming, auto-collapses shortly after streaming ends.
- `src/components/chat/tool-card.tsx` — collapsible card per `tool_call` segment. Header: status icon (running/success/error/cancelled) + label + file/target summary. Body: KV table + Copy result + Open file (file tools) / Open console (browser tool errored) + advanced "View details" disclosure with arguments/result JSON. Updates in place during streaming (matched by `callId`).
- `src/components/chat/prompt-box.tsx` — auto-grow textarea, attach menu (Upload file / Add workspace file), context menu (@file / @workspace:all / recent files), model selector dropdown, settings gear, Send (circular primary) / Stop (square destructive while streaming). ⌘/Ctrl+Enter sends. Listens for `chat:set-prompt` (suggestion buttons), `chat:focus-prompt` (⌘K), and `home:send` (home screen submit).
- `src/components/chat/chat-history.tsx` — Today / Yesterday / Earlier grouped list with rename / delete via dropdown.
- `src/components/chat/chat-search.tsx` — input that calls `GET /api/chats?search=` and lists results.
- `src/components/chat/markdown.tsx` — `react-markdown` renderer with custom code block (Copy button), inline code, links (relative paths rendered as file-opener buttons), ErrorCard component, CopyButton.
- `src/components/settings/settings-dialog.tsx` — large dialog with left nav + right content. Categories: AI Providers (list + editor with Test Connection / Fetch Models / API key show-hide / active toggle), Appearance (Light|Dark|System), Editor (font-size slider, tab size, word wrap, line numbers, minimap, auto-save, format-on-save), Preview (default viewport, auto reload, console visible, error overlay, open links externally), General (reset settings, about), Keyboard Shortcuts.

## Component tree

```
<Page>
  if !currentWorkspaceId:
    <HomeScreen/> + <CommandPalette/> + <SettingsDialog/>
  else if mobile:
    <MobileWorkspaceView/> + <MobileNav/> + <CommandPalette/> + <SettingsDialog/>
  else desktop:
    <Sidebar/> + <WorkspaceView/> + <CommandPalette/> + <SettingsDialog/>

<WorkspaceView>
  ResizablePanelGroup horizontal:
    Panel (WorkspaceArea):
      <WorkspaceHeader/>
      <WorkspaceToolbar/>
      ResizablePanelGroup horizontal (only in code mode):
        Panel: <FileExplorer/> | <BrowserTestPanel/> | <ChatHistory/> | <ChatSearch/>
        Panel: <CodeEditor/>
      OR <PreviewPane iframeRef/> (preview mode)
      {consoleOpen && <ConsoleDrawer/>}
    Panel: <ChatPanel bridgeExecute={execute}/>
```

## SSE handling approach

`api.streamMessage(chatId, body, signal)` returns an async generator of `StreamEvent`. Internally it `fetch`es with POST, gets the `ReadableStream`, decodes with `TextDecoder`, splits the buffer on `\n\n`, parses lines starting with `data: `, ignores `data: [DONE]` (returns from the generator), and `JSON.parse`s everything else.

`useChatStream.sendMessage(content)`:
1. Appends a user Message and an empty assistant Message to the chat store.
2. Calls `startStreaming(assistantId)`.
3. Creates an `AbortController` and stores it on a ref.
4. Iterates the async generator with `for await`, dispatching each event to `handleEvent`:
   - `reasoning_content` → append to the last `thinking` segment (or push a new one).
   - `content` → append to the last `content` segment.
   - `tool_call` → `upsertToolCallSegment` by `callId` with `status: running`.
   - `tool_result` → `setToolResult` updates the matching segment with `status`, `result`, `error`, `label`, `detail`.
   - `error` → push an `error` segment.
   - `done` → break the loop.
   - `browser_tools_pending` (loose-typed payload with `callIds[]`) → collect callIds, set `pendingBrowserTools`.
5. After the primary stream ends, if there are pending browser tools, call `executeBrowserToolsAndContinue`:
   - For each callId, find the segment in the assistant message to get the tool name + args.
   - Call `bridge.execute(tool, args, callId)` (postMessage to the iframe).
   - Update the segment with the result via `setToolResult`.
   - Collect results into `{callId, result?, error?}[]`.
   - Call `api.streamContinue(chatId, {results}, signal)` and resume consuming the new stream (same `handleEvent` dispatch).
6. On any error: push an error segment, toast with Retry action.
7. Finally: `stopStreaming()` and clear the controller.

## Preview bridge protocol

The `buildPreviewDoc` helper inlines local CSS / JS / SVG-image references into the entry HTML, then injects a bridge `<script>` before `</body>`. The bridge:

- Wraps `console.log/warn/error/info` to forward each call to the parent as `{source:"preview", kind:"console", level, args}` (args are stringified safely).
- Listens for `window.error` and `unhandledrejection` to forward `{source:"preview", kind:"error", message, filename, line, col}`.
- Captures failed resource loads (LINK/SCRIPT/IMG) and forwards as `{source:"preview", kind:"network", url, type, status:0}`.
- Listens for messages from the parent of the form `{source:"workspace-host", action:"browser-tool", tool, args, callId}`. Implements: `click`, `type`, `press_key`, `scroll`, `hover`, `select`, `get_dom`, `run_javascript` (via `eval`), `get_console_logs`, `get_page_errors`, `take_screenshot` (returns a not-supported note), `wait`. Posts back `{source:"preview", callId, result?, error?}`.

The host (`usePreviewBridge`) keeps a `Map<callId, resolver>` and resolves when the matching reply arrives (8s timeout). The host's `message` listener also routes console/error/network posts to the ConsoleDrawer state.

## Deviations from spec

- **File explorer position**: spec describes the file explorer as a "collapsible vertical section on the left of the editor area, toggleable." I render it as the left panel of the editor-area `ResizablePanelGroup` (always visible in code mode). The sidebar's "Files" item switches the left-panel content back to the file explorer when other views (Browser/Test, History, Search) have taken its place. Browser/Test, History, and Search all share that same left-panel slot when active (consistent with the "sidebar view" terminology in the spec).
- **`useChatStream` `setChatId` / `setMessages` returns**: kept on the returned object for parity but the values are also exposed through the store directly. The hook reads chatId from the store at call time so the latest value is always used.
- **Take screenshot**: returned `{note: "...not supported...", ok: false}` instead of attempting html2canvas (kept the MVP dependency-free).
- **Toast usage**: positive toasts used for Saved / Download started / File created / Workspace deleted / Provider saved / Connection successful. Errors use inline ErrorCard + a toast with Retry action as specified.
- **Connection indicator**: treats the built-in Z.ai provider (matched by name/baseURL pattern) as usable without an explicit API key, so the footer reads "● Connected" out of the box.

## Verification

- `bun run lint` — passes (no errors, no warnings).
- `curl http://localhost:3000/` — HTTP 200, home screen renders ("What do you want to build" + coffee-shop placeholder + recent workspaces grid).
- API routes (workspaces, files, providers, settings, chats) all respond 200 from the backend agent's implementation.
- Created + deleted a test workspace end-to-end via `curl` to confirm the round-trip works.
- The dev server log shows the page compiling and rendering in ~50–250 ms with no runtime errors.

## Stage summary

A complete, polished frontend is in place. The home screen, three-zone desktop IDE, mobile bottom-nav layout, CodeMirror editor, file explorer with context menus, preview iframe with bridge protocol, console drawer, browser/test timeline, AI chat with SSE streaming + thinking panels + tool cards + prompt box, settings dialog with all six categories, command palette, and keyboard shortcuts are all implemented. Lint passes. The app renders without hydration errors and correctly talks to the backend API contract.
