// Importar planilha padronizada.
import { Importacoes } from "../api.js";
import { analisar, gravar } from "../importer.js";
import { el, fmt, secao, tabela, botao, toast, erro } from "../ui.js";

export async function render(root, ctx) {
  if (!ctx.editor) { root.append(secao("Acesso", el("p", {}, "Apenas administradores e gestores importam dados."))); return; }
  if (!ctx.unidade_id) { root.append(secao("Selecione uma unidade", el("p", {}, "Escolha no menu lateral a unidade para a qual a planilha será importada."))); return; }
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Importar Planilha — " + ctx.unidade.nome),
    el("p", { class: "sub", style: "margin:0" }, "Use o modelo Base_Dados_Clinica.xlsx. Semanas já existentes são atualizadas; contratos, lançamentos e ações das semanas presentes no arquivo são substituídos."))));

  const file = el("input", { type: "file", accept: ".xlsx,.xlsm", class: "oculto" });
  const zona = el("div", { class: "dropzone" }, "Arraste a planilha aqui ou clique para selecionar (.xlsx)");
  zona.onclick = () => file.click();
  zona.ondragover = e => { e.preventDefault(); zona.classList.add("ativa"); };
  zona.ondragleave = () => zona.classList.remove("ativa");
  zona.ondrop = e => { e.preventDefault(); zona.classList.remove("ativa"); if (e.dataTransfer.files[0]) processar(e.dataTransfer.files[0]); };
  file.onchange = () => file.files[0] && processar(file.files[0]);
  const preview = el("div");
  root.append(secao("Arquivo", el("p", {}, el("a", { href: "Base_Dados_Clinica.xlsx", download: "" }, "Baixar o modelo da planilha")), zona, file, preview));

  const hist = el("div"); root.append(secao("Importações anteriores", hist));
  await historico();

  async function processar(f) {
    preview.replaceChildren(el("p", { class: "sub" }, "Lendo arquivo…"));
    let dados;
    try { dados = analisar(await f.arrayBuffer()); } catch (e) { erro(e); preview.replaceChildren(el("p", { class: "ruim" }, "Não foi possível ler a planilha: " + e.message)); return; }
    const total = dados.base.length + dados.contratos.length + dados.lancamentos.length + dados.leads.length + dados.reunioes.length + dados.acoes.length;
    const resumo = tabela([{ k: 0, t: "Conteúdo" }, { k: 1, t: "Registros", cls: "num" }], [
      ["Fisioterapeutas (Config)", [dados.fisios[1], dados.fisios[2]].filter(Boolean).join(", ") || "—"], ["Metas (Config)", dados.metas.length],
      ["Base_Semanal (semanas com dados)", dados.base.length], ["Contratos", dados.contratos.length], ["Financeiro (lançamentos)", dados.lancamentos.length],
      ["Leads_Canal", dados.leads.length], ["Reuniao_Semanal", dados.reunioes.length], ["Plano_Acao", dados.acoes.length],
      ["Semanas envolvidas", dados.semanas.join(", ") || "—"]]);
    const avisos = dados.avisos.length ? el("ul", {}, ...dados.avisos.map(a => el("li", { class: "nota" }, a))) : null;
    const barra = el("div", { class: "progresso" }, el("div")); const status = el("div", { class: "nota" });
    const btn = botao(`Importar ${total} registro(s)`, async () => {
      btn.disabled = true;
      try {
        const r = await gravar(dados, ctx, f.name, (txt, p) => { status.textContent = txt; barra.firstChild.style.width = (p * 100) + "%"; });
        toast("Importação concluída.", "ok");
        preview.append(el("p", { class: "ok" }, `Importado: ${r.base_semanal} semanas, ${r.contratos} contratos, ${r.lancamentos} lançamentos, ${r.leads_canal} leads por canal, ${r.reunioes} reuniões, ${r.acoes} ações.`),
          el("p", {}, el("a", { href: "#/painel/" + (r.semanas[r.semanas.length - 1] || "") }, "Abrir o painel da última semana importada →")));
        if (dados.avisos.length) preview.append(el("ul", {}, ...dados.avisos.map(a => el("li", { class: "nota" }, a))));
        await historico();
      } catch (e) { erro(e); btn.disabled = false; }
    });
    preview.replaceChildren(el("h3", {}, `Pré-visualização — ${f.name}`), resumo, avisos, el("div", { class: "form-acoes" }, total ? btn : el("span", { class: "ruim" }, "Nenhum registro reconhecido. Confira se o arquivo segue o modelo."), status), barra);
  }

  async function historico() {
    const rows = await Importacoes.listar(ctx.u);
    hist.replaceChildren(tabela([
      { k: "created_at", t: "Data", f: v => new Date(v).toLocaleString("pt-BR") }, { k: "arquivo", t: "Arquivo" },
      { k: r => r.resumo?.semanas?.join(", "), t: "Semanas" },
      { k: r => `${r.resumo?.base_semanal ?? 0} sem · ${r.resumo?.contratos ?? 0} contr · ${r.resumo?.lancamentos ?? 0} lanç · ${r.resumo?.acoes ?? 0} ações`, t: "Registros" },
    ], rows, { vazio: "Nenhuma importação ainda." }));
  }
}
