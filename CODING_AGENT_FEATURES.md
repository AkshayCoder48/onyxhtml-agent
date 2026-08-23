# OnyxHTML Coding Agent — 150+ Agent-Focused Features

> Pure coding-agent features only. No generic product fluff. Every item makes the AI write, debug, test, and ship HTML/CSS/JS better, faster, and with unlimited free local tooling.

---

## 0) What the Agent Can Do Today (Gap)

**Current tools:** `list_files, read_file, create_file, write_file, edit_file, delete_file, rename_file, move_file, replace_content, create_folder, search_files` + 40 browser tools (`click, type, get_dom, run_javascript, browser_execute_js, terminal_exec, run_qa_suite, assert_*`)

**Gaps for a coding agent:**
- No line-range read (reads whole file, wastes tokens)
- No AST-aware edit (string replace breaks easily)
- No symbol search (find class, id, function)
- No dependency graph (which file imports which)
- No CSS class usage audit
- No HTML structure validation
- No auto-fix loop
- No planning UI — user just sees "Thinking..." and tool cards
- Markdown is dumb — no diff, no file-tree, no plan rendering
- No checkpoints / rollback
- No multi-step task tracking

---

## 1) 📁 FILE & CODE INTELLIGENCE TOOLS (Free, Local, Unlimited)

All run in worker / browser, no API cost. Uses `htmlparser2`, `postcss`, `acorn`, `css-tree` via CDN wasm.

### Smart Read Tools
1. **read_file_lines** `path, startLine, endLine` — read 20 lines, not 2000. Saves tokens, faster.
2. **read_file_outline** `path` — returns outline: HTML tag tree, CSS selectors, JS functions/classes. 90% smaller than full file.
3. **get_file_symbols** `path` — list all ids, classes, functions, variables, components. Free AST parse.
4. **get_file_stats** `path` — lines, size, complexity, TODO count.
5. **find_symbol** `symbol` — where is `.hero` defined? Which files use `#app`? Returns refs.

### Smart Edit Tools (AST-aware, not string replace)
6. **edit_html_tag** `path, selector, attribute, value` or `innerHTML` — e.g. change `<h1>` text without breaking file.
7. **edit_css_rule** `path, selector, property, value` — edit ` .btn { bg: red }` surgically, create if not exists.
8. **add_css_rule** `path, selector, declarations` — append rule.
9. **remove_css_rule** `path, selector` 
10. **rename_class** `old, new` — rename across ALL files (HTML + CSS + JS) in one tool call.
11. **rename_id** `old, new` — same.
12. **extract_component** `path, selector, newPath` — cut DOM subtree into new file/component.
13. **inline_file** `htmlPath, cssPath` — inline CSS into HTML for single-file export, free.
14. **wrap_with_tag** `path, selector, wrapperTag` — wrap element with div/section.
15. **unwrap_tag** `path, selector`
16. **duplicate_element** `path, selector`
17. **sort_css_properties** `path` — alphabetize / logical order.
18. **format_file** `path` — prettier already there, expose as tool so agent can format after edit.

### Search & Analysis (Free)
19. **search_class_usage** `className` — which HTML files use this class? Is it dead?
20. **search_id_usage**
21. **find_unused_css** — returns unused selectors by scanning HTML vs CSS. Free, local.
22. **find_duplicate_ids** — HTML validation.
23. **find_broken_links** — scan href/src, check if file exists in workspace.
24. **get_dependency_graph** — which HTML imports which CSS/JS? Visual graph data.
25. **get_html_structure** — returns tree as JSON for AI to reason, not raw HTML.
26. **validate_html** — html-validate wasm, returns errors.
27. **validate_css** — stylelint wasm.
28. **validate_js** — eslint via wasm.

### Batch Tools (1 tool call = many edits, saves turns)
29. **batch_edit** `edits: [{path, oldContent, newContent}]` — atomic multi-file edit.
30. **batch_create** `files: [{path, content}]` — create component library in one go.
31. **apply_codemod** `pattern, replacement` — regex + file glob.

---

## 2) 🧠 PLANNING, REASONING & MEMORY TOOLS

32. **create_plan** `title, steps: [{id, title, files, description}]` — Agent outputs plan BEFORE coding. UI renders as interactive checklist (onyx:plan). Each step can be clicked to execute.
33. **update_plan** `stepId, status: todo/doing/done/error`
34. **create_todo** `todos: [{text, file, priority}]` — parsed to Kanban UI.
35. **think** `thought` — explicit thinking tool, not just hidden reasoning_content. Shows in ThinkingPanel with deeper nesting.
36. **ask_user** `question, options` — structured clarification. Renders as buttons in chat, not just text. Free, no tool execution needed.
37. **checkpoint** `message` — save current workspace state as version. User can rollback.
38. **list_checkpoints** + **restore_checkpoint** `id` + **diff_checkpoints** `from, to` — time travel.
39. **remember** `key, value` — agent long-term memory per workspace (e.g., "user likes Tailwind").
40. **recall** `key` — get memory.
41. **summarize_changes** — auto-generate changelog of what agent did this session.

