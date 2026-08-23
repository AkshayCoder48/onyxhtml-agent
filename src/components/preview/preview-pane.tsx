"use client";

import * as React from "react";
import {
  RefreshCw,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  Globe,
  ArrowLeft,
  ArrowRight,
  MoreVertical,
  Maximize,
  Search as SearchIcon,
  Terminal,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSettings } from "@/hooks/use-settings";
import { findEntryFile } from "@/lib/files";
import { DEVICE_SIZES, type PreviewDevice } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PreviewConsoleMessage = {
  level: "log" | "warn" | "error" | "info";
  args: unknown[];
  time: number;
};

export type PreviewError = {
  message: string;
  filename?: string;
  line?: number;
  col?: number;
  time: number;
};

export type PreviewNetworkEntry = {
  url: string;
  status?: number;
  type: string;
  time: number;
};

// Bridge script injected into the preview iframe. Runs inside the iframe's
// window context. Captures console/error/network events and forwards them to
// the parent, and handles browser-tool commands posted from the host.
//
// NOTE: This is a template literal in the React component scope, so we must
// NOT use ${...} here (it would be interpolated by the host). All string
// building inside the iframe uses string concatenation.
const BRIDGE_SCRIPT = `
(function(){
  "use strict";
  var send = function(msg){ try { var m = msg || {}; m.source = "preview"; parent.postMessage(m, "*"); } catch(e){} };
  var logs = [];
  var errs = [];
  var networkErrors = [];
  var wrap = function(level){ return function(){
    try {
      var args = Array.prototype.slice.call(arguments);
      var safe = args.map(function(a){
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === "object") { try { return JSON.stringify(a); } catch(e){ return String(a); } }
        return String(a);
      });
      var entry = { level: level, args: safe, time: Date.now() };
      logs.push(entry);
      send(Object.assign({ kind: "console" }, entry));
    } catch(e){}
    return origConsole[level].apply(console, arguments);
  }; };
  var origConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };
  console.log = wrap("log");
  console.warn = wrap("warn");
  console.error = wrap("error");
  console.info = wrap("info");

  window.addEventListener("error", function(e) {
    var m = { message: e.message || "Error", filename: e.filename, line: e.lineno, col: e.colno, time: Date.now() };
    errs.push(m);
    send(Object.assign({ kind: "error" }, m));
  });
  window.addEventListener("unhandledrejection", function(e) {
    var reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    var m = { message: "Unhandled promise rejection: " + reason, time: Date.now() };
    errs.push(m);
    send(Object.assign({ kind: "error" }, m));
  });
  // Capture failed resource loads (LINK / SCRIPT / IMG)
  window.addEventListener("error", function(e) {
    var tgt = e.target;
    if (tgt && tgt.tagName && (tgt.tagName === "LINK" || tgt.tagName === "SCRIPT" || tgt.tagName === "IMG")) {
      var entry = { url: tgt.src || tgt.href, type: tgt.tagName, status: 0, time: Date.now() };
      networkErrors.push(entry);
      send(Object.assign({ kind: "network" }, entry));
    }
  }, true);

  // Track long tasks (>50ms) for the test_performance tool. Browsers that
  // don't support PerformanceObserver simply report zero long tasks.
  window.__longTasks = window.__longTasks || [];
  try {
    if (typeof PerformanceObserver !== "undefined") {
      var po = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          window.__longTasks.push({ name: entries[i].name, duration: entries[i].duration, startTime: entries[i].startTime });
        }
      });
      po.observe({ entryTypes: ["longtask"] });
    }
  } catch(e) { /* unsupported — ignore */ }

  function announceReady(){ send({ kind: "ready", readyState: document.readyState }); }
  announceReady();
  if (document.readyState !== "complete") {
    window.addEventListener("load", announceReady);
  }

  // Inspect mode - highlight elements on hover and report clicks
  var inspectActive = false;
  var inspectOverlay = null;
  var lastInspectEl = null;
  function createInspectOverlay() {
    if (inspectOverlay) return inspectOverlay;
    var div = document.createElement("div");
    div.style.cssText = "position:fixed;pointer-events:none;z-index:999999;border:2px solid #8b5cf6;background:rgba(139,92,246,0.15);display:none;";
    document.body.appendChild(div);
    inspectOverlay = div;
    return div;
  }
  function enableInspect() {
    inspectActive = true;
    createInspectOverlay();
    document.body.style.cursor = "crosshair";
    send({ kind: "inspect-enabled" });
  }
  function disableInspect() {
    inspectActive = false;
    if (inspectOverlay) inspectOverlay.style.display = "none";
    document.body.style.cursor = "";
    lastInspectEl = null;
  }
  document.addEventListener("mousemove", function(e) {
    if (!inspectActive) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === inspectOverlay) return;
    lastInspectEl = el;
    var rect = el.getBoundingClientRect();
    var ov = createInspectOverlay();
    ov.style.display = "block";
    ov.style.left = rect.left + "px";
    ov.style.top = rect.top + "px";
    ov.style.width = rect.width + "px";
    ov.style.height = rect.height + "px";
  }, true);
  document.addEventListener("click", function(e) {
    if (!inspectActive) return;
    e.preventDefault();
    e.stopPropagation();
    var el = lastInspectEl || e.target;
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var at = el.attributes[i];
      attrs[at.name] = at.value;
    }
    var selector = el.tagName.toLowerCase();
    if (el.id) selector += "#" + el.id;
    else if (el.className && typeof el.className === "string") {
      var cls = el.className.trim().split(/\s+/).slice(0,2).join(".");
      if (cls) selector += "." + cls;
    }
    send({
      kind: "inspect-pick",
      tag: el.tagName,
      selector: selector,
      attributes: attrs,
      text: (el.textContent || "").trim().slice(0,200),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      computedStyle: styleSummary(el),
      outerHTML: el.outerHTML.slice(0,2000)
    });
    disableInspect();
  }, true);
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && inspectActive) disableInspect();
  });

  // Host-side tools read these arrays directly (same-origin). Keep the
  // references stable so later console/error/network pushes are visible.
  window.__onyxPreview = { logs: logs, errs: errs, networkErrors: networkErrors };

  function styleSummary(el) {
    try {
      var cs = window.getComputedStyle(el);
      return {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        color: cs.color,
        backgroundColor: cs.backgroundColor
      };
    } catch (e) {
      return {};
    }
  }

  // JSON-safe value serializer (functions become "[Function]", cyclic/throws
  // fall back to String(v)). Used by browser_execute_js / terminal_exec.
  function ser(v) {
    try {
      if (typeof v === "object" && v !== null) {
        return JSON.parse(JSON.stringify(v, function(k, x){ return typeof x === "function" ? "[Function]" : x; }));
      }
      return v;
    } catch (e) {
      return String(v);
    }
  }

  window.addEventListener("message", async function(ev) {
    var data = ev.data;
    if (!data || data.source !== "workspace-host") return;
    if (data.action === "inspect-mode") {
      if (inspectActive) disableInspect(); else enableInspect();
      return;
    }
    if (data.action === "inspect-enable") {
      enableInspect();
      return;
    }
    if (data.action === "inspect-disable") {
      disableInspect();
      return;
    }
    if (data.action !== "browser-tool") return;
    var tool = data.tool, args = data.args || {}, callId = data.callId;
    var result, error;
    try {
      var $ = function(sel){ return document.querySelector(sel); };
      switch (tool) {
        case "open_page": {
          // The preview iframe always shows the workspace entry file, so
          // "opening" a page is a no-op — we just confirm the page is ready
          // and return the current URL/title. The 'url' arg (if any) is
          // ignored because we can't navigate the sandboxed iframe to
          // arbitrary URLs.
          result = {
            ok: true,
            url: window.location.href,
            title: document.title || "",
            ready: document.readyState,
          };
          break;
        }
        case "reload_page": {
          // Reload by re-setting srcDoc — but we can't do that from inside
          // the iframe. Instead, we signal the host to bump the preview
          // nonce. For now, just report the current state.
          result = {
            ok: true,
            note: "Reload requested. Use the Reload button in the preview toolbar to actually reload.",
            title: document.title || "",
          };
          break;
        }
        case "click": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          el.click();
          result = { ok: true };
          break;
        }
        case "type": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          el.focus();
          if (args.clear !== false) el.value = "";
          el.value = (el.value || "") + String(args.text != null ? args.text : "");
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          result = { value: el.value };
          break;
        }
        case "press_key": {
          var key = String(args.key != null ? args.key : "");
          var target = args.selector ? $(args.selector) : (document.activeElement || document.body);
          if (!target) throw new Error("Target not found");
          target.dispatchEvent(new KeyboardEvent("keydown", { key: key, bubbles: true }));
          target.dispatchEvent(new KeyboardEvent("keypress", { key: key, bubbles: true }));
          target.dispatchEvent(new KeyboardEvent("keyup", { key: key, bubbles: true }));
          result = { ok: true };
          break;
        }
        case "scroll": {
          if (args.selector) {
            var el = $(args.selector);
            if (el) el.scrollIntoView({ behavior: "smooth", block: args.block || "center" });
          } else {
            window.scrollBy({ top: Number(args.y != null ? args.y : 0), left: Number(args.x != null ? args.x : 0), behavior: "smooth" });
          }
          result = { ok: true, scrollX: window.scrollX, scrollY: window.scrollY };
          break;
        }
        case "hover": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          setTimeout(function(){
            el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
            el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
          }, 50);
          result = { ok: true };
          break;
        }
        case "select": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          el.value = String(args.value != null ? args.value : "");
          el.dispatchEvent(new Event("change", { bubbles: true }));
          result = { value: el.value };
          break;
        }
        case "get_dom": {
          var el = args.selector ? $(args.selector) : document.body;
          if (!el) throw new Error("Element not found: " + args.selector);
          result = { html: el.outerHTML };
          break;
        }
        case "get_element": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          result = { outerHTML: el.outerHTML, tagName: el.tagName, computedStyle: styleSummary(el) };
          break;
        }
        case "inspect_element": {
          var el = $(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          var rect = el.getBoundingClientRect();
          var attrs = {};
          for (var i = 0; i < el.attributes.length; i++) {
            var at = el.attributes[i];
            attrs[at.name] = at.value;
          }
          result = {
            tag: el.tagName,
            attributes: attrs,
            text: (el.textContent || "").trim().slice(0, 500),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
            computedStyle: styleSummary(el)
          };
          break;
        }
        case "run_javascript": {
          // eslint-disable-next-line no-eval
          var r = eval(String(args.code != null ? args.code : ""));
          var serialized;
          try {
            serialized = (typeof r === "object" && r !== null)
              ? JSON.parse(JSON.stringify(r, function(k, v){ return typeof v === "function" ? "[Function]" : v; }))
              : r;
          } catch (e) {
            serialized = String(r);
          }
          result = { value: serialized };
          break;
        }
        case "browser_read_page": {
          var bodyText = (document.body && (document.body.innerText != null ? document.body.innerText : document.body.textContent)) || "";
          var h1 = document.querySelector("h1");
          var headings = [];
          var hs = document.querySelectorAll("h1,h2,h3,h4,h5,h6");
          for (var hi = 0; hi < hs.length && hi < 40; hi++) {
            headings.push(hs[hi].tagName.toLowerCase() + ": " + ((hs[hi].textContent || "").trim().slice(0, 120)));
          }
          var controls = [];
          var ces = document.querySelectorAll("input, textarea, select, button");
          for (var ci = 0; ci < ces.length && ci < 60; ci++) {
            var ce = ces[ci];
            controls.push({
              tag: ce.tagName.toLowerCase(),
              type: ce.type || "",
              name: ce.name || "",
              id: ce.id || "",
              placeholder: ce.placeholder || "",
              text: (ce.innerText || ce.value || "").trim().slice(0, 80)
            });
          }
          var links = [];
          var as = document.querySelectorAll("a[href]");
          for (var li = 0; li < as.length && li < 60; li++) {
            links.push({ href: as[li].getAttribute("href") || "", text: (as[li].textContent || "").trim().slice(0, 80) });
          }
          result = {
            url: window.location.href,
            title: document.title || "",
            readyState: document.readyState,
            text: bodyText.slice(0, 8000),
            textLength: bodyText.length,
            h1: h1 ? (h1.textContent || "").trim().slice(0, 200) : null,
            headings: headings,
            controls: controls,
            links: links,
            pageErrors: errs.length,
            consoleLogs: logs.length
          };
          break;
        }
        case "browser_execute_js": {
          var code = String(args.code != null ? args.code : "");
          if (!code.trim()) {
            send({ callId: callId, result: { success: false, result: null, url: window.location.href, title: document.title || "", stdout: "", error: "No code provided" } });
            return;
          }
          // Capture console output for this call (and forward it live so the
          // ToolCard streams it). Restored once the script settles.
          var captured = [];
          var oLog = console.log.bind(console);
          var oInfo = console.info.bind(console);
          var oWarn = console.warn.bind(console);
          var oErr = console.error.bind(console);
          var grab = function(level, orig){
            return function(){
              try {
                var a = Array.prototype.slice.call(arguments);
                var safe = a.map(function(x){
                  if (x instanceof Error) return x.stack || x.message;
                  if (typeof x === "object") { try { return JSON.stringify(x); } catch(e){ return String(x); } }
                  return String(x);
                });
                captured.push(safe.join(" "));
                try { parent.postMessage({ source: "preview", kind: "console", callId: callId, level: level, args: safe, time: Date.now() }, "*"); } catch(e){}
              } catch(e){}
              return orig.apply(console, arguments);
            };
          };
          console.log = grab("log", oLog);
          console.info = grab("info", oInfo);
          console.warn = grab("warn", oWarn);
          console.error = grab("error", oErr);
          var restore = function(){ console.log = oLog; console.info = oInfo; console.warn = oWarn; console.error = oErr; };
          var finish = function(payload){
            restore();
            send({ callId: callId, result: payload });
          };
          try {
            // Evaluate via an AsyncFunction so await/promises work and the
            // script's variables stay scoped (don't leak into the page).
            var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            var fn = new AsyncFunction(code);
            Promise.resolve(fn()).then(function(value){
              finish({ success: true, result: ser(value), url: window.location.href, title: document.title || "", stdout: captured.join("\\n"), error: undefined });
            }).catch(function(e){
              finish({ success: false, result: null, url: window.location.href, title: document.title || "", stdout: captured.join("\\n"), error: e && e.message ? e.message : String(e) });
            });
          } catch (e) {
            finish({ success: false, result: null, url: window.location.href, title: document.title || "", stdout: captured.join("\\n"), error: e && e.message ? e.message : String(e) });
          }
          return;
        }
        case "run_test": {
          var name = args.name != null ? String(args.name) : undefined;
          var assertions = Array.isArray(args.assertions) ? args.assertions : [];
          var results = assertions.map(function(ast){
            var label = String((ast && ast.label) || "assertion");
            var code = String((ast && ast.code) || "");
            var expected = (ast && typeof ast.expected === "string") ? ast.expected : undefined;
            var actual;
            try {
              // eslint-disable-next-line no-eval
              var r = eval(code);
              actual = (typeof r === "object" && r !== null) ? JSON.stringify(r) : String(r);
              var pass = (expected === undefined) ? true : (actual === expected);
              return { label: label, pass: pass, actual: actual, expected: expected };
            } catch (e) {
              return { label: label, pass: false, actual: "Error: " + (e && e.message ? e.message : String(e)), expected: expected };
            }
          });
          var passed = results.filter(function(r){ return r.pass; }).length;
          result = { name: name, passed: passed, total: results.length, results: results };
          break;
        }
        case "check_links": {
          var nodes = document.querySelectorAll("a[href]");
          var links = [];
          for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var href = el.getAttribute("href") || "";
            var text = (el.textContent || el.innerText || "").trim().slice(0, 120);
            var type;
            if (/^(https?:)?\\/\\//i.test(href)) type = "absolute";
            else if (/^mailto:/i.test(href)) type = "mailto";
            else if (/^#/.test(href)) type = "anchor";
            else type = "relative";
            links.push({ href: href, text: text, type: type });
          }
          result = { links: links, count: links.length };
          break;
        }
        case "get_console_logs": {
          result = { logs: logs };
          break;
        }
        case "check_console": {
          result = { logs: logs, errors: errs };
          break;
        }
        case "check_page": {
          result = {
            url: window.location.href,
            title: document.title || "",
            readyState: document.readyState,
            text: ((document.body && document.body.innerText) || "").slice(0, 4000),
            logs: logs,
            errors: errs
          };
          break;
        }
        case "get_page_errors": {
          result = { errors: errs };
          break;
        }
        case "get_network_errors": {
          result = { errors: networkErrors };
          break;
        }

        // =========================================================
        // Testing tools
        // =========================================================

        case "assert_text": {
          var text = String(args.text != null ? args.text : "");
          var contains = args.contains !== false; // default true
          var caseSensitive = args.caseSensitive === true;
          var scope = args.selector ? document.querySelector(args.selector) : document.body;
          if (!scope) throw new Error("Element not found: " + args.selector);
          var hay = (scope.innerText != null ? scope.innerText : scope.textContent) || "";
          if (!caseSensitive) { hay = hay.toLowerCase(); text = text.toLowerCase(); }
          var has = hay.indexOf(text) >= 0;
          var pass = contains ? has : !has;
          result = {
            pass: pass,
            message: pass
              ? ("PASS: expected text " + (contains ? "" : "not ") + "present")
              : ("FAIL: expected text " + (contains ? "" : "not ") + "present: " + text.slice(0, 80)),
            found: has,
          };
          break;
        }
        case "assert_element": {
          var matches = document.querySelectorAll(args.selector);
          var count = matches.length;
          var pass;
          if (typeof args.count === "number") {
            pass = count === args.count;
          } else {
            var exists = args.exists !== false;
            pass = exists ? count > 0 : count === 0;
          }
          result = {
            pass: pass,
            count: count,
            message: pass
              ? ("PASS: " + count + " element(s) matching " + args.selector)
              : ("FAIL: " + count + " element(s) matching " + args.selector + " (expected " + (typeof args.count === "number" ? args.count : (args.exists === false ? "none" : "at least one")) + ")"),
          };
          break;
        }
        case "assert_url": {
          var expected = String(args.expected != null ? args.expected : "");
          var mode = args.match || "contains";
          var actual = window.location.href;
          var pass = false;
          if (mode === "exact") pass = actual === expected;
          else if (mode === "prefix") pass = actual.indexOf(expected) === 0;
          else if (mode === "suffix") pass = actual.slice(-expected.length) === expected;
          else if (mode === "regex") { try { pass = new RegExp(expected).test(actual); } catch(e){ throw new Error("Invalid regex: " + e.message); } }
          else pass = actual.indexOf(expected) >= 0;
          result = { pass: pass, actual: actual, expected: expected, message: pass ? "PASS" : ("FAIL: URL " + actual + " did not match " + expected) };
          break;
        }
        case "assert_title": {
          var expected = String(args.expected != null ? args.expected : "");
          var mode = args.match || "contains";
          var actual = document.title || "";
          var pass = false;
          if (mode === "exact") pass = actual === expected;
          else if (mode === "regex") { try { pass = new RegExp(expected).test(actual); } catch(e){ throw new Error("Invalid regex"); } }
          else pass = actual.toLowerCase().indexOf(expected.toLowerCase()) >= 0;
          result = { pass: pass, actual: actual, message: pass ? "PASS" : ("FAIL: title '" + actual + "' did not match '" + expected + "'") };
          break;
        }
        case "assert_attribute": {
          var el = document.querySelector(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          var attr = String(args.attribute);
          var has = el.hasAttribute(attr);
          var actual = has ? el.getAttribute(attr) : null;
          var mode = args.match || "exact";
          var pass;
          if (mode === "exists") pass = has;
          else if (!has) pass = false;
          else if (mode === "contains") pass = String(actual).indexOf(String(args.expected)) >= 0;
          else if (mode === "regex") { try { pass = new RegExp(String(args.expected)).test(String(actual)); } catch(e){ pass = false; } }
          else pass = actual === String(args.expected);
          result = { pass: pass, attribute: attr, actual: actual, message: pass ? "PASS" : ("FAIL: " + attr + " was " + JSON.stringify(actual)) };
          break;
        }
        case "assert_visible": {
          var el = document.querySelector(args.selector);
          if (!el) { result = { pass: false, message: "FAIL: element not found: " + args.selector }; break; }
          var rect = el.getBoundingClientRect();
          var cs = window.getComputedStyle(el);
          var visible = !(cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") && rect.width > 0 && rect.height > 0;
          result = { pass: visible, message: visible ? "PASS: element is visible" : "FAIL: element is not visible", rect: { w: rect.width, h: rect.height } };
          break;
        }
        case "assert_hidden": {
          var el = document.querySelector(args.selector);
          if (!el) { result = { pass: true, message: "PASS: element is absent from DOM" }; break; }
          var rect = el.getBoundingClientRect();
          var cs = window.getComputedStyle(el);
          var hidden = (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") || rect.width === 0 || rect.height === 0;
          result = { pass: hidden, message: hidden ? "PASS: element is hidden" : "FAIL: element is still visible" };
          break;
        }
        case "assert_enabled": {
          var el = document.querySelector(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          var enabled = !el.disabled;
          result = { pass: enabled, message: enabled ? "PASS: element is enabled" : "FAIL: element is disabled" };
          break;
        }
        case "assert_disabled": {
          var el = document.querySelector(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          var disabled = !!el.disabled;
          result = { pass: disabled, message: disabled ? "PASS: element is disabled" : "FAIL: element is enabled" };
          break;
        }
        case "assert_screenshot": {
          var target = args.selector ? document.querySelector(args.selector) : document.documentElement;
          var clone = target.cloneNode(true);
          var scripts = clone.querySelectorAll ? clone.querySelectorAll("script") : [];
          for (var i = 0; i < scripts.length; i++) scripts[i].remove();
          if (clone.setAttribute) clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
          var w = Math.min(window.innerWidth, 1280);
          var h = args.fullPage ? Math.max(document.body ? document.body.scrollHeight : 0, window.innerHeight) : Math.min(window.innerHeight, 800);
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><foreignObject width="100%" height="100%">' + (clone.outerHTML || "") + '</foreignObject></svg>';
          result = { dataUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), domSnapshot: (document.body ? document.body.outerHTML : "").slice(0, 8000), width: w, height: h, ok: true };
          break;
        }
        case "test_api_endpoint": {
          var url = String(args.url);
          var method = String(args.method || "GET").toUpperCase();
          var headers = args.headers || {};
          var fetchOpts = { method: method, headers: headers };
          if (args.body != null && method !== "GET" && method !== "HEAD") { fetchOpts.body = String(args.body); if (!fetchOpts.headers["Content-Type"]) fetchOpts.headers["Content-Type"] = "application/json"; }
          var controller = new AbortController();
          var timeoutId = setTimeout(function(){ controller.abort(); }, Number(args.timeoutMs || 10000));
          fetchOpts.signal = controller.signal;
          var res;
          try {
            res = await fetch(url, fetchOpts);
          } finally {
            clearTimeout(timeoutId);
          }
          var text = await res.text();
          var bodyOut = text;
          if (args.expectJson) {
            try { bodyOut = JSON.parse(text); } catch(e) { /* keep text */ }
          }
          var pass = (typeof args.expectStatus !== "number") || (res.status === args.expectStatus);
          result = {
            pass: pass,
            status: res.status,
            ok: res.ok,
            url: res.url || url,
            headers: (function(){ var h = {}; res.headers.forEach(function(v,k){ h[k] = v; }); return h; })(),
            body: bodyOut,
            message: pass ? "PASS" : ("FAIL: expected status " + args.expectStatus + " got " + res.status),
          };
          break;
        }
        case "test_form": {
          var form = document.querySelector(args.formSelector);
          if (!form) throw new Error("Form not found: " + args.formSelector);
          var fields = Array.isArray(args.fields) ? args.fields : [];
          var fillLog = [];
          for (var fi = 0; fi < fields.length; fi++) {
            var f = fields[fi];
            var input = form.querySelector(f.selector) || document.querySelector(f.selector);
            if (!input) { fillLog.push({ selector: f.selector, ok: false, error: "not found" }); continue; }
            if (f.value === true || f.value === false) {
              if ("checked" in input) { input.checked = f.value; input.dispatchEvent(new Event("change", { bubbles: true })); }
            } else if (input.tagName === "SELECT") {
              input.value = String(f.value); input.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
              input.focus();
              input.value = String(f.value != null ? f.value : "");
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
            fillLog.push({ selector: f.selector, ok: true });
          }
          var submitted = false;
          if (args.submit !== false) {
            if (typeof form.requestSubmit === "function") {
              try { form.requestSubmit(); submitted = true; }
              catch(e) { form.submit(); submitted = true; }
            } else {
              form.submit(); submitted = true;
            }
          }
          if (Number(args.waitMs || 300) > 0) {
            await new Promise(function(r){ setTimeout(r, Number(args.waitMs || 300)); });
          }
          result = { filled: fillLog, submitted: submitted, url: window.location.href, title: document.title };
          break;
        }
        case "test_navigation": {
          var el = document.querySelector(args.selector);
          if (!el) throw new Error("Element not found: " + args.selector);
          var before = { url: window.location.href, title: document.title };
          el.click();
          if (Number(args.waitMs || 500) > 0) {
            await new Promise(function(r){ setTimeout(r, Number(args.waitMs || 500)); });
          }
          var after = { url: window.location.href, title: document.title };
          var urlPass = !args.expectUrl || after.url.indexOf(args.expectUrl) >= 0;
          var titlePass = !args.expectTitle || (after.title || "").toLowerCase().indexOf(String(args.expectTitle).toLowerCase()) >= 0;
          result = { before: before, after: after, pass: urlPass && titlePass, urlPass: urlPass, titlePass: titlePass };
          break;
        }
        case "test_responsive_layout": {
          var widths = Array.isArray(args.widths) && args.widths.length > 0 ? args.widths : [390, 768, 1024, 1280];
          var height = Number(args.height || 800);
          var waitMs = Number(args.waitMs || 400);
          var reports = [];
          for (var wi = 0; wi < widths.length; wi++) {
            var w = widths[wi];
            // Use an iframe loaded with the current URL to test at a
            // different viewport without disturbing the real window.
            var report = await new Promise(function(resolve){
              var iframe = document.createElement("iframe");
              iframe.style.cssText = "position:fixed;left:-99999px;top:0;width:" + w + "px;height:" + height + "px;border:0;";
              iframe.src = window.location.href;
              iframe.onload = function(){
                setTimeout(function(){
                  try {
                    var doc = iframe.contentDocument;
                    var body = doc && doc.body;
                    var de = doc && doc.documentElement;
                    var scrollW = body ? Math.max(body.scrollWidth, de ? de.scrollWidth : 0, w) : w;
                    var horizontalOverflow = scrollW > w + 2;
                    var buttons = doc ? doc.querySelectorAll("button, a").length : 0;
                    resolve({ width: w, height: height, horizontalOverflow: horizontalOverflow, scrollWidth: scrollW, interactiveCount: buttons });
                  } catch(e) {
                    resolve({ width: w, error: e.message });
                  } finally {
                    iframe.remove();
                  }
                }, waitMs);
              };
              iframe.onerror = function(){ resolve({ width: w, error: "iframe load failed" }); iframe.remove(); };
              document.body.appendChild(iframe);
            });
            reports.push(report);
          }
          var anyOverflow = reports.some(function(r){ return r.horizontalOverflow; });
          result = { pass: !anyOverflow, reports: reports, message: anyOverflow ? "FAIL: horizontal overflow at some widths" : "PASS" };
          break;
        }
        case "test_console": {
          var level = args.level || "error";
          var messages = level === "any" ? logs : logs.filter(function(l){ return l.level === level; });
          if (args.contains) {
            var needle = String(args.contains).toLowerCase();
            messages = messages.filter(function(l){ return (l.args || []).join(" ").toLowerCase().indexOf(needle) >= 0; });
          } else if (args.regex) {
            var re = new RegExp(args.regex);
            messages = messages.filter(function(l){ return re.test((l.args || []).join(" ")); });
          }
          var count = messages.length;
          var pass = (typeof args.maxCount !== "number") || count <= args.maxCount;
          result = {
            pass: pass,
            level: level,
            matching: messages.slice(-20),
            total: count,
            message: pass ? ("PASS: " + count + " matching message(s)") : ("FAIL: " + count + " matching messages (max " + args.maxCount + ")"),
          };
          break;
        }
        case "test_network": {
          var failures = networkErrors.slice();
          if (args.urlContains) {
            var needle = String(args.urlContains);
            failures = failures.filter(function(f){ return String(f.url || "").indexOf(needle) >= 0; });
          }
          var pass = !(args.expectNone && failures.length > 0);
          result = { pass: pass, failures: failures, count: failures.length, message: pass ? "PASS" : ("FAIL: " + failures.length + " network failure(s)") };
          break;
        }
        case "test_performance": {
          var waitMs = Number(args.waitMs || 1000);
          var longTasks = (window.__longTasks || []).slice();
          await new Promise(function(r){ setTimeout(r, waitMs); });
          longTasks = (window.__longTasks || []).slice();
          var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
          var paints = {};
          try {
            var paintEntries = performance.getEntriesByType("paint");
            for (var pi = 0; pi < paintEntries.length; pi++) {
              paints[paintEntries[pi].name] = paintEntries[pi].startTime;
            }
          } catch(e) {}
          var metrics = {
            domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
            loadEventEnd: nav ? nav.loadEventEnd : null,
            transferSize: nav ? nav.transferSize : null,
            firstPaint: paints["first-paint"] ?? null,
            firstContentfulPaint: paints["first-contentful-paint"] ?? null,
            longTaskCount: longTasks.length,
            resources: performance.getEntriesByType ? performance.getEntriesByType("resource").length : 0,
          };
          var pass = true;
          var failures = [];
          if (typeof args.maxLoadMs === "number" && metrics.loadEventEnd != null && metrics.loadEventEnd > args.maxLoadMs) { pass = false; failures.push("loadEventEnd " + Math.round(metrics.loadEventEnd) + "ms > " + args.maxLoadMs + "ms"); }
          if (typeof args.maxLongTasks === "number" && metrics.longTaskCount > args.maxLongTasks) { pass = false; failures.push(metrics.longTaskCount + " long tasks > " + args.maxLongTasks); }
          result = { pass: pass, metrics: metrics, failures: failures, message: pass ? "PASS" : ("FAIL: " + failures.join("; ")) };
          break;
        }
        case "run_unit_tests": {
          var tests = Array.isArray(args.tests) ? args.tests : [];
          var results = [];
          var passed = 0;
          for (var ti = 0; ti < tests.length; ti++) {
            var t = tests[ti];
            try {
              // eslint-disable-next-line no-eval
              var val = eval(String(t.code || ""));
              var ok = (val === undefined) ? true : !!val;
              if (ok) passed++;
              results.push({ name: t.name, pass: ok, actual: (typeof val === "object" ? JSON.stringify(val) : String(val)) });
            } catch(e) {
              results.push({ name: t.name, pass: false, error: e && e.message ? e.message : String(e) });
            }
          }
          result = { passed: passed, failed: results.length - passed, total: results.length, results: results, pass: passed === results.length };
          break;
        }
        case "run_integration_tests": {
          var steps = Array.isArray(args.steps) ? args.steps : [];
          var stepResults = [];
          var allPass = true;
          for (var si = 0; si < steps.length; si++) {
            var step = steps[si];
            try {
              if (step.action) {
                // eslint-disable-next-line no-eval
                var AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
                await new AsyncFn(String(step.action))();
              }
              if (Number(step.waitMs || 100) > 0) {
                await new Promise(function(r){ setTimeout(r, Number(step.waitMs || 100)); });
              }
              var ok = true;
              if (step.assert) {
                // eslint-disable-next-line no-eval
                ok = !!eval(String(step.assert));
              }
              if (!ok) allPass = false;
              stepResults.push({ name: step.name, pass: ok });
            } catch(e) {
              allPass = false;
              stepResults.push({ name: step.name, pass: false, error: e && e.message ? e.message : String(e) });
            }
          }
          result = { name: args.name || "integration", pass: allPass, steps: stepResults, passed: stepResults.filter(function(s){ return s.pass; }).length, total: stepResults.length };
          break;
        }
        case "run_e2e_test": {
          var scriptText = String(args.script || "");
          var e2eSteps = [];
          var assertFn = function(cond, msg){
            var pass = !!cond;
            e2eSteps.push({ pass: pass, message: msg || (pass ? "assertion passed" : "assertion failed") });
            if (!pass) throw new Error(msg || "Assertion failed");
          };
          try {
            var AsyncFn2 = Object.getPrototypeOf(async function(){}).constructor;
            var fn2 = new AsyncFn2("assert", "document", "window",
              "return (async () => { " + scriptText + " })();"
            );
            var timer = new Promise(function(_, reject){
              setTimeout(function(){ reject(new Error("E2E script timed out")); }, Number(args.timeoutMs || 15000));
            });
            await Promise.race([fn2(assertFn, document, window), timer]);
            result = { pass: true, name: args.name || "e2e", steps: e2eSteps };
          } catch(e) {
            result = { pass: false, name: args.name || "e2e", steps: e2eSteps, error: e && e.message ? e.message : String(e) };
          }
          break;
        }

        case "take_screenshot": {
          try {
            var body = document.body;
            var de = document.documentElement;
            var vpWidth = window.innerWidth;
            var vpHeight = window.innerHeight;
            var fullWidth = Math.max(body ? body.scrollWidth : 0, de ? de.scrollWidth : 0, vpWidth);
            var fullHeight = Math.max(body ? body.scrollHeight : 0, de ? de.scrollHeight : 0, vpHeight);

            // Approach 1: SVG foreignObject screenshot of the current viewport.
            // Captures rendered HTML as an SVG image that can be displayed back
            // to the user. We only capture the viewport (not the full page) to
            // keep the data URL size manageable — foreignObject on a tall page
            // can produce multi-MB strings that exceed postMessage limits.
            var clone = document.documentElement.cloneNode(true);
            // Remove script tags from the clone so they don't re-execute if
            // the SVG is ever rendered back into a document.
            var scripts = clone.querySelectorAll("script");
            for (var i = 0; i < scripts.length; i++) scripts[i].remove();
            // Remove the bridge script specifically (it has no src so the
            // selector above already catches it, but be defensive).
            clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
            // Limit to viewport size to keep payload reasonable.
            var svgWidth = Math.min(vpWidth, 1280);
            var svgHeight = Math.min(vpHeight, 800);
            var svg =
              '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgWidth + '" height="' + svgHeight + '">' +
              '<foreignObject width="100%" height="100%" style="overflow:hidden">' +
              clone.outerHTML +
              '</foreignObject></svg>';
            var dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

            // Approach 2: DOM snapshot as text (always works, used by the AI
            // for debugging even if the SVG is too large or fails to render).
            var domSnapshot = (document.body ? document.body.outerHTML : "").slice(0, 8000);

            // Approach 3: viewport scroll/size info for the AI.
            var scrollInfo = {
              viewportWidth: vpWidth,
              viewportHeight: vpHeight,
              pageWidth: fullWidth,
              pageHeight: fullHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
              title: document.title || "",
            };

            result = {
              dataUrl: dataUrl,
              domSnapshot: domSnapshot,
              scroll: scrollInfo,
              width: svgWidth,
              height: svgHeight,
              ok: true,
            };
          } catch (err) {
            // Even on failure, return a DOM snapshot so the AI has something
            // to work with.
            try {
              var fallback = (document.body ? document.body.outerHTML : "").slice(0, 8000);
              result = {
                ok: false,
                note: "Screenshot failed: " + (err && err.message ? err.message : String(err)),
                domSnapshot: fallback,
              };
            } catch (e2) {
              result = { ok: false, note: "Screenshot failed: " + (err && err.message ? err.message : String(err)) };
            }
          }
          break;
        }
        case "terminal_exec": {
          // A terminal-like REPL for executing JavaScript in the browser
          // console. State persists across calls via window.__term so the
          // AI can run multi-step interactive sessions: assign variables on
          // one call (via term.set('x', 5)) and reference them on the next
          // (via term.get('x')). Direct eval runs in the iframe global
          // scope, so document, window, and all globals are accessible.
          var code = String(args.code != null ? args.code : "");
          if (!code.trim()) {
            result = { ok: true, value: undefined, stdout: "" };
            break;
          }
          // Lazily initialize the terminal state on first use.
          if (!window.__term) {
            window.__term = {
              vars: {},        // user-defined variables (persisted across calls)
              history: [],     // command history
            };
            // Expose 'term' as a global so the AI can call term.set/term.get
            // to persist values between calls.
            window.term = {
              set: function(k, v){ window.__term.vars[k] = v; return v; },
              get: function(k){ return window.__term.vars[k]; },
              has: function(k){ return Object.prototype.hasOwnProperty.call(window.__term.vars, k); },
              keys: function(){ return Object.keys(window.__term.vars); },
              del: function(k){ delete window.__term.vars[k]; },
              reset: function(){ window.__term.vars = {}; },
            };
          }
          var term = window.__term;
          term.history.push(code);
          // Capture console output for this call only. Each captured call is
          // ALSO forwarded to the parent LIVE (with the callId) so the
          // ToolCard can render streaming console output as it happens
          // (PRD §18 "Streaming output"). The parent's use-preview-bridge
          // routes these to the BrowserStore → ToolStore.
          var captured = [];
          var origLog = console.log.bind(console);
          var origInfo = console.info.bind(console);
          var origWarn = console.warn.bind(console);
          var origErr = console.error.bind(console);
          var forwardLive = function(level, args){
            try {
              parent.postMessage({
                source: "preview",
                kind: "console",
                callId: callId,
                level: level,
                args: args,
                time: Date.now()
              }, "*");
            } catch(e){}
          };
          var capture = function(level){ return function(){
            try {
              var a = Array.prototype.slice.call(arguments);
              var safe = a.map(function(x){
                if (x instanceof Error) return x.stack || x.message;
                if (typeof x === "object") { try { return JSON.stringify(x); } catch(e){ return String(x); } }
                return String(x);
              });
              captured.push({ level: level, args: safe });
              // Forward LIVE so the ToolCard streams the console output.
              forwardLive(level, safe);
            } catch(e){}
            return level === "log" ? origLog.apply(console, arguments)
              : level === "info" ? origInfo.apply(console, arguments)
              : level === "warn" ? origWarn.apply(console, arguments)
              : origErr.apply(console, arguments);
          }; };
          console.log = capture("log");
          console.info = capture("info");
          console.warn = capture("warn");
          console.error = capture("error");
          var value;
          var isError = false;
          var errMsg = "";
          try {
            // Direct eval in the iframe global scope. window, document,
            // term (the persistent helper) are all accessible. Assignments
            // like var x = 5 leak to the global scope and persist naturally.
            // eslint-disable-next-line no-eval
            value = eval(code);
          } catch (e) {
            isError = true;
            errMsg = e && e.message ? e.message : String(e);
            value = undefined;
          } finally {
            console.log = origLog;
            console.info = origInfo;
            console.warn = origWarn;
            console.error = origErr;
          }
          // Serialize the return value (functions become "[Function]").
          var serialized;
          try {
            serialized = (typeof value === "object" && value !== null)
              ? JSON.parse(JSON.stringify(value, function(k, v){ return typeof v === "function" ? "[Function]" : v; }))
              : value;
          } catch (e) {
            serialized = String(value);
          }
          // Format captured output as a string (like a terminal would).
          var stdout = captured.map(function(c){
            return c.args.join(" ");
          }).join("\\n");
          result = {
            ok: !isError,
            value: serialized,
            stdout: stdout,
            error: isError ? errMsg : undefined,
            historyLen: term.history.length,
            varsKeys: Object.keys(term.vars),
          };
          break;
        }
        case "terminal_reset": {
          // Clear the terminal state (variables, history).
          if (window.__term) {
            window.__term.vars = {};
            window.__term.history = [];
          }
          result = { ok: true, cleared: true };
          break;
        }
        case "wait": {
          var waitMs = Math.max(0, Math.min(Number(args.ms || 0), 10000));
          if (waitMs > 0) await new Promise(function(r){ setTimeout(r, waitMs); });
          result = { ok: true, waited: waitMs };
          break;
        }
        case "run_qa_suite": {
          var qaChecks = [];
          var pushCheck = function(id, pass, message){
            qaChecks.push({ id: id, pass: !!pass, message: String(message) });
          };
          var qaBody = document.body;
          var qaText = (qaBody && (qaBody.innerText != null ? qaBody.innerText : qaBody.textContent) || "").trim();
          pushCheck("ready", document.readyState === "complete" || document.readyState === "interactive", "document.readyState=" + document.readyState);
          pushCheck("has_body", !!qaBody, qaBody ? "body present" : "missing body");
          pushCheck("has_content", qaText.length > 0, qaText.length > 0 ? ("visible text " + qaText.length + " chars") : "page has no visible text");
          var qaTitle = document.title || "";
          pushCheck("has_title", qaTitle.trim().length > 0, qaTitle ? ("title: " + qaTitle) : "missing document title");
          var qaHeadings = document.querySelectorAll("h1,h2,h3").length;
          pushCheck("has_heading", qaHeadings > 0, qaHeadings + " heading(s)");
          var qaViewport = document.querySelector("meta[name=viewport]");
          pushCheck("viewport_meta", !!qaViewport, qaViewport ? "viewport meta present" : "missing viewport meta");
          pushCheck("no_page_errors", errs.length === 0, errs.length === 0 ? "no uncaught exceptions" : (errs.length + " page error(s)"));
          var qaConsoleErrs = logs.filter(function(l){ return l.level === "error"; });
          pushCheck("no_console_errors", qaConsoleErrs.length === 0, qaConsoleErrs.length === 0 ? "no console.error" : (qaConsoleErrs.length + " console error(s)"));
          pushCheck("no_network_errors", networkErrors.length === 0, networkErrors.length === 0 ? "no failed resources" : (networkErrors.length + " failed resource(s)"));
          var qaImgs = document.querySelectorAll("img");
          var qaMissingAlt = 0;
          for (var qai = 0; qai < qaImgs.length; qai++) {
            if (!qaImgs[qai].hasAttribute("alt")) qaMissingAlt++;
          }
          pushCheck("images_alt", qaMissingAlt === 0, qaMissingAlt === 0 ? (qaImgs.length + " image(s) ok") : (qaMissingAlt + " image(s) missing alt"));
          var qaUnlabeled = 0;
          var qaControls = document.querySelectorAll("input, textarea, select");
          for (var qac = 0; qac < qaControls.length; qac++) {
            var qinp = qaControls[qac];
            var qtype = String(qinp.type || "").toLowerCase();
            if (qtype === "hidden" || qtype === "submit" || qtype === "button" || qtype === "image") continue;
            var qid = qinp.id;
            var qHasLabel = !!(qinp.getAttribute("aria-label") || qinp.getAttribute("aria-labelledby") || qinp.placeholder || (qid && document.querySelector("label[for='" + qid + "']")) || qinp.closest("label"));
            if (!qHasLabel) qaUnlabeled++;
          }
          pushCheck("form_labels", qaUnlabeled === 0, qaUnlabeled === 0 ? "form controls labeled" : (qaUnlabeled + " unlabeled control(s)"));
          var qaOverflow = false;
          try { qaOverflow = document.documentElement.scrollWidth > window.innerWidth + 2; } catch (eQa) {}
          pushCheck("no_h_overflow", !qaOverflow, qaOverflow ? "horizontal overflow" : "no horizontal overflow");
          var qaSels = Array.isArray(args.requiredSelectors) ? args.requiredSelectors : [];
          for (var qas = 0; qas < qaSels.length; qas++) {
            var qsel = String(qaSels[qas]);
            var qfound = !!document.querySelector(qsel);
            pushCheck("selector:" + qsel, qfound, qfound ? ("found " + qsel) : ("missing " + qsel));
          }
          var qaNeedles = Array.isArray(args.requiredText) ? args.requiredText : [];
          var qaHay = qaText.toLowerCase();
          for (var qat = 0; qat < qaNeedles.length; qat++) {
            var qneedle = String(qaNeedles[qat]);
            var qhas = qaHay.indexOf(qneedle.toLowerCase()) >= 0;
            pushCheck("text:" + qneedle, qhas, qhas ? ("found text " + qneedle) : ("missing text " + qneedle));
          }
          var qaFailed = qaChecks.filter(function(c){ return !c.pass; });
          var qaPassed = qaChecks.filter(function(c){ return c.pass; });
          var qaSuggestions = [];
          for (var qaf = 0; qaf < qaFailed.length; qaf++) {
            var qfail = qaFailed[qaf];
            if (qfail.id === "has_title") qaSuggestions.push("Add a descriptive title in the document head.");
            else if (qfail.id === "has_heading") qaSuggestions.push("Add at least one heading (h1-h3).");
            else if (qfail.id === "viewport_meta") qaSuggestions.push("Add a viewport meta tag (width=device-width, initial-scale=1).");
            else if (qfail.id === "no_page_errors" || qfail.id === "no_console_errors") qaSuggestions.push("Fix the JS error(s) listed in errors.");
            else if (qfail.id === "no_network_errors") qaSuggestions.push("Fix broken script/link/img src paths.");
            else if (qfail.id === "images_alt") qaSuggestions.push("Add alt attributes to images.");
            else if (qfail.id === "form_labels") qaSuggestions.push("Associate a label or aria-label with each input.");
            else if (qfail.id === "no_h_overflow") qaSuggestions.push("Fix horizontal overflow (fixed widths, large images).");
            else if (qfail.id === "has_content") qaSuggestions.push("The page rendered empty — check HTML structure and CSS display.");
            else qaSuggestions.push("Fix: " + qfail.message);
          }
          result = {
            pass: qaFailed.length === 0,
            score: qaChecks.length ? Math.round(100 * qaPassed.length / qaChecks.length) : 0,
            passed: qaPassed.length,
            failed: qaFailed.length,
            total: qaChecks.length,
            checks: qaChecks,
            failedChecks: qaFailed,
            errors: { page: errs.slice(-10), console: qaConsoleErrs.slice(-10), network: networkErrors.slice(-10) },
            title: qaTitle,
            url: window.location.href,
            textPreview: qaText.slice(0, 500),
            suggestions: qaSuggestions,
            report: (qaFailed.length === 0 ? "PASS" : "FAIL") + " " + qaPassed.length + "/" + qaChecks.length + " checks." + (qaFailed.length ? " " + qaFailed.map(function(f){ return f.message; }).join("; ") : " All good.")
          };
          break;
        }
        default:
          throw new Error("Unknown browser tool: " + tool);
      }
      send({ callId: callId, result: result });
    } catch (err) {
      error = err && err.message ? err.message : String(err);
      send({ callId: callId, error: error });
    }
  });
})();
`;

