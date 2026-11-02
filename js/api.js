// Camada de acesso a dados. Toda tela fala com o Supabase só por aqui,
// o que facilita a migração futura para uma API Node (basta reimplementar estas funções).
// Convenção: `u` = { clinica_id, unidade_id } (contexto da clínica/unidade selecionada).
import { sb, unwrap } from "./supabase.js";
import { METAS_PADRAO, PERIODO_INICIO } from "./config.js";

const porUnidade = (q, u) => (u.unidade_id ? q.eq("unidade_id", u.unidade_id) : q);
const chave = (u, extra = {}) => ({ clinica_id: u.clinica_id, unidade_id: u.unidade_id, ...extra });

export const Semanas = {
  async listar(limiteInicio = PERIODO_INICIO, limiteFim) {
    let q = sb.from("semanas").select("*").order("inicio");
    if (limiteInicio) q = q.gte("inicio", limiteInicio);
    if (limiteFim) q = q.lte("inicio", limiteFim);
    return unwrap(await q);
  },
  idDe(date) { // semana ISO de uma data (mesma regra do banco)
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const y = d.getUTCFullYear();
    const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    return `${y}-S${String(w).padStart(2, "0")}`;
  },
  atual() { return Semanas.idDe(new Date()); },
  anterior(id) { return shiftSemana(id, -1); },
  proxima(id) { return shiftSemana(id, 1); },
  /** Semanas de PERIODO_INICIO até `depois` semanas após a atual (ou após `id`). */
  async disponiveis(id, depois = 8) {
    let fim = id || Semanas.atual();
    for (let i = 0; i < depois; i++) fim = shiftSemana(fim, 1);
    return unwrap(await sb.from("semanas").select("*").gte("inicio", PERIODO_INICIO).lte("id_semana", fim).order("inicio"));
  },
};

function shiftSemana(id, n) {
  const [y, w] = id.split("-S").map(Number);
  const d = new Date(Date.UTC(y, 0, 4));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1 + (w - 1 + n) * 7);
  return Semanas.idDe(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Meses AAAA-MM de PERIODO_INICIO até o mês atual. */
export function mesesDisponiveis() {
  const out = []; const d = new Date(PERIODO_INICIO + "T00:00:00"); const hoje = new Date();
  while (d <= hoje) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() + 1); }
  return out;
}

export const Unidades = {
  async listar(clinica_id) { return unwrap(await sb.from("unidades").select("*").eq("clinica_id", clinica_id).order("nome")); },
  async salvar(row) { return unwrap(await sb.from("unidades").upsert(row).select().single()); },
};

export const Fisios = {
  async listar(u) { return unwrap(await porUnidade(sb.from("fisioterapeutas").select("*").eq("clinica_id", u.clinica_id), u).order("slot")); },
  async salvar(row) { return unwrap(await sb.from("fisioterapeutas").upsert(row, { onConflict: "clinica_id,unidade_id,slot" }).select().single()); },
  async garantirSlots(u, nomes) { // nomes: {1:"Ariosto",2:"Tássia"}
    const existentes = await Fisios.listar(u);
    const porSlot = Object.fromEntries(existentes.map(f => [f.slot, f]));
    for (const [slot, nome] of Object.entries(nomes)) {
      if (!nome) continue;
      if (!porSlot[slot] || porSlot[slot].nome !== nome) porSlot[slot] = await Fisios.salvar(chave(u, { ...(porSlot[slot] ? { id: porSlot[slot].id } : {}), slot: Number(slot), nome, ativo: true }));
    }
    return porSlot;
  },
};

export const Metas = {
  async listar(u) {
    const rows = unwrap(await porUnidade(sb.from("metas").select("*").eq("clinica_id", u.clinica_id), u));
    const map = Object.fromEntries(rows.map(r => [r.indicador, r]));
    for (const [ind, s, m] of METAS_PADRAO) if (!map[ind]) map[ind] = { indicador: ind, meta_semanal: s, meta_mensal: m, padrao: true };
    return map;
  },
  async salvar(u, lista) {
    const rows = lista.map(m => chave(u, { indicador: m.indicador, meta_semanal: m.meta_semanal, meta_mensal: m.meta_mensal }));
    return unwrap(await sb.from("metas").upsert(rows, { onConflict: "clinica_id,unidade_id,indicador" }));
  },
};

