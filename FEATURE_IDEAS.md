# OnyxHTML Agent — 200+ Feature Ideas Backlog

> Analyzed full codebase on 2026-05-13. Current app = HomeScreen + 3-zone IDE (FileExplorer | CodeMirror | Preview iframe with bridge) + ChatPanel with SSE streaming + tool cards + prompt box + settings + command palette. Missing a TON of modern AI-IDE delight, free-tool integrations, and structured-response UI magic.

---

## 0) Codebase Gap Analysis — What's Missing Right Now

**Editor:**
- No multi-file search UI (only tool, no UI)
- No global find/replace panel
- No minimap toggle actually works well
- No Emmet, no autocomplete for Tailwind classes
- No image asset manager / drag-drop
- No file upload / binary handling
- No version history / undo stack per file / time-travel
- No diff view (AI vs original)

**Preview:**
- No real screenshot (SVG foreignObject hack, no canvas)
- No inspect element picker (button exists, no overlay)
- No responsive ruler, no breakpoints overlay
- No accessibility / lighthouse style overlay
- No network waterfall UI
- No localStorage / cookie inspector

**Chat / AI:**
- Markdown renderer is barebones (no mermaid, no math, no tables styling, no collapsible sections, no artifact)
- No structured UI parsing — AI can only output text + tool calls, no rich interactive widgets
- No voice input, no slash commands, no @mentions autocomplete UI
- No prompt library / saved prompts
- No chat branching / fork
- No token usage / cost display
- No vision (upload screenshot -> AI sees it)

**Workspace:**
- No share / publish / deploy button (Vercel/Netlify one-click)
- No export to CodePen / StackBlitz
- No import from URL / GitHub
- No templates marketplace
- No component library

---

## 1) 🔧 AI Tools Using Unlimited FREE Things (No API key needed)

These are tools the AI can call that cost $0 — all client-side or free public CDNs.

### Free Generation Tools
1. **QR Code Generator** — `generate_qr(text, size)` -> renders QR in preview using `qrcode.js` CDN
2. **Barcode Generator** — EAN, CODE128 via JsBarcode
3. **Favicon Generator** — from emoji / letter / SVG
4. **OG Image Generator** — canvas-based open graph image, save as png in workspace
5. **Color Palette Generator** — `generate_palette(mood, baseColor)` -> returns 5 colors, injects CSS variables
6. **Gradient Generator** — AI outputs gradient intent, tool returns CSS + preview card
7. **Pattern Generator** — CSS patterns (dots, stripes) via css-doodle / SVG
8. **Lorem Generator** — structured lorem for any niche (startup, coffee shop, etc)
9. **Fake Data Generator** — faker.js browser build: users, products, testimonials
10. **Icon Picker** — search lucide, heroicons, simple-icons — tool returns SVG file and installs
11. **Illustration Picker** — unDraw, Open Peeps, DiceBear avatars via free CDN
12. **Unsplash / Picsum** — `fetch_free_images(query, count)` -> downloads placeholder images to `/assets/`
13. **Font Pairing Tool** — Google Fonts free API, AI picks heading/body pair, injects link tags
14. **Shadow / Glassmorphism Generator** — returns Tailwind / CSS
15. **Animation Preset Tool** — animate.css + motion presets, AI picks `fade-up` etc

### Free Audit & Transform Tools
16. **Image Optimizer** — browser Canvas compress, WebP convert via `browser-image-compression` (free)
17. **SVG Optimizer** — SVGO wasm in browser
18. **HTML Formatter / Minifier** — prettier already there, add minify tool
19. **CSS Autoprefixer** — postcss in browser
20. **Accessibility Checker** — axe-core wasm scan in preview iframe -> returns violations
21. **SEO Checker** — check meta, h1, alt, title length, og tags -> returns score card
22. **Link Checker** — already have check_links, but expand to external link validation via fetch
23. **Performance Hint Tool** — calculate image sizes, unused CSS via Coverage API
24. **Contrast Checker** — WCAG contrast for all text nodes
25. **Spellcheck** — cspell wasm