---

## 3) 🌐 BROWSER & RUNTIME AGENT TOOLS (Free)

42. **inspect_element_picker** — enable picker mode in preview, next click returns selector + computed styles + HTML snippet. Agent can then edit.
43. **get_computed_styles** `selector` — full computed style object, not just summary.
44. **get_box_model** `selector` — margin/border/padding/content rect.
45. **get_accessibility_tree** — returns a11y tree for AI to audit.
46. **get_css_variables** — all `:root` and computed vars.
47. **set_css_variable** `name, value` — live edit var in preview, then persist if user approves.
48. **measure_text** `selector` — width/height, line count, overflow check.
49. **take_element_screenshot** `selector` — real screenshot via html2canvas (free) of single element.
50. **compare_screenshots** `beforeDataUrl, afterDataUrl` — pixel diff, returns diff %.
51. **run_lighthouse_free** — simple perf metrics: FCP, LCP, CLS using PerformanceObserver, no external API.
52. **get_color_palette_from_page** — extract dominant colors from page via Canvas.
53. **get_fonts_in_use** — list fonts actually used.
54. **get_images_info** — all img tags + size + alt + broken?
55. **execute_code_in_worker** `code` — run JS in Web Worker, not iframe, for heavy analysis (e.g., parse big CSS).

---

## 4) 🧩 STRUCTURED AI RESPONSE → CODE UI COMPONENTS

**Core Idea:** Agent outputs ```onyx:xxx {json}``` and we render interactive code UI, not markdown.

### Protocol
```md
```onyx:plan
{"title":"Build landing","steps":[{"id":"1","title":"Create hero","file":"index.html","status":"todo"}]}
```
```onyx:diff
{"path":"index.html","old":"<h1>old</h1>","new":"<h1>new</h1>"}
```
```

### Code-Focused Components (Agent-Specific)

56. **onyx:plan** — interactive plan with progress bar, each step expandable, Run Step button → triggers tool.
57. **onyx:file-tree** — proposed files to create, checkboxes, Create All button.
58. **onyx:diff** — side-by-side diff with Accept/Reject, syntax highlighted. On Accept → `edit_file`.
59. **onyx:multi-diff** — multiple file diffs in tabs.
60. **onyx:code-preview** — live preview of HTML snippet in iframe + code side-by-side.
61. **onyx:symbol-list** — list of classes/ids/functions found, click to jump to editor.
62. **onyx:dependency-graph** — visual graph of files, nodes clickable.
63. **onyx:css-audit** — unused CSS list with Delete All button.
64. **onyx:html-outline** — collapsible outline of HTML file, click to scroll editor.
65. **onyx:todo-kanban** — Todo/Doing/Done columns from agent todos.
66. **onyx:checkpoint-timeline** — timeline of checkpoints, click to restore.
67. **onyx:test-report** — already have but make it interactive: click failed check → agent fixes.
68. **onyx:ask-user** — renders as buttons/cards, not text. e.g., "Which style? [Minimal] [Bold] [Playful]"
69. **onyx:color-palette-apply** — palette + Apply to CSS Variables button → calls `set_css_variable` batch.
70. **onyx:component-variants** — e.g., 3 button variants, pick one → inserts into file.
71. **onyx:command-suggestions** — "Next steps: [Make responsive] [Add dark mode] [Optimize images]" — each is a prompt button.
72. **onyx:reasoning-tree** — nested thinking: Goal → Plan → Step → Tool → Result, collapsible.
73. **onyx:file-stats** — file size, lines, complexity gauge.
74. **onyx:broken-links** — table of broken href/src with Fix button.
75. **onyx:css-specificity** — list selectors with specificity score, warn high specificity.

### Implementation (1 day)
- In `markdown.tsx`, add remark plugin: if code block lang starts with `onyx:`, parse JSON, render from registry.
- Registry at `src/components/chat/onyx-components/registry.tsx`
- Each component gets `onAction` prop that can call `api` or dispatch event.

---

## 5) 📝 CODE MARKDOWN SUPERPOWERS (Agent Writes Better Code Docs)

