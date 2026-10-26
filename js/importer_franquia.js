// Importador dos relatórios exportados do sistema da franqueadora (app.doutorhernia.com.br).
// Os arquivos vêm com extensão .xls, mas são tabelas HTML. Três relatórios, que podem ser enviados juntos ou separados:
//   1) Agendamentos  → base semanal (avaliações, atendimentos, cancelamentos/faltas, novos pacientes, ocupação), atendimentos por fisio, leads por canal, contratos de avaliação
//   2) Tratamentos   → contratos de protocolo (data de lançamento, fisio, origem, local/grau) — o valor vem das parcelas do contas a receber
//   3) Contas a receber → lançamentos de receita (uma linha por parcela: Pago / Pendente / Atrasado) e valor dos protocolos
//
// Regras de interpretação:
//  - Avaliação = primeiro agendamento de cada paciente (ID Paciente). Os demais agendamentos são sessões.
//  - Avaliação agendada: semana da Data Agendamento. Realizada: ATENDIDO. Cancelada: DESMARCADO ou NÃO COMPARECEU (falta).
//  - Atendimentos realizados (por fisio): situação ATENDIDO (inclui a avaliação). Cancelamentos: DESMARCADO + NÃO COMPARECEU.
//  - Novos pacientes: avaliação ATENDIDA na semana. Leads por canal: Origem Lead dos pacientes com avaliação agendada na semana.
//  - Horários ocupados: agendamentos não desmarcados por turno (manhã < 12h / tarde ≥ 12h). Disponíveis: capacidade semanal da unidade (Cadastros).
//  - Receita: parcelas do contas a receber (data de pagamento quando PAGO; vencimento quando pendente). Atrasado = pendente com vencimento anterior a hoje.
//  - Valor do protocolo: soma das parcelas (tipo ≠ AVALIAÇÃO) do mesmo paciente; se houver mais de um tratamento, cada parcela vai para o tratamento de data mais próxima.
import { sb, unwrap } from "./supabase.js";
import { Fisios, Importacoes, Semanas } from "./api.js";

const CANAL = [[/instagram/i, "Instagram"], [/direto|facebook.*whatsapp|whatsapp.*facebook/i, "WhatsApp direto"], [/whatsapp/i, "WhatsApp direto"], [/facebook/i, "Facebook"],
  [/indica/i, "Indicação"], [/fachada|passante/i, "Passante/Fachada"], [/ia2go/i, "IA2GO"], [/site|landing/i, "Site"], [/google/i, "Google"], [/liga/i, "Ligação telefônica"], [/outdoor/i, "Outdoor"], [/conv|parceria/i, "Convênio/Parceria"]];
const FORMA = { "DINHEIRO": "Dinheiro", "PIX": "Pix", "CARTÃO DE DÉBITO": "Cartão de débito", "CARTÃO DÉBITO": "Cartão de débito", "CARTÃO CRÉDITO": "Cartão de crédito", "CARTÃO DE CRÉDITO": "Cartão de crédito", "BOLETO": "Boleto", "TRANSFERÊNCIA": "Transferência", "CONVÊNIO": "Convênio" };