### Free Utility Tools (AI loves these)
26. **HTML to JSX / JSX to HTML** converter
27. **CSS to Tailwind converter** — free mapping
28. **Table to HTML converter** — paste CSV -> HTML table file
29. **JSON to UI** — `json_to_ui(json)` -> generates card/table/list
30. **Regex Generator / Tester** — AI writes regex, tool tests live
31. **Cron Expression Visualizer**
32. **Timezone / Date formatter** — dayjs free
33. **Currency / Number formatter**
34. **Markdown to HTML importer**
35. **Sitemap Generator** — scans workspace files -> sitemap.xml
36. **Robots.txt Generator**
37. **.htaccess / _redirects generator**
38. **PWA Manifest Generator** — icons + manifest.json + sw.js registration
39. **Schema.org JSON-LD Generator** — FAQ, Product, Article
40. **Meta Tags Generator** — Open Graph, Twitter Cards

---

## 2) 🧩 Structured AI Response → Special UI Components (The Big Unlock)

**Idea:** If AI outputs a fenced code block with ` ```onyx:componentName` or `:::onyx-component`, we parse it and render a RICH interactive React component inline in chat, not just markdown.

### Protocol Proposal
````md
```onyx:color-palette
{ "colors": ["#7c3aed","#3b82f6"], "name": "Violet Dream" }
```
```onyx:chart
{ "type": "bar", "data": [{"name":"A","value":10}] }
```
:::onyx:file-diff
path: index.html
...
:::
````

### Component Library (50+ ideas)
41. **onyx:color-palette** — swatches with copy hex, apply to CSS vars button
42. **onyx:gradient** — visual gradient + CSS + Tailwind
43. **onyx:font-preview** — live font pair preview with apply button
44. **onyx:icon-grid** — searchable icon grid, click to insert SVG
45. **onyx:image-gallery** — gallery of generated/unsplash images, click to add to workspace
46. **onyx:chart** — Recharts bar/line/pie rendered in chat, export to component
47. **onyx:table** — editable table, sort, filter, export CSV, convert to HTML
48. **onyx:kanban** — parse AI todo list `[]` into Kanban board (Todo/Doing/Done)
49. **onyx:diff** — Monaco diff editor, Accept/Reject buttons -> apply to file
50. **onyx:file-tree** — proposed file structure, click to create all files
51. **onyx:preview-card** — live mini-iframe preview of a component
52. **onyx:device-preview** — same component in desktop/tablet/mobile frames side-by-side
53. **onyx:form-builder** — JSON schema -> drag-drop form builder, generate HTML
54. **onyx:pricing-table** — editable pricing tiers, toggle monthly/yearly
55. **onyx:test-report** — QA suite visual report with pass/fail, progress ring
56. **onyx:seo-score** — circular score, checklist
57. **onyx:a11y-report** — violations list with fix buttons
58. **onyx:palette-from-image** — extract palette from uploaded image via Canvas
59. **onyx:animation-timeline** — scrubber for CSS keyframes
60. **onyx:code-playground** — runnable HTML/CSS/JS snippet with console
61. **onyx:component-props** — props table for a component, edit live
62. **onyx:api-tester** — interactive fetch UI for test_api_endpoint result
63. **onyx:regex-tester** — live regex tester
64. **onyx:cron-visualizer**
65. **onyx:color-contrast** — two colors + WCAG ratio + pass/fail
66. **onyx:qr-preview** — QR + download PNG
67. **onyx:og-preview** — Facebook/Twitter/Google preview of OG tags
68. **onyx:responsive-matrix** — screenshot at 4 widths in a grid
69. **onyx:component-variants** — button with 6 variants, click to copy
70. **onyx:shadow-lab** — sliders for shadow, live preview
71. **onyx:glass-lab** — backdrop blur + opacity sliders
72. **onyx:typography-scale** — type scale visualizer
73. **onyx:layout-grid** — CSS grid visual builder
74. **onyx:flex-builder** — flexbox interactive
75. **onyx:token-editor** — design tokens JSON -> visual editor
76. **onyx:prompt-enhancer** — original prompt + enhanced prompt + copy
77. **onyx:command-palette** — list of commands AI suggests, click to run
78. **onyx:checklist** — interactive checklist with progress
79. **onyx:timeline** — project timeline / roadmap
80. **onyx:mindmap** — simple mindmap from markdown list
81. **onyx:flowchart** — flowchart from steps
82. **onyx:comparison-slider** — before/after image slider (for redesign)
83. **onyx:file-compare** — two files side-by-side diff
84. **onyx:bundle-analyzer** — file sizes treemap
85. **onyx:deployment-card** — deploy status + logs + open URL

### Implementation Plan
- Extend `markdown.tsx` with custom remark plugin that detects `onyx:` language
- Create `/components/chat/onyx-components/` folder with 1 component per file
- Registry `ONYX_COMPONENTS: Record<string, Component>`
- Parser returns `{type, props}` and renders inline
- Each component has `onApply` -> calls workspace store or tool

---

## 3) ✨ AI Markdown Superpowers

86. **Mermaid Diagrams** — ` ```mermaid ` -> render flowchart, sequence, ERD (use mermaid.js)
87. **Math / LaTeX** — `$$` -> KaTeX
88. **Collapsible Sections** — `:::details Title` -> <Accordion>
89. **Tabs** — `:::tabs` -> shadcn Tabs with code in each tab (HTML/CSS/JS)
90. **Callouts** — `> [!NOTE]` GitHub style -> Alert component
91. **File Mention Pills** — already have, but enhance with hover preview + line numbers `index.html:42`
92. **Image Paste** — paste image -> upload to `/assets/` + markdown image + AI vision if provider supports
93. **Video Embed** — YouTube / Loom link -> embed preview
94. **Tweet / GitHub Embed** — link unfurl
95. **Diff Highlight** — ` ```diff ` -> green/red + copy
96. **Inline File Diff** — AI outputs `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` -> render diff card
97. **Copy as File** — any code block has "Create file" button with path suggestion
98. **Run Code Block** — JS code block has "Run in preview console" button
99. **Explain Code** — hover on code token -> tooltip explanation (via AI cache)
100. **AI Citation** — highlight text that came from a specific file
101. **Progressive Disclosure** — long markdown auto-collapses after 500px with "Show more"
102. **Table of Contents** — auto TOC from headings in assistant message
103. **Footnote Popovers** — hover footnote
104. **Emoji Reactions** — quick reactions to AI messages (👍, 🔥, 👎) -> trains prompt
105. **Message Bookmarks** — star message -> saved prompts library

---

## 4) 🎨 UI Improvements — 30 High-Impact Ideas

106. **Command Palette 2.0** — add "Ask AI to..." input inside palette, recent files, actions like "Make responsive", "Add dark mode"
107. **File Explorer: Drag & Drop** — reorder files, drag into folder, drag from OS to upload
108. **File Explorer: Image Thumbnails** — show thumbnail for png/jpg/svg
109. **File Explorer: Search + Filter** — fuzzy search, filter by type
110. **File Explorer: Git Status Colors** — new/modified (compare to last AI checkpoint)
111. **Editor: Breadcrumbs** — path breadcrumbs + tag breadcrumbs for HTML
112. **Editor: Minimap with Errors** — red dots where lint errors are
113. **Editor: Inline Color Picker** — click color hex -> color picker popup
114. **Editor: Tailwind Autocomplete** — class suggestions with preview swatch
115. **Editor: Emmet** — `div>ul>li*3` expansion
116. **Editor: Multi-cursor AI Edit** — show AI edits as ghost text like Copilot
117. **Editor: Command Menu on Right-Click** — "Ask AI to refactor this selection"
118. **Preview: Element Picker** — click element in preview -> highlight in editor + show styles
119. **Preview: Box Model Visualizer** — margin/padding overlay
120. **Preview: Ruler & Guides** — 8px grid toggle
121. **Preview: CSS Inspector Panel** — right sidebar showing computed styles of selected element
122. **Preview: Console Command Input** — input to run JS directly (like devtools)
123. **Preview: Network Waterfall** — visualize resource load times
124. **Chat: Slash Commands** — `/fix`, `/responsive`, `/dark`, `/seo`, `/explain`, `/test`
125. **Chat: Prompt Library Button** — dropdown of 50 curated prompts
126. **Chat: Voice Input** — Web Speech API, free
127. **Chat: Image Upload** — drag image to prompt box -> vision
128. **Chat: File Attachments Grid** — show attached files as chips with preview
129. **Chat: Branching** — fork chat from any message, compare two approaches side-by-side
130. **Chat: Timeline Scrubber** — scrub through file changes over time
131. **Workspace Header: Version History** — dropdown of checkpoints, restore
132. **Workspace Header: Share Button** — copy link, publish to `*.onyxhtml.app` (free via Cloudflare Pages)
133. **Home Screen: Import from URL / GitHub** — paste URL -> scrape / clone starter
134. **Home Screen: Template Marketplace** — 20+ templates with live preview thumbnails
135. **Settings: Keyboard Shortcuts Cheatsheet** — `?` to open, searchable

---

## 5) 🛠️ Editor & Workspace Power Features

136. **Split Editor** — two files side-by-side
137. **Zen Mode** — hide all panels, focus code
138. **Vim / Emacs Keybindings** toggle
139. **Auto Import CDN** — type `gsap` -> suggests `<script src="https://cdn.jsdelivr.net/npm/gsap">`
140. **Package Search** — search jsDelivr / cdnjs, insert import
141. **Asset Manager** — `/assets/` folder with grid view, upload, rename, optimize, copy URL
142. **Snippet Library** — user + AI snippets, e.g., `navbar`, `hero`, `footer`
143. **Component Library** — save selection as component, reuse
144. **Design Token Panel** — edit colors, spacing, radius, fonts globally
145. **CSS Variables Visual Editor** — `:root` vars as color pickers / sliders
146. **Tailwind Config Visual Editor** — if tailwind detected, show config UI
147. **Global Find & Replace UI** — with regex, preview replacements
148. **Refactor Rename** — rename class/id across all files
149. **Duplicate File / Folder**
150. **Zip Export with Options** — minified, with assets, as single HTML file (inline all)
151. **Import Zip** — drag zip to import
152. **Workspace Templates: Save as Template** — save current workspace as custom template
153. **Offline Support** — service worker already exists, make it full offline with IndexedDB sync
154. **Auto-save Indicator** — more granular: saving / saved / offline
155. **Conflict Resolution** — if file changed both by user and AI, show merge UI

---

## 6) 🤖 AI Agent Capabilities (Unlimited Free Logic)

156. **Vision Tool** — `analyze_screenshot()` -> AI describes UI, suggests fixes (free if provider supports vision, else use local moondream wasm)
157. **Self-Reflection Loop** — after edit, AI auto-runs `run_qa_suite` + `test_responsive_layout` + fixes
158. **Multi-file Planning** — AI outputs plan as `onyx:file-tree` before editing
159. **User Intent Clarification** — if prompt vague, AI returns `onyx:checklist` of questions as buttons
160. **Design System Adherence** — AI reads existing CSS variables, reuses them
161. **Accessibility Auto-fix** — after `axe` scan, AI auto-fixes issues
162. **Performance Auto-fix** — large images -> auto compress
163. **SEO Auto-fix** — missing meta -> AI adds
164. **Component Generation** — "create a pricing component" -> generates isolated HTML file + preview card
165. **Page from Screenshot** — user uploads screenshot, AI recreates HTML (vision)
166. **Figma to HTML** — paste Figma link (via free Figma API) -> HTML
167. **Voice to Code** — speech -> text -> code
168. **AI Code Review** — button "Review my code" -> AI comments inline like PR review
169. **AI Commit Messages** — auto-generate commit message for changes
170. **AI Changelog** — summarize what changed in this session

---

## 7) 📤 Sharing, Export, Deploy (Free Tiers)

171. **One-Click Deploy to Cloudflare Pages / Netlify / Vercel** — via drag-drop API (free)
172. **Share as Link** — generate `https://preview.onyxhtml.app/w/{id}` with readonly view
173. **Embed Code** — iframe embed for portfolio
174. **Export as Single HTML** — inline CSS/JS/images as base64
175. **Export to CodePen / JSFiddle / StackBlitz** — open in new tab with code prefilled
176. **Download as PNG** — screenshot via html2canvas (free)
177. **Download as PDF** — via browser print API
178. **Copy as React / Vue / Svelte** — convert HTML to framework component
179. **GitHub Export** — create gist / repo (via user token)
180. **QR for Preview** — QR code to open preview on phone