76. **Diff Blocks** — ```diff → green/red + Copy + Apply Diff button
77. **File Reference with Line** — `index.html:12-20` → hover shows 8 lines preview, click opens editor at line.
78. **Inline File Preview** — `![file](index.html)` → renders file content inline with syntax highlight.
79. **Executable Code Blocks** — JS block has ▶ Run in Preview button.
80. **CSS Color Swatch** — any hex in markdown shows swatch + picker.
81. **Class Name Autocomplete Pill** — `.btn` in markdown → pill with usage count, click to find refs.
82. **TODO → Interactive Checkbox** — `- [ ] Fix hero` → checkbox that agent can tick via `update_plan`.
83. **Collapsible Code** — long code auto-collapsed with "Show 120 lines"
84. **Copy as File** — code block header has "Create as components/hero.html" suggestion.
85. **Explain Code Hover** — hover token → tooltip with AI explanation (cached).
86. **Two-Way Code Link** — click code block line → highlights same line in editor.

---

## 6) 🎛️ AGENT CONTROL UI (Buttons, UIs that Control Agent)

87. **Pause / Resume Agent** — pause mid-stream, edit file, resume.
88. **Stop & Fork** — stop agent, fork chat into two branches to try different approaches.
89. **Step-Through Mode** — agent asks for approval before each tool call. Toggle in prompt box.
90. **Auto-Fix Toggle** — "Auto-fix errors" on/off. When on, agent auto-runs qa_suite after each edit.
91. **Agent Speed Slider** — delay between tool calls for demo mode.
92. **Tool Filter** — user can disable risky tools (delete_file) for safe mode.
93. **Plan Approval Gate** — agent creates plan, waits for user "Approve" button before coding.
94. **Checkpoint Auto** — auto-checkpoint every 5 tool calls, UI shows timeline.
95. **Undo Last Agent Action** — one-click undo last file edit batch.
96. **Redo**
97. **Agent Memory Panel** — sidebar tab showing what agent remembers about this workspace.
98. **Token Usage Bar** — shows tokens used / remaining (even for free models, estimate).
99. **Cost Estimator** — if paid model, show $.
100. **Model Switch Mid-Chat** — dropdown to switch model without losing chat.
101. **System Prompt Editor** — per-workspace system prompt override, with templates.
102. **Agent Persona** — "Senior Frontend", "Accessibility Expert", "Performance Guru" — changes system prompt.

---

## 7) 🧪 SELF-HEALING & TESTING LOOP (Agent Fixes Itself)

103. **Auto QA Loop Tool** — `auto_fix_loop(maxIterations)` — agent edits, runs qa_suite, fixes, repeats until pass or max.
104. **Visual Regression Tool** — `save_baseline_screenshot()` + `compare_with_baseline()` — agent sees if its change broke layout.
105. **Console Error Auto-Fix** — if console has errors after edit, agent automatically reads error + fixes.
106. **Responsive Auto-Fix** — run `test_responsive_layout`, if overflow → agent fixes CSS.
107. **Accessibility Auto-Fix** — axe-core → list → agent fixes each.
108. **Dead Code Elimination** — agent finds unused CSS/classes, asks user to delete.
109. **Performance Budget** — warn if file > 100kb, image > 500kb, etc.
110. **Test Generation** — agent generates `assert_*` tests for current page, saves to `tests.json`.
111. **User Flow Test Recorder** — user clicks in preview, we record as `run_e2e_test` script that agent can replay.
112. **Flaky Test Retry** — auto-retry failed asserts 3x.

---

## 8) 🧬 CONTEXT & MEMORY MANAGEMENT (Free, Critical for Coding Agent)

113. **Smart Context Window** — don't send all files, send outline + relevant files only. Tool `get_relevant_files(query)` returns top 5 files by TF-IDF, free.
114. **File Summarizer** — summarize large file into 10-line summary for context.
115. **Recent Edits Context** — always include last 3 edited files in prompt.
116. **Workspace AGENT.md Auto-Update** — agent updates AGENT.md with project conventions it discovers.
117. **Chat Summarizer** — summarize long chat into memory to keep context small.
118. **Embedding Search** — local embedding via `transformers.js` (free, wasm) to find relevant code by semantic search.
119. **Symbol Context** — when user mentions "hero", auto-include file where `.hero` is defined.
120. **Image Context** — if workspace has images, include their names/sizes in context so agent doesn't break src.

---

## 9) 🛠️ EDITOR ↔ AGENT INTEGRATION

121. **Inline AI Edit** — select code in editor, right-click "Ask AI to refactor", prompt prefilled with selection.
122. **Ghost Text** — agent's next edit shown as ghost text before applying, user can Tab to accept.
123. **Agent Cursor** — show where agent is editing in editor, like multiplayer cursor.
124. **Comment to Code** — type `// AI: create a navbar` in editor, agent converts comment to code on save.
125. **File Lens** — above each function/class, show "AI: Explain | Refactor | Test" codelens.
126. **Problems Panel** — bottom panel listing all html/css/js validation errors, click to fix via AI.
127. **Agent Chat in Editor** — small chat bubble in gutter for quick question about that line.
128. **Split View: Code + Agent Diff** — left original, right agent proposal, accept.
129. **Live CSS Edit** — edit CSS in preview inspector, sync back to file on save.
130. **Color Picker Sync** — pick color in editor → preview updates live.

