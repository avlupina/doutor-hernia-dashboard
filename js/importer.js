// Leitura da planilha padronizada (Base_Dados_Clinica.xlsx) e gravação no Supabase.
// Regras: Base_Semanal, Leads_Canal e Reuniao_Semanal são "upsert" por semana;
// Contratos, Financeiro e Plano_Acao substituem os registros das semanas presentes no arquivo.
import { sb, unwrap } from "./supabase.js";
import { Fisios, Metas, Importacoes } from "./api.js";
import { METAS_PADRAO } from "./config.js";

const HEADER_ROW = 2; // linha 3 da planilha (índice 0)

function lerAba(wb, nome) {
  const ws = wb.Sheets[nome];
  if (!ws) return null;
  const linhas = window.XLSX.utils.sheet_to_json(ws, { header: 1, range: HEADER_ROW, raw: true, defval: null });
  const cab = (linhas[0] || []).map(h => (h == null ? "" : String(h).trim()));
  return linhas.slice(1).map(l => { const o = {}; cab.forEach((h, i) => { if (h) o[h] = l[i]; }); return o; });
}

function data(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
const n = v => (v == null || v === "" ? 0 : Number(v) || 0);
const nn = v => (v == null || v === "" ? null : Number(v));
const t = v => (v == null ? null : String(v).trim() || null);
const semanaOk = v => /^\d{4}-S\d{2}$/.test(String(v || ""));
const temDado = (o, chaves) => chaves.some(k => o[k] != null && o[k] !== "");

/** Lê o arquivo e devolve um resumo + dados prontos para gravar. */
export function analisar(arrayBuffer) {
  const wb = window.XLSX.read(arrayBuffer, { type: "array" });
  const out = { fisios: {}, metas: [], base: [], fisioRows: [], contratos: [], lancamentos: [], leads: [], reunioes: [], acoes: [], avisos: [] };

  const cfg = wb.Sheets["Config"];
  if (cfg) {
    const g = a => (cfg[a] ? t(cfg[a].v) : null);
    out.fisios = { 1: g("B5"), 2: g("B6") };
    for (let r = 10; r <= 20; r++) {
      const ind = g("A" + r); if (!ind) continue;
      out.metas.push({ indicador: ind, meta_semanal: nn(cfg["B" + r]?.v), meta_mensal: nn(cfg["C" + r]?.v) });
    }
  } else out.avisos.push("Aba Config não encontrada: nomes dos fisioterapeutas e metas não serão importados.");

  const base = lerAba(wb, "Base_Semanal") || [];
  const chavesBase = ["Leads recebidos", "Aval. agendadas", "Aval. canceladas", "Aval. realizadas Fisio 1", "Aval. realizadas Fisio 2", "Contratos fechados Fisio 1", "Contratos fechados Fisio 2",
    "Atendimentos Fisio 1", "Atendimentos Fisio 2", "Cancelamentos de atendimentos", "Novos pacientes", "Horários disponíveis manhã", "Horários ocupados manhã", "Horários disponíveis tarde", "Horários ocupados tarde",
    "Tempo médio atend. Fisio 1 (min)", "Desvio padrão Fisio 1 (min)", "Tempo médio atend. Fisio 2 (min)", "Desvio padrão Fisio 2 (min)"];
  for (const r of base) {
    if (!semanaOk(r["id_semana"]) || !temDado(r, chavesBase)) continue;
    out.base.push({ id_semana: r["id_semana"], leads: n(r["Leads recebidos"]), aval_agendadas: n(r["Aval. agendadas"]), aval_canceladas: n(r["Aval. canceladas"]),
      cancel_atendimentos: n(r["Cancelamentos de atendimentos"]), novos_pacientes: n(r["Novos pacientes"]),
      horarios_disp_manha: n(r["Horários disponíveis manhã"]), horarios_ocup_manha: n(r["Horários ocupados manhã"]), horarios_disp_tarde: n(r["Horários disponíveis tarde"]), horarios_ocup_tarde: n(r["Horários ocupados tarde"]),
      observacoes: t(r["Observações"]) });
    for (const slot of [1, 2]) {
      out.fisioRows.push({ id_semana: r["id_semana"], slot, aval_realizadas: n(r[`Aval. realizadas Fisio ${slot}`]), contratos: n(r[`Contratos fechados Fisio ${slot}`]), atendimentos: n(r[`Atendimentos Fisio ${slot}`]),
        tempo_medio_min: nn(r[`Tempo médio atend. Fisio ${slot} (min)`]), desvio_min: nn(r[`Desvio padrão Fisio ${slot} (min)`]) });
    }
  }
  if (!wb.Sheets["Base_Semanal"]) out.avisos.push("Aba Base_Semanal não encontrada.");

  for (const r of lerAba(wb, "Contratos") || []) {
    const d = data(r["Data"]); if (!d) continue;
    const tipo = t(r["Tipo"]);
    if (!["Avaliação", "Protocolo"].includes(tipo)) { out.avisos.push(`Contrato de ${d} ignorado: tipo "${tipo}" inválido.`); continue; }
    out.contratos.push({ data: d, paciente: t(r["Paciente"]), tipo, fisio_nome: t(r["Fisioterapeuta"]), descricao: t(r["Protocolo / descrição"]), n_sessoes: nn(r["Nº sessões"]), valor: n(r["Valor (R$)"]),
      condicao: t(r["Condição de pagamento"]), forma_pagamento: t(r["Forma de pagamento"]), parcelas: nn(r["Parcelas"]) ?? 1, status_pagamento: t(r["Status pagamento"]) || "Pago", canal: t(r["Canal de ingresso"]), observacoes: t(r["Observações"]) });
  }
  for (const r of lerAba(wb, "Financeiro") || []) {
    const d = data(r["Data"]); if (!d) continue;
    const cat = t(r["Categoria"]);
    if (!["Receita", "Gasto", "Imposto", "Marketing"].includes(cat)) { out.avisos.push(`Lançamento de ${d} ignorado: categoria "${cat}" inválida.`); continue; }
    const tc = t(r["Tipo de custo"]);
    out.lancamentos.push({ data: d, categoria: cat, tipo_custo: cat === "Gasto" && ["Fixo", "Variável"].includes(tc) ? tc : null, descricao: t(r["Descrição"]), valor: n(r["Valor (R$)"]),
      status: t(r["Status"]) || "Pago", vencimento: data(r["Vencimento"]), contraparte: t(r["Paciente / fornecedor"]), observacoes: t(r["Observações"]) });
  }
  for (const r of lerAba(wb, "Leads_Canal") || []) {
    if (!semanaOk(r["id_semana"]) || !t(r["Canal"])) continue;
    out.leads.push({ id_semana: r["id_semana"], canal: t(r["Canal"]), quantidade: n(r["Quantidade"]), observacoes: t(r["Observações"]) });
  }
  for (const r of lerAba(wb, "Reuniao_Semanal") || []) {
    if (!semanaOk(r["id_semana"])) continue;
    const pj = t(r["Algo prejudicando a experiência?"]);
    out.reunioes.push({ id_semana: r["id_semana"], resultado_geral: ["Melhor", "Igual", "Pior"].includes(t(r["Resultado geral (registrado)"])) ? t(r["Resultado geral (registrado)"]) : null,
      pontos_positivos: t(r["Pontos positivos"]), pontos_melhorar: t(r["Pontos a melhorar"]), pacientes_criticos: t(r["Pacientes críticos / risco de desistência"]), pontos_pertinentes: t(r["Pontos pertinentes"]),
      problemas_atendimento: t(r["Problemas no atendimento"]), prejudica_experiencia: pj == null ? null : /^s/i.test(pj), prejudica_descricao: t(r["Descrição do que prejudica"]),
      demandas_equipe: t(r["Demandas da recepção e equipe"]), pontos_proxima_semana: t(r["Pontos relevantes (próxima semana)"]), outros: t(r["Outros pontos"]), metas_semana: t(r["Metas da semana"]), solucoes: t(r["Soluções para os problemas identificados"]) });
  }
  for (const r of lerAba(wb, "Plano_Acao") || []) {
    if (!semanaOk(r["id_semana"]) || !t(r["O quê (What)"])) continue;
    out.acoes.push({ id_semana: r["id_semana"], ordem: nn(r["Ordem"]), problema: t(r["Problema / meta"]), o_que: t(r["O quê (What)"]), por_que: t(r["Por quê (Why)"]), onde: t(r["Onde (Where)"]),
      quando: data(r["Quando (When)"]), quem: t(r["Quem (Who)"]), como: t(r["Como (How)"]), quanto: nn(r["Quanto (How much)"]), status: ["A fazer", "Em andamento", "Concluída", "Cancelada"].includes(t(r["Status"])) ? t(r["Status"]) : "A fazer" });
  }
  out.semanas = [...new Set([...out.base.map(b => b.id_semana), ...out.leads.map(l => l.id_semana), ...out.reunioes.map(r => r.id_semana), ...out.acoes.map(a => a.id_semana)])].sort();
  return out;
}

function semanaDe(iso) { // mesma regra ISO do banco
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yy = dt.getUTCFullYear(); const w = Math.ceil(((dt - Date.UTC(yy, 0, 1)) / 864e5 + 1) / 7);
  return `${yy}-S${String(w).padStart(2, "0")}`;
}

/** Grava os dados analisados. onProgress(texto, fração). */
export async function gravar(dados, ctx, arquivo, onProgress = () => {}) {
  const cid = ctx.clinica_id;
  const resumo = {};
  onProgress("Equipe e metas", 0.05);
  const porSlot = await Fisios.garantirSlots(cid, dados.fisios);
  const existentes = await Fisios.listar(cid);
  const porNome = Object.fromEntries(existentes.map(f => [f.nome.toLowerCase(), f.id]));
  if (dados.metas.length) await Metas.salvar(cid, dados.metas.filter(m => METAS_PADRAO.some(p => p[0] === m.indicador)));

  onProgress("Base semanal", 0.2);
  if (dados.base.length) {
    unwrap(await sb.from("base_semanal").upsert(dados.base.map(b => ({ ...b, clinica_id: cid, updated_at: new Date().toISOString() })), { onConflict: "clinica_id,id_semana" }));
    const rowsF = dados.fisioRows.filter(r => porSlot[r.slot]).map(({ slot, ...r }) => ({ ...r, clinica_id: cid, fisioterapeuta_id: porSlot[slot].id }));
    if (rowsF.length) unwrap(await sb.from("base_semanal_fisio").upsert(rowsF, { onConflict: "clinica_id,id_semana,fisioterapeuta_id" }));
  }
  resumo.base_semanal = dados.base.length;

  onProgress("Contratos", 0.4);
  if (dados.contratos.length) {
    const sem = [...new Set(dados.contratos.map(c => semanaDe(c.data)))];
    unwrap(await sb.from("contratos").delete().eq("clinica_id", cid).in("id_semana", sem));
    unwrap(await sb.from("contratos").insert(dados.contratos.map(({ fisio_nome, ...c }) => ({ ...c, clinica_id: cid, fisioterapeuta_id: fisio_nome ? porNome[fisio_nome.toLowerCase()] || null : null }))));
    const semNome = dados.contratos.filter(c => c.fisio_nome && !porNome[c.fisio_nome.toLowerCase()]).length;
    if (semNome) dados.avisos.push(`${semNome} contrato(s) com fisioterapeuta não cadastrado ficaram sem profissional.`);
  }
  resumo.contratos = dados.contratos.length;

  onProgress("Financeiro", 0.6);
  if (dados.lancamentos.length) {
    const sem = [...new Set(dados.lancamentos.map(l => semanaDe(l.data)))];
    unwrap(await sb.from("lancamentos").delete().eq("clinica_id", cid).in("id_semana", sem));
    unwrap(await sb.from("lancamentos").insert(dados.lancamentos.map(l => ({ ...l, clinica_id: cid }))));
  }
  resumo.lancamentos = dados.lancamentos.length;

  onProgress("Leads por canal e reunião", 0.75);
  if (dados.leads.length) unwrap(await sb.from("leads_canal").upsert(dados.leads.map(l => ({ ...l, clinica_id: cid })), { onConflict: "clinica_id,id_semana,canal" }));
  if (dados.reunioes.length) unwrap(await sb.from("reunioes").upsert(dados.reunioes.map(r => ({ ...r, clinica_id: cid, updated_at: new Date().toISOString() })), { onConflict: "clinica_id,id_semana" }));
  resumo.leads_canal = dados.leads.length; resumo.reunioes = dados.reunioes.length;

  onProgress("Plano de ação", 0.9);
  if (dados.acoes.length) {
    const sem = [...new Set(dados.acoes.map(a => a.id_semana))];
    unwrap(await sb.from("acoes").delete().eq("clinica_id", cid).in("id_semana", sem));
    unwrap(await sb.from("acoes").insert(dados.acoes.map(a => ({ ...a, clinica_id: cid }))));
  }
  resumo.acoes = dados.acoes.length;
  resumo.semanas = dados.semanas;
  await Importacoes.registrar({ clinica_id: cid, user_id: ctx.session.user.id, arquivo, resumo });
  onProgress("Concluído", 1);
  return resumo;
}
