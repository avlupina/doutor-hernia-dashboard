// Marketing & Vendas — duas abas: Marketing (aquisição, canais, CPL/MQL/SQL/CAC) e Vendas (funil, eficiência, metas, ROI).
// Definições: MQL = avaliação agendada; SQL = avaliação realizada; venda = tratamento contratado; CAC = marketing ÷ novos pacientes.
import { Resumo, Metas, mesesDisponiveis } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico, PALETA, seletorPeriodo, evolucao } from "../ui.js";
import { agregarMeses } from "./mensal.js";
import { agregarPorSemana } from "./painel.js";

export async function render(root, ctx) {
  const aba = ctx.params[0] === "vendas" ? "vendas" : "marketing";
  const [mesesTodos, semanasTodas, metas] = await Promise.all([Resumo.mensal(ctx.u).then(agregarMeses), Resumo.semanal(ctx.u).then(agregarPorSemana), Metas.listar(ctx.u)]);
  root.append(el("div", { class: "topo" },
    el("div", {}, el("h1", {}, "Marketing & Vendas" + (ctx.unidade ? " — " + ctx.unidade.nome : " — consolidado")),
      el("p", { class: "sub", style: "margin:0" }, "MQL = avaliação agendada · SQL = avaliação realizada · Venda = tratamento contratado · CAC = marketing ÷ novos pacientes.")),
    el("div", { class: "subnav" }, el("a", { href: "#/marketing", class: aba === "marketing" ? "ativo" : "" }, "Marketing"), el("a", { href: "#/marketing/vendas", class: aba === "vendas" ? "ativo" : "" }, "Vendas"))));
  const corpo = el("div");
  const periodo = seletorPeriodo(mesesDisponiveis(), desenhar, { chave: "mkt" });
  root.append(secao("Período", periodo), corpo);
  desenhar(periodo.valor());

  async function desenhar({ de, ate, mesDe, mesAte }) {
    corpo.replaceChildren();
    const sem = semanasTodas.filter(s => s.inicio >= de && s.inicio <= ate);
    const meses = mesesTodos.filter(m => m.mes >= mesDe && m.mes <= mesAte);
    if (!sem.length && !meses.length) { corpo.append(secao("Sem dados", el("p", {}, "Nenhuma semana lançada no período."))); return; }
    const soma = k => sem.reduce((a, s) => a + Number(s[k] || 0), 0);
    const T = { leads: soma("leads"), mql: soma("aval_agendadas"), canc: soma("aval_canceladas"), sql: soma("aval_realizadas"), vendas: soma("contratos"), novos: soma("novos_pacientes"),
      mkt: soma("marketing"), valor: soma("valor_protocolos") + soma("valor_avaliacoes"), valorProt: soma("valor_protocolos"), receita: soma("receitas"), semanas: sem.length };
    const div = (a, b) => (b ? a / b : null);
    if (aba === "marketing") marketing(T, sem, meses, div); else vendas(T, sem, meses, div);
  }

  // ------------------------------------------------------------------ Marketing
  async function marketing(T, sem, meses, div) {
    corpo.append(secao("Indicadores de aquisição no período",
      el("div", { class: "grid grid-kpi" },
        kpi({ titulo: "Investimento em marketing", valor: T.mkt, formato: fmt.brl }),
        kpi({ titulo: "Leads", valor: T.leads, formato: fmt.int, sub: `${fmt.num(div(T.leads, T.semanas))} por semana` }),
        kpi({ titulo: "Custo por lead", valor: div(T.mkt, T.leads), formato: fmt.brl }),
        kpi({ titulo: "Custo por MQL (aval. agendada)", valor: div(T.mkt, T.mql), formato: fmt.brl }),
        kpi({ titulo: "Custo por SQL (aval. realizada)", valor: div(T.mkt, T.sql), formato: fmt.brl }),
        kpi({ titulo: "CAC (por novo paciente)", valor: div(T.mkt, T.novos), formato: fmt.brl }),
        kpi({ titulo: "Ticket médio por novo paciente", valor: div(T.valorProt, T.novos), formato: fmt.brl }),
        kpi({ titulo: "Retorno (valor contratado ÷ marketing)", valor: div(T.valor, T.mkt), formato: v => v == null ? "—" : fmt.num(v) + "x" }))));

    const gCanal = secao("Leads por canal de ingresso");
    const canais = sem.length ? await Resumo.leadsCanal(ctx.u, sem.map(s => s.id_semana)) : [];
    const porCanal = {}; for (const c of canais) porCanal[c.canal] = (porCanal[c.canal] || 0) + c.quantidade;
    const ordenado = Object.entries(porCanal).sort((a, b) => b[1] - a[1]); const totalCanal = ordenado.reduce((a, [, v]) => a + v, 0);
    if (ordenado.length) {
      grafico(gCanal, { tipo: "bar", labels: ordenado.map(o => o[0]), datasets: [{ label: "Leads", data: ordenado.map(o => o[1]) }] }, 220);
      gCanal.append(tabela([{ k: 0, t: "Canal" }, { k: 1, t: "Leads", cls: "num", f: fmt.int }, { k: r => r[1] / totalCanal, t: "% do total", cls: "num", f: fmt.pct },
        { k: r => totalCanal ? T.mkt / totalCanal : null, t: "Custo por lead (rateio)", cls: "num", f: fmt.brl }], ordenado));
    } else gCanal.append(el("p", { class: "nota" }, "Sem leads por canal no período."));
    // canais ao longo do tempo (por mês)
    const gCanalEvo = secao("Evolução dos canais");
    const nomes = ordenado.slice(0, 8).map(o => o[0]); const mesesLbl = [...new Set(canais.map(c => c.mes))].sort();
    if (nomes.length && mesesLbl.length) grafico(gCanalEvo, { tipo: "bar", empilhado: true, labels: mesesLbl.map(fmt.mes), datasets: nomes.map(n => ({ label: n, data: mesesLbl.map(m => canais.filter(c => c.mes === m && c.canal === n).reduce((a, c) => a + c.quantidade, 0)) })) }, 240);
    else gCanalEvo.append(el("p", { class: "nota" }, "Sem dados."));
    corpo.append(el("div", { class: "grid grid-2" }, gCanal, gCanalEvo));

    evolucao(corpo, { titulo: "Evolução — investimento e leads", rowsSem: sem, rowsMes: meses, tipo: "bar", series: [{ label: "Marketing (R$)", k: "marketing" }], formatoY: fmt.brl, altura: 220 });
    evolucao(corpo, { titulo: "Evolução — custo por lead, MQL, SQL e CAC", rowsSem: sem, rowsMes: meses, formatoY: fmt.brl,
      series: [{ label: "Custo por lead", k: "custo_por_lead" }, { label: "Custo por MQL", k: "custo_por_mql" }, { label: "Custo por SQL", k: "custo_por_sql" }, { label: "CAC", k: "cac" }] });
    evolucao(corpo, { titulo: "Evolução — leads, MQL, SQL e novos pacientes", rowsSem: sem, rowsMes: meses,
      series: [{ label: "Leads", k: "leads" }, { label: "MQL", k: "aval_agendadas" }, { label: "SQL", k: "aval_realizadas" }, { label: "Novos pacientes", k: "novos_pacientes" }] });
    corpo.append(secao("Semanas do período", el("div", { class: "tabela-wrap" }, tabela([
      { k: "id_semana", t: "Semana" }, { k: "marketing", t: "Marketing", cls: "num", f: fmt.brl }, { k: "leads", t: "Leads", cls: "num", f: fmt.int },
      { k: "conversao_lead_aval", t: "Lead → aval.", cls: "num", f: fmt.pct }, { k: "aval_agendadas", t: "MQL", cls: "num", f: fmt.int }, { k: "aval_realizadas", t: "SQL", cls: "num", f: fmt.int },
      { k: "contratos", t: "Vendas", cls: "num", f: fmt.int }, { k: "novos_pacientes", t: "Novos pac.", cls: "num", f: fmt.int }, { k: "custo_por_lead", t: "CPL", cls: "num", f: fmt.brl },
      { k: "custo_por_mql", t: "C/MQL", cls: "num", f: fmt.brl }, { k: "custo_por_sql", t: "C/SQL", cls: "num", f: fmt.brl }, { k: "cac", t: "CAC", cls: "num", f: fmt.brl },
    ], [...sem].reverse()))));
  }

  // ------------------------------------------------------------------ Vendas
  function vendas(T, sem, meses, div) {
    const M = k => metas[k]?.meta_semanal, nSem = T.semanas || 1;
    const metaVendas = M("Contratos fechados (tratamentos)") != null ? M("Contratos fechados (tratamentos)") * nSem : null;
    const metaReceita = M("Receita") != null ? M("Receita") * nSem : null;
    const metaConv = M("Conversão avaliação → contrato");
    const ticket = div(T.valorProt, T.vendas), ciclo = null;
    const ef = { leadMql: div(T.mql, T.leads), mqlSql: div(T.sql, T.mql), sqlVenda: div(T.vendas, T.sql), total: div(T.vendas, T.leads) };
    const dias = Math.round((new Date(periodo.valor().ate) - new Date(periodo.valor().de)) / 864e5) + 1;

    // INPUT | FUNIL | OUTPUT
    const inputT = tabela([{ k: 0, t: "Input (período)" }, { k: 1, t: "", cls: "num" }], [
      ["Leads no topo do funil", fmt.int(T.leads)], ["Avaliações agendadas (MQL)", fmt.int(T.mql)], ["Avaliações realizadas (SQL)", fmt.int(T.sql)],
      ["Vendas (tratamentos contratados)", fmt.int(T.vendas)], ["Ticket médio (protocolos)", fmt.brl(ticket)], ["Investimento em marketing", fmt.brl(T.mkt)],
      ["Semanas no período", fmt.int(T.semanas)], ["Dias no período", fmt.int(dias)],
      ["Meta de vendas no período", metaVendas != null ? fmt.int(metaVendas) : "defina em Metas"], ["Meta de receita no período", metaReceita != null ? fmt.brl(metaReceita) : "defina em Metas"],
      ["Meta de conversão aval. → venda", metaConv != null ? fmt.pct(metaConv) : "defina em Metas"]]);
    const etapas = [["Leads", T.leads, null], ["Conexão — aval. agendadas", T.mql, ef.leadMql], ["Oportunidade — aval. realizadas", T.sql, ef.mqlSql], ["Venda — contratos", T.vendas, ef.sqlVenda]];
    const maxv = Math.max(...etapas.map(e => e[1]), 1);
    const funil = el("div", { class: "funil-etapas" }, ...etapas.map(([n, v, tx], i) => el("div", { class: "funil-etapa" },
      el("div", { class: "barra", style: `width:${Math.max(30, v / maxv * 100)}%;background:${i === 3 ? "#b30e0a" : PALETA[0]};opacity:${1 - i * 0.12}` }, `${n}: ${fmt.int(v)}`),
      el("div", { class: "taxa" }, tx == null ? "" : fmt.pct(tx) + " da etapa anterior"))));
    const outputT = tabela([{ k: 0, t: "Output" }, { k: 1, t: "", cls: "num" }], [
      ["Eficiência real do funil (vendas ÷ leads)", fmt.pct(ef.total)], ["Conversão aval. realizada → venda", fmt.pct(ef.sqlVenda) + (metaConv != null ? ` (meta ${fmt.pct(metaConv)})` : "")],
      ["Vendas realizadas ÷ meta", metaVendas ? fmt.pct(div(T.vendas, metaVendas)) : "—"], ["Vendas por semana", fmt.num(div(T.vendas, nSem))],
      ["Faturamento contratado no período", fmt.brl(T.valor)], ["Receita recebida no período", fmt.brl(T.receita) + (metaReceita ? ` (${fmt.pct(div(T.receita, metaReceita))} da meta)` : "")],
      ["Receita média por semana", fmt.brl(div(T.receita, nSem))], ["Novos pacientes", fmt.int(T.novos)], ["CAC", fmt.brl(div(T.mkt, T.novos))],
      ["Leads necessários por venda", fmt.num(div(T.leads, T.vendas))], ["ROI do marketing (valor contratado ÷ investimento)", div(T.valor, T.mkt) == null ? "—" : fmt.num(div(T.valor, T.mkt)) + "x"],
      ["Retorno líquido (valor contratado − marketing)", fmt.brl(T.valor - T.mkt)]]);
    corpo.append(secao("Funil de vendas no período", el("div", { class: "io" }, inputT, el("div", {}, funil, el("p", { class: "nota", style: "margin-top:10px" }, "Barras proporcionais ao volume de cada etapa.")), outputT)));

    corpo.append(secao("Resumo",
      el("div", { class: "grid grid-kpi" },
        kpi({ titulo: "Vendas no período", valor: T.vendas, meta: metaVendas, formato: fmt.int }),
        kpi({ titulo: "Eficiência do funil", valor: ef.total, formato: fmt.pct }),
        kpi({ titulo: "Conversão SQL → venda", valor: ef.sqlVenda, meta: metaConv, formato: fmt.pct }),
        kpi({ titulo: "Ticket médio", valor: ticket, formato: fmt.brl }),
        kpi({ titulo: "Valor contratado", valor: T.valor, formato: fmt.brl }),
        kpi({ titulo: "Receita recebida", valor: T.receita, meta: metaReceita, formato: fmt.brl }),
        kpi({ titulo: "Avaliações canceladas", valor: T.canc, formato: fmt.int, sub: `${fmt.pct(div(T.canc, T.mql))} das agendadas` }))));

    evolucao(corpo, { titulo: "Evolução — funil (leads, MQL, SQL, vendas)", rowsSem: sem, rowsMes: meses,
      series: [{ label: "Leads", k: "leads" }, { label: "Aval. agendadas", k: "aval_agendadas" }, { label: "Aval. realizadas", k: "aval_realizadas" }, { label: "Vendas", k: "contratos" }] });
    evolucao(corpo, { titulo: "Evolução — conversões", rowsSem: sem, rowsMes: meses, formatoY: fmt.pct, max: 1,
      series: [{ label: "Lead → aval. agendada", k: r => r.leads ? r.aval_agendadas / r.leads : null }, { label: "Agendada → realizada", k: r => r.aval_agendadas ? r.aval_realizadas / r.aval_agendadas : null }, { label: "Realizada → venda", k: "conversao_aval_contrato" }] });
    evolucao(corpo, { titulo: "Evolução — valor contratado e receita", rowsSem: sem, rowsMes: meses, tipo: "bar", formatoY: fmt.brl,
      series: [{ label: "Valor contratado", k: r => Number(r.valor_avaliacoes || 0) + Number(r.valor_protocolos || 0) }, { label: "Receita recebida", k: "receitas" }] });
  }
}
