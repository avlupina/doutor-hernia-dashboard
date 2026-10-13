// Utilitários de período: atalhos (mês/trimestre/ano), seletor de datas e agregação de semanas.
import { Semanas } from "./api.js";
import { el, input, select, campo, botao } from "./ui.js";
import { PERIODO_INICIO } from "./config.js";

export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const ATALHOS = [["", "Atalhos…"], ["mes_atual", "Mês atual"], ["mes_anterior", "Mês anterior"], ["t1", "1º trimestre"], ["t2", "2º trimestre"], ["t3", "3º trimestre"], ["t4", "4º trimestre"], ["ano_atual", "Ano atual"], ["ano_anterior", "Ano anterior"], ["inicio", "Desde o início"]];

/** Intervalo [de, ate] de um atalho; `ano` opcional para trimestres/mês (ex.: t1 de 2025). */
export function atalho(cod, ano) {
  const h = new Date(), y = ano || h.getFullYear(), m = h.getMonth();
  const mes = (yy, mm) => [iso(new Date(yy, mm, 1)), iso(new Date(yy, mm + 1, 0))];
  const tri = (q, yy) => [iso(new Date(yy, (q - 1) * 3, 1)), iso(new Date(yy, q * 3, 0))];
  switch (cod) {
    case "mes_atual": return mes(h.getFullYear(), m);
    case "mes_anterior": return mes(h.getFullYear(), m - 1);
    case "t1": case "t2": case "t3": case "t4": return tri(Number(cod[1]), y);
    case "ano_atual": return [iso(new Date(h.getFullYear(), 0, 1)), iso(new Date(h.getFullYear(), 11, 31))];
    case "ano_anterior": return [iso(new Date(h.getFullYear() - 1, 0, 1)), iso(new Date(h.getFullYear() - 1, 11, 31))];
    case "inicio": return [PERIODO_INICIO, iso(h)];
  }
  return null;
}

/** Mesmo intervalo deslocado n anos (para "mesmo período do ano anterior"). */
export function deslocarAnos([de, ate], n) {
  const f = s => { const d = new Date(s + "T00:00:00"); d.setFullYear(d.getFullYear() + n); return iso(d); };
  return [f(de), f(ate)];
}

/** Período anterior de mesma duração. */
export function periodoAnterior(de, ate) {
  const dias = Math.round((new Date(ate) - new Date(de)) / 864e5) + 1;
  const fim = new Date(de + "T00:00:00"); fim.setDate(fim.getDate() - 1);
  const ini = new Date(fim); ini.setDate(ini.getDate() - dias + 1);
  return [iso(ini), iso(fim)];
}

let _cal = null;
export async function calendario() { return _cal ||= await Semanas.listar(PERIODO_INICIO, "2031-12-31"); }
/** Semanas (do calendário) cujo início cai no intervalo. */
export async function semanasEntre(de, ate) { return (await calendario()).filter(s => s.inicio >= de && s.inicio <= ate); }

/**
 * Grupo de seleção de período: Início, Término, Atalhos, Aplicar. onAplicar({de, ate}).
 * opts.extras: atalhos adicionais [[cod, rótulo]] tratados por opts.resolver(cod) → [de, ate].
 */
export function grupoPeriodo({ de = "", ate = "", onAplicar, rotulo, extras = [], resolver, aplicarRotulo = "Aplicar" }) {
  const iDe = input({ type: "date", min: PERIODO_INICIO, value: de }), iAte = input({ type: "date", min: PERIODO_INICIO, value: ate });
  const sel = select([...ATALHOS, ...extras], {}, "");
  const btn = botao(aplicarRotulo, aplicar, "btn sec alinhado");
  const box = el("div", { class: "grupo-periodo" }, rotulo ? el("div", { class: "grupo-rotulo" }, rotulo) : null, campo("Início", iDe), campo("Término", iAte), campo("Atalhos", sel), btn);
  sel.onchange = () => { const r = atalho(sel.value) || (resolver && resolver(sel.value)); if (r) { [iDe.value, iAte.value] = r; aplicar(); } };
  iDe.onchange = iAte.onchange = () => { sel.value = ""; };
  function aplicar() {
    if (!iDe.value || !iAte.value) return;
    if (iDe.value > iAte.value) [iDe.value, iAte.value] = [iAte.value, iDe.value];
    onAplicar({ de: iDe.value, ate: iAte.value });
  }
  box.valor = () => ({ de: iDe.value, ate: iAte.value });
  box.definir = (d, a) => { iDe.value = d; iAte.value = a; sel.value = ""; };
  return box;
}

