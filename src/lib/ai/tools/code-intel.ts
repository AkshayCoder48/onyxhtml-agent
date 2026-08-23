// Free, local code intelligence — no API, no wasm (regex-based, fast)
// Used by new coding-agent tools

export type OutlineNode = {
  tag?: string;
  id?: string;
  classes?: string[];
  text?: string;
  children?: OutlineNode[];
  line?: number;
};

export type FileSymbols = {
  ids: string[];
  classes: string[];
  tags: string[];
  functions: string[];
  variables: string[];
  selectors: string[]; // css selectors
  imports: string[]; // script/link href/src
};

export function getLines(content: string, start: number, end: number): { lines: string[]; total: number } {
  const all = content.split("\n");
  const total = all.length;
  const s = Math.max(1, start) - 1;
  const e = Math.min(total, end);
  return { lines: all.slice(s, e), total };
}

export function outlineHtml(content: string): OutlineNode[] {
  // Very lightweight HTML outline via regex, not full parser
  const nodes: OutlineNode[] = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  const stack: OutlineNode[] = [];
  const lines = content.split("\n");
  // Build line index for tag positions
  let pos = 0;
  const lineStarts: number[] = [0];
  for (const line of lines) {
    pos += line.length + 1;
    lineStarts.push(pos);
  }
  function getLine(offset: number): number {
    for (let i = 0; i < lineStarts.length - 1; i++) {
      if (offset >= lineStarts[i] && offset < lineStarts[i + 1]) return i + 1;
    }
    return 1;
  }

  while ((m = tagRe.exec(content)) !== null) {
    const tag = m[1].toLowerCase();
    if (["br", "hr", "img", "input", "meta", "link"].includes(tag)) continue;
    const attrStr = m[2];
    const idMatch = attrStr.match(/id\s*=\s*["']([^"']+)["']/);
    const classMatch = attrStr.match(/class\s*=\s*["']([^"']+)["']/);
    const node: OutlineNode = {
      tag,
      id: idMatch?.[1],
      classes: classMatch?.[1]?.split(/\s+/).filter(Boolean) ?? [],
      line: getLine(m.index),
    };
    if (tag.startsWith("/")) {
      stack.pop();
      continue;
    }
    if (stack.length === 0) nodes.push(node);
    else {
      const parent = stack[stack.length - 1];
      parent.children = parent.children || [];
      if (parent.children.length < 20) parent.children.push(node); // limit breadth
    }
    if (!m[0].endsWith("/>")) {
      if (stack.length < 10) stack.push(node);
    }
    if (nodes.length > 100) break;
  }
  return nodes;
}

