// Camada de acesso a dados. Toda tela fala com o Supabase só por aqui,
// o que facilita a migração futura para uma API Node (basta reimplementar estas funções).
import { sb, unwrap } from "./supabase.js";
import { METAS_PADRAO } from "./config.js";

export const Semanas = {
  async listar(limiteInicio, limiteFim) {
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
  /** Semanas ao redor de `id`: `antes` anteriores e `depois` posteriores (inclui a própria). */
  async janela(id, antes = 26, depois = 8) {
    let ini = id, fim = id;
    for (let i = 0; i < antes; i++) ini = shiftSemana(ini, -1);
    for (let i = 0; i < depois; i++) fim = shiftSemana(fim, 1);
    const rows = unwrap(await sb.from("semanas").select("*").gte("id_semana", ini).lte("id_semana", fim).order("inicio"));
    return rows;
  },
  anterior(id) { return shiftSemana(id, -1); },
  proxima(id) { return shiftSemana(id, 1); },
};

function shiftSemana(id, n) {
  const [y, w] = id.split("-S").map(Number);
  const d = new Date(Date.UTC(y, 0, 4));             // 4 de janeiro está sempre na semana 1
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1 + (w - 1 + n) * 7);
  return Semanas.idDe(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const Fisios = {
  async listar(clinica_id) {
    return unwrap(await sb.from("fisioterapeutas").select("*").eq("clinica_id", clinica_id).order("slot"));
  },
  async salvar(row) { return unwrap(await sb.from("fisioterapeutas").upsert(row, { onConflict: "clinica_id,slot" }).select().single()); },
  async garantirSlots(clinica_id, nomes) { // nomes: {1:"Ariosto",2:"Tássia"}
    const existentes = await Fisios.listar(clinica_id);
    const porSlot = Object.fromEntries(existentes.map(f => [f.slot, f]));
    for (const [slot, nome] of Object.entries(nomes)) {
      if (!nome) continue;
      if (!porSlot[slot] || porSlot[slot].nome !== nome) {
        porSlot[slot] = await Fisios.salvar({ clinica_id, slot: Number(slot), nome, ativo: true });
      }
    }
    return porSlot;
  },
};

export const Metas = {
  async listar(clinica_id) {
    const rows = unwrap(await sb.from("metas").select("*").eq("clinica_id", clinica_id));
    const map = Object.fromEntries(rows.map(r => [r.indicador, r]));
    for (const [ind, s, m] of METAS_PADRAO) if (!map[ind]) map[ind] = { indicador: ind, meta_semanal: s, meta_mensal: m, padrao: true };
    return map;
  },
  async salvar(clinica_id, lista) {
    const rows = lista.map(m => ({ clinica_id, indicador: m.indicador, meta_semanal: m.meta_semanal, meta_mensal: m.meta_mensal }));
    return unwrap(await sb.from("metas").upsert(rows, { onConflict: "clinica_id,indicador" }));
  },
};

export const Resumo = {
  async semanal(clinica_id, { de, ate, ids } = {}) {
    let q = sb.from("v_resumo_semanal").select("*").eq("clinica_id", clinica_id).order("inicio");
    if (de) q = q.gte("inicio", de);
    if (ate) q = q.lte("inicio", ate);
    if (ids) q = q.in("id_semana", ids);
    return unwrap(await q);
  },
  async mensal(clinica_id) {
    return unwrap(await sb.from("v_resumo_mensal").select("*").eq("clinica_id", clinica_id).order("mes"));
  },
  async fisios(clinica_id, { de, ate, ids } = {}) {
    let q = sb.from("v_fisio_semanal").select("*").eq("clinica_id", clinica_id).order("inicio");
    if (de) q = q.gte("inicio", de);
    if (ate) q = q.lte("inicio", ate);
    if (ids) q = q.in("id_semana", ids);
    return unwrap(await q);
  },
  async leadsCanal(clinica_id, ids) {
    return unwrap(await sb.from("v_leads_canal_semanal").select("*").eq("clinica_id", clinica_id).in("id_semana", ids));
  },
  async pendencias(clinica_id) {
    const rows = unwrap(await sb.from("v_pendencias").select("*").eq("clinica_id", clinica_id));
    return rows[0] || { pendente_valor: 0, pendente_qtd: 0, atrasado_valor: 0, atrasado_qtd: 0 };
  },
};

export const BaseSemanal = {
  async obter(clinica_id, id_semana) {
    const base = unwrap(await sb.from("base_semanal").select("*").eq("clinica_id", clinica_id).eq("id_semana", id_semana).maybeSingle());
    const fisios = unwrap(await sb.from("base_semanal_fisio").select("*").eq("clinica_id", clinica_id).eq("id_semana", id_semana));
    return { base, fisios };
  },
  async salvar(base, fisios) {
    unwrap(await sb.from("base_semanal").upsert({ ...base, updated_at: new Date().toISOString() }, { onConflict: "clinica_id,id_semana" }));
    if (fisios?.length) unwrap(await sb.from("base_semanal_fisio").upsert(fisios, { onConflict: "clinica_id,id_semana,fisioterapeuta_id" }));
  },
};

export const Reunioes = {
  async obter(clinica_id, id_semana) {
    return unwrap(await sb.from("reunioes").select("*").eq("clinica_id", clinica_id).eq("id_semana", id_semana).maybeSingle());
  },
  async salvar(row) { return unwrap(await sb.from("reunioes").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "clinica_id,id_semana" })); },
};

export const Acoes = {
  async listar(clinica_id, id_semana) {
    let q = sb.from("acoes").select("*").eq("clinica_id", clinica_id).order("id_semana").order("ordem");
    if (id_semana) q = q.eq("id_semana", id_semana);
    return unwrap(await q);
  },
  async pendentes(clinica_id) {
    return unwrap(await sb.from("acoes").select("*").eq("clinica_id", clinica_id).in("status", ["A fazer", "Em andamento"]).order("quando"));
  },
  async salvar(row) { return unwrap(await sb.from("acoes").upsert(row).select().single()); },
  async excluir(id) { return unwrap(await sb.from("acoes").delete().eq("id", id)); },
};

export const Contratos = {
  async listar(clinica_id, { de, ate } = {}) {
    let q = sb.from("contratos").select("*, fisioterapeutas(nome)").eq("clinica_id", clinica_id).order("data", { ascending: false });
    if (de) q = q.gte("data", de);
    if (ate) q = q.lte("data", ate);
    return unwrap(await q);
  },
  async salvar(row) { return unwrap(await sb.from("contratos").upsert(row).select().single()); },
  async excluir(id) { return unwrap(await sb.from("contratos").delete().eq("id", id)); },
};

export const Lancamentos = {
  async listar(clinica_id, { de, ate, categoria } = {}) {
    let q = sb.from("lancamentos").select("*").eq("clinica_id", clinica_id).order("data", { ascending: false });
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
  async listar(clinica_id, id_semana) {
    return unwrap(await sb.from("leads_canal").select("*").eq("clinica_id", clinica_id).eq("id_semana", id_semana));
  },
  async salvar(rows) { return unwrap(await sb.from("leads_canal").upsert(rows, { onConflict: "clinica_id,id_semana,canal" })); },
};

export const Importacoes = {
  async listar(clinica_id) {
    return unwrap(await sb.from("importacoes").select("*").eq("clinica_id", clinica_id).order("created_at", { ascending: false }).limit(20));
  },
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
};