/** Soma várias linhas de v2_resumo_semanal (unidades e/ou semanas) numa só; null se vazio. */
export function agregar(rows) {
  if (!rows.length) return null;
  const soma = ["leads", "aval_agendadas", "aval_canceladas", "cancel_atendimentos", "novos_pacientes", "horarios_disp_manha", "horarios_ocup_manha", "horarios_disp_tarde", "horarios_ocup_tarde",
    "aval_realizadas", "contratos", "atendimentos", "aval_contratadas", "valor_avaliacoes", "protocolos_contratados", "valor_protocolos", "receitas", "gastos", "impostos", "marketing",
    "gastos_fixos", "gastos_variaveis", "valor_total_contratado", "resultado", "leads_por_canal"];
  const o = { ...rows[rows.length - 1] };
  for (const k of soma) o[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const div = (x, y) => (y ? x / y : null);
  o.taxa_cancel_aval = div(o.aval_canceladas, o.aval_agendadas); o.conversao_aval_contrato = div(o.contratos, o.aval_realizadas); o.conversao_lead_aval = div(o.aval_agendadas, o.leads);
  o.ocupacao_manha = div(o.horarios_ocup_manha, o.horarios_disp_manha); o.ocupacao_tarde = div(o.horarios_ocup_tarde, o.horarios_disp_tarde);
  o.ocupacao_total = div(o.horarios_ocup_manha + o.horarios_ocup_tarde, o.horarios_disp_manha + o.horarios_disp_tarde);
  o.custo_por_lead = div(o.marketing, o.leads); o.custo_por_mql = div(o.marketing, o.aval_agendadas); o.custo_por_sql = div(o.marketing, o.aval_realizadas); o.cac = div(o.marketing, o.novos_pacientes);
  o.ticket_medio = div(o.valor_protocolos, o.protocolos_contratados); o.margem_liquida = div(o.resultado, o.receitas); o.ticket_por_atendimento = div(o.receitas, o.atendimentos);
  o.semanas = rows.length;
  return o;
}
export function agregarPorSemana(rows) {
  const g = {}; for (const r of rows) (g[r.id_semana] ||= []).push(r);
  return Object.keys(g).sort().map(k => agregar(g[k]));
}
export function agregarPorMes(rows) {
  const g = {}; for (const r of rows) (g[r.mes] ||= []).push(r);
  return Object.keys(g).sort().map(k => ({ ...agregar(g[k]), mes: k }));
}

/** Indicadores disponíveis para comparação/gráficos: chave, rótulo, formato ('int'|'brl'|'pct'|'num'), menor-é-melhor. */
export const INDICADORES = [
  ["leads", "Leads recebidos", "int"], ["aval_agendadas", "Avaliações agendadas (MQL)", "int"], ["aval_realizadas", "Avaliações realizadas (SQL)", "int"],
  ["contratos", "Tratamentos contratados", "int"], ["novos_pacientes", "Novos pacientes", "int"], ["conversao_aval_contrato", "Conversão avaliação → contrato", "pct"],
  ["taxa_cancel_aval", "Taxa de cancelamento de avaliações", "pct", true], ["atendimentos", "Atendimentos realizados", "int"], ["cancel_atendimentos", "Cancelamentos de atendimentos", "int", true],
  ["ocupacao_total", "Ocupação da agenda", "pct"], ["valor_total_contratado", "Valor contratado", "brl"], ["ticket_medio", "Ticket médio (protocolos)", "brl"],
  ["receitas", "Receita", "brl"], ["gastos", "Gastos", "brl", true], ["impostos", "Impostos", "brl", true], ["marketing", "Investimento em marketing", "brl", true],
  ["resultado", "Resultado", "brl"], ["margem_liquida", "Margem líquida", "pct"], ["custo_por_lead", "Custo por lead", "brl", true], ["cac", "CAC", "brl", true],
];
