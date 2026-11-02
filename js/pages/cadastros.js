// Cadastros — clínica, unidades, fisioterapeutas e configuração do assistente de IA.
import { Fisios, Unidades, Clinica, Inter } from "../api.js";
import { getPerfil } from "../supabase.js";
import { el, secao, input, campo, botao, toast, erro, tabela, fmt, textarea } from "../ui.js";

async function secaoInter(ctx) {
  const atual = await Inter.integracao(ctx.unidade_id);
  const status = el("div");
  const desenharStatus = (i) => status.replaceChildren(!i ? el("p", { class: "nota" }, "Nenhuma integração cadastrada para esta unidade.")
    : el("div", { class: "grid grid-kpi" },
      el("div", { class: "kpi" }, el("div", { class: "kpi-titulo" }, "Saldo disponível"), el("div", { class: "kpi-valor" }, fmt.brl(i.saldo)), el("div", { class: "kpi-linhas" }, el("span", { class: "kpi-sub" }, i.saldo_em ? "em " + fmt.data(i.saldo_em) : "ainda não consultado"))),
      el("div", { class: "kpi" }, el("div", { class: "kpi-titulo" }, "Última sincronização"), el("div", { class: "kpi-valor", style: "font-size:18px" }, i.ultima_sync ? new Date(i.ultima_sync).toLocaleString("pt-BR") : "nunca"), el("div", { class: "kpi-linhas" }, el("span", { class: "kpi-sub" }, "Client ID " + (i.client_id ? "…" + i.client_id.slice(-6) : "—")))),
      el("div", { class: "kpi" }, el("div", { class: "kpi-titulo" }, "Situação"), el("div", { class: "kpi-valor", style: "font-size:18px" }, i.ultimo_erro ? "erro" : i.ativo ? "ativa" : "inativa"), i.ultimo_erro ? el("div", { class: "kpi-linhas" }, el("span", { class: "kpi-sub", style: "color:var(--ruim)" }, i.ultimo_erro)) : null)));
  desenharStatus(atual);

  const f = {
    clientId: input({ value: atual?.client_id || "", autocomplete: "off", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }),
    secret: input({ type: "password", autocomplete: "new-password", placeholder: atual ? "(mantido — preencha só para trocar)" : "" }),
    cert: textarea({ rows: 3, placeholder: atual ? "(mantido — cole ou envie o arquivo só para trocar)" : "-----BEGIN CERTIFICATE----- …" }),
    key: textarea({ rows: 3, placeholder: atual ? "(mantida — cole ou envie o arquivo só para trocar)" : "-----BEGIN PRIVATE KEY----- …" }),
    conta: input({ value: atual?.conta_corrente || "", placeholder: "só se o CNPJ tiver mais de uma conta" }),
    desde: input({ type: "date", value: atual?.sync_desde || "2025-07-01" }),
    cobranca: el("input", { type: "checkbox" }),
  };
  f.cobranca.checked = atual ? /boleto-cobranca/.test(atual.escopos) : true;
  const arquivo = (alvo, accept) => { const i = el("input", { type: "file", accept, class: "input" }); i.onchange = async () => { const a = i.files?.[0]; if (a) alvo.value = await a.text(); }; return i; };

  const sincronizar = async (acao) => {
    if (!atual && !f.clientId.value) return toast("Cadastre as credenciais primeiro.", "erro");
    const b = acao === "testar" ? btnTestar : btnSync; b.disabled = true; b.textContent = acao === "testar" ? "Testando…" : "Sincronizando…";
    try {
      const r = await Inter.sincronizar(ctx.unidade_id, acao);
      toast(acao === "testar" ? `Conexão OK. Saldo disponível: ${fmt.brl(r.saldo)}` : `Sincronizado: ${r.extrato} itens de extrato, ${r.cobrancas} cobranças, ${r.conciliados} créditos conciliados.`, "ok");
      desenharStatus(await Inter.integracao(ctx.unidade_id));
    } catch (e) { erro(e); desenharStatus(await Inter.integracao(ctx.unidade_id)); }
    finally { b.disabled = false; b.textContent = acao === "testar" ? "Testar conexão" : "Sincronizar agora"; }
  };
  const btnTestar = botao("Testar conexão", () => sincronizar("testar"), "btn sec"), btnSync = botao("Sincronizar agora", () => sincronizar("sincronizar"), "btn sec");

  return secao(`Banco Inter — ${ctx.unidade.nome}`,
    el("p", { class: "nota" }, "No Inter Empresas: Integrar → Nova Integração → marque API Banking (extrato e saldo) e API Cobrança → baixe Client ID, Client Secret, certificado (.crt) e chave (.key). ",
      "Eles só podem ser baixados uma vez. O segredo, o certificado e a chave ficam guardados no servidor e não são exibidos de volta aqui."),
    status,
    el("div", { class: "form-grid" },
      campo("Client ID", f.clientId), campo("Client Secret", f.secret),
      campo("Conta corrente (opcional)", f.conta), campo("Sincronizar extrato desde", f.desde, "Primeiro dia a buscar no extrato (histórico)."),
      el("label", { class: "campo" }, el("span", { class: "campo-label" }, "Escopos"), el("label", { class: "nota" }, f.cobranca, " incluir API Cobrança (boletos e Pix cobrança emitidos pelo Inter)"))),
    el("div", { class: "form-grid", style: "margin-top:12px" },
      el("div", {}, campo("Certificado (Inter_API_Certificado.crt)", f.cert), arquivo(f.cert, ".crt,.pem,.cer,.txt")),
      el("div", {}, campo("Chave privada (Inter_API_Chave.key)", f.key), arquivo(f.key, ".key,.pem,.txt"))),
    el("div", { class: "form-acoes" }, botao("Salvar credenciais", async () => {
      try {
        const row = { clinica_id: ctx.clinica_id, unidade_id: ctx.unidade_id, nome: "Banco Inter", client_id: f.clientId.value.trim() || null, conta_corrente: f.conta.value.trim() || null,
          sync_desde: f.desde.value || "2025-07-01", escopos: f.cobranca.checked ? "extrato.read boleto-cobranca.read" : "extrato.read", ativo: true };
        if (f.secret.value.trim()) row.client_secret = f.secret.value.trim();
        if (f.cert.value.trim()) row.certificado = f.cert.value.trim();
        if (f.key.value.trim()) row.chave_privada = f.key.value.trim();
        if (!atual && !(row.client_secret && row.certificado && row.chave_privada)) return toast("Informe Client Secret, certificado e chave.", "erro");
        await Inter.salvarIntegracao(row);
        f.secret.value = f.cert.value = f.key.value = "";
        toast("Credenciais salvas. Use “Testar conexão”.", "ok");
        desenharStatus(await Inter.integracao(ctx.unidade_id));
      } catch (e) { erro(e); }
    }), btnTestar, btnSync, el("a", { href: "#/banco", class: "btn sec" }, "Abrir Conciliação Bancária")));
}

