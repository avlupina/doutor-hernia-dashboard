// Redefinição de senha (destino do link de recuperação).
import { sb } from "../supabase.js";
import { el, secao, input, campo, botao, toast, erro } from "../ui.js";

export async function render(root) {
  const s1 = input({ type: "password", minlength: 6 }), s2 = input({ type: "password", minlength: 6 });
  root.append(el("h1", {}, "Nova senha"), secao("Defina sua nova senha", el("div", { class: "form-grid" }, campo("Nova senha", s1), campo("Repita a senha", s2)),
    el("div", { class: "form-acoes" }, botao("Salvar", async () => {
      if (s1.value.length < 6) return toast("A senha precisa ter ao menos 6 caracteres.", "erro");
      if (s1.value !== s2.value) return toast("As senhas não coincidem.", "erro");
      try { const { error } = await sb.auth.updateUser({ password: s1.value }); if (error) throw error; toast("Senha alterada.", "ok"); location.hash = "#/painel"; } catch (e) { erro(e); }
    }))));
}
