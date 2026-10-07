// Metas e equipe — nome da clínica, fisioterapeutas e metas semanais/mensais.
import { Fisios, Metas, Clinica } from "../api.js";
import { getPerfil } from "../supabase.js";
import { el, secao, input, campo, botao, toast, erro, tabela, fmt } from "../ui.js";

export async function render(root, ctx) {
  if (!ctx.editor) { root.append(secao("Acesso", el("p", {}, "Apenas administradores e gestores alteram metas e equipe."))); return; }
  const [fisios, metas] = await Promise.all([Fisios.listar(ctx.clinica_id), Metas.listar(ctx.clinica_id)]);
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Metas e equipe"))));

  if (ctx.admin) {
    const nome = input({ value: ctx.perfil.clinica_nome || "" });
    root.append(secao("Clínica", el("div", { class: "form-grid" }, campo("Nome da clínica", nome)),
      el("div", { class: "form-acoes" }, botao("Salvar", async () => { try { await Clinica.renomear(ctx.clinica_id, nome.value); await getPerfil(true); toast("Nome salvo.", "ok"); } catch (e) { erro(e); } }))));
  }

  const slots = [1, 2, 3, 4].map(slot => { const f = fisios.find(x => x.slot === slot); return { slot, f, nome: input({ value: f?.nome || "", placeholder: slot <= 2 ? `Fisio ${slot} na planilha` : "opcional" }), ativo: el("input", { type: "checkbox" }) }; });
  slots.forEach(s => s.ativo.checked = s.f ? s.f.ativo : true);
  root.append(secao("Fisioterapeutas", el("p", { class: "nota" }, "Os slots 1 e 2 correspondem a “Fisio 1” e “Fisio 2” da planilha. Mantenha os nomes iguais aos usados na aba Contratos."),
    el("div", { class: "form-grid" }, ...slots.map(s => el("div", {}, campo(`Fisio ${s.slot}`, s.nome), el("label", { class: "nota" }, s.ativo, " ativo")))),
    el("div", { class: "form-acoes" }, botao("Salvar equipe", async () => {
      try {
        for (const s of slots) if (s.nome.value.trim()) await Fisios.salvar({ ...(s.f ? { id: s.f.id } : {}), clinica_id: ctx.clinica_id, slot: s.slot, nome: s.nome.value.trim(), ativo: s.ativo.checked });
        toast("Equipe salva.", "ok");
      } catch (e) { erro(e); }
    }))));

  const lista = Object.values(metas);
  const campos = lista.map(m => ({ m, s: input({ type: "number", step: "any", value: m.meta_semanal ?? "" }), mm: input({ type: "number", step: "any", value: m.meta_mensal ?? "" }) }));
  root.append(secao("Metas", el("p", { class: "nota" }, "Taxas em fração (0,85 = 85%). Valores em R$ para receita, gastos e marketing."),
    tabela([{ k: "m", t: "Indicador", f: m => m.indicador + (m.padrao ? " (padrão)" : "") }, { k: "s", t: "Meta semanal" }, { k: "mm", t: "Meta mensal" }], campos),
    el("div", { class: "form-acoes" }, botao("Salvar metas", async () => {
      try { await Metas.salvar(ctx.clinica_id, campos.map(c => ({ indicador: c.m.indicador, meta_semanal: c.s.value === "" ? null : Number(c.s.value), meta_mensal: c.mm.value === "" ? null : Number(c.mm.value) }))); toast("Metas salvas.", "ok"); }
      catch (e) { erro(e); }
    }))));
}
