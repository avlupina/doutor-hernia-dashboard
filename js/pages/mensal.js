// Resultados mensais — consolidação por mês com evolução.
import { Resumo, Metas } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico } from "../ui.js";

export async function render(root, ctx) {
  const [meses, metas] = await Promise.all([Resumo.mensal(ctx.clinica_id), Metas.listar(ctx.clinica_id)]);
  const MM = k => metas[k]?.meta_mensal;
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Resultados mensais"), el("p", { class: "sub", style: "margin:0" }, "Semanas atribuídas ao mês da sua data de início; contratos e lançamentos ao mês da própria data."))));
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