const t = v => (v == null ? null : String(v).trim() || null);
const up = v => (t(v) || "").toUpperCase();
const dataBR = v => { const s = String(v || ""); let m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; m = s.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
/** '1.250,00' | '150,00' | '35000' (centavos sem separador) | número → reais */
const valorBR = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; const s = String(v).trim(); if (/,\d{2}$/.test(s)) return Number(s.replace(/\./g, "").replace(",", ".")) || 0; if (/^\d+$/.test(s)) return Number(s) / 100; return Number(s.replace(/[^\d.]/g, "")) || 0; };
const formaDe = v => FORMA[up(v)] || t(v);
const canalDe = o => { for (const [re, n] of CANAL) if (re.test(o || "")) return n; return "Outro"; };
const semanaDe = iso => Semanas.idDe(new Date(iso + "T00:00:00"));
const hoje = () => new Date().toISOString().slice(0, 10);
const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function lerTabela(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const head = new TextDecoder("utf-8").decode(u8.slice(0, 300)).toLowerCase();
  const wb = head.includes("<table") || head.includes("<html") || head.includes("<!doctype")
    ? window.XLSX.read(new TextDecoder("utf-8").decode(u8), { type: "string", raw: true })
    : window.XLSX.read(u8, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}
function cabecalho(rows, marcador) {
  const hi = rows.findIndex(r => (r || []).some(c => norm(c) === norm(marcador)));
  if (hi < 0) throw new Error(`Não encontrei a coluna "${marcador}" — confira se é o relatório certo.`);
  const cab = rows[hi].map(c => norm(c));
  return { hi, idx: n => cab.indexOf(norm(n)) };
}

/** Identifica o tipo do relatório pelo cabeçalho. */
export function detectar(arrayBuffer) {
  const rows = lerTabela(arrayBuffer);
  const cab = (rows.find(r => (r || []).filter(Boolean).length > 5) || []).map(norm);
  if (cab.includes("situacao agendamento")) return "agendamentos";
  if (cab.includes("tratamento") && cab.includes("status")) return "tratamentos";
  if (cab.includes("tipo de recebimento")) return "receber";
  return null;
}

// ------------------------------------------------------------------ leitura
export function lerAgendamentos(arrayBuffer) {
  const rows = lerTabela(arrayBuffer); const { hi, idx } = cabecalho(rows, "ID Paciente");
  const col = { id: idx("ID #"), unidade: idx("Unidade"), pac: idx("ID Paciente"), nome: idx("Paciente"), lead: idx("Código Lead"), origem: idx("Origem Lead"), data: idx("Data Agendamento"), hora: idx("Hora Agendamento"),
    valor: idx("Valor Total"), forma: idx("Forma de Pagamento"), parcelas: idx("Qtd. Parcelas"), venc: idx("Data Vencimento"), sitPag: idx("Situação Pagamento"), dataPag: idx("Data Pagamento"), fisio: idx("Fisioterapeuta"), sit: idx("Situação Agendamento") };
  const faltando = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => k); if (faltando.length) throw new Error("Agendamentos: colunas ausentes: " + faltando.join(", "));
  const linhas = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r || !r[col.pac]) continue; const data = dataBR(r[col.data]); if (!data) continue;
    const hora = String(r[col.hora] || "").slice(0, 5);
    linhas.push({ id: t(r[col.id]), unidade: t(r[col.unidade]), paciente_id: t(r[col.pac]), paciente: t(r[col.nome]), lead: t(r[col.lead]), origem: t(r[col.origem]), canal: canalDe(r[col.origem]), data, hora,
      turno: Number(hora.slice(0, 2)) < 12 ? "manha" : "tarde", valor: valorBR(r[col.valor]), forma: formaDe(r[col.forma]), parcelas: Number(r[col.parcelas]) || 1, venc: dataBR(r[col.venc]), sitPag: up(r[col.sitPag]) || null,
      dataPag: dataBR(r[col.dataPag]), fisio: t(r[col.fisio]), sit: up(r[col.sit]), semana: semanaDe(data) });
  }
  linhas.sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));
  return linhas;
}
export function lerTratamentos(arrayBuffer) {
  const rows = lerTabela(arrayBuffer); const { hi, idx } = cabecalho(rows, "Tratamento");
  const col = { id: idx("ID #"), pac: idx("ID Paciente"), nome: idx("Paciente"), origem: idx("Origem Lead"), trat: idx("Tratamento"), local: idx("Local"), grau: idx("Grau"), tipo: idx("Tipo"), preco: idx("Preço"), forma: idx("Forma de Pagamento"),
    sitFin: idx("Situação Financeira"), fisio: idx("Fisioterapeuta"), lanc: idx("Data de Lançamento"), status: idx("Status") };
  const faltando = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => k); if (faltando.length) throw new Error("Tratamentos: colunas ausentes: " + faltando.join(", "));
  const linhas = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r || !r[col.pac]) continue; const data = dataBR(r[col.lanc]); if (!data) continue;
    const partes = [t(r[col.trat]), t(r[col.local]) !== "N/A" ? t(r[col.local]) : null, t(r[col.grau]) !== "N/A" ? t(r[col.grau]) : null, t(r[col.tipo]) !== "N/A" ? t(r[col.tipo]) : null].filter(Boolean);
    const meses = (String(r[col.trat] || "").match(/(\d+)\s*M/i) || [])[1];
    linhas.push({ id: t(r[col.id]), paciente_id: t(r[col.pac]), paciente: t(r[col.nome]), origem: t(r[col.origem]), canal: canalDe(r[col.origem]), tratamento: t(r[col.trat]), descricao: partes.join(" · "), meses: meses ? Number(meses) : null,
      preco: valorBR(r[col.preco]), forma: formaDe(r[col.forma]), sitFin: up(r[col.sitFin]) || null, fisio: t(r[col.fisio]), data, semana: semanaDe(data), status: up(r[col.status]) });
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}
export function lerReceber(arrayBuffer) {
  const rows = lerTabela(arrayBuffer); const { hi, idx } = cabecalho(rows, "Tipo de Recebimento");
  // o cabeçalho exportado tem uma coluna a menos que os dados: após "Vencimento" vêm Data de Pagamento e Situação
  const col = { codigo: idx("Código #"), unidade: idx("Unidade"), paciente: idx("Paciente"), descricao: idx("Descrição"), prof: idx("Profissional"), tipo: idx("Tipo de Recebimento"), valor: idx("Valor"), forma: idx("Forma de Pagamento"), parcela: idx("Parcela"), venc: idx("Vencimento") };
  const faltando = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => k); if (faltando.length) throw new Error("Contas a receber: colunas ausentes: " + faltando.join(", "));
  const linhas = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r || !r[col.codigo] || !r[col.paciente]) continue;
    const venc = dataBR(r[col.venc]); if (!venc) continue;
    const resto = r.slice(col.venc + 1).map(x => t(x)).filter(Boolean);
    const sit = up(resto.find(x => /^(PAGO|PENDENTE|CANCELADO|ATRASADO)$/i.test(x)) || ""), pag = dataBR(resto.find(x => /\d{2}\/\d{2}\/\d{4}/.test(x)) || "");
    const tipo = up(r[col.tipo]), descricao = t(r[col.descricao]);
    // parcela pendente cuja descrição indica erro/duplicidade/cancelamento/troca de forma de pagamento: tratada como cancelada (não entra na inadimplência)
    const cancelada = sit !== "PAGO" && /errad|duplic|\berro\b|cancelad|desist|mudou/i.test(descricao || "");
    linhas.push({ codigo: t(r[col.codigo]), paciente: t(r[col.paciente]), descricao, profissional: t(r[col.prof]), tipo, avaliacao: tipo === "AVALIAÇÃO", valor: valorBR(r[col.valor]), forma: formaDe(r[col.forma]),
      parcela: Number(r[col.parcela]) || 1, venc, pago: sit === "PAGO", cancelada, situacao: sit, dataPag: sit === "PAGO" ? (pag || venc) : null });
  }
  return linhas.sort((a, b) => a.venc.localeCompare(b.venc));
}

