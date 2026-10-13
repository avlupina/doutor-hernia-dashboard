// Painel Semanal — dashboard horizontal com indicadores-chave: crescimento, agenda/atendimentos e financeiro.
// Dois modos: uma semana (seletor "Semana") ou um período (datas de início/fim ou atalhos). No modo período,
// as semanas do intervalo são somadas, a comparação é com o período anterior de mesma duração e as metas
// semanais são multiplicadas pelo número de semanas.
import { Semanas, Resumo, Metas } from "../api.js";
import { el, kpi, fmt, tabela, select, grafico, botao, input, campo } from "../ui.js";
import { PERIODO_INICIO } from "../config.js";

const ATALHOS = [["", "Período…"], ["mes_atual", "Mês atual"], ["mes_anterior", "Mês anterior"], ["t1", "1º trimestre"], ["t2", "2º trimestre"], ["t3", "3º trimestre"], ["t4", "4º trimestre"], ["ano_atual", "Ano atual"], ["ano_anterior", "Ano anterior"]];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function atalho(cod) {
  const h = new Date(), y = h.getFullYear(), m = h.getMonth();
  const mes = (yy, mm) => [iso(new Date(yy, mm, 1)), iso(new Date(yy, mm + 1, 0))];
  const tri = (q, yy = y) => [iso(new Date(yy, (q - 1) * 3, 1)), iso(new Date(yy, q * 3, 0))];
  switch (cod) {
    case "mes_atual": return mes(y, m);
    case "mes_anterior": return mes(y, m - 1);
    case "t1": case "t2": case "t3": case "t4": return tri(Number(cod[1]));
    case "ano_atual": return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    case "ano_anterior": return [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11, 31))];
  }
  return null;
}