---

## 8) 🧪 Testing & QA (Free)

181. **Visual Regression** — save baseline screenshot, compare after AI edit, show diff
182. **Lighthouse Score Card** — run lighthouse in browser (free lib `lighthouse` not trivial, but use simple metrics)
183. **Link Rot Checker UI** — table of all links with status
184. **Console Error Zero Goal** — badge "0 errors" green, else red with fix button
185. **Test Coverage Bar** — how many asserts passed
186. **Responsive Screenshot Matrix** — 4 screenshots in grid, download zip
187. **User Flow Recorder** — record clicks in preview, generate `run_e2e_test` script
188. **Fuzz Testing** — random form inputs, check no crash

---

## 9) 🎯 Monetizable / Pro but Built with Free Tech

189. **Custom Domain** (pro) — but UI ready
190. **Team Workspaces** — share workspace with link, live cursors via Yjs (free CRDT)
191. **Comments** — leave comment on line / element, AI resolves
192. **AI Credits Indicator** — show tokens used, even for free providers
193. **Prompt Marketplace** — community prompts
194. **Plugin System** — JS plugins that add tools (free)

---

## 10) ✨ Delight & Polish (10 small but wow)

195. **Confetti on Deploy / Success** — canvas-confetti (free)
196. **Sound Effects** — toggle, subtle pop on send
197. **Cursor Chat** — show AI typing cursor in editor like multiplayer
198. **Ghost Text** — AI suggestion ghost text in editor
199. **Command K Spotlight** — like Raycast
200. **Onboarding Tour** — driver.js free
201. **Empty State Illustrations** — custom SVG
202. **Easter Egg** — Konami code -> rainbow mode
203. **Achievements** — "First deploy", "100 edits" badges
204. **Daily Streak** — fire icon

