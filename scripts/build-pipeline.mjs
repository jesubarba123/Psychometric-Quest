#!/usr/bin/env node
// Genera pipeline.html (estático, autocontenido) desde docs/pipeline.json.
// Uso: node scripts/build-pipeline.mjs   (o: npm run pipeline)
// Sin dependencias. Editá docs/pipeline.json y volvé a correrlo para actualizar.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "docs/pipeline.json"), "utf8"));

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STATUS = {
  done: { icon: "✅", label: "Listo", cls: "done" },
  wip: { icon: "🟡", label: "En curso", cls: "wip" },
  todo: { icon: "⬜", label: "Pendiente", cls: "todo" },
};

function stageStats(stage) {
  const total = stage.items.length || 1;
  const done = stage.items.filter((i) => i.status === "done").length;
  const wip = stage.items.filter((i) => i.status === "wip").length;
  const pct = Math.round((done / total) * 100);
  const status = done === stage.items.length ? "done" : done === 0 && wip === 0 ? "todo" : "wip";
  return { total: stage.items.length, done, wip, pct, status };
}

const stages = data.stages.map((s) => ({ ...s, stats: stageStats(s) }));
const allItems = stages.flatMap((s) => s.items.map((i) => ({ ...i, stage: s.name })));
const totalItems = allItems.length;
const doneItems = allItems.filter((i) => i.status === "done").length;
const overall = Math.round((doneItems / totalItems) * 100);

const nodes = stages
  .map(
    (s, idx) => `
      ${idx ? '<span class="arrow" aria-hidden="true">→</span>' : ""}
      <div class="node ${s.stats.status}">
        <span class="node-dot">${STATUS[s.stats.status].icon}</span>
        <span class="node-name">${esc(s.name)}</span>
        <span class="node-pct">${s.stats.pct}%</span>
      </div>`
  )
  .join("");

const cards = stages
  .map(
    (s) => `
    <section class="card ${s.stats.status}">
      <header class="card-head">
        <h2>${esc(s.name)}</h2>
        <span class="chip ${s.stats.status}">${STATUS[s.stats.status].icon} ${STATUS[s.stats.status].label}</span>
      </header>
      <div class="bar"><span style="width:${s.stats.pct}%"></span></div>
      <div class="bar-meta">${s.stats.done}/${s.stats.total} · ${s.stats.pct}%</div>
      <ul class="items">
        ${s.items
          .map(
            (i) => `<li class="item ${i.status}">
              <span class="i-icon">${STATUS[i.status].icon}</span>
              <span class="i-body"><span class="i-label">${esc(i.label)}</span>${
                i.note ? `<span class="i-note">${esc(i.note)}</span>` : ""
              }</span>
            </li>`
          )
          .join("")}
      </ul>
    </section>`
  )
  .join("");

