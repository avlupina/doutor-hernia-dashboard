// Resultados mensais — consolidação por mês com evolução.
import { Resumo, Metas } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico } from "../ui.js";

export async function render(root, ctx) {
  const [meses, metas] = await Promise.all([Resumo.mensal(ctx.u).then(agregarMeses), Metas.listar(ctx.u)]);
  const MM = k => metas[k]?.meta_mensal;
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Resultado Mensal" + (ctx.unidade ? " — " + ctx.unidade.nome : " — consolidado")), el("p", { class: "sub", style: "margin:0" }, "Semanas atribuídas ao mês da sua data de início; contratos e lançamentos ao mês da própria data."))));
  if (!meses.length) { root.append(secao("Sem dados", el("p", {}, "Nenhum mês com dados ainda."))); return; }
  const u = meses[meses.length - 1], ant = meses[meses.length - 2] || {};

  root.append(secao(`Mês mais recente — ${fmt.mes(u.mes)} (${u.semanas} semana(s) lançada(s))`,
    el("div", { class: "grid grid-kpi" },
      kpi({ titulo: "Receita", valor: u.receitas, anterior: ant.receitas, meta: MM("Receita"), formato: fmt.brl }),
      kpi({ titulo: "Gastos", valor: u.gastos, anterior: ant.gastos, meta: MM("Gastos"), formato: fmt.brl, inverter: true }),
      kpi({ titulo: "Resultado", valor: u.resultado, anterior: ant.resultado, formato: fmt.brl }),
      kpi({ titulo: "Margem líquida", valor: u.margem_liquida, anterior: ant.margem_liquida, formato: fmt.pct }),
      kpi({ titulo: "Leads", valor: u.leads, anterior: ant.leads, meta: MM("Leads recebidos"), formato: fmt.int }),
      kpi({ titulo: "Novos pacientes", valor: u.novos_pacientes, anterior: ant.novos_pacientes, meta: MM("Novos pacientes"), formato: fmt.int }),
      kpi({ titulo: "Avaliações realizadas", valor: u.aval_realizadas, anterior: ant.aval_realizadas, meta: MM("Avaliações realizadas"), formato: fmt.int }),
      kpi({ titulo: "Tratamentos contratados", valor: u.contratos, anterior: ant.contratos, meta: MM("Contratos fechados (tratamentos)"), formato: fmt.int }),
      kpi({ titulo: "Atendimentos", valor: u.atendimentos, anterior: ant.atendimentos, meta: MM("Atendimentos realizados"), formato: fmt.int }),
      kpi({ titulo: "Ocupação da agenda", valor: u.ocupacao_total, anterior: ant.ocupacao_total, meta: MM("Taxa de ocupação da agenda"), formato: fmt.pct }),
      kpi({ titulo: "Valor contratado", valor: Number(u.valor_avaliacoes) + Number(u.valor_protocolos), anterior: ant.mes ? Number(ant.valor_avaliacoes) + Number(ant.valor_protocolos) : null, formato: fmt.brl }),
      kpi({ titulo: "CAC", valor: u.cac, anterior: ant.cac, formato: fmt.brl, inverter: true }))));

  const g1 = secao("Receita, gastos e resultado por mês");
  grafico(g1, { tipo: "bar", labels: meses.map(m => fmt.mes(m.mes)), formatoY: fmt.brl, datasets: [
    { label: "Receita", data: meses.map(m => m.receitas) }, { label: "Gastos + impostos + marketing", data: meses.map(m => Number(m.gastos) + Number(m.impostos) + Number(m.marketing)) },
    { label: "Resultado", data: meses.map(m => m.resultado) }] });
  const g2 = secao("Funil comercial por mês");
  grafico(g2, { tipo: "line", labels: meses.map(m => fmt.mes(m.mes)), datasets: [
    { label: "Leads", data: meses.map(m => m.leads) }, { label: "Avaliações agendadas", data: meses.map(m => m.aval_agendadas) },
    { label: "Avaliações realizadas", data: meses.map(m => m.aval_realizadas) }, { label: "Tratamentos contratados", data: meses.map(m => m.contratos) }] });
  root.append(el("div", { class: "grid grid-2" }, g1, g2));

  root.append(secao("Tabela mensal", el("div", { class: "tabela-wrap" }, tabela([
    { k: "mes", t: "Mês", f: fmt.mes }, { k: "semanas", t: "Sem.", cls: "num" },
    { k: "leads", t: "Leads", cls: "num", f: fmt.int }, { k: "novos_pacientes", t: "Novos pac.", cls: "num", f: fmt.int },
    { k: "aval_agendadas", t: "Aval. agend.", cls: "num", f: fmt.int }, { k: "aval_realizadas", t: "Aval. realiz.", cls: "num", f: fmt.int },
    { k: "taxa_cancel_aval", t: "Canc. aval.", cls: "num", f: fmt.pct }, { k: "contratos", t: "Contratos", cls: "num", f: fmt.int },
    { k: "conversao_aval_contrato", t: "Conversão", cls: "num", f: fmt.pct }, { k: "atendimentos", t: "Atend.", cls: "num", f: fmt.int },
    { k: "cancel_atendimentos", t: "Canc. atend.", cls: "num", f: fmt.int }, { k: "ocupacao_total", t: "Ocupação", cls: "num", f: fmt.pct },
    { k: "valor_protocolos", t: "Protocolos (R$)", cls: "num", f: fmt.brl }, { k: "receitas", t: "Receita", cls: "num", f: fmt.brl },
    { k: "gastos", t: "Gastos", cls: "num", f: fmt.brl }, { k: "impostos", t: "Impostos", cls: "num", f: fmt.brl }, { k: "marketing", t: "Marketing", cls: "num", f: fmt.brl },
    { k: "resultado", t: "Resultado", cls: "num", f: fmt.brl }, { k: "margem_liquida", t: "Margem", cls: "num", f: fmt.pct },
  ], [...meses].reverse()))));
}

