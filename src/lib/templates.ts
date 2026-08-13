export type TemplateKey = "blank" | "landing" | "portfolio" | "docs";

export type TemplateFile = {
  path: string;
  content: string;
};

export type Template = {
  key: TemplateKey;
  name: string;
  description: string;
  files: TemplateFile[];
};

export const TEMPLATES: Record<TemplateKey, Template> = {
  blank: {
    key: "blank",
    name: "Blank",
    description: "Start from an empty HTML page.",
    files: [
      {
        path: "index.html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Page</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>Hello, world.</h1>
    <p>Edit this file to start building.</p>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
      },
      {
        path: "style.css",
        content: `* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: #0f172a;
  background: #f8fafc;
}
main {
  max-width: 720px;
  margin: 0 auto;
  padding: 4rem 1.5rem;
}
h1 { font-size: 2rem; }
`,
      },
      {
        path: "script.js",
        content: `console.log("Page loaded");
`,
      },
    ],
  },
  landing: {
    key: "landing",
    name: "Landing Page",
    description: "A responsive SaaS landing page.",
    files: [
      {
        path: "index.html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nimbus — Ship faster</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="nav">
    <div class="brand">◆ Nimbus</div>
    <nav>
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="#" class="btn primary">Get started</a>
    </nav>
  </header>
  <section class="hero">
    <h1>Ship products your users love</h1>
    <p>The modern platform to plan, build, and launch — all in one place.</p>
    <div class="cta">
      <a href="#" class="btn primary lg">Start free</a>
      <a href="#" class="btn ghost lg">View demo</a>
    </div>
  </section>
  <section id="features" class="features">
    <div class="card"><h3>Fast</h3><p>Optimized for performance out of the box.</p></div>
    <div class="card"><h3>Reliable</h3><p>Built on a robust, battle-tested stack.</p></div>
    <div class="card"><h3>Simple</h3><p>Designed to get out of your way.</p></div>
  </section>
  <section id="pricing" class="pricing">
    <h2>Simple pricing</h2>
    <div class="plan"><h3>Starter</h3><div class="price">$0</div><a href="#" class="btn primary">Choose</a></div>
    <div class="plan featured"><h3>Pro</h3><div class="price">$19</div><a href="#" class="btn primary">Choose</a></div>
    <div class="plan"><h3>Team</h3><div class="price">$49</div><a href="#" class="btn primary">Choose</a></div>
  </section>
  <footer>© 2025 Nimbus. All rights reserved.</footer>
  <script src="script.js"></script>
</body>
</html>
`,
      },
      {
        path: "style.css",
        content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; background: #fff; line-height: 1.5; }
a { color: inherit; text-decoration: none; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; border-bottom: 1px solid #e2e8f0; }
.brand { font-weight: 700; font-size: 1.1rem; }
.nav nav { display: flex; gap: 1.25rem; align-items: center; }
.btn { padding: 0.5rem 1rem; border-radius: 8px; font-weight: 500; display: inline-block; border: 1px solid transparent; }
.btn.primary { background: #0f172a; color: #fff; }
.btn.ghost { border-color: #e2e8f0; }
.btn.lg { padding: 0.75rem 1.5rem; font-size: 1rem; }
.hero { text-align: center; padding: 6rem 1.5rem; max-width: 800px; margin: 0 auto; }
.hero h1 { font-size: clamp(2rem, 5vw, 3.25rem); line-height: 1.1; }
.hero p { margin: 1rem auto 2rem; color: #475569; font-size: 1.15rem; }
.cta { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; padding: 3rem 2rem; max-width: 1000px; margin: 0 auto; }
.card { padding: 1.5rem; border: 1px solid #e2e8f0; border-radius: 12px; }
.card h3 { margin-bottom: 0.5rem; }
.card p { color: #475569; }
.pricing { padding: 4rem 2rem; text-align: center; }
.pricing h2 { font-size: 2rem; margin-bottom: 2rem; }
.plan { display: inline-block; width: 220px; vertical-align: top; padding: 2rem 1rem; border: 1px solid #e2e8f0; border-radius: 14px; margin: 0.5rem; }
.plan.featured { border-color: #0f172a; box-shadow: 0 10px 30px rgba(15,23,42,0.08); }
.price { font-size: 2.25rem; font-weight: 700; margin: 0.75rem 0 1rem; }
footer { text-align: center; padding: 2rem; color: #64748b; border-top: 1px solid #e2e8f0; }
@media (max-width: 640px) { .nav nav a:not(.btn){ display:none; } }
`,
      },
      {
        path: "script.js",
        content: `document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
  });
});
console.log('Nimbus landing loaded');
`,
      },
    ],
  },
  portfolio: {
    key: "portfolio",
    name: "Portfolio",
    description: "A personal portfolio site.",
    files: [
      {
        path: "index.html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alex Rivera — Portfolio</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="nav">
    <div class="brand">AR</div>
    <nav><a href="#work">Work</a><a href="#about">About</a><a href="#contact" class="btn primary">Contact</a></nav>
  </header>
  <section class="hero">
    <h1>Alex Rivera</h1>
    <p>Product designer & front-end developer crafting clean, usable interfaces.</p>
  </section>
  <section id="work" class="work">
    <h2>Selected work</h2>
    <div class="grid">
      <article class="project"><div class="thumb">01</div><h3>Cartograph</h3><p>A collaborative map editor.</p></article>
      <article class="project"><div class="thumb">02</div><h3>Lumen</h3><p>A focus timer for makers.</p></article>
      <article class="project"><div class="thumb">03</div><h3>Atlas</h3><p>A reading list companion.</p></article>
      <article class="project"><div class="thumb">04</div><h3>Forge</h3><p>A design tokens toolkit.</p></article>
    </div>
  </section>
  <footer id="contact"><p>Get in touch — <a href="mailto:hello@example.com">hello@example.com</a></p></footer>
  <script src="script.js"></script>
</body>
</html>
`,
      },
      {
        path: "style.css",
        content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111827; background: #fafaf9; }
a { color: inherit; text-decoration: none; }
.nav { display:flex; justify-content:space-between; align-items:center; padding: 1.25rem 2rem; }
.brand { font-weight: 800; letter-spacing: 0.1em; }
.nav nav { display:flex; gap: 1.5rem; align-items:center; }
.btn { padding: 0.5rem 1rem; border-radius: 999px; }
.btn.primary { background:#111827; color:#fff; }
.hero { padding: 5rem 2rem; max-width: 760px; margin: 0 auto; }
.hero h1 { font-size: clamp(2.5rem, 6vw, 4rem); }
.hero p { margin-top: 1rem; color:#4b5563; font-size: 1.15rem; }
.work { padding: 3rem 2rem; max-width: 1000px; margin: 0 auto; }
.work h2 { font-size: 1.5rem; margin-bottom: 1.5rem; }
.grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.project { background:#fff; border:1px solid #e5e7eb; border-radius: 14px; padding: 1.5rem; }
.thumb { width:48px; height:48px; border-radius:12px; background:#f3f4f6; display:flex; align-items:center; justify-content:center; font-weight:700; margin-bottom: 1rem; }
.project h3 { margin-bottom: 0.25rem; }
.project p { color:#6b7280; }
footer { text-align:center; padding: 4rem 2rem; color:#6b7280; border-top: 1px solid #e5e7eb; }
`,
      },
      {
        path: "script.js",
        content: `console.log('Portfolio loaded');
`,
      },
    ],
  },
  docs: {
    key: "docs",
    name: "Documentation",
    description: "A clean documentation site.",
    files: [
      {
        path: "index.html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Docs — Getting Started</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="topbar"><div class="brand">📘 Docs</div><input class="search" placeholder="Search docs..." /></header>
  <div class="layout">
    <aside class="sidebar">
      <p class="group">Getting Started</p>
      <a href="#" class="active">Introduction</a>
      <a href="#">Installation</a>
      <a href="#">Quick start</a>
      <p class="group">Guides</p>
      <a href="#">Configuration</a>
      <a href="#">Components</a>
    </aside>
    <main class="content">
      <h1>Introduction</h1>
      <p>Welcome to the documentation. This is a static docs template you can edit freely.</p>
      <h2>Sections</h2>
      <ul><li>Getting started</li><li>Guides</li><li>API reference</li></ul>
      <pre><code>npm install docs</code></pre>
    </main>
  </div>
  <script src="script.js"></script>
</body>
</html>
`,
      },
      {
        path: "style.css",
        content: `* { box-sizing: border-box; margin:0; padding:0; }
body { font-family: ui-sans-serif, system-ui, sans-serif; color:#1f2937; background:#fff; }
.topbar { display:flex; align-items:center; gap:1.5rem; padding: 0.85rem 1.5rem; border-bottom:1px solid #e5e7eb; }
.brand { font-weight:700; }
.search { flex:1; max-width: 320px; padding: 0.5rem 0.85rem; border:1px solid #e5e7eb; border-radius:8px; }
.layout { display:grid; grid-template-columns: 220px 1fr; }
.sidebar { padding: 1.5rem 1rem; border-right:1px solid #f1f5f9; }
.sidebar a { display:block; padding: 0.4rem 0.75rem; border-radius:6px; color:#475569; }
.sidebar a.active, .sidebar a:hover { background:#f1f5f9; color:#0f172a; }
.group { margin: 1rem 0 0.35rem; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; }
.content { padding: 2.5rem 3rem; max-width: 760px; }
.content h1 { font-size:2rem; margin-bottom:0.75rem; }
.content h2 { margin:1.5rem 0 0.5rem; font-size:1.25rem; }
.content p, .content li { color:#475569; line-height:1.6; }
.content ul { padding-left:1.25rem; margin:0.5rem 0; }
.content pre { background:#0f172a; color:#e2e8f0; padding:1rem; border-radius:8px; margin:1rem 0; overflow:auto; }
.content code { font-family: ui-monospace, monospace; }
@media (max-width: 760px){ .layout{ grid-template-columns:1fr; } .sidebar{ display:none; } }
`,
      },
      {
        path: "script.js",
        content: `console.log('Docs loaded');
`,
      },
    ],
  },
};