const pendingWip = allItems.filter((i) => i.status === "wip");
const pendingTodo = allItems.filter((i) => i.status === "todo");
const pendingList = (arr) =>
  arr
    .map(
      (i) =>
        `<li><span class="i-icon">${STATUS[i.status].icon}</span> <strong>${esc(i.stage)}:</strong> ${esc(
          i.label
        )}${i.note ? ` <span class="i-note">— ${esc(i.note)}</span>` : ""}</li>`
    )
    .join("");

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pipeline — ${esc(data.project)}</title>
<style>
  :root{
    --ink:#d8e8e4;--muted:#7a9898;--line:#2a3a48;--paper:#0e1318;--surface:#161d24;
    --surface2:#1b242d;--signal:#4ecdc4;--green:#5cb88a;--amber:#e8a94a;--blue:#6aa8ff;
    --font:"Inter",system-ui,-apple-system,sans-serif;
  }
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1200px 600px at 70% -10%,#13202a,var(--paper));
       color:var(--ink);font-family:var(--font);line-height:1.5;padding:32px 20px 64px}
  .wrap{max-width:1060px;margin:0 auto}
  header.top{margin-bottom:26px}
  .eyebrow{color:var(--signal);font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px;margin:0 0 6px}
  h1{margin:0 0 4px;font-size:26px;letter-spacing:-.01em}
  .tagline{color:var(--muted);margin:0 0 18px;font-size:14px}
  .overall{display:flex;align-items:center;gap:16px;background:var(--surface);border:1px solid var(--line);
           border-radius:14px;padding:16px 18px}
  .overall .big{font-size:34px;font-weight:800;color:var(--signal);min-width:78px}
  .overall .obar{flex:1}
  .meta{color:var(--muted);font-size:12.5px;margin-top:6px}
  .bar{height:9px;border-radius:99px;background:#0c151b;border:1px solid var(--line);overflow:hidden}
  .bar>span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--signal),var(--green))}
  .strip{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:24px 0 30px}
  .arrow{color:var(--muted);font-size:18px}
  .node{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:120px;
        padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
  .node-name{font-size:12.5px;font-weight:700;text-align:center}
  .node-pct{font-size:12px;color:var(--muted)}
  .node.done{border-color:rgba(92,184,138,.5)} .node.wip{border-color:rgba(232,169,74,.5)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
  .card.done{border-left:4px solid var(--green)} .card.wip{border-left:4px solid var(--amber)}
  .card.todo{border-left:4px solid var(--line)}
  .card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
  .card-head h2{font-size:15px;margin:0}
  .chip{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid var(--line);white-space:nowrap}
  .chip.done{color:var(--green);background:rgba(92,184,138,.1)}
  .chip.wip{color:var(--amber);background:rgba(232,169,74,.1)}
  .chip.todo{color:var(--muted);background:var(--surface2)}
  .bar-meta{font-size:11.5px;color:var(--muted);margin:6px 0 12px}
  ul.items{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
  .item{display:flex;gap:9px;align-items:flex-start}
  .item.todo .i-label,.item.wip .i-label{color:var(--ink)}
  .item.done .i-label{color:var(--muted)}
  .i-icon{font-size:13px;line-height:1.3;flex:none}
  .i-body{display:flex;flex-direction:column}
  .i-label{font-size:13px}
  .i-note{font-size:11.5px;color:var(--amber);margin-top:1px}
  .pending{margin-top:34px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
  .pending h2{font-size:16px;margin:0 0 12px}
  .pending h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 6px}
  .pending ul{margin:0;padding-left:2px;list-style:none;display:flex;flex-direction:column;gap:6px}
  .pending li{font-size:13px}
  footer{color:var(--muted);font-size:12px;margin-top:30px;text-align:center}
  code{background:var(--surface2);padding:1px 6px;border-radius:6px;color:var(--ink)}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <p class="eyebrow">Pipeline del proyecto</p>
    <h1>${esc(data.project)}</h1>
    <p class="tagline">${esc(data.tagline || "")}</p>
    <div class="overall">
      <div class="big">${overall}%</div>
      <div class="obar">
        <div class="bar"><span style="width:${overall}%"></span></div>
        <div class="meta">${doneItems}/${totalItems} subtareas completas · ${stages.filter(s=>s.stats.status==="done").length}/${stages.length} etapas listas · Actualizado: ${esc(data.updated)}</div>
      </div>
    </div>
  </header>

  <div class="strip">${nodes}</div>

  <div class="grid">${cards}</div>

  <div class="pending">
    <h2>🔭 Lo que falta ahora</h2>
    ${pendingWip.length ? `<h3>En curso</h3><ul>${pendingList(pendingWip)}</ul>` : ""}
    ${pendingTodo.length ? `<h3>Pendiente</h3><ul>${pendingList(pendingTodo)}</ul>` : ""}
    ${!pendingWip.length && !pendingTodo.length ? "<p>🎉 Todo completo.</p>" : ""}
  </div>

  <footer>
    Generado desde <code>docs/pipeline.json</code> · actualizá con <code>npm run pipeline</code> (o lo hace el bucle de las 9am).
  </footer>
</div>
</body>
</html>
`;

writeFileSync(join(ROOT, "pipeline.html"), html, "utf8");
console.log(`pipeline.html generado · ${overall}% global · ${doneItems}/${totalItems} subtareas`);