/** Soma várias unidades por mês (modo consolidado). */
export function agregarMeses(rows) {
  const g = {}; for (const r of rows) (g[r.mes] ||= []).push(r);
  return Object.keys(g).sort().map(mes => {
    const rs = g[mes]; if (rs.length === 1) return rs[0];
    const soma = ["leads","aval_agendadas","aval_canceladas","aval_realizadas","contratos","atendimentos","cancel_atendimentos","novos_pacientes","hdm","hom","hdt","hot","semanas",
      "aval_contratadas","valor_avaliacoes","protocolos_contratados","valor_protocolos","receitas","gastos","impostos","marketing","gastos_fixos","gastos_variaveis","resultado"];
    const o = { ...rs[0] }; for (const k of soma) o[k] = rs.reduce((s, r) => s + Number(r[k] || 0), 0);
    const div = (x, y) => (y ? x / y : null);
    o.taxa_cancel_aval = div(o.aval_canceladas, o.aval_agendadas); o.conversao_aval_contrato = div(o.contratos, o.aval_realizadas);
    o.ocupacao_manha = div(o.hom, o.hdm); o.ocupacao_tarde = div(o.hot, o.hdt); o.ocupacao_total = div(o.hom + o.hot, o.hdm + o.hdt);
    o.margem_liquida = div(o.resultado, o.receitas); const mc = div(o.receitas - o.gastos_variaveis - o.impostos, o.receitas); o.margem_contribuicao = mc;
    o.ponto_equilibrio = mc > 0 ? (o.gastos_fixos + o.marketing) / mc : null;
    o.custo_por_lead = div(o.marketing, o.leads); o.custo_por_mql = div(o.marketing, o.aval_agendadas); o.custo_por_sql = div(o.marketing, o.aval_realizadas);
    o.cac = div(o.marketing, o.novos_pacientes); o.ticket_medio_novo_paciente = div(o.valor_protocolos, o.novos_pacientes);
    return o;
  });
}
