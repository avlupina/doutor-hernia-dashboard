// Assistente interno de IA (Gemini) — responde com base nos dados da clínica.
// A chave do Gemini fica em clinica_config (lida via função assistente_config). As chamadas vão direto do navegador
// para a API do Google (generativelanguage.googleapis.com).
import { Resumo, Acoes, Metas, Clinica } from "../api.js";
import { el, fmt, secao, botao, textarea, erro } from "../ui.js";
import { agregarMeses } from "./mensal.js";
import { agregarPorSemana } from "./painel.js";

const SUGESTOES = [
  "Resuma o desempenho da última semana e aponte os 3 principais pontos de atenção.",
  "Compare os fisioterapeutas em conversão e atendimentos neste mês.",
  "Qual canal de marketing tem o melhor custo por lead? O que você recomenda?",
  "Estamos acima ou abaixo do ponto de equilíbrio? O que precisa mudar?",
  "Monte a pauta da reunião semanal com base nos números.",
  "Sugira 3 ações 5W2H para melhorar a ocupação da agenda à tarde.",
];

export async function render(root, ctx) {
  const cfg = await Clinica.assistenteConfig().catch(() => null);
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Assistente IA"), el("p", { class: "sub", style: "margin:0" }, "Analisa os dados da unidade selecionada" + (ctx.unidade ? ` (${ctx.unidade.nome})` : " (consolidado)") + " e responde em português."))));
  if (!cfg?.gemini_api_key) {
    root.append(secao("Configuração necessária", el("p", {}, "O assistente usa o Gemini (Google). ", ctx.admin ? el("span", {}, "Cadastre a chave da API em ", el("a", { href: "#/cadastros" }, "Cadastros → Assistente de IA"), ".") : "Peça a um administrador para cadastrar a chave da API em Cadastros.")));
    return;
  }

  const msgs = el("div", { class: "msgs" });
  const entrada = textarea({ placeholder: "Pergunte algo sobre os números da clínica…", rows: 2 });
  const enviar = botao("Enviar", () => perguntar(entrada.value));
  const chips = el("div", { class: "chips" }, ...SUGESTOES.map(s => el("button", { class: "chip", onclick: () => perguntar(s) }, s)));
  const status = el("div", { class: "nota" }, "Carregando dados da clínica…");
  root.append(secao("Conversa", el("div", { class: "chat" }, msgs, chips, el("div", { class: "entrada" }, entrada, enviar), status)));
  entrada.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(entrada.value); } };

  const historico = [];
  let contexto = "";
  try { contexto = await montarContexto(ctx); status.textContent = "Dados carregados. O assistente responde com base neles; confira os números antes de decidir."; }
  catch (e) { status.textContent = "Não foi possível carregar os dados: " + e.message; }

  async function perguntar(texto) {
    texto = (texto || "").trim(); if (!texto) return;
    entrada.value = ""; enviar.disabled = true;
    msgs.append(el("div", { class: "msg user" }, texto));
    const resp = el("div", { class: "msg ia" }, "Pensando…"); msgs.append(resp); resp.scrollIntoView({ behavior: "smooth" });
    historico.push({ role: "user", parts: [{ text: texto }] });
    try {
      const out = await gemini(cfg, sistema(ctx, cfg, contexto), historico);
      historico.push({ role: "model", parts: [{ text: out }] });
      resp.innerHTML = md(out);
    } catch (e) { resp.textContent = "Erro ao consultar o Gemini: " + e.message; historico.pop(); erro(e); }
    finally { enviar.disabled = false; resp.scrollIntoView({ behavior: "smooth" }); }
  }
}

function sistema(ctx, cfg, contexto) {
  return `Você é o assistente de gestão da clínica de fisioterapia "${ctx.perfil.clinica_nome}" (rede Doutor Hérnia), unidade ${ctx.unidade?.nome || "consolidado de todas as unidades"}.
Responda sempre em português do Brasil, de forma objetiva e prática, como um consultor de gestão. Use os dados abaixo como fonte da verdade; quando um dado não existir, diga que não há registro em vez de inventar.
Formate valores em R$ e percentuais no padrão brasileiro. Quando sugerir ações, use o formato 5W2H (o quê, por quê, onde, quando, quem, como, quanto).
Definições: MQL = avaliação agendada; SQL = avaliação realizada; CAC = marketing ÷ novos pacientes; margem de contribuição = (receita − gastos variáveis − impostos) ÷ receita; ponto de equilíbrio = (gastos fixos + marketing) ÷ margem de contribuição. Semanas são ISO (AAAA-Sww, segunda a domingo).
${cfg.assistente_instrucoes ? "Instruções da clínica: " + cfg.assistente_instrucoes : ""}

=== DADOS DA CLÍNICA (JSON) ===
${contexto}`;
}

