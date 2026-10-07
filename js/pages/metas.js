// Metas — metas semanais e mensais por unidade.
import { Metas } from "../api.js";
import { el, secao, input, botao, toast, erro, tabela } from "../ui.js";

export async function render(root, ctx) {
  if (!ctx.editor) { root.append(secao("Acesso", el("p", {}, "Apenas administradores e gestores alteram metas."))); return; }
  if (!ctx.unidade_id) { root.append(secao("Selecione uma unidade", el("p", {}, "As metas são definidas por unidade. Escolha a unidade no menu lateral."))); return; }
  const metas = await Metas.listar(ctx.u);
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Metas — " + ctx.unidade.nome), el("p", { class: "sub", style: "margin:0" }, "Taxas em fração (0,85 = 85%). Valores em R$ para receita, gastos e marketing."))));
  const campos = Object.values(metas).map(m => ({ m, s: input({ type: "number", step: "any", value: m.meta_semanal ?? "" }), mm: input({ type: "number", step: "any", value: m.meta_mensal ?? "" }) }));
  root.append(secao("Metas financeiras e operacionais",
    tabela([{ k: "m", t: "Indicador", f: m => m.indicador + (m.padrao ? "  (padrão)" : "") }, { k: "s", t: "Meta semanal" }, { k: "mm", t: "Meta mensal" }], campos),
    el("div", { class: "form-acoes" }, botao("Salvar metas", async () => {
      try { await Metas.salvar(ctx.u, campos.map(c => ({ indicador: c.m.indicador, meta_semanal: c.s.value === "" ? null : Number(c.s.value), meta_mensal: c.mm.value === "" ? null : Number(c.mm.value) }))); toast("Metas salvas.", "ok"); }
      catch (e) { erro(e); }
    }))));
}
