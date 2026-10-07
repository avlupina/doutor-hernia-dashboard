// Utilitários de interface: formatação, tabelas, KPIs, gráficos (Chart.js) e mensagens.

export const PALETA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export const fmt = {
  brl: v => (v == null || v === "" ? "—" : brl.format(Number(v))),
  num: v => (v == null || v === "" ? "—" : num.format(Number(v))),
  int: v => (v == null || v === "" ? "—" : Math.round(Number(v)).toLocaleString("pt-BR")),
  pct: v => (v == null || v === "" ? "—" : pct.format(Number(v))),
  data: v => (v ? new Date(v + (v.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—"),
  mes: m => { if (!m) return "—"; const [y, mm] = m.split("-"); return new Date(y, mm - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }); },
  delta: (a, b, f = fmt.num) => { if (a == null || b == null) return ""; const d = Number(a) - Number(b); const s = d > 0 ? "▲ " : d < 0 ? "▼ " : "= "; return s + f(Math.abs(d)); },
};

export function hoje() { return new Date().toISOString().slice(0, 10); }
export function addDias(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

export function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/** Card de indicador: valor atual, comparação e meta. */
export function kpi({ titulo, valor, anterior, meta, formato = fmt.num, inverter = false, sub }) {
  const card = el("div", { class: "kpi" });
  card.append(el("div", { class: "kpi-titulo" }, titulo));
  card.append(el("div", { class: "kpi-valor" }, formato(valor)));
  const linhas = [];
  if (anterior != null && valor != null) {
    const d = Number(valor) - Number(anterior);
    const bom = inverter ? d <= 0 : d >= 0;
    linhas.push(el("span", { class: "kpi-delta " + (d === 0 ? "" : bom ? "ok" : "ruim") }, fmt.delta(valor, anterior, formato) + " vs. anterior"));
  }
  if (meta != null && valor != null && Number(meta) !== 0) {
    const r = Number(valor) / Number(meta);
    const bom = inverter ? r <= 1 : r >= 1;
    linhas.push(el("span", { class: "kpi-meta " + (bom ? "ok" : "ruim") }, `${fmt.pct(r)} da meta (${formato(meta)})`));
  }
  if (sub) linhas.push(el("span", { class: "kpi-sub" }, sub));
  if (linhas.length) card.append(el("div", { class: "kpi-linhas" }, ...linhas));
  return card;
}

/** Tabela simples: colunas = [{k, t, f?, cls?}] ; rows = objetos. */
export function tabela(colunas, rows, { vazio = "Sem dados.", classe = "" } = {}) {
  const t = el("table", { class: "tabela " + classe });
  t.append(el("thead", {}, el("tr", {}, ...colunas.map(c => el("th", { class: c.cls || "" }, c.t)))));
  const tb = el("tbody");
  if (!rows?.length) tb.append(el("tr", {}, el("td", { colspan: colunas.length, class: "vazio" }, vazio)));
  for (const r of rows || []) {
    tb.append(el("tr", {}, ...colunas.map(c => {
      const v = typeof c.k === "function" ? c.k(r) : r[c.k];
      const td = el("td", { class: c.cls || "" });
      const out = c.f ? c.f(v, r) : v;
      if (out?.nodeType) td.append(out); else td.textContent = out ?? "";
      return td;
    })));
  }
  t.append(tb);
  return t;
}

export function secao(titulo, ...conteudo) {
  return el("section", { class: "secao" }, el("h2", {}, titulo), ...conteudo);
}

export function toast(msg, tipo = "info") {
  let box = document.getElementById("toasts");
  if (!box) { box = el("div", { id: "toasts" }); document.body.append(box); }
  const t = el("div", { class: "toast " + tipo }, msg);
  box.append(t);
  setTimeout(() => t.remove(), 5000);
}

export function erro(e) { console.error(e); toast(e?.message || String(e), "erro"); }

export function campo(label, input, hint) {
  const w = el("label", { class: "campo" }, el("span", { class: "campo-label" }, label), input);
  if (hint) w.append(el("small", { class: "campo-hint" }, hint));
  return w;
}
export function input(attrs = {}) { return el("input", { class: "input", ...attrs }); }
export function select(opcoes, attrs = {}, atual) {
  const s = el("select", { class: "input", ...attrs });
  for (const o of opcoes) {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    const op = el("option", { value: v }, t);
    if (String(v) === String(atual)) op.selected = true;
    s.append(op);
  }
  return s;
}
export function textarea(attrs = {}, valor = "") { const t = el("textarea", { class: "input", rows: 3, ...attrs }); t.value = valor || ""; return t; }
export function botao(texto, onclick, cls = "btn") { return el("button", { class: cls, type: "button", onclick }, texto); }

// ------------------------------------------------------------------ gráficos (Chart.js)
const base = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } }, tooltip: { mode: "index", intersect: false } },
  interaction: { mode: "index", intersect: false },
  scales: { x: { grid: { display: false } }, y: { grid: { color: "rgba(0,0,0,.06)" }, border: { display: false }, beginAtZero: true } },
};

export function grafico(container, cfg, altura = 260) {
  const wrap = el("div", { class: "grafico", style: `height:${altura}px` });
  const canvas = el("canvas");
  wrap.append(canvas);
  container.append(wrap);
  const opts = JSON.parse(JSON.stringify(base));
  if (cfg.formatoY) {
    const f = cfg.formatoY;
    opts.scales.y.ticks = { callback: v => f(v) };
    opts.plugins.tooltip.callbacks = { label: c => `${c.dataset.label}: ${f(c.parsed.y)}` };
  }
  if (cfg.max != null) opts.scales.y.max = cfg.max;
  if (cfg.empilhado) { opts.scales.x.stacked = true; opts.scales.y.stacked = true; }
  (cfg.datasets || []).forEach((d, i) => {
    const cor = d.cor || PALETA[i % PALETA.length];
    Object.assign(d, cfg.tipo === "line"
      ? { borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.25, fill: false }
      : { backgroundColor: cor, borderColor: "#fcfcfb", borderWidth: 1, borderRadius: 4, maxBarThickness: 36 });
  });
  new window.Chart(canvas, { type: cfg.tipo || "bar", data: { labels: cfg.labels, datasets: cfg.datasets }, options: opts });
  return wrap;
}
