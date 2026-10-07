// Usuários e acessos — papéis, ativação e convites (somente admin).
import { Usuarios } from "../api.js";
import { sb } from "../supabase.js";
import { el, secao, input, select, campo, botao, toast, erro, tabela } from "../ui.js";
import { LISTAS } from "../config.js";

const DESCR = { admin: "tudo, inclusive usuários e acessos", gestor: "lança, importa e edita dados e metas", fisio: "consulta painéis (sem edição)", leitura: "consulta painéis (sem edição)" };

export async function render(root, ctx) {
  const s1 = input({ type: "password", minlength: 6, autocomplete: "new-password" }), s2 = input({ type: "password", minlength: 6, autocomplete: "new-password" });
  const minhaSenha = secao("Minha senha", el("div", { class: "form-grid" }, campo("Nova senha", s1), campo("Repita a nova senha", s2)),
    el("div", { class: "form-acoes" }, botao("Alterar minha senha", async () => {
      if (s1.value.length < 6) return toast("A senha precisa ter ao menos 6 caracteres.", "erro");
      if (s1.value !== s2.value) return toast("As senhas não coincidem.", "erro");
      try { const { error } = await sb.auth.updateUser({ password: s1.value }); if (error) throw error; s1.value = s2.value = ""; toast("Senha alterada.", "ok"); } catch (e) { erro(e); }
    })));
  if (!ctx.admin) { root.append(el("h1", {}, "Usuários e Senhas"), minhaSenha); return; }
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Usuários e Senhas"), el("p", { class: "sub", style: "margin:0" }, "Convide pelo e-mail; ao criar a conta com esse e-mail a pessoa entra automaticamente na clínica com o papel definido."))));
  root.append(secao("Papéis", el("dl", { class: "lista-chave" }, ...LISTAS.papeis.flatMap(p => [el("dt", {}, p), el("dd", {}, DESCR[p])]))));

  const lista = el("div"); root.append(secao("Usuários da clínica", lista));
  const email = input({ type: "email", placeholder: "pessoa@exemplo.com" }), papel = select(LISTAS.papeis, {}, "leitura");
  const conv = el("div");
  root.append(secao("Convites", el("div", { class: "form-grid" }, campo("E-mail", email), campo("Papel", papel)),
    el("div", { class: "form-acoes" }, botao("Convidar", async () => {
      try { await Usuarios.convidar({ clinica_id: ctx.clinica_id, email: email.value.trim().toLowerCase(), papel: papel.value, criado_por: ctx.session.user.id }); email.value = ""; toast("Convite registrado. Peça para a pessoa criar a conta com esse e-mail.", "ok"); await convites(); }
      catch (e) { erro(e); }
    })), conv));
  root.append(minhaSenha);
  await usuarios(); await convites();

  async function usuarios() {
    const rows = await Usuarios.listar(ctx.clinica_id);
    lista.replaceChildren(tabela([
      { k: "nome", t: "Nome" }, { k: "email", t: "E-mail" },
      { k: "papel", t: "Papel", f: (v, r) => { if (r.id === ctx.session.user.id) return v + " (você)"; const s = select(LISTAS.papeis, { style: "padding:3px 6px;width:auto" }, v); s.onchange = async () => { try { await Usuarios.atualizar(r.id, { papel: s.value }); toast("Papel atualizado.", "ok"); } catch (e) { erro(e); } }; return s; } },
      { k: "ativo", t: "Ativo", f: (v, r) => { if (r.id === ctx.session.user.id) return v ? "sim" : "não"; const c = el("input", { type: "checkbox" }); c.checked = v; c.onchange = async () => { try { await Usuarios.atualizar(r.id, { ativo: c.checked }); toast(c.checked ? "Usuário ativado." : "Usuário desativado.", "ok"); } catch (e) { erro(e); } }; return c; } },
      { k: "created_at", t: "Desde", f: v => new Date(v).toLocaleDateString("pt-BR") },
    ], rows));
  }
  async function convites() {
    const rows = await Usuarios.convites(ctx.clinica_id);
    conv.replaceChildren(tabela([
      { k: "email", t: "E-mail" }, { k: "papel", t: "Papel" }, { k: "usado_em", t: "Situação", f: v => v ? "aceito em " + new Date(v).toLocaleDateString("pt-BR") : "pendente" },
      { k: "id", t: "", f: (v, r) => r.usado_em ? "" : botao("revogar", async () => { try { await Usuarios.revogar(v); await convites(); } catch (e) { erro(e); } }, "btn perigo mini") },
    ], rows, { vazio: "Nenhum convite." }));
  }
}