export async function render(root, ctx) {
  const todas = agregarPorSemana(await Resumo.semanal(ctx.u));
  const comAtividade = todas.filter(r => r.leads || r.atendimentos || Number(r.receitas) > 0 || r.contratos).map(r => r.id_semana);
  const idsComDados = new Set(todas.map(r => r.id_semana));
  const p0 = ctx.params[0] || "";
  const padraoSemana = /^\d{4}-S\d{2}$/.test(p0) ? p0 : (comAtividade[comAtividade.length - 1] || [...idsComDados].sort().pop() || Semanas.atual());
  const semanas = await Semanas.disponiveis(padraoSemana, 8);
  let periodoIni = null;
  if (p0.startsWith("p:")) { const [a, b] = p0.slice(2).split("_"); if (a && b) periodoIni = [a, b]; }

  const de = input({ type: "date", min: PERIODO_INICIO, value: periodoIni?.[0] || "" }), ate = input({ type: "date", min: PERIODO_INICIO, value: periodoIni?.[1] || "" });
  const selAtalho = select(ATALHOS, {}, "");
  const selSemana = select(semanas.map(s => [s.id_semana, `${s.id_semana}  (${fmt.data(s.inicio)} – ${fmt.data(s.fim)})${idsComDados.has(s.id_semana) ? "" : "  · sem dados"}`]), { id: "sel-semana" }, padraoSemana);
  const btnAplicar = botao("Aplicar", () => aplicarPeriodo(), "btn sec alinhado");
  const topo = el("div", { class: "topo" },
    el("div", {}, el("h1", {}, "Painel Semanal"), el("p", { class: "sub", style: "margin:0" }, ctx.unidade ? `Unidade ${ctx.unidade.nome}` : "Consolidado de todas as unidades")),
    el("div", { class: "acoes linha" },
      el("div", { class: "grupo-periodo" },
        campo("Início", de), campo("Término", ate), campo("Atalhos", selAtalho), btnAplicar),
      el("div", { class: "divisor" }),
      el("label", { class: "campo", style: "min-width:300px" }, el("span", { class: "campo-label" }, "Semana"), selSemana),
      ctx.editor ? botao("Lançar / editar", () => location.hash = "#/semana/" + selSemana.value, "btn sec alinhado") : null));
  const corpo = el("div");
  root.append(topo, corpo);

  selSemana.onchange = () => { de.value = ate.value = ""; selAtalho.value = ""; history.replaceState(null, "", "#/painel/" + selSemana.value); carregar({ semana: selSemana.value }); };
  selAtalho.onchange = () => { const r = atalho(selAtalho.value); if (r) { [de.value, ate.value] = r; aplicarPeriodo(); } };
  de.onchange = ate.onchange = () => { selAtalho.value = ""; if (de.value && ate.value) aplicarPeriodo(); };
  function aplicarPeriodo() {
    if (!de.value || !ate.value) return;
    if (de.value > ate.value) [de.value, ate.value] = [ate.value, de.value];
    history.replaceState(null, "", `#/painel/p:${de.value}_${ate.value}`);
    carregar({ de: de.value, ate: ate.value });
  }
  if (periodoIni) await carregar({ de: periodoIni[0], ate: periodoIni[1] }); else await carregar({ semana: padraoSemana });

  async function carregar(sel) {
    corpo.replaceChildren(el("p", { class: "sub" }, "Carregando…"));
    // --- define semanas do período atual e do anterior
    let idsAtual, idsAnt, titulo, prox = null, nSem;
    if (sel.semana) {
      idsAtual = [sel.semana]; idsAnt = [Semanas.anterior(sel.semana)]; prox = Semanas.proxima(sel.semana); nSem = 1;
      const s = semanas.find(x => x.id_semana === sel.semana); titulo = `Semana ${sel.semana}` + (s ? ` (${fmt.data(s.inicio)} – ${fmt.data(s.fim)})` : "");
    } else {
      const cal = await Semanas.listar(PERIODO_INICIO, "2030-12-31");
      const dentro = cal.filter(s => s.inicio >= sel.de && s.inicio <= sel.ate);
      idsAtual = dentro.map(s => s.id_semana); nSem = Math.max(1, idsAtual.length);
      const dias = Math.round((new Date(sel.ate) - new Date(sel.de)) / 864e5) + 1;
      const antFim = new Date(sel.de); antFim.setDate(antFim.getDate() - 1); const antIni = new Date(antFim); antIni.setDate(antIni.getDate() - dias + 1);
      idsAnt = cal.filter(s => s.inicio >= iso(antIni) && s.inicio <= iso(antFim)).map(s => s.id_semana);
      titulo = `Período ${fmt.data(sel.de)} – ${fmt.data(sel.ate)} · ${idsAtual.length} semana(s) · comparado com ${fmt.data(iso(antIni))} – ${fmt.data(iso(antFim))}`;
    }
    const idsTodos = [...idsAtual, ...idsAnt, ...(prox ? [prox] : [])];
    const [rows, metas, canais, pend, fisios] = await Promise.all([
      idsTodos.length ? Resumo.semanal(ctx.u, { ids: idsTodos }) : [], Metas.listar(ctx.u), idsAtual.length + idsAnt.length ? Resumo.leadsCanal(ctx.u, [...idsAtual, ...idsAnt]) : [],
      Resumo.pendencias(ctx.u), idsAtual.length + idsAnt.length ? Resumo.fisios(ctx.u, { ids: [...idsAtual, ...idsAnt] }) : [],
    ]);
    const a = agregar(rows.filter(r => idsAtual.includes(r.id_semana))), p = agregar(rows.filter(r => idsAnt.includes(r.id_semana))), n = prox ? agregar(rows.filter(r => r.id_semana === prox)) : null;
    const semanasComDados = new Set(rows.filter(r => idsAtual.includes(r.id_semana)).map(r => r.id_semana)).size || 1;
    const M = k => (metas[k]?.meta_semanal == null ? null : (k.startsWith("Taxa") || k.startsWith("Conversão") ? metas[k].meta_semanal : metas[k].meta_semanal * nSem));
    const MM = k => metas[k]?.meta_mensal;
    const fA = agruparFisios(fisios.filter(f => idsAtual.includes(f.id_semana))), fP = agruparFisios(fisios.filter(f => idsAnt.includes(f.id_semana)));
    const ultimo = idsAtual.slice().sort().pop(); const limite = semanas.find(s => s.id_semana === ultimo)?.inicio || todas.find(s => s.id_semana === ultimo)?.inicio;
    const hist = (sel.semana ? todas.filter(s => !limite || s.inicio <= limite).slice(-10) : todas.filter(s => idsAtual.includes(s.id_semana))).slice(-26);
    corpo.replaceChildren();
    corpo.append(el("p", { class: "nota", style: "margin:-6px 0 10px" }, titulo + (nSem > 1 ? ` · metas semanais × ${nSem}` : "")));
    if (!a) { corpo.append(el("section", { class: "secao" }, el("h2", {}, "Sem dados"), el("p", {}, "Nenhum lançamento no período selecionado. ", ctx.editor ? "Use “Lançar Semana” ou importe a planilha." : "Peça a um gestor para lançar os dados."))); return; }
    const ocMeta = M("Taxa de ocupação da agenda");
    const rot = sel.semana ? "semanal" : "do período", rotA = sel.semana ? "da semana" : "do período";

    corpo.append(el("div", { class: "faixa" },
      faixa("Leads", fmt.int(a.leads)), el("div", { class: "sep" }),
      faixa("Avaliações realizadas", fmt.int(a.aval_realizadas)), el("div", { class: "sep" }),
      faixa("Tratamentos contratados", fmt.int(a.contratos)), el("div", { class: "sep" }),
      faixa("Atendimentos", fmt.int(a.atendimentos)), el("div", { class: "sep" }),
      faixa("Ocupação", fmt.pct(a.ocupacao_total)), el("div", { class: "sep" }),
      faixa("Receita", fmt.brl(a.receitas)), el("div", { class: "sep" }),
      faixa("Resultado", fmt.brl(a.resultado))));

    const dash = el("div", { class: "dash" });
    corpo.append(dash);

    dash.append(bloco("c8", "Crescimento",
      el("div", { class: "mini-grid" },
        kpi({ titulo: "Novos pacientes", valor: a.novos_pacientes, anterior: p?.novos_pacientes, meta: M("Novos pacientes"), formato: fmt.int }),
        kpi({ titulo: "Leads recebidos", valor: a.leads, anterior: p?.leads, meta: M("Leads recebidos"), formato: fmt.int }),
        kpi({ titulo: "Avaliações agendadas", valor: a.aval_agendadas, anterior: p?.aval_agendadas, formato: fmt.int }),
        kpi({ titulo: "Avaliações realizadas", valor: a.aval_realizadas, anterior: p?.aval_realizadas, meta: M("Avaliações realizadas"), formato: fmt.int }),
        kpi({ titulo: "Tratamentos contratados", valor: a.contratos, anterior: p?.contratos, meta: M("Contratos fechados (tratamentos)"), formato: fmt.int }),
        kpi({ titulo: "Conversão aval. → contrato", valor: a.conversao_aval_contrato, anterior: p?.conversao_aval_contrato, meta: M("Conversão avaliação → contrato"), formato: fmt.pct }),
        kpi({ titulo: "Cancelamento de avaliações", valor: a.taxa_cancel_aval, anterior: p?.taxa_cancel_aval, meta: M("Taxa máx. de cancelamento de avaliações"), formato: fmt.pct, inverter: true }),
        kpi({ titulo: "Valor contratado", valor: a.valor_total_contratado, anterior: p?.valor_total_contratado, formato: fmt.brl, sub: `${a.aval_contratadas} aval. · ${a.protocolos_contratados} protocolos` }))));
    dash.append(bloco("c4", "Meios de ingresso", blocoCanais(canais, idsAtual, idsAnt)));

    const agendaKpis = [
      ...fA.map(f => kpi({ titulo: `Atendimentos — ${f.fisioterapeuta}`, valor: f.atendimentos, anterior: fP.find(x => x.fisioterapeuta === f.fisioterapeuta)?.atendimentos, formato: fmt.int })),
      kpi({ titulo: "Atendimentos — total", valor: a.atendimentos, anterior: p?.atendimentos, meta: M("Atendimentos realizados"), formato: fmt.int }),
      kpi({ titulo: "Cancelamentos", valor: a.cancel_atendimentos, anterior: p?.cancel_atendimentos, formato: fmt.int, inverter: true }),
      kpi({ titulo: "Ocupação — manhã", valor: a.ocupacao_manha, anterior: p?.ocupacao_manha, meta: ocMeta, formato: fmt.pct }),
      kpi({ titulo: "Ocupação — tarde", valor: a.ocupacao_tarde, anterior: p?.ocupacao_tarde, meta: ocMeta, formato: fmt.pct }),
      kpi({ titulo: "Ocupação — total", valor: a.ocupacao_total, anterior: p?.ocupacao_total, meta: ocMeta, formato: fmt.pct }),
    ];
    if (prox) agendaKpis.push(kpi({ titulo: `Ocupação já agendada (${prox})`, valor: n?.ocupacao_total, meta: ocMeta, formato: fmt.pct, sub: n ? `manhã ${fmt.pct(n.ocupacao_manha)} · tarde ${fmt.pct(n.ocupacao_tarde)}` : "lance a agenda da próxima semana" }));
    else agendaKpis.push(kpi({ titulo: "Atendimentos por semana", valor: a.atendimentos / semanasComDados, formato: fmt.num, sub: `${semanasComDados} semana(s) com dados` }));
    dash.append(bloco("c8", "Agenda e atendimentos", el("div", { class: "mini-grid" }, ...agendaKpis),
      el("h3", {}, "Tempo médio de atendimento (min)"),
      tabela([{ k: "fisioterapeuta", t: "Fisioterapeuta" }, { k: "tempo_medio_min", t: "Média", cls: "num", f: fmt.num }, { k: "desvio_min", t: "Desvio", cls: "num", f: fmt.num },
        { k: r => fP.find(x => x.fisioterapeuta === r.fisioterapeuta)?.tempo_medio_min, t: "Média anterior", cls: "num", f: fmt.num },
        { k: "aval_realizadas", t: "Avaliações", cls: "num", f: fmt.int }, { k: "contratos", t: "Contratos", cls: "num", f: fmt.int }, { k: "conversao", t: "Conversão", cls: "num", f: fmt.pct }], fA)));
    const gAt = bloco("c4", sel.semana ? "Atendimentos — últimas semanas" : "Atendimentos — semanas do período");
    grafico(gAt, { tipo: "bar", labels: hist.map(r => r.id_semana.slice(2)), datasets: [{ label: "Atendimentos", data: hist.map(r => r.atendimentos) }, { label: "Avaliações realizadas", data: hist.map(r => r.aval_realizadas) }] }, 220);
    dash.append(gAt);

    const finKpis = [
      kpi({ titulo: `Receita ${rot}`, valor: a.receitas, anterior: p?.receitas, meta: M("Receita"), formato: fmt.brl }),
      kpi({ titulo: `Gastos ${sel.semana ? "semanais" : "do período"}`, valor: a.gastos, anterior: p?.gastos, meta: M("Gastos"), formato: fmt.brl, inverter: true }),
      kpi({ titulo: "Impostos", valor: a.impostos, anterior: p?.impostos, formato: fmt.brl, inverter: true }),
      kpi({ titulo: "Marketing", valor: a.marketing, anterior: p?.marketing, meta: M("Investimento em marketing"), formato: fmt.brl, inverter: true }),
      kpi({ titulo: `Resultado ${rotA}`, valor: a.resultado, anterior: p?.resultado, formato: fmt.brl }),
    ];
    if (sel.semana) finKpis.push(
      kpi({ titulo: `Receita acumulada — ${fmt.mes(a.mes)}`, valor: a.receita_acum_mes, meta: MM("Receita"), formato: fmt.brl }),
      kpi({ titulo: `Gastos acumulados — ${fmt.mes(a.mes)}`, valor: a.gastos_acum_mes, meta: MM("Gastos"), formato: fmt.brl, inverter: true }));
    else finKpis.push(
      kpi({ titulo: "Receita média por semana", valor: a.receitas / semanasComDados, meta: metas["Receita"]?.meta_semanal, formato: fmt.brl }),
      kpi({ titulo: "Margem líquida", valor: a.receitas ? a.resultado / a.receitas : null, formato: fmt.pct }));
    finKpis.push(
      kpi({ titulo: "Pendências (a receber)", valor: pend.pendente_valor, formato: fmt.brl, sub: `${pend.pendente_qtd} lançamento(s)` }),
      kpi({ titulo: "Inadimplência (em atraso)", valor: pend.atrasado_valor, formato: fmt.brl, sub: `${pend.atrasado_qtd} lançamento(s)` }));
    dash.append(bloco("c8", "Financeiro", el("div", { class: "mini-grid" }, ...finKpis)));
    const gFin = bloco("c4", sel.semana ? "Receita × gastos — últimas semanas" : "Receita × gastos — semanas do período");
    grafico(gFin, { tipo: "bar", labels: hist.map(r => r.id_semana.slice(2)), formatoY: fmt.brl, datasets: [{ label: "Receita", data: hist.map(r => r.receitas) }, { label: "Gastos", data: hist.map(r => r.gastos) }, { label: "Resultado", data: hist.map(r => r.resultado) }] }, 220);
    dash.append(gFin);
  }
}