export function buildPreviewDoc(
  files: Record<string, { content: string; isBinary: boolean }>,
  entry: string
): string {
  const html = files[entry]?.content ?? "";
  if (!html) return "<!doctype html><html><body><p>No HTML to preview.</p></body></html>";

  const inlinable = new Set(Object.keys(files));

  // Inline <link rel="stylesheet" href="local.css">
  let out = html.replace(
    /<link\b[^>]*?rel=["']stylesheet["'][^>]*?>/gi,
    (tag) => {
      const m = tag.match(/href=["']([^"']+)["']/i);
      if (!m) return tag;
      const href = m[1];
      if (/^https?:\/\//i.test(href) || href.startsWith("//") || href.startsWith("data:"))
        return tag;
      const path = href.replace(/^\.?\//, "");
      if (!inlinable.has(path)) return tag;
      const css = files[path]?.content ?? "";
      return `<style data-src="${path}">\n${css}\n</style>`;
    }
  );

  // Inline <script src="local.js">
  out = out.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*?)><\/script>/gi, (tag, pre, src, post) => {
    if (/^https?:\/\//i.test(src) || src.startsWith("//") || src.startsWith("data:"))
      return tag;
    const path = src.replace(/^\.?\//, "");
    if (!inlinable.has(path)) return tag;
    const js = files[path]?.content ?? "";
    const attrs = `${pre}${post}`.replace(/\s+/g, " ").trim();
    return `<script ${attrs} data-src="${path}">\n${js}\n</script>`;
  });

  // Inline <img src="local.*"> for SVG / text (best-effort). For binary, we cannot
  // embed directly without base64 — skip; the broken image will be reported by the bridge.
  out = out.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (tag, pre, src, post) => {
    if (/^https?:\/\//i.test(src) || src.startsWith("//") || src.startsWith("data:"))
      return tag;
    const path = src.replace(/^\.?\//, "");
    if (!inlinable.has(path)) return tag;
    const f = files[path];
    if (!f || f.isBinary) return tag;
    // Text content: only SVG can be inlined as a data URL
    if (path.toLowerCase().endsWith(".svg")) {
      const data = `data:image/svg+xml;utf8,${encodeURIComponent(f.content)}`;
      return `<img ${pre} src="${data}" ${post} />`;
    }
    return tag;
  });

  // Inject bridge before </body> (or at the end of the document).
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `<script>${BRIDGE_SCRIPT}</script></body>`);
  } else {
    out = `${out}<script>${BRIDGE_SCRIPT}</script>`;
  }
  return out;
}

type CustomSize = { width: number; height: number };

export function PreviewPane({
  iframeRef,
  onOpenConsole,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onOpenConsole?: () => void;
}) {
  const files = useWorkspaceStore((s) => s.files);
  const device = useWorkspaceStore((s) => s.device);
  const setDevice = useWorkspaceStore((s) => s.setDevice);
  const previewNonce = useWorkspaceStore((s) => s.previewNonce);
  const { settings } = useSettings();

  // Freeze srcDoc while the AI is streaming file bytes — rebuilding the
  // iframe on every delta killed the document the browser tools were
  // talking to (infinite "loading" / instant error).
  const [previewFiles, setPreviewFiles] = React.useState(files);
  const previewFilesRef = React.useRef(files);
  React.useEffect(() => {
    if (useWorkspaceStore.getState().aiEditingFiles.size > 0) return;
    const apply = () => {
      previewFilesRef.current = files;
      setPreviewFiles(files);
    };
    if (Object.keys(previewFilesRef.current).length === 0) {
      apply();
      return;
    }
    const handle = window.setTimeout(apply, 180);
    return () => window.clearTimeout(handle);
  }, [files]);
  React.useEffect(() => {
    const latest = useWorkspaceStore.getState().files;
    previewFilesRef.current = latest;
    setPreviewFiles(latest);
  }, [previewNonce]);

  const paths = React.useMemo(() => Object.keys(previewFiles), [previewFiles]);
  const entry = React.useMemo(() => findEntryFile(paths), [paths]);
  const doc = React.useMemo(
    () => (entry ? buildPreviewDoc(previewFiles, entry) : ""),
    [previewFiles, entry]
  );

  // Local custom-device state (not in the store — the segmented control still
  // drives `device`; `useCustom` overrides the size when true).
  const [useCustom, setUseCustom] = React.useState(false);
  const [customSize, setCustomSize] = React.useState<CustomSize>({ width: 1024, height: 768 });
  const [customOpen, setCustomOpen] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const presetSize = DEVICE_SIZES[device];
  const activeSize = useCustom ? customSize : presetSize;

  function openInNewTab() {
    if (!doc) return;
    const blob = new Blob([doc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function reload() {
    useWorkspaceStore.getState().bumpPreview();
  }

  const [isInspecting, setIsInspecting] = React.useState(false);
  const [pickedEl, setPickedEl] = React.useState<any>(null);

  React.useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || data.source !== "preview") return;
      if (data.kind === "inspect-pick") {
        setPickedEl(data);
        setIsInspecting(false);
        toast.success(`Picked <${data.tag.toLowerCase()}> ${data.selector}`);
      } else if (data.kind === "inspect-enabled") {
        setIsInspecting(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function handleInspect() {
    const next = !isInspecting;
    setIsInspecting(next);
    if (next) toast.info("Inspect mode — hover and click an element in the preview (Esc to cancel)");
    else toast.info("Inspect mode off");
    window.dispatchEvent(new CustomEvent("preview:inspect-mode"));
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        { source: "workspace-host", action: next ? "inspect-enable" : "inspect-disable" },
        "*"
      );
    }
  }

  function handlePickedAction(action: string) {
    if (!pickedEl) return;
    const sel = pickedEl.selector;
    if (action === "edit") {
      window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: `Edit the element ${sel} (${pickedEl.tag}) — current text: "${pickedEl.text}". OuterHTML: \n\`\`\`html\n${pickedEl.outerHTML}\n\`\`\`` }));
    } else if (action === "style") {
      window.dispatchEvent(new CustomEvent("chat:set-prompt", { detail: `Change styles for ${sel}. Current computed: ${JSON.stringify(pickedEl.computedStyle)}. How should I update it?` }));
    } else if (action === "copy") {
      navigator.clipboard.writeText(pickedEl.outerHTML);
      toast.success("Copied outerHTML");
    }
  }

  function handleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        toast.error("Fullscreen not available");
      });
    }
  }

  function handleOpenConsole() {
    if (onOpenConsole) {
      onOpenConsole();
    } else {
      window.dispatchEvent(new CustomEvent("preview:open-console"));
    }
  }

  function applyCustom() {
    if (!customSize.width || !customSize.height) {
      toast.error("Enter a valid width and height");
      return;
    }
    setUseCustom(true);
    setCustomOpen(false);
  }

  // Render the iframe element (shared across device modes).
  // `allow-same-origin` is required for:
  //   - Canvas-based screenshots (canvas.toDataURL taints without same-origin)
  //   - Reading computed styles for get_element / inspect_element
  //   - Reliable postMessage correlation
  // The iframe content is the user's own workspace code (not untrusted
  // third-party content), so the security trade-off is acceptable.
  const renderIframe = (className?: string, style?: React.CSSProperties) => (
    <iframe
      key={previewNonce}
      ref={iframeRef}
      title="preview"
      srcDoc={doc}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      className={cn("bg-white", className)}
      style={style}
      loading="eager"
    />
  );

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-muted/30">
      {isInspecting && (
        <div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-violet-600 px-3 text-xs font-medium text-white">
          <SearchIcon className="size-3.5" /> Inspect mode — Click any element to pick it • Press Esc to cancel
          <Button size="sm" variant="secondary" className="ml-2 h-6 rounded-full text-xs" onClick={() => handleInspect()}>Exit</Button>
        </div>
      )}
      {pickedEl && (
        <div className="flex shrink-0 flex-col gap-2 border-b bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] text-violet-700">&lt;{pickedEl.tag.toLowerCase()}&gt;</span>
              <span className="font-mono text-[12px]">{pickedEl.selector}</span>
              <span className="text-[11px] text-muted-foreground">{Math.round(pickedEl.rect.width)}×{Math.round(pickedEl.rect.height)}</span>
            </div>
            <Button size="sm" variant="ghost" className="h-6 rounded-full text-[11px]" onClick={() => setPickedEl(null)}>✕</Button>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 rounded-full text-xs" onClick={() => handlePickedAction("edit")}>✏️ Edit with AI</Button>
            <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => handlePickedAction("style")}>🎨 Change style</Button>
            <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => handlePickedAction("copy")}>📋 Copy HTML</Button>
          </div>
          <div className="max-h-24 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">{pickedEl.outerHTML.slice(0, 500)}</div>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2">
        {/* Back / Forward — placeholder nav buttons (no history yet). */}
        <div className="hidden items-center gap-0.5 sm:flex">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled
            aria-label="Back"
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled
            aria-label="Forward"
          >
            <ArrowRight className="size-3.5" />
          </Button>
        </div>

        {/* Reload */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={reload}
                aria-label="Reload preview"
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload preview</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* URL display — hidden on small screens to save space. */}
        <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground md:flex">
          <Globe className="size-3.5 shrink-0" />
          <span className="truncate font-mono">
            https://preview.local/{entry ?? "—"}
          </span>
        </div>
        {/* Spacer on mobile so the right-side cluster stays right-aligned. */}
        <div className="flex-1 md:hidden" />

        {/* Device segmented control + Custom */}
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border p-0.5">
            <DeviceBtn
              active={device === "desktop" && !useCustom}
              onClick={() => {
                setUseCustom(false);
                setDevice("desktop");
              }}
              label="Desktop"
            >
              <Monitor className="size-3.5" />
            </DeviceBtn>
            <DeviceBtn
              active={device === "tablet" && !useCustom}
              onClick={() => {
                setUseCustom(false);
                setDevice("tablet");
              }}
              label="Tablet"
            >
              <Tablet className="size-3.5" />
            </DeviceBtn>
            <DeviceBtn
              active={device === "mobile" && !useCustom}
              onClick={() => {
                setUseCustom(false);
                setDevice("mobile");
              }}
              label="Mobile"
            >
              <Smartphone className="size-3.5" />
            </DeviceBtn>
          </div>

          {/* Custom device size popover */}
          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Custom device size"
                      className={cn(
                        "flex items-center justify-center rounded-md border p-1.5 transition-colors",
                        useCustom
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <SlidersHorizontal className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Custom size</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-56" align="end">
              <div className="space-y-2">
                <div className="text-xs font-medium">Custom device size</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Width</span>
                    <Input
                      type="number"
                      min={1}
                      max={4096}
                      value={customSize.width}
                      onChange={(e) =>
                        setCustomSize((s) => ({
                          ...s,
                          width: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Height</span>
                    <Input
                      type="number"
                      min={1}
                      max={4096}
                      value={customSize.height}
                      onChange={(e) =>
                        setCustomSize((s) => ({
                          ...s,
                          height: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={applyCustom}
                  >
                    Apply
                  </Button>
                  {useCustom && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setUseCustom(false);
                        setCustomOpen(false);
                      }}
                    >
                      Reset
                    </Button>
                  )}
                </div>
                {useCustom && (
                  <div className="text-[10px] text-muted-foreground">
                    Active: {customSize.width} × {customSize.height}px
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* More dropdown */}
        <DropdownMenu>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="More actions"
                  >
                    <MoreVertical className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleInspect}>
              <SearchIcon className="mr-2 size-3.5" /> Inspect
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleFullscreen}>
              <Maximize className="mr-2 size-3.5" /> Fullscreen
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenConsole}>
              <Terminal className="mr-2 size-3.5" /> Open console
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Open in new tab */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={openInNewTab}
                aria-label="Open in new tab"
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in new tab</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Preview area */}
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin p-4">
        {!entry ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Add an <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">index.html</code>
            file to see the preview.
          </div>
        ) : useCustom ? (
          // Custom device: render at the explicit pixel size, centered.
          <div className="flex h-full items-start justify-center">
            <div
              className="device-frame custom shrink-0 rounded-lg border bg-white"
              style={{
                width: Math.min(activeSize.width + 16, 4096),
                height: "100%",
                maxHeight: "100%",
              }}
            >
              {renderIframe("h-full w-full rounded-lg border-0", {
                width: activeSize.width,
                height: "100%",
              })}
            </div>
          </div>
        ) : device === "desktop" ? (
          renderIframe("h-full w-full rounded-lg border")
        ) : (
          <div className="flex h-full items-start justify-center">
            <div
              className={cn("device-frame", device)}
              style={{ width: activeSize.width + 16, height: "100%", maxHeight: "100%" }}
            >
              {renderIframe("h-full w-full rounded-[20px] border-0", {
                width: activeSize.width,
                height: "100%",
              })}
            </div>
          </div>
        )}
      </div>

      {/* Screen reader-only announcement of preview size for accessibility. */}
      <span className="sr-only" aria-live="polite">
        Preview size: {activeSize.width} by {activeSize.height} pixels
      </span>
    </div>
  );
}

function DeviceBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "flex items-center justify-center rounded px-1.5 py-1 transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Re-export for the page-level preview builder
export { buildPreviewDoc as buildPreview };