export async function render(root, ctx) {
  if (!ctx.editor) { root.append(secao("Acesso", el("p", {}, "Apenas administradores e gestores alteram cadastros."))); return; }
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Cadastros"))));

  if (ctx.admin) {
    const nome = input({ value: ctx.perfil.clinica_nome || "" });
    root.append(secao("Clínica", el("div", { class: "form-grid" }, campo("Nome da clínica / franquia", nome)),
      el("div", { class: "form-acoes" }, botao("Salvar", async () => { try { await Clinica.renomear(ctx.clinica_id, nome.value); await getPerfil(true); document.getElementById("nav-clinica").textContent = nome.value; toast("Nome salvo.", "ok"); } catch (e) { erro(e); } }))));
  }

  // ---- unidades
  const uLista = el("div");
  const desenharUnidades = () => uLista.replaceChildren(tabela([
    { k: "nome", t: "Unidade" }, { k: "cidade", t: "Cidade" }, { k: "uf", t: "UF" }, { k: "inicio", t: "Início das operações", f: fmt.data },
    { k: r => r.cap_manha_semana ? `${r.cap_manha_semana} / ${r.cap_tarde_semana || 0}` : "—", t: "Horários/semana (manhã / tarde)", cls: "num" },
    { k: "ativa", t: "Ativa", f: (v, r) => { const c = el("input", { type: "checkbox" }); c.checked = v; c.onchange = async () => { try { await Unidades.salvar({ ...r, ativa: c.checked }); await ctx.recarregarUnidades(); toast("Unidade atualizada.", "ok"); } catch (e) { erro(e); } }; return c; } },
    { k: "id", t: "", f: (v, r) => botao("editar", () => formUnidade(r), "btn sec mini") },
  ], ctx.unidades, { vazio: "Nenhuma unidade." }));
  desenharUnidades();
  const uForm = el("div");
  function formUnidade(r = {}) {
    const f = { nome: input({ value: r.nome || "" }), cidade: input({ value: r.cidade || "" }), uf: input({ value: r.uf || "BA", maxlength: 2 }), inicio: input({ type: "date", value: r.inicio || "" }),
      capM: input({ type: "number", min: 0, value: r.cap_manha_semana ?? "" }), capT: input({ type: "number", min: 0, value: r.cap_tarde_semana ?? "" }) };
    uForm.replaceChildren(el("h3", {}, r.id ? "Editar unidade" : "Nova unidade"), el("div", { class: "form-grid" }, campo("Nome", f.nome), campo("Cidade", f.cidade), campo("UF", f.uf), campo("Início das operações", f.inicio),
      campo("Horários disponíveis por semana — manhã", f.capM, "ex.: 2 fisios × 5 horários × 5 dias = 50. Usado na taxa de ocupação ao importar da franquia."), campo("Horários disponíveis por semana — tarde", f.capT)),
      el("div", { class: "form-acoes" }, botao("Salvar unidade", async () => {
        try {
          await Unidades.salvar({ ...(r.id ? { id: r.id } : {}), clinica_id: ctx.clinica_id, nome: f.nome.value.trim(), cidade: f.cidade.value.trim(), uf: f.uf.value.trim().toUpperCase(), inicio: f.inicio.value || null, ativa: r.ativa ?? true,
            cap_manha_semana: f.capM.value === "" ? null : Number(f.capM.value), cap_tarde_semana: f.capT.value === "" ? null : Number(f.capT.value) });
          await ctx.recarregarUnidades(); ctx.unidades = (await Unidades.listar(ctx.clinica_id)); desenharUnidades(); uForm.replaceChildren(); toast("Unidade salva.", "ok");
        } catch (e) { erro(e); }
      }), botao("Cancelar", () => uForm.replaceChildren(), "btn sec")));
  }
  root.append(secao("Unidades", el("p", { class: "nota" }, "Cada unidade tem seus próprios lançamentos, metas e fisioterapeutas. A unidade selecionada no menu lateral define o contexto das telas."), uLista,
    el("div", { class: "form-acoes" }, botao("+ Nova unidade", () => formUnidade())), uForm));

  // ---- fisioterapeutas da unidade selecionada
  if (!ctx.unidade_id) root.append(secao("Fisioterapeutas", el("p", { class: "nota" }, "Selecione uma unidade no menu lateral para cadastrar os fisioterapeutas.")));
  else {
    const fisios = await Fisios.listar(ctx.u);
    const slots = [1, 2, 3, 4].map(slot => { const f = fisios.find(x => x.slot === slot); return { slot, f, nome: input({ value: f?.nome || "", placeholder: slot <= 2 ? `Fisio ${slot} na planilha` : "opcional" }), ativo: el("input", { type: "checkbox" }) }; });
    slots.forEach(s => s.ativo.checked = s.f ? s.f.ativo : true);
    root.append(secao(`Fisioterapeutas — ${ctx.unidade.nome}`, el("p", { class: "nota" }, "Os slots 1 e 2 correspondem a “Fisio 1” e “Fisio 2” da planilha. Mantenha os nomes iguais aos usados na aba Contratos."),
      el("div", { class: "form-grid" }, ...slots.map(s => el("div", {}, campo(`Fisio ${s.slot}`, s.nome), el("label", { class: "nota" }, s.ativo, " ativo")))),
      el("div", { class: "form-acoes" }, botao("Salvar equipe", async () => {
        try {
          for (const s of slots) if (s.nome.value.trim()) await Fisios.salvar({ ...(s.f ? { id: s.f.id } : {}), clinica_id: ctx.clinica_id, unidade_id: ctx.unidade_id, slot: s.slot, nome: s.nome.value.trim(), ativo: s.ativo.checked });
          toast("Equipe salva.", "ok");
        } catch (e) { erro(e); }
      }))));
  }

  // ---- zerar dados (admin)
  if (ctx.admin && ctx.unidade_id) {
    const confirmar = input({ placeholder: `digite ZERAR para confirmar` });
    root.append(secao(`Zerar dados — ${ctx.unidade.nome}`, el("p", { class: "nota" }, "Apaga todos os lançamentos desta unidade (semanas, contratos, financeiro, leads por canal, reuniões, ações e histórico de importações). Metas, equipe e usuários são mantidos. Não há como desfazer."),
      el("div", { class: "form-grid" }, campo("Confirmação", confirmar)),
      el("div", { class: "form-acoes" }, botao("Zerar dados da unidade", async () => {
        if (confirmar.value.trim().toUpperCase() !== "ZERAR") return toast("Digite ZERAR no campo de confirmação.", "erro");
        try { const r = await Clinica.zerarUnidade(ctx.unidade_id); confirmar.value = ""; toast("Dados apagados: " + Object.entries(r || {}).map(([k, v]) => `${k} ${v}`).join(", "), "ok"); }
        catch (e) { erro(e.message?.includes("zerar_unidade") ? new Error("Função zerar_unidade não encontrada no banco. Aplique supabase/migrations/0005_zerar_unidade.sql no SQL Editor.") : e); }
      }, "btn perigo"))));
  }

  // ---- Banco Inter (admin, por unidade)
  if (ctx.admin) {
    if (!ctx.unidade_id) root.append(secao("Banco Inter", el("p", { class: "nota" }, "Selecione uma unidade no menu lateral para configurar a conta do Banco Inter dela.")));
    else root.append(await secaoInter(ctx));
  }

  // ---- assistente de IA (admin)
  if (ctx.admin) {
    const cfg = (await Clinica.config(ctx.clinica_id)) || {};
    const chave = input({ type: "password", value: cfg.gemini_api_key || "", placeholder: "AIza…", autocomplete: "off" });
    const modelo = input({ value: cfg.gemini_model || "gemini-2.0-flash" });
    const instr = el("textarea", { class: "input", rows: 4 }); instr.value = cfg.assistente_instrucoes || "";
    root.append(secao("Assistente de IA (Gemini)",
      el("p", { class: "nota" }, "Crie uma chave em ", el("a", { href: "https://aistudio.google.com/apikey", target: "_blank" }, "Google AI Studio"), ". A chave fica guardada na clínica e só é lida por usuários autenticados da clínica."),
      el("div", { class: "form-grid" }, campo("Chave da API do Gemini", chave), campo("Modelo", modelo, "ex.: gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-pro")),
      campo("Instruções adicionais para o assistente (opcional)", instr, "Ex.: tom de voz, prioridades da clínica, o que sempre destacar."),
      el("div", { class: "form-acoes" }, botao("Salvar configuração", async () => {
        try { await Clinica.salvarConfig({ clinica_id: ctx.clinica_id, gemini_api_key: chave.value.trim() || null, gemini_model: modelo.value.trim() || "gemini-2.0-flash", assistente_instrucoes: instr.value.trim() || null }); toast("Configuração salva.", "ok"); }
        catch (e) { erro(e); }
      }))));
  }
}