function faixa(t, v) { return el("div", { class: "item" }, el("b", {}, v), el("span", {}, t)); }
function bloco(cls, titulo, ...conteudo) { return el("section", { class: "bloco " + cls }, el("h2", {}, titulo), ...conteudo); }

/** Soma várias linhas (unidades e/ou semanas) numa só; null se vazio. */
function agregar(rows) {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const soma = ["leads", "aval_agendadas", "aval_canceladas", "cancel_atendimentos", "novos_pacientes", "horarios_disp_manha", "horarios_ocup_manha", "horarios_disp_tarde", "horarios_ocup_tarde",
    "aval_realizadas", "contratos", "atendimentos", "aval_contratadas", "valor_avaliacoes", "protocolos_contratados", "valor_protocolos", "receitas", "gastos", "impostos", "marketing",
    "valor_total_contratado", "resultado", "leads_por_canal"];
  const o = { ...rows[rows.length - 1] };
  for (const k of soma) o[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const div = (x, y) => (y ? x / y : null);
  o.taxa_cancel_aval = div(o.aval_canceladas, o.aval_agendadas); o.conversao_aval_contrato = div(o.contratos, o.aval_realizadas);
  o.ocupacao_manha = div(o.horarios_ocup_manha, o.horarios_disp_manha); o.ocupacao_tarde = div(o.horarios_ocup_tarde, o.horarios_disp_tarde);
  o.ocupacao_total = div(o.horarios_ocup_manha + o.horarios_ocup_tarde, o.horarios_disp_manha + o.horarios_disp_tarde);
  o.custo_por_lead = div(o.marketing, o.leads); o.custo_por_mql = div(o.marketing, o.aval_agendadas); o.custo_por_sql = div(o.marketing, o.aval_realizadas); o.cac = div(o.marketing, o.novos_pacientes);
  return o;
}
export function agregarPorSemana(rows) {
  const g = {}; for (const r of rows) (g[r.id_semana] ||= []).push(r);
  return Object.keys(g).sort().map(k => agregar(g[k]));
}
function agruparFisios(rows) {
  const g = {}; for (const r of rows) (g[r.fisioterapeuta] ||= []).push(r);
  const media = (rs, k) => { const v = rs.map(r => r[k]).filter(x => x != null).map(Number); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  return Object.entries(g).map(([nome, rs]) => rs.length === 1 ? rs[0] : { ...rs[0], fisioterapeuta: nome, atendimentos: rs.reduce((s, r) => s + r.atendimentos, 0), aval_realizadas: rs.reduce((s, r) => s + r.aval_realizadas, 0),
    contratos: rs.reduce((s, r) => s + r.contratos, 0), conversao: rs.reduce((s, r) => s + r.aval_realizadas, 0) ? rs.reduce((s, r) => s + r.contratos, 0) / rs.reduce((s, r) => s + r.aval_realizadas, 0) : null,
    tempo_medio_min: media(rs, "tempo_medio_min"), desvio_min: media(rs, "desvio_min") });
}
function blocoCanais(canais, idsAtual, idsAnt) {
  const atual = canais.filter(c => idsAtual.includes(c.id_semana)), anterior = canais.filter(c => idsAnt.includes(c.id_semana));
  const soma = (lista, c) => lista.filter(x => x.canal === c).reduce((s, x) => s + x.quantidade, 0);
  const nomes = [...new Set([...atual, ...anterior].map(c => c.canal))];
  const totalAtual = atual.reduce((s, x) => s + x.quantidade, 0);
  const rows = nomes.map(c => ({ canal: c, atual: soma(atual, c), ant: soma(anterior, c) })).map(r => ({ ...r, part: totalAtual ? r.atual / totalAtual : null })).sort((x, y) => y.atual - x.atual);
  return tabela([{ k: "canal", t: "Canal" }, { k: "atual", t: "Atual", cls: "num", f: fmt.int }, { k: "ant", t: "Anterior", cls: "num", f: fmt.int },
    { k: r => r.atual - r.ant, t: "Var.", cls: "num", f: v => (v > 0 ? "+" : "") + v }, { k: "part", t: "%", cls: "num", f: fmt.pct }], rows, { vazio: "Sem leads por canal." });
}