async function montarContexto(ctx) {
  const [sem, mes, fis, pend, acoes, metas] = await Promise.all([
    Resumo.semanal(ctx.u).then(agregarPorSemana), Resumo.mensal(ctx.u).then(agregarMeses), Resumo.fisios(ctx.u), Resumo.pendencias(ctx.u), Acoes.pendentes(ctx.u), Metas.listar(ctx.u),
  ]);
  const ult = sem.slice(-12);
  const canais = ult.length ? await Resumo.leadsCanal(ctx.u, ult.map(s => s.id_semana)) : [];
  const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k] == null ? null : (typeof o[k] === "string" && !isNaN(o[k]) ? Number(o[k]) : o[k])]));
  const KS = ["id_semana", "mes", "leads", "aval_agendadas", "aval_canceladas", "aval_realizadas", "contratos", "novos_pacientes", "atendimentos", "cancel_atendimentos", "ocupacao_manha", "ocupacao_tarde", "ocupacao_total",
    "taxa_cancel_aval", "conversao_aval_contrato", "valor_avaliacoes", "valor_protocolos", "receitas", "gastos", "gastos_fixos", "gastos_variaveis", "impostos", "marketing", "resultado", "custo_por_lead", "custo_por_mql", "custo_por_sql", "cac"];
  const KM = ["mes", "semanas", "leads", "aval_agendadas", "aval_realizadas", "contratos", "novos_pacientes", "atendimentos", "ocupacao_total", "conversao_aval_contrato", "valor_protocolos", "receitas", "gastos", "gastos_fixos", "gastos_variaveis", "impostos", "marketing", "resultado", "margem_contribuicao", "margem_liquida", "ponto_equilibrio", "custo_por_lead", "custo_por_mql", "custo_por_sql", "cac"];
  return JSON.stringify({
    hoje: new Date().toISOString().slice(0, 10),
    metas: Object.values(metas).map(m => ({ indicador: m.indicador, semanal: m.meta_semanal, mensal: m.meta_mensal })),
    semanas_recentes: ult.map(s => pick(s, KS)),
    meses: mes.map(m => pick(m, KM)),
    fisioterapeutas_por_semana: fis.filter(f => ult.some(s => s.id_semana === f.id_semana)).map(f => pick(f, ["id_semana", "fisioterapeuta", "aval_realizadas", "contratos", "conversao", "atendimentos", "tempo_medio_min", "desvio_min", "valor_contratado"])),
    leads_por_canal: canais.map(c => pick(c, ["id_semana", "canal", "quantidade"])),
    pendencias_e_inadimplencia: pend,
    acoes_em_aberto: acoes.map(a => pick(a, ["id_semana", "problema", "o_que", "quem", "quando", "status"])),
  }, null, 0);
}

async function gemini(cfg, systemText, contents) {
  const model = cfg.gemini_model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.gemini_api_key },
    body: JSON.stringify({ system_instruction: { parts: [{ text: systemText }] }, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 2048 } }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  if (!text) throw new Error(j.candidates?.[0]?.finishReason ? "Resposta bloqueada: " + j.candidates[0].finishReason : "Resposta vazia");
  return text;
}

/** Markdown mínimo e seguro: títulos, negrito, itálico, listas, tabelas, parágrafos. */
function md(t) {
  const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const linhas = esc(t).split("\n"); const out = []; let lista = null, tab = null;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const fechar = () => { if (lista) { out.push(`</${lista}>`); lista = null; } if (tab) { out.push("</table>"); tab = null; } };
  for (const l of linhas) {
    if (/^\s*\|.*\|\s*$/.test(l)) { if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue; if (!tab) { fechar(); out.push("<table>"); tab = true; } out.push("<tr>" + l.trim().slice(1, -1).split("|").map(c => "<td>" + inline(c.trim()) + "</td>").join("") + "</tr>"); continue; }
    if (tab) { out.push("</table>"); tab = null; }
    const h = l.match(/^(#{1,3})\s+(.*)/); if (h) { fechar(); out.push(`<h3>${inline(h[2])}</h3>`); continue; }
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) { const tipo = /^\s*\d/.test(l) ? "ol" : "ul"; if (lista !== tipo) { fechar(); out.push(`<${tipo}>`); lista = tipo; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (!l.trim()) { fechar(); continue; }
    fechar(); out.push(`<p>${inline(l)}</p>`);
  }
  fechar(); return out.join("");
}
