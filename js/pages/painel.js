// Painel Semanal — dashboard horizontal com indicadores-chave: crescimento, agenda/atendimentos e financeiro.
import { Semanas, Resumo, Metas } from "../api.js";
import { el, kpi, fmt, tabela, select, grafico, botao } from "../ui.js";

export async function render(root, ctx) {
  const todas = await Resumo.semanal(ctx.u);
  const comAtividade = [...new Set(todas.filter(r => r.leads || r.atendimentos || Number(r.receitas) > 0 || r.contratos).map(r => r.id_semana))].sort();
  const idsComDados = new Set(todas.map(r => r.id_semana));
  const padrao = ctx.params[0] || comAtividade.pop() || [...idsComDados].sort().pop() || Semanas.atual();
  const semanas = await Semanas.disponiveis(padrao, 8);
  const topo = el("div", { class: "topo" },
    el("div", {}, el("h1", {}, "Painel Semanal"), el("p", { class: "sub", style: "margin:0" }, ctx.unidade ? `Unidade ${ctx.unidade.nome}` : "Consolidado de todas as unidades")),
    el("div", { class: "acoes" },
      el("span", { class: "nota" }, "Semana:"),
      select(semanas.map(s => [s.id_semana, `${s.id_semana}  (${fmt.data(s.inicio)} – ${fmt.data(s.fim)})${idsComDados.has(s.id_semana) ? "" : "  · sem dados"}`]), { id: "sel-semana" }, padrao),
      ctx.editor ? botao("Lançar / editar", () => location.hash = "#/semana/" + document.getElementById("sel-semana").value, "btn sec") : null));
  const corpo = el("div");
  root.append(topo, corpo);
  const sel = topo.querySelector("#sel-semana");
  sel.onchange = () => { history.replaceState(null, "", "#/painel/" + sel.value); carregar(sel.value); };
  await carregar(padrao);

  async function carregar(id) {
    corpo.replaceChildren(el("p", { class: "sub" }, "Carregando…"));
    const ant = Semanas.anterior(id), prox = Semanas.proxima(id);
    const semSel = semanas.find(s => s.id_semana === id);
    const [rows, metas, canais, pend, fisios, historico] = await Promise.all([
      Resumo.semanal(ctx.u, { ids: [ant, id, prox] }), Metas.listar(ctx.u), Resumo.leadsCanal(ctx.u, [ant, id]),
      Resumo.pendencias(ctx.u), Resumo.fisios(ctx.u, { ids: [ant, id] }), Resumo.semanal(ctx.u, { ate: semSel?.inicio }),
    ]);
    // modo consolidado: somar unidades
    const a = agregar(rows.filter(r => r.id_semana === id)), p = agregar(rows.filter(r => r.id_semana === ant)), n = agregar(rows.filter(r => r.id_semana === prox));
    const M = k => metas[k]?.meta_semanal, MM = k => metas[k]?.meta_mensal;
    const fA = agruparFisios(fisios.filter(f => f.id_semana === id)), fP = agruparFisios(fisios.filter(f => f.id_semana === ant));
    const hist = agregarPorSemana(historico).slice(-10);
    corpo.replaceChildren();
    if (!a) { corpo.append(el("section", { class: "secao" }, el("h2", {}, "Sem dados"), el("p", {}, "Nenhum lançamento para ", el("b", {}, id), ". ", ctx.editor ? "Use “Lançar Semana” ou importe a planilha." : "Peça a um gestor para lançar os dados."))); return; }
    const ocMeta = M("Taxa de ocupação da agenda");

    // faixa de resumo
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

    // --- Crescimento
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
    dash.append(bloco("c4", "Meios de ingresso", blocoCanais(canais, id, ant)));

    // --- Agenda e atendimentos
    const agendaBloco = bloco("c8", "Agenda e atendimentos",
      el("div", { class: "mini-grid" },
        ...fA.map(f => kpi({ titulo: `Atendimentos — ${f.fisioterapeuta}`, valor: f.atendimentos, anterior: fP.find(x => x.fisioterapeuta === f.fisioterapeuta)?.atendimentos, formato: fmt.int })),
        kpi({ titulo: "Atendimentos — total", valor: a.atendimentos, anterior: p?.atendimentos, meta: M("Atendimentos realizados"), formato: fmt.int }),
        kpi({ titulo: "Cancelamentos", valor: a.cancel_atendimentos, anterior: p?.cancel_atendimentos, formato: fmt.int, inverter: true }),
        kpi({ titulo: "Ocupação — manhã", valor: a.ocupacao_manha, anterior: p?.ocupacao_manha, meta: ocMeta, formato: fmt.pct }),
        kpi({ titulo: "Ocupação — tarde", valor: a.ocupacao_tarde, anterior: p?.ocupacao_tarde, meta: ocMeta, formato: fmt.pct }),
        kpi({ titulo: "Ocupação — total", valor: a.ocupacao_total, anterior: p?.ocupacao_total, meta: ocMeta, formato: fmt.pct }),
        kpi({ titulo: `Ocupação já agendada (${prox})`, valor: n?.ocupacao_total, meta: ocMeta, formato: fmt.pct, sub: n ? `manhã ${fmt.pct(n.ocupacao_manha)} · tarde ${fmt.pct(n.ocupacao_tarde)}` : "lance a agenda da próxima semana" })),
      el("h3", {}, "Tempo médio de atendimento (min)"),
      tabela([{ k: "fisioterapeuta", t: "Fisioterapeuta" }, { k: "tempo_medio_min", t: "Média", cls: "num", f: fmt.num }, { k: "desvio_min", t: "Desvio", cls: "num", f: fmt.num },
        { k: r => fP.find(x => x.fisioterapeuta === r.fisioterapeuta)?.tempo_medio_min, t: "Média anterior", cls: "num", f: fmt.num },
        { k: "aval_realizadas", t: "Avaliações", cls: "num", f: fmt.int }, { k: "contratos", t: "Contratos", cls: "num", f: fmt.int }, { k: "conversao", t: "Conversão", cls: "num", f: fmt.pct }], fA));
    dash.append(agendaBloco);
    const gAt = bloco("c4", "Atendimentos — últimas semanas");
    grafico(gAt, { tipo: "bar", labels: hist.map(r => r.id_semana.slice(5)), datasets: [{ label: "Atendimentos", data: hist.map(r => r.atendimentos) }, { label: "Avaliações realizadas", data: hist.map(r => r.aval_realizadas) }] }, 220);
    dash.append(gAt);

    // --- Financeiro
    dash.append(bloco("c8", "Financeiro",
      el("div", { class: "mini-grid" },
        kpi({ titulo: "Receita semanal", valor: a.receitas, anterior: p?.receitas, meta: M("Receita"), formato: fmt.brl }),
        kpi({ titulo: "Gastos semanais", valor: a.gastos, anterior: p?.gastos, meta: M("Gastos"), formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Impostos", valor: a.impostos, anterior: p?.impostos, formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Marketing", valor: a.marketing, anterior: p?.marketing, meta: M("Investimento em marketing"), formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Resultado da semana", valor: a.resultado, anterior: p?.resultado, formato: fmt.brl }),
        kpi({ titulo: `Receita acumulada — ${fmt.mes(a.mes)}`, valor: a.receita_acum_mes, meta: MM("Receita"), formato: fmt.brl }),
        kpi({ titulo: `Gastos acumulados — ${fmt.mes(a.mes)}`, valor: a.gastos_acum_mes, meta: MM("Gastos"), formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Pendências (a receber)", valor: pend.pendente_valor, formato: fmt.brl, sub: `${pend.pendente_qtd} lançamento(s)` }),
        kpi({ titulo: "Inadimplência (em atraso)", valor: pend.atrasado_valor, formato: fmt.brl, sub: `${pend.atrasado_qtd} lançamento(s)` }))));
    const gFin = bloco("c4", "Receita × gastos — últimas semanas");
    grafico(gFin, { tipo: "bar", labels: hist.map(r => r.id_semana.slice(5)), formatoY: fmt.brl, datasets: [{ label: "Receita", data: hist.map(r => r.receitas) }, { label: "Gastos", data: hist.map(r => r.gastos) }, { label: "Resultado", data: hist.map(r => r.resultado) }] }, 220);
    dash.append(gFin);
  }
}

function faixa(t, v) { return el("div", { class: "item" }, el("b", {}, v), el("span", {}, t)); }
function bloco(cls, titulo, ...conteudo) { return el("section", { class: "bloco " + cls }, el("h2", {}, titulo), ...conteudo); }

/** Soma linhas de várias unidades numa só (modo consolidado); null se vazio. */
function agregar(rows) {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const soma = ["leads", "aval_agendadas", "aval_canceladas", "cancel_atendimentos", "novos_pacientes", "horarios_disp_manha", "horarios_ocup_manha", "horarios_disp_tarde", "horarios_ocup_tarde",
    "aval_realizadas", "contratos", "atendimentos", "aval_contratadas", "valor_avaliacoes", "protocolos_contratados", "valor_protocolos", "receitas", "gastos", "impostos", "marketing",
    "valor_total_contratado", "resultado", "receita_acum_mes", "gastos_acum_mes", "leads_por_canal"];
  const o = { ...rows[0] };
  for (const k of soma) o[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const div = (x, y) => (y ? x / y : null);
  o.taxa_cancel_aval = div(o.aval_canceladas, o.aval_agendadas); o.conversao_aval_contrato = div(o.contratos, o.aval_realizadas);
  o.ocupacao_manha = div(o.horarios_ocup_manha, o.horarios_disp_manha); o.ocupacao_tarde = div(o.horarios_ocup_tarde, o.horarios_disp_tarde);
  o.ocupacao_total = div(o.horarios_ocup_manha + o.horarios_ocup_tarde, o.horarios_disp_manha + o.horarios_disp_tarde);
  return o;
}
export function agregarPorSemana(rows) {
  const g = {}; for (const r of rows) (g[r.id_semana] ||= []).push(r);
  return Object.keys(g).sort().map(k => agregar(g[k]));
}
function agruparFisios(rows) {
  const g = {}; for (const r of rows) (g[r.fisioterapeuta] ||= []).push(r);
  return Object.entries(g).map(([nome, rs]) => rs.length === 1 ? rs[0] : { ...rs[0], fisioterapeuta: nome, atendimentos: rs.reduce((s, r) => s + r.atendimentos, 0), aval_realizadas: rs.reduce((s, r) => s + r.aval_realizadas, 0),
    contratos: rs.reduce((s, r) => s + r.contratos, 0), conversao: rs.reduce((s, r) => s + r.aval_realizadas, 0) ? rs.reduce((s, r) => s + r.contratos, 0) / rs.reduce((s, r) => s + r.aval_realizadas, 0) : null });
}
function blocoCanais(canais, id, ant) {
  const atual = canais.filter(c => c.id_semana === id), anterior = canais.filter(c => c.id_semana === ant);
  const soma = (lista, c) => lista.filter(x => x.canal === c).reduce((s, x) => s + x.quantidade, 0);
  const nomes = [...new Set([...atual, ...anterior].map(c => c.canal))];
  const totalAtual = atual.reduce((s, x) => s + x.quantidade, 0);
  const rows = nomes.map(c => ({ canal: c, atual: soma(atual, c), ant: soma(anterior, c) })).map(r => ({ ...r, part: totalAtual ? r.atual / totalAtual : null })).sort((x, y) => y.atual - x.atual);
  return tabela([{ k: "canal", t: "Canal" }, { k: "atual", t: "Atual", cls: "num", f: fmt.int }, { k: "ant", t: "Anterior", cls: "num", f: fmt.int },
    { k: r => r.atual - r.ant, t: "Var.", cls: "num", f: v => (v > 0 ? "+" : "") + v }, { k: "part", t: "%", cls: "num", f: fmt.pct }], rows, { vazio: "Sem leads por canal." });
}