// ------------------------------------------------------------------ consolidação
export function consolidar({ agend = [], trat = [], receber = [] }) {
  const avisos = [];
  // --- agendamentos
  const primeira = {}; for (const l of agend) if (!primeira[l.paciente_id]) primeira[l.paciente_id] = l.id;
  for (const l of agend) l.avaliacao = primeira[l.paciente_id] === l.id;
  const sem = {}, fis = {}, canais = {};
  const S = id => (sem[id] ||= { id_semana: id, aval_agendadas: 0, aval_realizadas: 0, aval_canceladas: 0, aval_faltas: 0, cancel_atendimentos: 0, faltas: 0, novos_pacientes: 0, atendimentos: 0, horarios_ocup_manha: 0, horarios_ocup_tarde: 0 });
  const F = (semana, fisio) => (fis[semana + "|" + fisio] ||= { id_semana: semana, fisio, aval_realizadas: 0, atendimentos: 0, contratos: 0 });
  for (const l of agend) {
    const s = S(l.semana), realizado = l.sit === "ATENDIDO", desmarcado = l.sit === "DESMARCADO", falta = l.sit === "NÃO COMPARECEU";
    if (l.avaliacao) { s.aval_agendadas++; if (realizado) { s.aval_realizadas++; s.novos_pacientes++; } if (desmarcado) s.aval_canceladas++; if (falta) s.aval_faltas++; const c = (canais[l.semana] ||= {}); c[l.canal] = (c[l.canal] || 0) + 1; }
    if (realizado) s.atendimentos++;
    if (desmarcado || falta) s.cancel_atendimentos++; if (falta) s.faltas++;
    if (!desmarcado) s[l.turno === "manha" ? "horarios_ocup_manha" : "horarios_ocup_tarde"]++;
    if (l.fisio && realizado) { const f = F(l.semana, l.fisio); f.atendimentos++; if (l.avaliacao) f.aval_realizadas++; }
  }
  // --- tratamentos + parcelas do contas a receber
  const porPaciente = {}; for (const p of receber) if (!p.avaliacao && !p.cancelada) (porPaciente[norm(p.paciente)] ||= []).push(p);
  const tratPorPac = {}; for (const c of trat) (tratPorPac[norm(c.paciente)] ||= []).push(c);
  const diasEntre = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
  for (const c of trat) c.parcelas = [];
  for (const [pac, lista] of Object.entries(tratPorPac)) {
    for (const p of porPaciente[pac] || []) {
      const dv = new Date(p.venc + "T00:00:00"); dv.setMonth(dv.getMonth() - (p.parcela - 1)); const estimada = dv.toISOString().slice(0, 10);
      const alvo = lista.length === 1 ? lista[0] : lista.slice().sort((a, b) => diasEntre(a.data, estimada) - diasEntre(b.data, estimada))[0];
      alvo.parcelas.push(p); p.tratamento_id = alvo.id;
    }
  }
  const semTrat = receber.filter(p => !p.avaliacao && !p.cancelada && !p.tratamento_id); if (semTrat.length) avisos.push(`${semTrat.length} parcela(s) de protocolo sem tratamento correspondente (ex.: ${[...new Set(semTrat.map(p => p.paciente))].slice(0, 3).join(", ")}) — entram como receita, sem contrato.`);
  const H = hoje();
  for (const c of trat) {
    c.valor = c.parcelas.reduce((a, p) => a + p.valor, 0) || c.preco || 0; c.n_parcelas = c.parcelas.length || null;
    c.atrasadas = c.parcelas.filter(p => !p.pago && p.venc < H).length; c.pendentes = c.parcelas.filter(p => !p.pago).length;
    c.status_pagamento = !c.parcelas.length ? (c.sitFin === "PAGO" ? "Pago" : "Pendente") : c.atrasadas ? "Atrasado" : c.pendentes ? "Pendente" : "Pago";
    const formas = c.parcelas.map(p => p.forma).filter(Boolean); c.forma = formas.sort((a, b) => formas.filter(x => x === b).length - formas.filter(x => x === a).length)[0] || c.forma;
    if (c.fisio) F(c.semana, c.fisio).contratos++;
  }
  const semValor = trat.filter(c => !c.valor).length; if (semValor) avisos.push(`${semValor} tratamento(s) sem valor (sem parcelas no contas a receber).`);
  const canc = receber.filter(p => p.cancelada); if (canc.length) avisos.push(`${canc.length} parcela(s) pendente(s) com descrição de erro/duplicidade/cancelamento/troca de forma de pagamento (R$ ${canc.reduce((a, p) => a + p.valor, 0).toFixed(2)}) serão gravadas como "Cancelado" e não entram na inadimplência.`);
  const fisios = [...new Set([...agend.map(l => l.fisio), ...trat.map(c => c.fisio)].filter(Boolean))];
  const avaliacoesPagas = agend.filter(l => l.avaliacao && l.valor > 0);
  const semanasSet = new Set([...Object.keys(sem), ...trat.map(c => c.semana), ...receber.map(p => semanaDe(p.dataPag || p.venc))]);
  const semanas = [...semanasSet].sort();
  const unidades = [...new Set(agend.map(l => l.unidade).filter(Boolean))];
  return { semanas, porSemana: Object.values(sem).sort((a, b) => a.id_semana.localeCompare(b.id_semana)), porFisio: Object.values(fis), canais, fisios, avaliacoesPagas, trat, receber, avisos, unidadeRelatorio: unidades.join(", "),
    totais: { agendamentos: agend.length, pacientes: Object.keys(primeira).length, atendidos: agend.filter(l => l.sit === "ATENDIDO").length, desmarcados: agend.filter(l => l.sit === "DESMARCADO").length, faltas: agend.filter(l => l.sit === "NÃO COMPARECEU").length,
      avaliacoes: Object.keys(primeira).length, avaliacoesPagas: avaliacoesPagas.length, tratamentos: trat.length, valorTratamentos: trat.reduce((a, c) => a + c.valor, 0), parcelas: receber.length,
      recebido: receber.filter(p => p.pago).reduce((a, p) => a + p.valor, 0), pendente: receber.filter(p => !p.pago && !p.cancelada && p.venc >= H).reduce((a, p) => a + p.valor, 0), atrasado: receber.filter(p => !p.pago && !p.cancelada && p.venc < H).reduce((a, p) => a + p.valor, 0),
      canceladas: receber.filter(p => p.cancelada).length, valorCanceladas: receber.filter(p => p.cancelada).reduce((a, p) => a + p.valor, 0),
      de: semanas[0], ate: semanas[semanas.length - 1] } };
}

