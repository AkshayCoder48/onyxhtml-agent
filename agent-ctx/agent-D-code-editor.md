# Task agent-D — Code Editor Enhancements (minimap / lint / format-on-save / auto-indent)

Task ID: agent-D
Agent: code-editor
Owned file: `src/components/editor/code-editor.tsx` (ONLY)

## What was already present on arrival

When I picked up the task, the file had already been modified (uncommitted in the working tree) with the four required features wired up using:
- `@replit/codemirror-minimap` (the de-facto standard minimap for CodeMirror 6 — the `@codemirror/minimap` package named in the task brief does not exist on npm; `@replit/codemirror-minimap` was already in `package.json` and the constraint forbids touching `package.json` resolutions).
- `@codemirror/lint` (`linter`, `lintGutter`, `lintKeymap`, `Diagnostic`).
- `prettier/standalone` + `prettier/plugins/*` via **dynamic** `await import()` calls inside `formatContent`.
- `indentOnInput()` + `indentUnit.of(" ".repeat(tabSize))` in the base extensions array.

## Changes I made this pass

### 1. Converted prettier to static imports (per task step 5)
The task explicitly requires static top-level imports for prettier + plugins. The previous implementation used `Promise.all([import("prettier/standalone"), import("prettier/plugins/html"), …])` inside `formatContent`, which meant every save paid a dynamic-import round-trip.

Replaced with:
```ts
import * as prettier from "prettier/standalone";
import htmlPlugin from "prettier/plugins/html";
import postcssPlugin from "prettier/plugins/postcss";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";
```
and three hoisted plugin arrays (`PRETTIER_HTML_PLUGINS`, `PRETTIER_CSS_PLUGINS`, `PRETTIER_BABEL_PLUGINS`) that `formatContent` references directly. `formatContent` is now a thin switch on `language` calling `prettier.format(content, { parser, plugins })`.

Note on TypeScript: the plugin `.d.ts` files only declare named exports (`parsers`, `printers`) — no default export declaration. With `esModuleInterop: true` + `moduleResolution: "bundler"` in `tsconfig.json`, the default imports type-check fine (the runtime `.mjs` ships `export default`). `npx tsc --noEmit` reports zero errors for this file.

### 2. Removed the debug `console.log` in `handleSave`
The prior code had:
```ts
// eslint-disable-next-line no-console
console.log("[handleSave]", { formatOnSave, fmtLang, contentLen, activeFile });
```
This (a) polluted the browser console, (b) would trigger the very `console.log` warning the new JS linter flags, and (c) produced an ESLint warning ("Unused eslint-disable directive — no problems were reported from 'no-console'") because the `no-console` rule isn't enabled in this repo's ESLint config. Removed both the comment and the log call.

## Features verified present in the final file

### Minimap (conditional on `settings.minimap`)
```ts
if (settings.minimap) {
  extensions.push(
    showMinimap.compute(["doc"], () => ({
      create: (_view: EditorView) => { const dom = document.createElement("div"); return { dom }; },
      showOverlay: "always",
      displayText: "blocks",
    }))
  );
}
```
Also: `basicSetup.foldGutter` is set to `settings.minimap !== true` so the fold gutter hides when the minimap is on (avoids visual clutter).

### Lint error markers (always on)
- `buildLinter(activeFile)` returns `linter(source, { delay: 750 })` — 750ms debounce ✓
- `lintGutter()` in the extensions array ✓
- `keymap.of(lintKeymap)` for keyboard nav ✓
- Memoized on `activeFile` via `useMemo` so diagnostics don't reset every render
- HTML heuristic: per-line scan for `<(\w+)([^>]*?)(\/?)>`, skips void elements (`area`, `base`, `br`, …), `<!--` comments, `<!doctype`-ish matches, and self-closing tags; flags an opening tag whose closing tag doesn't appear later on the same line with severity "warning" and source "html-lint"
- CSS heuristic: walks the doc tracking a stack of `{` positions; flags stray `}` immediately; if depth > 0 at EOF, flags the last unmatched `{` with severity "warning" and source "css-lint"
- JS heuristic: per-line strip `//…` comments, then flag `console.log(` (source "js-lint") and unbalanced single/double quotes (severity "warning")
- All diagnostics use severity `"warning"` per the task ✓

### Format-on-save (`settings.formatOnSave`)
`handleSave(view)`:
1. Reads `view.state.doc.toString()`.
2. Detects language via `detectLanguage(activeFile)` → `mapLanguage` → `"html" | "css" | "javascript" | "json" | "other"`.
3. If `settings.formatOnSave && fmtLang !== "other"`: `await formatContent(content, fmtLang)`. If the formatted result differs, `view.dispatch({ changes: { from: 0, to: doc.length, insert: formatted } })` so the editor doc + the workspace store (via `onChange`) stay in sync. On format failure: `toast.warning("Format failed", { description })` and continue with the unformatted content.
4. `api.putFile(workspaceId, activeFile, content)` → `markSaved(activeFile)` → `api.patchWorkspace(workspaceId, { activeFile })` → `toast.success("Saved", { description: activeFile })`. On save failure: `toast.error("Save failed", …)`.
5. Bound via `keymap.of([{ key: "Mod-s", preventDefault: true, run: (view) => { void handleSave(view); return true; } }])` so Ctrl/Cmd+S works while CodeMirror has focus.

Parsers: html → `"html"` (plugins: html+postcss+babel+estree), css → `"css"` (postcss), javascript → `"babel"` (babel+estree), json → `"json"` (babel+estree).

### Auto-indentation (always on)
```ts
indentOnInput(),
indentUnit.of(" ".repeat(tabSize)),
```
where `tabSize = settings.tabSize ?? 2`. Both live in the base `extensions` array, so they're always active regardless of file type or settings.

## Step 1 (bun add) — skipped, with rationale
The task says `bun add @codemirror/lint @codemirror/minimap prettier`. All three were already present in `package.json`:
- `@codemirror/lint` ^6.9.7 ✓
- `@replit/codemirror-minimap` ^0.5.2 (the real package; `@codemirror/minimap` doesn't exist on npm) ✓
- `prettier` ^3.9.6 ✓

The constraint "Do NOT change package.json resolutions" + the fact that `@codemirror/minimap` is not a real package means running `bun add @codemirror/minimap` would have errored out and/or added a phantom dependency. Skipped.

## Verification
- `bun run lint` → exit 0, **zero errors, zero warnings** (the prior "Unused eslint-disable directive" warning is gone after removing the debug log).
- `npx tsc --noEmit` → zero TypeScript errors in `src/components/editor/code-editor.tsx` (pre-existing TS errors in other agents' files are unchanged and outside my ownership).
- `dev.log` (last 30 lines) → `✓ Compiled in 568ms`, `GET / 200`, `GET /api/workspaces 200`, `PUT /api/workspaces/.../files 200`, `PATCH /api/workspaces/... 200`. No compile errors, no runtime errors in my file.
- Only file touched: `src/components/editor/code-editor.tsx`. No other files modified.

## Constraints honored
- No indigo or blue colors (only `muted-foreground`, `background`, `accent-strong`, `muted`, `amber-600/400` for the unsaved dot).
- `package.json` resolutions untouched.
- TypeScript-strict (file compiles under `strict: true` with zero errors).
- Only `src/components/editor/code-editor.tsx` edited.