export const Resumo = {
  async semanal(u, { de, ate, ids } = {}) {
    let q = porUnidade(sb.from("v2_resumo_semanal").select("*").eq("clinica_id", u.clinica_id), u).order("inicio");
    if (de) q = q.gte("inicio", de);
    if (ate) q = q.lte("inicio", ate);
    if (ids) q = q.in("id_semana", ids);
    return unwrap(await q);
  },
  async mensal(u) { return unwrap(await porUnidade(sb.from("v2_resumo_mensal").select("*").eq("clinica_id", u.clinica_id), u).order("mes")); },
  async fisios(u, { de, ate, ids } = {}) {
    let q = porUnidade(sb.from("v2_fisio_semanal").select("*").eq("clinica_id", u.clinica_id), u).order("inicio");
    if (de) q = q.gte("inicio", de);
    if (ate) q = q.lte("inicio", ate);
    if (ids) q = q.in("id_semana", ids);
    return unwrap(await q);
  },
  async leadsCanal(u, ids) { return unwrap(await porUnidade(sb.from("v2_leads_canal_semanal").select("*").eq("clinica_id", u.clinica_id), u).in("id_semana", ids)); },
  async pendencias(u) {
    const rows = unwrap(await porUnidade(sb.from("v2_pendencias").select("*").eq("clinica_id", u.clinica_id), u));
    return rows.reduce((a, r) => ({ pendente_valor: a.pendente_valor + Number(r.pendente_valor), pendente_qtd: a.pendente_qtd + r.pendente_qtd, atrasado_valor: a.atrasado_valor + Number(r.atrasado_valor), atrasado_qtd: a.atrasado_qtd + r.atrasado_qtd }),
      { pendente_valor: 0, pendente_qtd: 0, atrasado_valor: 0, atrasado_qtd: 0 });
  },
};

export const BaseSemanal = {
  async obter(u, id_semana) {
    const base = unwrap(await porUnidade(sb.from("base_semanal").select("*").eq("clinica_id", u.clinica_id), u).eq("id_semana", id_semana).maybeSingle());
    const fisios = unwrap(await porUnidade(sb.from("base_semanal_fisio").select("*").eq("clinica_id", u.clinica_id), u).eq("id_semana", id_semana));
    return { base, fisios };
  },
  async salvar(base, fisios) {
    unwrap(await sb.from("base_semanal").upsert({ ...base, updated_at: new Date().toISOString() }, { onConflict: "clinica_id,unidade_id,id_semana" }));
    if (fisios?.length) unwrap(await sb.from("base_semanal_fisio").upsert(fisios, { onConflict: "clinica_id,unidade_id,id_semana,fisioterapeuta_id" }));
  },
};

export const Reunioes = {
  async obter(u, id_semana) { return unwrap(await porUnidade(sb.from("reunioes").select("*").eq("clinica_id", u.clinica_id), u).eq("id_semana", id_semana).maybeSingle()); },
  async salvar(row) { return unwrap(await sb.from("reunioes").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "clinica_id,unidade_id,id_semana" })); },
};

export const Acoes = {
  async listar(u, id_semana) {
    let q = porUnidade(sb.from("acoes").select("*").eq("clinica_id", u.clinica_id), u).order("id_semana").order("ordem");
    if (id_semana) q = q.eq("id_semana", id_semana);
    return unwrap(await q);
  },
  async pendentes(u) { return unwrap(await porUnidade(sb.from("acoes").select("*").eq("clinica_id", u.clinica_id), u).in("status", ["A fazer", "Em andamento"]).order("quando")); },
  async salvar(row) { return unwrap(await sb.from("acoes").upsert(row).select().single()); },
  async excluir(id) { return unwrap(await sb.from("acoes").delete().eq("id", id)); },
};

export const Contratos = {
  async listar(u, { de, ate } = {}) {
    let q = porUnidade(sb.from("contratos").select("*, fisioterapeutas(nome)").eq("clinica_id", u.clinica_id), u).order("data", { ascending: false });
    if (de) q = q.gte("data", de);
    if (ate) q = q.lte("data", ate);
    return unwrap(await q);
  },
  async salvar(row) { return unwrap(await sb.from("contratos").upsert(row).select().single()); },
  async excluir(id) { return unwrap(await sb.from("contratos").delete().eq("id", id)); },
};

export const Lancamentos = {
  async listar(u, { de, ate, categoria } = {}) {
    let q = porUnidade(sb.from("lancamentos").select("*").eq("clinica_id", u.clinica_id), u).order("data", { ascending: false });
    if (de) q = q.gte("data", de);
    if (ate) q = q.lte("data", ate);
    if (categoria) q = q.eq("categoria", categoria);
    return unwrap(await q);
  },
  async salvar(row) { return unwrap(await sb.from("lancamentos").upsert(row).select().single()); },
  async atualizar(id, patch) { return unwrap(await sb.from("lancamentos").update(patch).eq("id", id)); },
  async excluir(id) { return unwrap(await sb.from("lancamentos").delete().eq("id", id)); },
};

