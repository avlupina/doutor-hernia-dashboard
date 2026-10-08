// Cadastros — clínica, unidades, fisioterapeutas e configuração do assistente de IA.
import { Fisios, Unidades, Clinica } from "../api.js";
import { getPerfil } from "../supabase.js";
import { el, secao, input, campo, botao, toast, erro, tabela, fmt } from "../ui.js";

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
    { k: "ativa", t: "Ativa", f: (v, r) => { const c = el("input", { type: "checkbox" }); c.checked = v; c.onchange = async () => { try { await Unidades.salvar({ ...r, ativa: c.checked }); await ctx.recarregarUnidades(); toast("Unidade atualizada.", "ok"); } catch (e) { erro(e); } }; return c; } },
    { k: "id", t: "", f: (v, r) => botao("editar", () => formUnidade(r), "btn sec mini") },
  ], ctx.unidades, { vazio: "Nenhuma unidade." }));
  desenharUnidades();
  const uForm = el("div");
  function formUnidade(r = {}) {
    const f = { nome: input({ value: r.nome || "" }), cidade: input({ value: r.cidade || "" }), uf: input({ value: r.uf || "BA", maxlength: 2 }), inicio: input({ type: "date", value: r.inicio || "" }) };
    uForm.replaceChildren(el("h3", {}, r.id ? "Editar unidade" : "Nova unidade"), el("div", { class: "form-grid" }, campo("Nome", f.nome), campo("Cidade", f.cidade), campo("UF", f.uf), campo("Início das operações", f.inicio)),
      el("div", { class: "form-acoes" }, botao("Salvar unidade", async () => {
        try {
          await Unidades.salvar({ ...(r.id ? { id: r.id } : {}), clinica_id: ctx.clinica_id, nome: f.nome.value.trim(), cidade: f.cidade.value.trim(), uf: f.uf.value.trim().toUpperCase(), inicio: f.inicio.value || null, ativa: r.ativa ?? true });
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