---

## 10) 🔌 FREE EXTENSIBILITY (Unlimited)

131. **Custom Tool Definition** — user can add tool in `AGENT.md` like `tools: [{name: "my_tool", description: "...", run: "js code"}]` — agent can call it.
132. **Snippet to Tool** — save code snippet as tool that agent can reuse.
133. **Webhook Tool** — `call_webhook(url, body)` — free, call any free API (e.g., unsplash, dicebear).
134. **NPM CDN Tool** — `import_cdn(packageName)` — adds script tag from jsDelivr, free.
135. **Tailwind Plugin Tool** — detect if tailwind, if not, add CDN and config.
136. **Component Library Import** — `import_component(library, component)` — e.g., shadcn button, daisyUI card — free copy-paste.

---

## 11) 📊 AGENT OBSERVABILITY UI

137. **Agent Timeline** — horizontal timeline of tool calls, click to see file state at that time.
138. **Token Flow Diagram** — how tokens were used: planning, reading, editing, testing.
139. **File Change Heatmap** — which files agent edited most.
140. **Tool Call Stats** — which tools used most, avg duration.
141. **Error Recovery Graph** — how many errors, how many auto-fixed.
142. **Live File Tree with AI Status** — file icon shows: reading (eye), editing (pencil), done (check).
143. **Agent Thinking Visualization** — tree of thoughts, not just flat text.

---

## 12) IMPLEMENTATION ORDER (Coding Agent Focus)

**Day 1 — Core Tools (Free, No UI):**
- `read_file_lines`, `read_file_outline`, `get_file_symbols`, `find_symbol`
- `edit_css_rule`, `rename_class`, `batch_edit`
- `find_unused_css`, `get_dependency_graph`, `validate_html`

**Day 2 — Structured UI:**
- `onyx:plan`, `onyx:diff`, `onyx:file-tree`, `onyx:ask-user`, `onyx:reasoning-tree`
- Parser in `markdown.tsx` + registry
- `create_plan` + `ask_user` tools

**Day 3 — Self-Healing Loop:**
- `checkpoint`, `restore_checkpoint`
- `auto_fix_loop` tool
- QA loop UI + Undo button
- Problems panel

**Day 4 — Editor Integration:**
- Inline AI edit (selection → prompt)
- Agent cursor + ghost text
- File reference with line numbers + hover preview
- Diff blocks with Apply button

**Day 5 — Context & Memory:**
- `get_relevant_files` via simple keyword search (free)
- File summarizer
- AGENT.md auto-update
- Memory panel

---

## 13) EXAMPLE AGENT FLOW WITH NEW FEATURES

User: "Make hero more bold and add pricing"

Old flow: Agent reads files, edits, maybe breaks.

New flow:
1. Agent calls `create_plan` → UI shows:
   ```
   [Plan] Make hero bold + add pricing
   - [ ] Analyze hero section (index.html:10-30)
   - [ ] Make hero bold (edit_css_rule)
   - [ ] Create pricing component (batch_create)
   - [ ] QA check
   ```
   User clicks Approve.

2. Agent calls `read_file_outline` + `get_file_symbols` → cheap context.

3. Agent outputs:
   ````md
   ```onyx:diff
   {"path":"style.css","old":".hero { font-weight:400 }","new":".hero { font-weight:800; letter-spacing:-0.02em }"}
   ```
   ````
   UI shows side-by-side diff with Accept.

4. On Accept, calls `edit_css_rule` + `checkpoint`.

5. Creates pricing via `onyx:file-tree` → user sees 3 files, clicks Create All.

6. Runs `run_qa_suite` + `test_responsive_layout` → if fail, auto-fixes.

7. Shows `onyx:command-suggestions` → [Make responsive] [Add animations] [Deploy]

All free, all local except LLM call.

---

**Total: 143 coding-agent-specific features. Every one makes the agent more autonomous, more observable, more fixable.**