export const LeadsCanal = {
  async listar(u, id_semana) { return unwrap(await porUnidade(sb.from("leads_canal").select("*").eq("clinica_id", u.clinica_id), u).eq("id_semana", id_semana)); },
  async salvar(rows) { return unwrap(await sb.from("leads_canal").upsert(rows, { onConflict: "clinica_id,unidade_id,id_semana,canal" })); },
};

export const Importacoes = {
  async listar(u) { return unwrap(await porUnidade(sb.from("importacoes").select("*").eq("clinica_id", u.clinica_id), u).order("created_at", { ascending: false }).limit(20)); },
  async registrar(row) { return unwrap(await sb.from("importacoes").insert(row).select().single()); },
};

export const Usuarios = {
  async listar(clinica_id) { return unwrap(await sb.from("profiles").select("*").eq("clinica_id", clinica_id).order("nome")); },
  async atualizar(id, patch) { return unwrap(await sb.from("profiles").update(patch).eq("id", id)); },
  async convites(clinica_id) { return unwrap(await sb.from("convites").select("*").eq("clinica_id", clinica_id).order("created_at", { ascending: false })); },
  async convidar(row) { return unwrap(await sb.from("convites").upsert(row, { onConflict: "clinica_id,email" }).select().single()); },
  async revogar(id) { return unwrap(await sb.from("convites").delete().eq("id", id)); },
};

export const Clinica = {
  async renomear(id, nome) { return unwrap(await sb.from("clinicas").update({ nome }).eq("id", id)); },
  async config(clinica_id) { return unwrap(await sb.from("clinica_config").select("*").eq("clinica_id", clinica_id).maybeSingle()); },
  async salvarConfig(row) { return unwrap(await sb.from("clinica_config").upsert({ ...row, updated_at: new Date().toISOString() })); },
  async zerarUnidade(unidade_id) { return unwrap(await sb.rpc("zerar_unidade", { p_unidade: unidade_id })); },
  async assistenteConfig() { const rows = unwrap(await sb.rpc("assistente_config")); return rows?.[0] || null; },
};

