// The resume preview card, an MCP App view (SEP-1865, protocol 2026-01-26). One self-contained
// HTML document: no external scripts, styles, fonts or network access, so it runs under the
// spec's default CSP. It is read-only on purpose: it shows the resume and offers two buttons,
// both of which call our own tools through the host (export_resume, get_editor_link) and then
// ask the host to open the returned link (ui/open-link). Editing stays in the chat or the editor.
//
// The script speaks the protocol directly over postMessage, as the spec allows, instead of
// inlining the 540 KB @modelcontextprotocol/ext-apps bundle. It mirrors the SDK's App: the
// ui/initialize handshake, theme and host style variables, and size-changed reporting
// (documentElement at max-content height, window width, once per animation frame).
// Card data arrives as the tool result's structuredContent (src/lib/mcp/card.ts); every value
// is written with textContent, never as HTML.

export const RESUME_CARD_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ModuleHire resume</title>
<style>
  :root {
    color-scheme: light dark;
    --mh-teal: oklch(0.62 0.17 195);
    --mh-teal-soft: oklch(0.62 0.17 195 / 0.14);
    --bg: var(--color-background-primary, light-dark(#ffffff, #1b1d22));
    --bg-2: var(--color-background-secondary, light-dark(#f5f6f8, #23262d));
    --text: var(--color-text-primary, light-dark(#14161b, #f2f3f5));
    --text-2: var(--color-text-secondary, light-dark(#4a5060, #b4b9c4));
    --text-3: var(--color-text-tertiary, light-dark(#7c8291, #858b98));
    --border: var(--color-border-primary, light-dark(rgba(0,0,0,0.12), rgba(255,255,255,0.12)));
    --border-2: var(--color-border-secondary, light-dark(rgba(0,0,0,0.07), rgba(255,255,255,0.07)));
    --danger: var(--color-text-danger, light-dark(#b42318, #f97066));
    --radius: var(--border-radius-lg, 12px);
    --radius-sm: var(--border-radius-sm, 6px);
    --font: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  }
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"] { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: transparent; }
  body { font-family: var(--font); color: var(--text); font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  .card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; }
  .brand { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--text-3); margin-bottom: 12px; }
  .mark { width: 18px; height: 18px; border-radius: 5px; background: var(--mh-teal); color: #fff; font: 800 8px/18px ui-monospace, Menlo, monospace; text-align: center; letter-spacing: 0.02em; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
  .name { font-size: 18px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.25; overflow-wrap: anywhere; }
  .title { font-size: 13.5px; color: var(--text-2); margin-top: 2px; overflow-wrap: anywhere; }
  .for { font-size: 12.5px; color: var(--text-3); margin-top: 6px; }
  .for b { color: var(--text-2); font-weight: 600; }
  .fit { flex-shrink: 0; width: 56px; text-align: center; }
  .ring { position: relative; width: 52px; height: 52px; margin: 0 auto; }
  .ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
  .ring circle { fill: none; stroke-width: 4; }
  .ring .track { stroke: var(--border-2); }
  .ring .bar { stroke: var(--mh-teal); stroke-linecap: round; stroke-dasharray: 138.2; transition: stroke-dashoffset 0.6s ease; }
  .ring .num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .fit-label { font-size: 10.5px; color: var(--text-3); margin-top: 3px; white-space: nowrap; }
  .jobs { list-style: none; margin-top: 14px; border-top: 1px solid var(--border-2); }
  .job { padding: 10px 0; border-bottom: 1px solid var(--border-2); }
  .job-head { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
  .job-role { font-weight: 600; overflow-wrap: anywhere; }
  .job-dates { color: var(--text-3); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .job-line { margin-top: 4px; font-size: 13px; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .more { font-size: 12px; color: var(--text-3); padding-top: 8px; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
  button { font: 600 13px/1 var(--font); border-radius: var(--radius-sm); padding: 9px 14px; cursor: pointer; border: 1px solid var(--border); background: var(--bg); color: var(--text); transition: background 0.15s, opacity 0.15s; }
  button:hover { background: var(--bg-2); }
  button.primary { background: var(--mh-teal); border-color: transparent; color: #fff; }
  button.primary:hover { opacity: 0.9; }
  button:disabled { opacity: 0.55; cursor: default; }
  button:focus-visible { outline: 2px solid var(--mh-teal); outline-offset: 2px; }
  .status { font-size: 12.5px; color: var(--text-3); flex: 1 1 160px; }
  .status.error { color: var(--danger); }
  .empty { color: var(--text-3); font-size: 13px; padding: 4px 0; }
  .skeleton { height: 12px; border-radius: 4px; background: var(--bg-2); margin-top: 8px; }
  @media (max-width: 380px) { .card { padding: 14px; } .name { font-size: 16.5px; } }
  @media (prefers-reduced-motion: reduce) { .ring .bar { transition: none; } }
</style>
</head>
<body>
<div class="card" id="card" aria-live="polite">
  <div class="brand"><span class="mark">MH</span><span>ModuleHire resume</span></div>
  <div id="body">
    <div class="skeleton" style="width: 45%"></div>
    <div class="skeleton" style="width: 70%"></div>
    <div class="skeleton" style="width: 60%"></div>
  </div>
</div>
<script>
(function () {
  "use strict";
  var PROTOCOL_VERSION = "2026-01-26";
  var parent = window.parent;
  var nextId = 1;
  var pending = {};
  var hostCaps = {};
  var card = null;

  // ── JSON-RPC over postMessage (only messages from the host window are accepted) ──
  function send(msg) { parent.postMessage(Object.assign({ jsonrpc: "2.0" }, msg), "*"); }
  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      send({ id: id, method: method, params: params || {} });
    });
  }
  function notify(method, params) { send({ method: method, params: params || {} }); }

  window.addEventListener("message", function (event) {
    if (event.source !== parent) return;
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.id !== undefined && msg.method === undefined) {
      var p = pending[msg.id];
      if (!p) return;
      delete pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message || "Request failed"));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === "ui/notifications/tool-result") onToolResult(msg.params || {});
    else if (msg.method === "ui/notifications/host-context-changed") applyContext(msg.params || {});
    else if (msg.method === "ui/notifications/tool-cancelled") showEmpty("Cancelled.");
    else if (msg.method === "ui/resource-teardown" && msg.id !== undefined) send({ id: msg.id, result: {} });
    else if (msg.method === "ping" && msg.id !== undefined) send({ id: msg.id, result: {} });
  });

  // ── Theme and host styles (same effect as the SDK's applyDocumentTheme / applyHostStyleVariables) ──
  function applyContext(ctx) {
    var root = document.documentElement;
    if (ctx.theme === "light" || ctx.theme === "dark") {
      root.setAttribute("data-theme", ctx.theme);
      root.style.colorScheme = ctx.theme;
    }
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) {
      Object.keys(vars).forEach(function (key) {
        if (key.indexOf("--") === 0 && typeof vars[key] === "string") root.style.setProperty(key, vars[key]);
      });
    }
  }

  // ── Size reporting, like the SDK's setupSizeChangedNotifications ──
  var lastW = 0, lastH = 0, queued = false;
  function reportSize() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      var el = document.documentElement;
      var prev = el.style.height;
      el.style.height = "max-content";
      var h = Math.ceil(el.getBoundingClientRect().height);
      el.style.height = prev;
      var w = Math.ceil(window.innerWidth);
      if (w !== lastW || h !== lastH) {
        lastW = w; lastH = h;
        notify("ui/notifications/size-changed", { width: w, height: h });
      }
    });
  }

  // ── Rendering (textContent only) ──
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function showEmpty(text) {
    var body = document.getElementById("body");
    body.replaceChildren(el("p", "empty", text));
    reportSize();
  }

  function render(data) {
    card = data;
    var body = document.getElementById("body");
    var frag = document.createDocumentFragment();

    var top = el("div", "top");
    var who = el("div");
    who.appendChild(el("div", "name", data.name || "Your resume"));
    if (data.title) who.appendChild(el("div", "title", data.title));
    if (data.for_job) {
      var forLine = el("div", "for", "For ");
      forLine.appendChild(el("b", null, data.for_job));
      who.appendChild(forLine);
    }
    top.appendChild(who);

    if (data.fit && typeof data.fit.overall === "number") {
      var score = Math.max(0, Math.min(100, Math.round(data.fit.overall)));
      var fit = el("div", "fit");
      var ring = el("div", "ring");
      ring.setAttribute("role", "img");
      ring.setAttribute("aria-label", "Fit " + score + " out of 100");
      var ns = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 52 52");
      var track = document.createElementNS(ns, "circle");
      var bar = document.createElementNS(ns, "circle");
      [track, bar].forEach(function (c) { c.setAttribute("cx", "26"); c.setAttribute("cy", "26"); c.setAttribute("r", "22"); });
      track.setAttribute("class", "track");
      bar.setAttribute("class", "bar");
      bar.style.strokeDashoffset = "138.2";
      svg.appendChild(track);
      svg.appendChild(bar);
      ring.appendChild(svg);
      ring.appendChild(el("span", "num", String(score)));
      fit.appendChild(ring);
      fit.appendChild(el("div", "fit-label", data.fit.source === "estimate" ? "Fit (est.)" : "Fit"));
      top.appendChild(fit);
      requestAnimationFrame(function () { bar.style.strokeDashoffset = String(138.2 - (138.2 * score) / 100); });
    }
    frag.appendChild(top);

    var jobs = Array.isArray(data.jobs) ? data.jobs : [];
    if (jobs.length) {
      var list = el("ul", "jobs");
      jobs.forEach(function (j) {
        var item = el("li", "job");
        var head = el("div", "job-head");
        head.appendChild(el("span", "job-role", [j.title, j.company].filter(Boolean).join(", ")));
        if (j.dates) head.appendChild(el("span", "job-dates", j.dates));
        item.appendChild(head);
        if (j.first_line) item.appendChild(el("div", "job-line", j.first_line));
        list.appendChild(item);
      });
      frag.appendChild(list);
      if (data.more_jobs > 0) frag.appendChild(el("div", "more", "+" + data.more_jobs + " more " + (data.more_jobs === 1 ? "role" : "roles")));
    }

    var actions = el("div", "actions");
    var pdf = el("button", "primary", "Download PDF");
    var edit = el("button", null, "Open in editor");
    var status = el("span", "status");
    status.setAttribute("role", "status");
    pdf.type = edit.type = "button";
    pdf.addEventListener("click", function () {
      openFromTool(pdf, status, "Preparing PDF...", "export_resume", { resume_id: data.resume_id, format: "pdf" }, "download_url");
    });
    edit.addEventListener("click", function () {
      openFromTool(edit, status, "Opening editor...", "get_editor_link", { resume_id: data.resume_id }, "url");
    });
    actions.appendChild(pdf);
    actions.appendChild(edit);
    actions.appendChild(status);
    frag.appendChild(actions);

    body.replaceChildren(frag);
    reportSize();
  }

  // Reads a field from a tool result: structuredContent first, then the JSON text content.
  function resultField(result, field) {
    if (result && result.structuredContent && typeof result.structuredContent[field] === "string") return result.structuredContent[field];
    var text = result && result.content && result.content[0] && result.content[0].text;
    try { var parsed = JSON.parse(text); return typeof parsed[field] === "string" ? parsed[field] : null; } catch (e) { return null; }
  }
  function errorText(result) {
    var text = result && result.content && result.content[0] && result.content[0].text;
    return typeof text === "string" && text.length < 300 ? text : "Something went wrong. Ask your assistant to try again.";
  }

  function openFromTool(button, status, busyText, tool, args, field) {
    button.disabled = true;
    status.className = "status";
    status.textContent = busyText;
    reportSize();
    request("tools/call", { name: tool, arguments: args })
      .then(function (result) {
        if (result && result.isError) throw new Error(errorText(result));
        var url = resultField(result, field);
        if (!url) throw new Error("No link came back. Ask your assistant for it instead.");
        if (!hostCaps.openLinks) {
          status.textContent = "This app can't open links from here. Ask your assistant for the link.";
          return;
        }
        return request("ui/open-link", { url: url }).then(function () { status.textContent = ""; });
      })
      .catch(function (err) {
        status.className = "status error";
        status.textContent = (err && err.message) || "That didn't work. Ask your assistant instead.";
      })
      .then(function () { button.disabled = false; reportSize(); });
  }

  function onToolResult(result) {
    var data = result && result.structuredContent;
    if (data && data.kind === "resume_card") render(data);
    else if (result && result.isError) showEmpty("No preview for this one.");
  }

  // ── Handshake ──
  request("ui/initialize", {
    appInfo: { name: "modulehire-resume-card", version: "1.0.0" },
    appCapabilities: {},
    protocolVersion: PROTOCOL_VERSION
  }).then(function (init) {
    hostCaps = (init && init.hostCapabilities) || {};
    applyContext((init && init.hostContext) || {});
    notify("ui/notifications/initialized", {});
    reportSize();
    var ro = new ResizeObserver(reportSize);
    ro.observe(document.documentElement);
    ro.observe(document.body);
  }).catch(function () { /* Not inside an MCP Apps host: nothing to do. */ });
})();
</script>
</body>
</html>`