export function extractSymbols(content: string, path: string): FileSymbols {
  const ids: Set<string> = new Set();
  const classes: Set<string> = new Set();
  const tags: Set<string> = new Set();
  const functions: Set<string> = new Set();
  const variables: Set<string> = new Set();
  const selectors: Set<string> = new Set();
  const imports: Set<string> = new Set();

  if (path.endsWith(".html") || path.endsWith(".htm")) {
    const idRe = /id\s*=\s*["']([^"']+)["']/g;
    const classRe = /class\s*=\s*["']([^"']+)["']/g;
    const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b/g;
    const srcRe = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = idRe.exec(content)) !== null) ids.add(m[1]);
    while ((m = classRe.exec(content)) !== null) {
      m[1].split(/\s+/).forEach((c) => c && classes.add(c));
    }
    while ((m = tagRe.exec(content)) !== null) tags.add(m[1].toLowerCase());
    while ((m = srcRe.exec(content)) !== null) {
      if (!m[1].startsWith("http") && !m[1].startsWith("data:") && !m[1].startsWith("#")) imports.add(m[1]);
    }
  }
  if (path.endsWith(".css")) {
    const selRe = /([.#]?[a-zA-Z0-9_-]+)\s*\{/g;
    const classRe = /\.([a-zA-Z0-9_-]+)/g;
    const idRe = /#([a-zA-Z0-9_-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = selRe.exec(content)) !== null) selectors.add(m[1].trim());
    while ((m = classRe.exec(content)) !== null) classes.add(m[1]);
    while ((m = idRe.exec(content)) !== null) ids.add(m[1]);
  }
  if (path.endsWith(".js") || path.endsWith(".ts") || path.endsWith(".jsx") || path.endsWith(".tsx")) {
    const funcRe = /(?:function\s+([a-zA-Z0-9_]+)|const\s+([a-zA-Z0-9_]+)\s*=\s*(?:\([^)]*\)\s*=>|function)|([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{)/g;
    const varRe = /(?:let|const|var)\s+([a-zA-Z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = funcRe.exec(content)) !== null) {
      const name = m[1] || m[2] || m[3];
      if (name) functions.add(name);
    }
    while ((m = varRe.exec(content)) !== null) variables.add(m[1]);
  }
  return {
    ids: Array.from(ids).slice(0, 100),
    classes: Array.from(classes).slice(0, 100),
    tags: Array.from(tags).slice(0, 100),
    functions: Array.from(functions).slice(0, 100),
    variables: Array.from(variables).slice(0, 100),
    selectors: Array.from(selectors).slice(0, 100),
    imports: Array.from(imports).slice(0, 100),
  };
}

export function findSymbolAcrossFiles(files: Map<string, { content: string }>, symbol: string) {
  const results: { path: string; line: number; text: string; type: string }[] = [];
  const lower = symbol.toLowerCase();
  for (const [path, file] of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lower)) {
        let type = "text";
        if (lines[i].includes(`.${symbol}`) || lines[i].includes(`class="${symbol}"`) || lines[i].includes(`class='${symbol}'`) || lines[i].includes(` ${symbol} `)) type = "class";
        if (lines[i].includes(`#${symbol}`) || lines[i].includes(`id="${symbol}"`)) type = "id";
        results.push({ path, line: i + 1, text: lines[i].trim().slice(0, 200), type });
        if (results.length >= 100) return results;
      }
    }
  }
  return results;
}

export function findUnusedCss(files: Map<string, { content: string }>) {
  const htmlClasses = new Set<string>();
  const htmlIds = new Set<string>();
  const cssFiles: { path: string; content: string }[] = [];

  for (const [path, file] of files) {
    if (path.endsWith(".html") || path.endsWith(".htm")) {
      const classRe = /class\s*=\s*["']([^"']+)["']/g;
      const idRe = /id\s*=\s*["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = classRe.exec(file.content)) !== null) {
        m[1].split(/\s+/).forEach((c) => c && htmlClasses.add(c));
      }
      while ((m = idRe.exec(file.content)) !== null) htmlIds.add(m[1]);
    }
    if (path.endsWith(".css")) cssFiles.push({ path, content: file.content });
  }

  const unused: { path: string; selector: string; type: string }[] = [];
  for (const css of cssFiles) {
    const classRe = /\.([a-zA-Z0-9_-]+)/g;
    const idRe = /#([a-zA-Z0-9_-]+)/g;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = classRe.exec(css.content)) !== null) {
      const cls = m[1];
      if (seen.has(`.${cls}`)) continue;
      seen.add(`.${cls}`);
      if (!htmlClasses.has(cls)) unused.push({ path: css.path, selector: `.${cls}`, type: "class" });
    }
    while ((m = idRe.exec(css.content)) !== null) {
      const id = m[1];
      if (seen.has(`#${id}`)) continue;
      seen.add(`#${id}`);
      if (!htmlIds.has(id)) unused.push({ path: css.path, selector: `#${id}`, type: "id" });
    }
  }
  return unused.slice(0, 100);
}

export function getDependencyGraph(files: Map<string, { content: string }>) {
  const nodes: { id: string; type: string }[] = [];
  const edges: { from: string; to: string; type: string }[] = [];
  const fileList = Array.from(files.keys());
  fileList.forEach((p) => nodes.push({ id: p, type: p.endsWith(".html") ? "html" : p.endsWith(".css") ? "css" : p.endsWith(".js") ? "js" : "other" }));

  for (const [path, file] of files) {
    if (path.endsWith(".html")) {
      const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(file.content)) !== null) {
        const dep = m[1].replace(/^\.?\//, "");
        if (fileList.includes(dep)) edges.push({ from: path, to: dep, type: dep.endsWith(".css") ? "stylesheet" : dep.endsWith(".js") ? "script" : "asset" });
      }
    }
  }
  return { nodes, edges };
}