// ------------------------------------------------------------------ Banco Inter
const INTEG_COLS = "id,clinica_id,unidade_id,nome,conta_corrente,client_id,escopos,sync_desde,ativo,ultima_sync,ultimo_erro,saldo,saldo_em,updated_at";
export const Inter = {
  async integracao(unidade_id) { return unwrap(await sb.from("inter_integracoes").select(INTEG_COLS).eq("unidade_id", unidade_id).maybeSingle()); },
  async integracoes(clinica_id) { return unwrap(await sb.from("inter_integracoes").select(INTEG_COLS).eq("clinica_id", clinica_id)); },
  /** Campos sensíveis (client_secret, certificado, chave_privada) só são enviados se preenchidos; nunca são lidos de volta. */
  async salvarIntegracao(row) { return unwrap(await sb.rpc("inter_salvar_integracao", { p: row })); },
  /** Chama a Edge Function inter-sync. acao: "testar" | "sincronizar"; extra: { de, ate } */
  async sincronizar(unidade_id, acao = "sincronizar", extra = {}) {
    const { data, error } = await sb.functions.invoke("inter-sync", { body: { unidade_id, acao, ...extra } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json(); if (j?.erro) msg = j.erro; } catch {}
      throw new Error(msg);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  },
  async extrato(u, { de, ate, tipo, filtro } = {}) {
    let q = porUnidade(sb.from("inter_extrato").select("*").eq("clinica_id", u.clinica_id), u).order("data", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
    if (de) q = q.gte("data", de);
    if (ate) q = q.lte("data", ate);
    if (tipo) q = q.eq("tipo_operacao", tipo);
    if (filtro === "sem_categoria") q = q.is("categoria", null);
    if (filtro === "sem_parcela") q = q.eq("tipo_operacao", "C").is("conciliado_id", null);
    return unwrap(await q);
  },
  async atualizarExtrato(id, patch) { return unwrap(await sb.from("inter_extrato").update(patch).eq("id", id)); },
  async cobrancas(u, { de, ate } = {}) {
    let q = porUnidade(sb.from("inter_cobrancas").select("*").eq("clinica_id", u.clinica_id), u).order("data_vencimento", { ascending: false }).limit(2000);
    if (de) q = q.gte("data_vencimento", de);
    if (ate) q = q.lte("data_vencimento", ate);
    return unwrap(await q);
  },
  async saldos(u) { return unwrap(await porUnidade(sb.from("inter_saldos").select("*").eq("clinica_id", u.clinica_id), u).order("data")); },
  async mensal(u) { return unwrap(await porUnidade(sb.from("v2_inter_mensal").select("*").eq("clinica_id", u.clinica_id), u).order("mes")); },
  async regras(clinica_id) { return unwrap(await sb.from("inter_regras").select("*").eq("clinica_id", clinica_id).order("ordem").order("created_at")); },
  async salvarRegra(row) { return unwrap(await sb.from("inter_regras").upsert(row).select().single()); },
  async excluirRegra(id) { return unwrap(await sb.from("inter_regras").delete().eq("id", id)); },
  async classificar(unidade_id) { return unwrap(await sb.rpc("inter_classificar", { p_unidade: unidade_id })); },
  async gerarLancamentos(unidade_id) { return unwrap(await sb.rpc("inter_gerar_lancamentos", { p_unidade: unidade_id })); },
  async conciliar(unidade_id, tolerancia = 5) { return unwrap(await sb.rpc("inter_conciliar", { p_unidade: unidade_id, p_tolerancia: tolerancia })); },
  /** Parcelas (lançamentos rec:*) por id — para mostrar com que parcela um crédito foi conciliado. */
  async parcelas(ids) { if (!ids.length) return {}; const rows = unwrap(await sb.from("lancamentos").select("id,data,vencimento,valor,contraparte,descricao,status").in("id", ids)); return Object.fromEntries(rows.map(r => [r.id, r])); },
};

// ------------------------------------------------------------------ IA2GO (agente de IA de WhatsApp da franquia) — coleta manual
export const IA2GO = {
  async semanal(u, { de, ate } = {}) {
    let q = porUnidade(sb.from("v2_ia2go_semanal").select("*").eq("clinica_id", u.clinica_id), u).order("inicio");
    if (de) q = q.gte("inicio", de);
    if (ate) q = q.lte("inicio", ate);
    return unwrap(await q);
  },
  /** Salva só os campos IA2GO da semana (upsert parcial — não mexe nos demais campos da base). */
  async salvarSemana(u, id_semana, campos) {
    return unwrap(await sb.from("base_semanal").upsert({ ...chave(u), id_semana, ...campos, updated_at: new Date().toISOString() }, { onConflict: "clinica_id,unidade_id,id_semana" }));
  },
  /**
   * Leads por origem informados por mês (gráfico "Leads por Origem" do dashboard do IA2GO):
   * distribui pelas semanas ISO que tocam o mês, proporcionalmente aos dias de cada semana dentro do mês,
   * e grava em leads_canal (observacoes = 'IA2GO mês AAAA-MM').
   */
  async salvarLeadsOrigemMes(u, mes, porCanal, semanas) {
    const [y, m] = mes.split("-").map(Number);
    const ini = new Date(Date.UTC(y, m - 1, 1)), fim = new Date(Date.UTC(y, m, 0));
    const toca = semanas.map(s => {
      const a = new Date(s.inicio + "T00:00:00Z"), b = new Date(s.fim + "T00:00:00Z");
      const d0 = a > ini ? a : ini, d1 = b < fim ? b : fim;
      const dias = Math.round((d1 - d0) / 864e5) + 1;
      return dias > 0 ? { id_semana: s.id_semana, dias } : null;
    }).filter(Boolean);
    const totalDias = toca.reduce((a, s) => a + s.dias, 0);
    const rows = [];
    for (const [canal, qtd] of Object.entries(porCanal)) {
      // maior resto: soma das semanas bate exatamente com o total do mês
      const brutos = toca.map(s => ({ s, v: qtd * s.dias / totalDias }));
      let dist = brutos.map(x => Math.floor(x.v)); let resto = qtd - dist.reduce((a, b) => a + b, 0);
      brutos.map((x, i) => [x.v - Math.floor(x.v), i]).sort((a, b) => b[0] - a[0]).slice(0, resto).forEach(([, i]) => dist[i]++);
      toca.forEach((s, i) => rows.push(chave(u, { id_semana: s.id_semana, canal, quantidade: dist[i], observacoes: "IA2GO mês " + mes })));
    }
    if (rows.length) unwrap(await sb.from("leads_canal").upsert(rows, { onConflict: "clinica_id,unidade_id,id_semana,canal" }));
    unwrap(await sb.from("ia2go_leads_origem_mes").upsert(Object.entries(porCanal).map(([canal, quantidade]) => chave(u, { mes, canal, quantidade, updated_at: new Date().toISOString() })), { onConflict: "unidade_id,mes,canal" }));
    return rows.length;
  },
  async leadsOrigemMes(u, mes) {
    const rows = unwrap(await porUnidade(sb.from("ia2go_leads_origem_mes").select("canal,quantidade").eq("clinica_id", u.clinica_id), u).eq("mes", mes));
    const out = {}; for (const r of rows) out[r.canal] = (out[r.canal] || 0) + r.quantidade; return out;
  },
  async leadsOrigemMeses(u) { return unwrap(await porUnidade(sb.from("ia2go_leads_origem_mes").select("*").eq("clinica_id", u.clinica_id), u).order("mes")); },
};

export { chave };
