// Shell da aplicação: autenticação, unidade selecionada, navegação por hash e carregamento das páginas.
import { requireAuth, getPerfil, sair, podeEditar, isAdmin } from "./supabase.js";
import { Unidades } from "./api.js";
import { erro, el } from "./ui.js";

const ROTAS = {
  painel: () => import("./pages/painel.js"),
  mensal: () => import("./pages/mensal.js"),
  fisios: () => import("./pages/fisios.js"),
  financeiro: () => import("./pages/financeiro.js"),
  projecoes: () => import("./pages/projecoes.js"),
  marketing: () => import("./pages/marketing.js"),
  metas: () => import("./pages/metas.js"),
  semana: () => import("./pages/semana.js"),
  importar: () => import("./pages/importar.js"),
  cadastros: () => import("./pages/cadastros.js"),
  usuarios: () => import("./pages/usuarios.js"),
  assistente: () => import("./pages/assistente.js"),
  senha: () => import("./pages/senha.js"),
};

const main = document.getElementById("main");
let ctx = null;

async function iniciar() {
  const session = await requireAuth();
  if (!session) return;
  try {
    const perfil = await getPerfil(true);
    const unidades = await Unidades.listar(perfil.clinica_id);
    ctx = { session, perfil, clinica_id: perfil.clinica_id, editor: podeEditar(perfil), admin: isAdmin(perfil), unidades, unidade_id: null, unidade: null,
      recarregarUnidades: async () => { ctx.unidades = await Unidades.listar(ctx.clinica_id); montarUnidades(); } };
  } catch (e) { erro(e); main.replaceChildren(el("p", {}, "Não foi possível carregar seu perfil. Tente sair e entrar novamente.")); return; }

  document.getElementById("nav-clinica").textContent = ctx.perfil.clinica_nome || "";
  document.getElementById("nav-usuario").textContent = `${ctx.perfil.nome || ctx.perfil.email} · ${ctx.perfil.papel}`;
  document.getElementById("sair").onclick = sair;
  document.querySelectorAll("[data-editor]").forEach(a => a.classList.toggle("oculto", !ctx.editor));
  document.querySelectorAll("[data-admin]").forEach(a => a.classList.toggle("oculto", !ctx.admin));
  montarUnidades();
  window.addEventListener("hashchange", navegar);
  navegar();
}

function montarUnidades() {
  const sel = document.getElementById("nav-unidade");
  const salvo = localStorage.getItem("unidade_id");
  const ativas = ctx.unidades.filter(u => u.ativa);
  sel.replaceChildren(...ativas.map(u => el("option", { value: u.id }, u.nome)));
  if (ativas.length > 1) sel.append(el("option", { value: "" }, "Todas as unidades (consolidado)"));
  const escolhida = ativas.find(u => u.id === salvo) ? salvo : (ativas[0]?.id || "");
  sel.value = escolhida;
  aplicarUnidade(escolhida);
  sel.onchange = () => { aplicarUnidade(sel.value); localStorage.setItem("unidade_id", sel.value); navegar(); };
}

function aplicarUnidade(id) {
  ctx.unidade_id = id || null;
  ctx.unidade = ctx.unidades.find(u => u.id === id) || null;
  ctx.u = { clinica_id: ctx.clinica_id, unidade_id: ctx.unidade_id };
  ctx.unidadePrincipal = ctx.unidade_id || ctx.unidades.find(u => u.ativa)?.id || null; // para gravações no modo consolidado
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