export function validateHtml(content: string) {
  const errors: { line: number; message: string; type: string }[] = [];
  const lines = content.split("\n");
  // Check unclosed tags simple
  const stack: { tag: string; line: number }[] = [];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(line)) !== null) {
      const full = m[0];
      const tag = m[1].toLowerCase();
      if (full.startsWith("</")) {
        const last = stack[stack.length - 1];
        if (last && last.tag === tag) stack.pop();
        else if (stack.some((s) => s.tag === tag)) {
          errors.push({ line: i + 1, message: `Mismatched closing tag </${tag}>, expected </${last?.tag}>`, type: "mismatch" });
        }
      } else if (!full.endsWith("/>") && !voidTags.has(tag)) {
        stack.push({ tag, line: i + 1 });
      }
    }
  }
  for (const s of stack) errors.push({ line: s.line, message: `Unclosed <${s.tag}>`, type: "unclosed" });

  // Check duplicate ids
  const idMap = new Map<string, number>();
  const idRe = /id\s*=\s*["']([^"']+)["']/g;
  for (let i = 0; i < lines.length; i++) {
    let m: RegExpExecArray | null;
    idRe.lastIndex = 0;
    while ((m = idRe.exec(lines[i])) !== null) {
      const id = m[1];
      if (idMap.has(id)) errors.push({ line: i + 1, message: `Duplicate id "${id}" first at line ${idMap.get(id)}`, type: "duplicate-id" });
      else idMap.set(id, i + 1);
    }
  }
  return errors.slice(0, 50);
}

export function editCssRule(content: string, selector: string, property: string, value: string): string {
  // Try to find existing rule
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ruleRe = new RegExp(`(${escaped}\\s*\\{[^}]*)(\\})`, "i");
  const propRe = new RegExp(`(${property}\\s*:\\s*)[^;]+;?`, "i");
  if (ruleRe.test(content)) {
    return content.replace(ruleRe, (match, before, close) => {
      if (propRe.test(before)) {
        return before.replace(propRe, `$1${value};`) + close;
      } else {
        return before + `  ${property}: ${value};\n` + close;
      }
    });
  } else {
    // Append new rule
    return content.trim() + `\n\n${selector} {\n  ${property}: ${value};\n}\n`;
  }
}

export function addCssRule(content: string, selector: string, declarations: string): string {
  return content.trim() + `\n\n${selector} {\n  ${declarations}\n}\n`;
}

export function removeCssRule(content: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ruleRe = new RegExp(`${escaped}\\s*\\{[^}]*\\}\\s*`, "gi");
  return content.replace(ruleRe, "");
}

export function renameClassAcrossFiles(files: Map<string, { content: string; path: string }>, oldName: string, newName: string) {
  const updates: { path: string; oldContent: string; newContent: string }[] = [];
  for (const [path, file] of files) {
    let newContent = file.content;
    if (path.endsWith(".html")) {
      // class="... old ... " -> replace
      newContent = newContent.replace(new RegExp(`class\\s*=\\s*["'][^"']*\\b${oldName}\\b[^"']*["']`, "g"), (match) => {
        return match.replace(new RegExp(`\\b${oldName}\\b`, "g"), newName);
      });
    }
    if (path.endsWith(".css") || path.endsWith(".html") || path.endsWith(".js")) {
      // .oldName -> .newName in CSS selectors and JS
      const dotOld = new RegExp(`\\.${oldName}\\b`, "g");
      newContent = newContent.replace(dotOld, `.${newName}`);
    }
    if (newContent !== file.content) updates.push({ path, oldContent: file.content, newContent });
  }
  return updates;
}

export function getRelevantFiles(files: Map<string, { content: string }>, query: string, limit = 5) {
  const lower = query.toLowerCase();
  const scored: { path: string; score: number }[] = [];
  for (const [path, file] of files) {
    const contentLower = file.content.toLowerCase();
    let score = 0;
    const terms = lower.split(/\s+/).filter(Boolean);
    for (const term of terms) {
      if (path.toLowerCase().includes(term)) score += 10;
      const matches = (contentLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      score += matches;
    }
    if (score > 0) scored.push({ path, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