---

## 11) 📐 Implementation Priority (Suggested Order)

**Week 1 — Quick Wins (no backend):**
- Mermaid + Callouts + Tabs in markdown.tsx
- Slash commands in prompt-box.tsx
- Voice input (Web Speech API)
- Color picker inline in editor
- QR / Palette / Lorem free tools (add to tools.ts)
- Confetti + Sound toggle
- File thumbnails + drag-drop upload

**Week 2 — Structured UI System:**
- Create `onyx:` parser + registry
- Build 10 core components: color-palette, chart, table, diff, file-tree, preview-card, seo-score, qr-preview, kanban, checklist
- Wire `onApply` to workspace store

**Week 3 — Preview Superpowers:**
- Element picker + CSS inspector
- Ruler / grid toggle
- Real screenshot via html2canvas
- Console command input

**Week 4 — Editor & Workspace:**
- Asset manager
- Split editor
- Version history / checkpoints
- Global search UI
- Deploy / Share button

---

## 12) Example AI Prompt That Would Trigger Special UI

User: "Create a landing page for a coffee shop"

AI should output:

```md
Here's a warm palette for a coffee shop:

```onyx:color-palette
{ "name": "Espresso", "colors": ["#3c2415","#a47551","#f5e6d3","#d4a574","#2c1810"] }
```

And a pricing table:

```onyx:pricing-table
{ "plans": [{"name":"Espresso","price":"$3.5","features":["Single shot","Oat milk"]}] }
```

File structure:

```onyx:file-tree
{ "files": ["index.html","style.css","script.js","assets/hero.jpg"] }
```

Now building...
```

Each of those blocks renders as interactive UI, not just code.

---

## 13) Unlimited Free APIs to Leverage

- **DiceBear** — avatars
- **Picsum / Unsplash Source** — images
- **Google Fonts** — fonts
- **cdnjs / jsDelivr** — libraries
- **Heroicons / Lucide / Simple Icons** — icons (already have lucide)
- **undraw / Open Peeps** — illustrations
- **html2canvas** — screenshots
- **axe-core** — a11y
- **fuse.js** — fuzzy search
- **prettier** — formatting (already)
- **qrcode.js** — QR
- **canvas-confetti** — delight
- **driver.js** — onboarding
- **mermaid** — diagrams
- **katex** — math
- **Yjs** — collaboration
- **Comlink** — web workers
- **Web Speech API** — voice
- **EyeDropper API** — color picker
- **File System Access API** — native file open
- **Clipboard API** — copy/paste

All free, all browser-native or CDN.

---

**Total: 204 feature ideas. Pick 10 per sprint. The `onyx:` component system is the highest leverage — turns chat from text into an app builder.**
