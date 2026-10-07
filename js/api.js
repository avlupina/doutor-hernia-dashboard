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
  async assistenteConfig() { const rows = unwrap(await sb.rpc("assistente_config")); return rows?.[0] || null; },
};

export { chave };
