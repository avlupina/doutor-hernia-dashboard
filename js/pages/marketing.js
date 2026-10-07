// Marketing — funil, custo por lead / MQL / SQL, CAC e canais.
// Definições: MQL = avaliação agendada; SQL = avaliação realizada; CAC = marketing / novos pacientes.
import { Resumo, Semanas } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico, select, PALETA } from "../ui.js";

export async function render(root, ctx) {
  const [meses, semanas] = await Promise.all([Resumo.mensal(ctx.clinica_id), Resumo.semanal(ctx.clinica_id)]);
  const opcoes = [["todos", "Todo o período"], ...meses.map(m => [m.mes, fmt.mes(m.mes)])];
  const ativos = meses.filter(m => m.leads || m.atendimentos || Number(m.receitas) > 0 || Number(m.marketing) > 0);
  const sel = select(opcoes, {}, ativos.length ? ativos[ativos.length - 1].mes : "todos");
  root.append(el("div", { class: "topo" },
    el("div", {}, el("h1", {}, "Marketing"), el("p", { class: "sub", style: "margin:0" }, "MQL = avaliação agendada · SQL = avaliação realizada · CAC = investimento em marketing ÷ novos pacientes.")),
    el("div", { class: "acoes" }, el("span", { class: "nota" }, "Período:"), sel)));
  const corpo = el("div"); root.append(corpo);
  sel.onchange = () => desenhar(sel.value);
  await desenhar(sel.value);

  async function desenhar(periodo) {
    corpo.replaceChildren();
    const sem = periodo === "todos" ? semanas : semanas.filter(s => s.mes === periodo);
    if (!sem.length) { corpo.append(secao("Sem dados", el("p", {}, "Nenhuma semana lançada no período."))); return; }
    const soma = k => sem.reduce((a, s) => a + Number(s[k] || 0), 0);
    const T = { leads: soma("leads"), mql: soma("aval_agendadas"), sql: soma("aval_realizadas"), contratos: soma("contratos"), novos: soma("novos_pacientes"), mkt: soma("marketing"), valor: soma("valor_protocolos") };
    const div = (a, b) => (b ? a / b : null);
    const anterior = periodo === "todos" ? null : meses[meses.findIndex(m => m.mes === periodo) - 1];

    corpo.append(secao("Indicadores de aquisição",
      el("div", { class: "grid grid-kpi" },
        kpi({ titulo: "Investimento em marketing", valor: T.mkt, anterior: anterior?.marketing, formato: fmt.brl }),
        kpi({ titulo: "Leads", valor: T.leads, anterior: anterior?.leads, formato: fmt.int }),
        kpi({ titulo: "Custo por lead", valor: div(T.mkt, T.leads), anterior: anterior?.custo_por_lead, formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Custo por MQL (aval. agendada)", valor: div(T.mkt, T.mql), anterior: anterior?.custo_por_mql, formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Custo por SQL (aval. realizada)", valor: div(T.mkt, T.sql), anterior: anterior?.custo_por_sql, formato: fmt.brl, inverter: true }),
        kpi({ titulo: "CAC (por novo paciente)", valor: div(T.mkt, T.novos), anterior: anterior?.cac, formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Ticket médio por novo paciente", valor: div(T.valor, T.novos), anterior: anterior?.ticket_medio_novo_paciente, formato: fmt.brl }),
        kpi({ titulo: "Retorno (valor contratado ÷ marketing)", valor: div(T.valor, T.mkt), formato: v => v == null ? "—" : fmt.num(v) + "x" }))));

    // funil
    const etapas = [["Leads", T.leads], ["MQL — avaliações agendadas", T.mql], ["SQL — avaliações realizadas", T.sql], ["Tratamentos contratados", T.contratos], ["Novos pacientes", T.novos]];
    const maxv = Math.max(...etapas.map(e => e[1]), 1);
    const funil = el("div");
    etapas.forEach(([n, v], i) => {
      const prev = i ? etapas[i - 1][1] : null;
      funil.append(el("div", { class: "func-step" },
        el("div", {}, el("div", {}, el("b", {}, n), " ", el("span", { class: "nota" }, prev ? `${fmt.pct(div(v, prev))} da etapa anterior` : "")),
          el("div", { class: "func-bar", style: `width:${Math.max(4, v / maxv * 100)}%;background:${PALETA[i]}` })),
        el("div", { class: "hero", style: "font-size:20px" }, fmt.int(v))));
    });
    const gCanal = secao("Leads por canal de ingresso");
    const canais = await Resumo.leadsCanal(ctx.clinica_id, sem.map(s => s.id_semana));
    const porCanal = {};
    for (const c of canais) porCanal[c.canal] = (porCanal[c.canal] || 0) + c.quantidade;
    const ordenado = Object.entries(porCanal).sort((a, b) => b[1] - a[1]);
    const totalCanal = ordenado.reduce((a, [, v]) => a + v, 0);
    if (ordenado.length) {
      grafico(gCanal, { tipo: "bar", labels: ordenado.map(o => o[0]), datasets: [{ label: "Leads", data: ordenado.map(o => o[1]) }] }, 220);
      gCanal.append(tabela([{ k: 0, t: "Canal" }, { k: 1, t: "Leads", cls: "num", f: fmt.int }, { k: r => r[1] / totalCanal, t: "% do total", cls: "num", f: fmt.pct },
        { k: r => div(T.mkt, 1) != null && totalCanal ? T.mkt * (r[1] / totalCanal) / r[1] : null, t: "Custo por lead (rateio)", cls: "num", f: fmt.brl }], ordenado));
    } else gCanal.append(el("p", { class: "nota" }, "Sem leads por canal no período."));
    corpo.append(el("div", { class: "grid grid-2" }, secao("Funil comercial", funil), gCanal));

    const g = secao("Evolução semanal — custo por lead, MQL, SQL e CAC");
    grafico(g, { tipo: "line", labels: sem.map(s => s.id_semana), formatoY: fmt.brl, datasets: [
      { label: "Custo por lead", data: sem.map(s => s.custo_por_lead) }, { label: "Custo por MQL", data: sem.map(s => s.custo_por_mql) },
      { label: "Custo por SQL", data: sem.map(s => s.custo_por_sql) }, { label: "CAC", data: sem.map(s => s.cac) }] });
    corpo.append(g);
    corpo.append(secao("Semanas do período", el("div", { class: "tabela-wrap" }, tabela([
      { k: "id_semana", t: "Semana" }, { k: "marketing", t: "Marketing", cls: "num", f: fmt.brl }, { k: "leads", t: "Leads", cls: "num", f: fmt.int },
      { k: "conversao_lead_aval", t: "Lead → aval.", cls: "num", f: fmt.pct }, { k: "aval_agendadas", t: "MQL", cls: "num", f: fmt.int },
      { k: "aval_realizadas", t: "SQL", cls: "num", f: fmt.int }, { k: "contratos", t: "Contratos", cls: "num", f: fmt.int },
      { k: "novos_pacientes", t: "Novos pac.", cls: "num", f: fmt.int }, { k: "custo_por_lead", t: "CPL", cls: "num", f: fmt.brl },
      { k: "custo_por_mql", t: "C/MQL", cls: "num", f: fmt.brl }, { k: "custo_por_sql", t: "C/SQL", cls: "num", f: fmt.brl }, { k: "cac", t: "CAC", cls: "num", f: fmt.brl },
    ], [...sem].reverse()))));
  }
}
