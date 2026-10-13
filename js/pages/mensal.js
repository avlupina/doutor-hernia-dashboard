// Utilitário compartilhado (a tela "Resultado Mensal" foi removida; a consolidação por mês continua em uso).
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
