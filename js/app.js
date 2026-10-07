// Shell da aplicação: autenticação, navegação por hash e carregamento das páginas.
import { requireAuth, getPerfil, sair, podeEditar, isAdmin } from "./supabase.js";
import { erro, el } from "./ui.js";

const ROTAS = {
  painel: () => import("./pages/painel.js"),
  mensal: () => import("./pages/mensal.js"),
  fisios: () => import("./pages/fisios.js"),
  marketing: () => import("./pages/marketing.js"),
  financeiro: () => import("./pages/financeiro.js"),
  semana: () => import("./pages/semana.js"),
  importar: () => import("./pages/importar.js"),
  config: () => import("./pages/config.js"),
  usuarios: () => import("./pages/usuarios.js"),
  senha: () => import("./pages/senha.js"),
};

const main = document.getElementById("main");
let ctx = null;

async function iniciar() {
  const session = await requireAuth();
  if (!session) return;
  try {
    const perfil = await getPerfil(true);
    ctx = { session, perfil, clinica_id: perfil.clinica_id, editor: podeEditar(perfil), admin: isAdmin(perfil) };
  } catch (e) { erro(e); main.replaceChildren(el("p", {}, "Não foi possível carregar seu perfil. Tente sair e entrar novamente.")); return; }

  document.getElementById("nav-clinica").textContent = ctx.perfil.clinica_nome || "";
  document.getElementById("nav-usuario").textContent = `${ctx.perfil.nome || ctx.perfil.email} · ${ctx.perfil.papel}`;
  document.getElementById("sair").onclick = sair;
  document.querySelectorAll("[data-editor]").forEach(a => a.classList.toggle("oculto", !ctx.editor));
  document.querySelectorAll("[data-admin]").forEach(a => a.classList.toggle("oculto", !ctx.admin));

  window.addEventListener("hashchange", navegar);
  navegar();
}

async function navegar() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [rota, ...resto] = hash.split("/");
  const nome = ROTAS[rota] ? rota : "painel";
  document.querySelectorAll(".sidebar a").forEach(a => a.classList.toggle("ativo", a.getAttribute("href") === "#/" + nome));
  main.replaceChildren(el("p", { class: "sub" }, "Carregando…"));
  try {
    const mod = await ROTAS[nome]();
    const root = el("div");
    await mod.render(root, { ...ctx, params: resto });
    main.replaceChildren(root);
  } catch (e) { erro(e); main.replaceChildren(el("p", {}, "Erro ao carregar a página: " + (e.message || e))); }
}

iniciar();