/** Casa o nome do relatório ("ARIOSTO BERNARDES", "DR. ARIOSTO SOUZA BERNARDES") com os cadastrados ("Ariosto"). */
function casarFisio(nome, cadastrados) {
  const n = norm(nome).replace(/^dra?\.?\s+/, ""); if (!n) return null;
  const partes = n.split(" ").filter(p => p.length > 2);
  return cadastrados.find(f => norm(f.nome) === n) || cadastrados.find(f => partes[0] && norm(f.nome).split(" ")[0] === partes[0]) || cadastrados.find(f => partes.some(p => norm(f.nome).includes(p))) || null;
}

// ------------------------------------------------------------------ gravação
export async function gravar(cons, ctx, arquivos, unidade, onProgress = () => {}, opts = {}) {
  const cid = ctx.clinica_id, uid = ctx.unidade_id, u = { clinica_id: cid, unidade_id: uid };
  const filtro = s => (!opts.de || s >= opts.de) && (!opts.ate || s <= opts.ate);
  const avisos = [...cons.avisos]; const H = hoje();
  onProgress("Fisioterapeutas", 0.05);
  const cadastrados = await Fisios.listar(u);
  for (const nome of cons.fisios) if (!casarFisio(nome, cadastrados)) {
    const slot = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(s => !cadastrados.some(f => f.slot === s)); const primeiro = nome.replace(/^DRA?\.?\s+/i, "").split(" ")[0];
    const novo = await Fisios.salvar({ clinica_id: cid, unidade_id: uid, slot, nome: primeiro[0] + primeiro.slice(1).toLowerCase(), ativo: true }); cadastrados.push(novo); avisos.push(`Fisioterapeuta "${nome}" cadastrado como "${novo.nome}" (slot ${slot}).`);
  }
  const fid = nome => casarFisio(nome, cadastrados)?.id || null;
  const lote = async (tabela, rows, conflito) => { for (let i = 0; i < rows.length; i += 400) unwrap(await sb.from(tabela).upsert(rows.slice(i, i + 400), { onConflict: conflito })); };
  const resumo = { origem: "franquia", arquivos, semanas: cons.semanas.filter(filtro), base_semanal: 0, base_fisio: 0, leads_canal: 0, contratos_avaliacao: 0, contratos_protocolo: 0, lancamentos: 0 };

  if (cons.porSemana.length) {
    onProgress("Base semanal (agendamentos)", 0.2);
    const capM = unidade?.cap_manha_semana, capT = unidade?.cap_tarde_semana;
    const base = cons.porSemana.filter(s => filtro(s.id_semana)).map(s => ({ clinica_id: cid, unidade_id: uid, id_semana: s.id_semana, aval_agendadas: s.aval_agendadas, aval_canceladas: s.aval_canceladas + s.aval_faltas, cancel_atendimentos: s.cancel_atendimentos, faltas: s.faltas,
      novos_pacientes: s.novos_pacientes, horarios_ocup_manha: s.horarios_ocup_manha, horarios_ocup_tarde: s.horarios_ocup_tarde, ...(capM ? { horarios_disp_manha: capM } : {}), ...(capT ? { horarios_disp_tarde: capT } : {}), updated_at: new Date().toISOString() }));
    await lote("base_semanal", base, "clinica_id,unidade_id,id_semana"); resumo.base_semanal = base.length;
    if (!capM || !capT) avisos.push("Defina a capacidade semanal de horários (manhã/tarde) em Cadastros → Unidades para calcular a taxa de ocupação.");
    const lc = []; for (const [semana, m] of Object.entries(cons.canais)) if (filtro(semana)) for (const [canal, q] of Object.entries(m)) lc.push({ clinica_id: cid, unidade_id: uid, id_semana: semana, canal, quantidade: q });
    await lote("leads_canal", lc, "clinica_id,unidade_id,id_semana,canal"); resumo.leads_canal = lc.length;
  }
  if (cons.porFisio.length) {
    onProgress("Atendimentos e contratos por fisioterapeuta", 0.35);
    // garante que a semana exista na base (tratamento numa semana sem agendamentos)
    const semanasFis = [...new Set(cons.porFisio.filter(f => filtro(f.id_semana)).map(f => f.id_semana))].filter(s => !cons.porSemana.some(x => x.id_semana === s));
    if (semanasFis.length) await lote("base_semanal", semanasFis.map(s => ({ clinica_id: cid, unidade_id: uid, id_semana: s })), "clinica_id,unidade_id,id_semana");
    const rowsF = cons.porFisio.filter(f => filtro(f.id_semana) && fid(f.fisio)).map(f => ({ clinica_id: cid, unidade_id: uid, id_semana: f.id_semana, fisioterapeuta_id: fid(f.fisio), aval_realizadas: f.aval_realizadas, atendimentos: f.atendimentos, ...(cons.trat.length ? { contratos: f.contratos } : {}) }));
    await lote("base_semanal_fisio", rowsF, "clinica_id,unidade_id,id_semana,fisioterapeuta_id"); resumo.base_fisio = rowsF.length;
  }
  if (cons.avaliacoesPagas.length && opts.gravarContratos !== false) {
    onProgress("Contratos de avaliação", 0.5);
    const ct = cons.avaliacoesPagas.filter(l => filtro(l.semana)).map(l => ({ clinica_id: cid, unidade_id: uid, data: l.data, paciente: l.paciente, tipo: "Avaliação", fisioterapeuta_id: fid(l.fisio), descricao: "Avaliação", n_sessoes: 1, valor: l.valor,
      condicao: l.parcelas > 1 ? "Parcelado" : "À vista", forma_pagamento: l.forma, parcelas: l.parcelas, status_pagamento: l.sitPag === "PAGO" ? "Pago" : (l.venc && l.venc < H ? "Atrasado" : "Pendente"), canal: l.canal, ref_externa: "agend:" + l.id }));
    await lote("contratos", ct, "clinica_id,ref_externa"); resumo.contratos_avaliacao = ct.length;
  }
  if (cons.trat.length && opts.gravarContratos !== false) {
    onProgress("Contratos de protocolo (tratamentos)", 0.65);
    const ct = cons.trat.filter(c => filtro(c.semana)).map(c => ({ clinica_id: cid, unidade_id: uid, data: c.data, paciente: c.paciente, tipo: "Protocolo", fisioterapeuta_id: fid(c.fisio), descricao: c.descricao + (c.status ? ` (${c.status.toLowerCase()})` : ""), n_sessoes: null,
      valor: c.valor, condicao: (c.n_parcelas || 1) > 1 ? "Parcelado" : "À vista", forma_pagamento: c.forma, parcelas: c.n_parcelas || 1, status_pagamento: c.status_pagamento, canal: c.canal, ref_externa: "trat:" + c.id }));
    await lote("contratos", ct, "clinica_id,ref_externa"); resumo.contratos_protocolo = ct.length;
  }
  if (cons.receber.length && opts.gravarReceitas !== false) {
    onProgress("Receitas (parcelas do contas a receber)", 0.8);
    const lanc = cons.receber.filter(p => filtro(semanaDe(p.dataPag || p.venc))).map(p => ({ clinica_id: cid, unidade_id: uid, data: p.dataPag || p.venc, categoria: "Receita", descricao: `${p.avaliacao ? "Avaliação" : "Protocolo"} — ${p.paciente} (parcela ${p.parcela})`,
      valor: p.valor, status: p.pago ? "Pago" : p.cancelada ? "Cancelado" : (p.venc < H ? "Atrasado" : "Pendente"), vencimento: p.venc, contraparte: p.paciente, observacoes: p.descricao, ref_externa: "rec:" + p.codigo }));
    await lote("lancamentos", lanc, "clinica_id,ref_externa"); resumo.lancamentos = lanc.length;
  } else if (cons.avaliacoesPagas.length && opts.gravarReceitas !== false) {
    onProgress("Receitas de avaliação (do relatório de agendamentos)", 0.8);
    const lanc = cons.avaliacoesPagas.filter(l => filtro(l.semana) && l.sitPag).map(l => ({ clinica_id: cid, unidade_id: uid, data: l.dataPag || l.data, categoria: "Receita", descricao: `Avaliação — ${l.paciente}`, valor: l.valor, status: l.sitPag === "PAGO" ? "Pago" : "Pendente", vencimento: l.venc, contraparte: l.paciente, ref_externa: "agend:" + l.id }));
    await lote("lancamentos", lanc, "clinica_id,ref_externa"); resumo.lancamentos = lanc.length;
  }
  resumo.avisos = avisos;
  await Importacoes.registrar({ clinica_id: cid, unidade_id: uid, user_id: ctx.session.user.id, arquivo: arquivos.join(" + "), resumo });
  onProgress("Concluído", 1);
  return resumo;
}
