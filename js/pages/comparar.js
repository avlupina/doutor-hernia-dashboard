// Comparar períodos — dois períodos (até 5 anos), indicadores à escolha, totais e evolução lado a lado.
import { Resumo } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico, select, botao, PALETA } from "../ui.js";
import { grupoPeriodo, atalho, iso, deslocarAnos, periodoAnterior, semanasEntre, agregar, agregarPorSemana, agregarPorMes, INDICADORES } from "../periodos.js";

const FMT = { int: fmt.int, brl: fmt.brl, pct: fmt.pct, num: fmt.num };
const PADRAO = ["leads", "aval_realizadas", "contratos", "atendimentos", "receitas", "resultado"];
const CORES = ["#09285f", "#eb6834"]; // período A (azul da marca) / período B (laranja)

export async function render(root, ctx) {
  const todas = agregarPorSemana(await Resumo.semanal(ctx.u));
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Comparar períodos"), el("p", { class: "sub", style: "margin:0" }, (ctx.unidade ? `Unidade ${ctx.unidade.nome}` : "Consolidado de todas as unidades") + " · intervalos de até 5 anos, por semana ou por mês."))));

  // períodos padrão: A = mês atual (ou último mês com atividade); B = mesmo período do ano anterior
  let A = atalho("mes_atual");
  const ult = todas.filter(r => r.leads || r.atendimentos || Number(r.receitas) > 0).pop();
  if (ult && !(ult.inicio >= A[0] && ult.inicio <= A[1])) { const d = new Date(ult.inicio + "T00:00:00"); A = [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
  let B = deslocarAnos(A, -1);

  const gA = grupoPeriodo({ rotulo: "Período A", de: A[0], ate: A[1], onAplicar: desenhar, aplicarRotulo: "Comparar" });
  const gB = grupoPeriodo({ rotulo: "Período B", de: B[0], ate: B[1], onAplicar: desenhar, aplicarRotulo: "Comparar",
    extras: [["ano_ant_A", "Mesmo período de A, ano anterior"], ["ant_A", "Período imediatamente anterior a A"]],
    resolver: cod => { const v = gA.valor(); if (!v.de || !v.ate) return null; if (cod === "ano_ant_A") return deslocarAnos([v.de, v.ate], -1); if (cod === "ant_A") return periodoAnterior(v.de, v.ate); return null; } });

  // indicadores
  const checks = INDICADORES.map(([k, rotulo]) => { const c = el("input", { type: "checkbox", value: k }); c.checked = PADRAO.includes(k); return { k, rotulo, c }; });
  const gran = select([["auto", "Granularidade automática"], ["semana", "Por semana"], ["mes", "Por mês"]], { style: "width:auto" }, "auto");
  const lista = el("div", { class: "checks" }, ...checks.map(x => el("label", { class: "check" }, x.c, " " + x.rotulo)));
  root.append(secao("Períodos", el("div", { class: "grid grid-2" }, gA, gB)),
    secao("Indicadores a comparar", lista, el("div", { class: "form-acoes" },
      botao("Todos", () => { checks.forEach(x => x.c.checked = true); desenhar(); }, "btn sec mini"), botao("Nenhum", () => { checks.forEach(x => x.c.checked = false); desenhar(); }, "btn sec mini"),
      botao("Padrão", () => { checks.forEach(x => x.c.checked = PADRAO.includes(x.k)); desenhar(); }, "btn sec mini"), gran, botao("Comparar", desenhar))));
  checks.forEach(x => x.c.onchange = desenhar); gran.onchange = desenhar;
  const corpo = el("div"); root.append(corpo);
  await desenhar();

  async function desenhar() {
    const a = gA.valor(), b = gB.valor();
    if (!a.de || !a.ate || !b.de || !b.ate) return;
    corpo.replaceChildren(el("p", { class: "sub" }, "Carregando…"));
    const [sa, sb] = await Promise.all([semanasEntre(a.de, a.ate), semanasEntre(b.de, b.ate)]);
    const ida = sa.map(s => s.id_semana), idb = sb.map(s => s.id_semana);
    const rowsA = todas.filter(r => ida.includes(r.id_semana)), rowsB = todas.filter(r => idb.includes(r.id_semana));
    const TA = agregar(rowsA), TB = agregar(rowsB);
    const sel = checks.filter(x => x.c.checked);
    const porMes = gran.value === "mes" || (gran.value === "auto" && Math.max(ida.length, idb.length) > 16);
    const serA = porMes ? agregarPorMes(rowsA) : rowsA, serB = porMes ? agregarPorMes(rowsB) : rowsB;
    const nomeA = `A: ${fmt.data(a.de)} – ${fmt.data(a.ate)}`, nomeB = `B: ${fmt.data(b.de)} – ${fmt.data(b.ate)}`;
    corpo.replaceChildren();
    corpo.append(el("p", { class: "nota" }, `${nomeA} (${ida.length} semanas, ${rowsA.length} com dados) · ${nomeB} (${idb.length} semanas, ${rowsB.length} com dados) · ${porMes ? "por mês" : "por semana"}`));
    if (!TA && !TB) { corpo.append(secao("Sem dados", el("p", {}, "Nenhum dos dois períodos tem lançamentos."))); return; }
    if (!sel.length) { corpo.append(secao("Indicadores", el("p", {}, "Selecione ao menos um indicador."))); return; }

    // tabela resumo
    const linhas = sel.map(x => { const def = INDICADORES.find(i => i[0] === x.k); const va = TA?.[x.k], vb = TB?.[x.k]; const f = FMT[def[2]];
      const dif = va != null && vb != null ? Number(va) - Number(vb) : null; const pct = dif != null && Number(vb) ? dif / Math.abs(Number(vb)) : null;
      const bom = dif == null ? null : (def[3] ? dif <= 0 : dif >= 0);
      return { ind: def[1], a: f(va), b: f(vb), dif: dif == null ? "—" : (def[2] === "pct" ? fmt.delta(va, vb, fmt.pct) : fmt.delta(va, vb, f)), pct: pct == null ? "—" : (pct > 0 ? "+" : "") + fmt.pct(pct), bom }; });
    corpo.append(secao("Resumo A × B", el("div", { class: "tabela-wrap" }, tabela([
      { k: "ind", t: "Indicador" }, { k: "a", t: nomeA, cls: "num" }, { k: "b", t: nomeB, cls: "num" },
      { k: "dif", t: "Diferença (A − B)", cls: "num", f: (v, r) => el("span", { class: r.bom == null ? "" : r.bom ? "ok" : "ruim" }, v) },
      { k: "pct", t: "Variação %", cls: "num", f: (v, r) => el("span", { class: r.bom == null ? "" : r.bom ? "ok" : "ruim" }, v) }], linhas))));

    // gráfico de totais (barras agrupadas por indicador, normalizadas por formato)
    const grupos = { int: [], brl: [], pct: [] };
    sel.forEach(x => { const def = INDICADORES.find(i => i[0] === x.k); grupos[def[2] === "num" ? "int" : def[2]].push(def); });
    const gTot = secao("Totais do período — A × B");
    const wrap = el("div", { class: "grid grid-3" });
    for (const [tipo, defs] of Object.entries(grupos)) { if (!defs.length) continue; const box = el("div");
      grafico(box, { tipo: "bar", labels: defs.map(d => d[1]), formatoY: FMT[tipo], max: tipo === "pct" ? 1 : undefined,
        datasets: [{ label: nomeA, cor: CORES[0], data: defs.map(d => TA?.[d[0]] ?? null) }, { label: nomeB, cor: CORES[1], data: defs.map(d => TB?.[d[0]] ?? null) }] }, 260);
      wrap.append(box); }
    gTot.append(wrap); corpo.append(gTot);

    // evolução por indicador: séries alinhadas pela posição (semana/mês 1..n)
    const n = Math.max(serA.length, serB.length);
    const labels = Array.from({ length: n }, (_, i) => porMes ? `M${i + 1}` : `S${i + 1}`);
    const evo = el("div", { class: "grid grid-2" });
    for (const x of sel) { const def = INDICADORES.find(i => i[0] === x.k); const box = el("section", { class: "secao" }, el("h2", {}, def[1]));
      grafico(box, { tipo: "line", labels, formatoY: FMT[def[2]], max: def[2] === "pct" && !["ocupacao_total"].includes(def[0]) ? undefined : (def[2] === "pct" ? 1 : undefined),
        datasets: [{ label: nomeA, cor: CORES[0], data: labels.map((_, i) => serA[i]?.[x.k] ?? null) }, { label: nomeB, cor: CORES[1], data: labels.map((_, i) => serB[i]?.[x.k] ?? null) }] }, 220);
      box.append(el("p", { class: "nota" }, porMes ? `M1 = ${fmt.mes(serA[0]?.mes) || "—"} em A e ${fmt.mes(serB[0]?.mes) || "—"} em B` : `S1 = ${serA[0]?.id_semana || "—"} em A e ${serB[0]?.id_semana || "—"} em B`));
      evo.append(box); }
    corpo.append(el("h3", {}, "Evolução dentro de cada período (alinhada pela posição)"), evo);
  }
}
