// Importar — duas fontes: relatórios do sistema da franquia (agendamentos, tratamentos, contas a receber) e a planilha padronizada.
import { Importacoes } from "../api.js";
import { analisar, gravar } from "../importer.js";
import * as FR from "../importer_franquia.js";
import { el, fmt, secao, tabela, botao, toast, erro } from "../ui.js";

export async function render(root, ctx) {
  if (!ctx.editor) { root.append(secao("Acesso", el("p", {}, "Apenas administradores e gestores importam dados."))); return; }
  if (!ctx.unidade_id) { root.append(secao("Selecione uma unidade", el("p", {}, "Escolha no menu lateral a unidade para a qual os dados serão importados."))); return; }
  const aba = ctx.params[0] === "planilha" ? "planilha" : "franquia";
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Importar — " + ctx.unidade.nome)),
    el("div", { class: "subnav" }, el("a", { href: "#/importar", class: aba === "franquia" ? "ativo" : "" }, "Relatórios da franquia"), el("a", { href: "#/importar/planilha", class: aba === "planilha" ? "ativo" : "" }, "Planilha padronizada"))));
  const hist = el("div");
  if (aba === "franquia") franquia(root, ctx, historico); else planilha(root, ctx, historico);
  root.append(secao("Importações anteriores", hist));
  await historico();

  async function historico() {
    const rows = await Importacoes.listar(ctx.u);
    hist.replaceChildren(tabela([
      { k: "created_at", t: "Data", f: v => new Date(v).toLocaleString("pt-BR") }, { k: "arquivo", t: "Arquivo(s)" },
      { k: r => r.resumo?.semanas?.length ? `${r.resumo.semanas[0]} → ${r.resumo.semanas[r.resumo.semanas.length - 1]} (${r.resumo.semanas.length})` : "", t: "Semanas" },
      { k: r => r.resumo?.origem === "franquia" ? `${r.resumo.base_semanal} sem · ${r.resumo.contratos_avaliacao + r.resumo.contratos_protocolo} contr · ${r.resumo.lancamentos} parcelas` : `${r.resumo?.base_semanal ?? 0} sem · ${r.resumo?.contratos ?? 0} contr · ${r.resumo?.lancamentos ?? 0} lanç · ${r.resumo?.acoes ?? 0} ações`, t: "Registros" },
    ], rows, { vazio: "Nenhuma importação ainda." }));
  }
}

function zonaArquivo(texto, aceitar, onFile) {
  const file = el("input", { type: "file", accept: aceitar, class: "oculto" });
  const zona = el("div", { class: "dropzone" }, texto);
  zona.onclick = () => file.click();
  zona.ondragover = e => { e.preventDefault(); zona.classList.add("ativa"); };
  zona.ondragleave = () => zona.classList.remove("ativa");
  zona.ondrop = e => { e.preventDefault(); zona.classList.remove("ativa"); for (const f of e.dataTransfer.files) onFile(f); };
  file.onchange = () => { for (const f of file.files) onFile(f); file.value = ""; };
  return el("div", {}, zona, file);
}

// ------------------------------------------------------------------ relatórios da franquia
function franquia(root, ctx, historico) {
  const arquivos = { agendamentos: null, tratamentos: null, receber: null };
  const dados = { agend: [], trat: [], receber: [] };
  const rotulos = { agendamentos: "Relatório de agendamentos", tratamentos: "Relatório de tratamentos", receber: "Relatório de contas a receber" };
  const estado = el("div", { class: "grid grid-3" });
  const preview = el("div");
  const desenharEstado = () => estado.replaceChildren(...Object.keys(rotulos).map(k => el("div", { class: "kpi" }, el("div", { class: "kpi-titulo" }, rotulos[k]),
    el("div", { class: arquivos[k] ? "ok" : "nota" }, arquivos[k] ? `✔ ${arquivos[k]} (${k === "agendamentos" ? dados.agend.length : k === "tratamentos" ? dados.trat.length : dados.receber.length} linhas)` : "não enviado"))));
  desenharEstado();
  async function receber(f) {
    try {
      const ab = await f.arrayBuffer(); const tipo = FR.detectar(ab);
      if (!tipo) throw new Error(`Não reconheci "${f.name}" como relatório de agendamentos, tratamentos ou contas a receber.`);
      if (tipo === "agendamentos") dados.agend = FR.lerAgendamentos(ab); else if (tipo === "tratamentos") dados.trat = FR.lerTratamentos(ab); else dados.receber = FR.lerReceber(ab);
      arquivos[tipo] = f.name; desenharEstado(); previa();
    } catch (e) { erro(e); }
  }
  root.append(secao("Arquivos exportados do sistema da franquia",
    el("p", { class: "nota" }, "No sistema da franqueadora, exporte os relatórios de Agendamentos, Tratamentos e Contas a receber do período desejado (arquivos .xls). Arraste os três aqui — o tipo é reconhecido automaticamente. Pode enviar só um deles; cada relatório alimenta uma parte do painel."),
    zonaArquivo("Arraste os relatórios aqui ou clique para selecionar (.xls / .xlsx)", ".xls,.xlsx,.html,.htm", receber), estado,
    el("ul", { class: "nota" },
      el("li", {}, el("b", {}, "Agendamentos"), " → avaliações agendadas/realizadas/canceladas, atendimentos por fisioterapeuta, cancelamentos e faltas, novos pacientes, ocupação por turno, origem dos pacientes (leads por canal) e contratos de avaliação."),
      el("li", {}, el("b", {}, "Tratamentos"), " → contratos de protocolo por fisioterapeuta e semana (valor vem das parcelas do contas a receber)."),
      el("li", {}, el("b", {}, "Contas a receber"), " → receita por parcela (paga, pendente ou atrasada), pendências e inadimplência.")),
    preview));

  function previa() {
    const c = FR.consolidar(dados);
    if (ctx.unidade && c.unidadeRelatorio && !c.unidadeRelatorio.toUpperCase().includes(ctx.unidade.nome.toUpperCase().split(" ")[0])) c.avisos.unshift(`Atenção: o relatório é da "${c.unidadeRelatorio}", mas a unidade selecionada é "${ctx.unidade.nome}".`);
    const T = c.totais;
    const linhas = [];
    if (dados.agend.length) linhas.push(["Agendamentos", fmt.int(T.agendamentos)], ["Pacientes (avaliações)", fmt.int(T.pacientes)], ["Atendidos / desmarcados / faltas", `${fmt.int(T.atendidos)} / ${fmt.int(T.desmarcados)} / ${fmt.int(T.faltas)}`], ["Avaliações pagas", fmt.int(T.avaliacoesPagas)]);
    if (dados.trat.length) linhas.push(["Tratamentos (protocolos)", fmt.int(T.tratamentos)], ["Valor dos protocolos (pelas parcelas)", fmt.brl(T.valorTratamentos)]);
    if (dados.receber.length) linhas.push(["Parcelas", fmt.int(T.parcelas)], ["Recebido", fmt.brl(T.recebido)], ["Pendente (a vencer)", fmt.brl(T.pendente)], ["Atrasado (vencido)", fmt.brl(T.atrasado)], ["Parcelas marcadas como erro/cancelamento", `${fmt.int(T.canceladas || 0)} (${fmt.brl(T.valorCanceladas || 0)})`]);
    linhas.push(["Semanas", c.semanas.length ? `${c.semanas[0]} → ${c.semanas[c.semanas.length - 1]} (${c.semanas.length})` : "—"], ["Fisioterapeutas", c.fisios.join(", ") || "—"]);
    const barra = el("div", { class: "progresso" }, el("div")); const status = el("div", { class: "nota" });
    const btn = botao("Importar para " + ctx.unidade.nome, async () => {
      btn.disabled = true;
      try {
        const r = await FR.gravar(c, ctx, Object.values(arquivos).filter(Boolean), ctx.unidade, (txt, p) => { status.textContent = txt; barra.firstChild.style.width = (p * 100) + "%"; });
        toast("Importação concluída.", "ok");
        preview.append(el("p", { class: "ok" }, `Gravado: ${r.base_semanal} semanas, ${r.base_fisio} linhas por fisioterapeuta, ${r.leads_canal} leads por canal, ${r.contratos_avaliacao} avaliações, ${r.contratos_protocolo} protocolos, ${r.lancamentos} parcelas de receita.`),
          r.avisos.length ? el("ul", {}, ...r.avisos.map(a => el("li", { class: "nota" }, a))) : null,
          el("p", {}, el("a", { href: "#/painel" }, "Abrir Resultados →")));
        await historico();
      } catch (e) { erro(e); btn.disabled = false; }
    });
    const porSemana = c.porSemana.slice(-8).reverse();
    preview.replaceChildren(el("h3", {}, "Pré-visualização"), tabela([{ k: 0, t: "Conteúdo" }, { k: 1, t: "", cls: "num" }], linhas),
      c.avisos.length ? el("ul", {}, ...c.avisos.map(a => el("li", { class: "nota" }, a))) : null,
      porSemana.length ? el("div", {}, el("h3", {}, "Últimas semanas do relatório de agendamentos"), el("div", { class: "tabela-wrap" }, tabela([
        { k: "id_semana", t: "Semana" }, { k: "aval_agendadas", t: "Aval. agend.", cls: "num" }, { k: "aval_realizadas", t: "Aval. realiz.", cls: "num" }, { k: r => r.aval_canceladas + r.aval_faltas, t: "Aval. canc.", cls: "num" },
        { k: "novos_pacientes", t: "Novos pac.", cls: "num" }, { k: "atendimentos", t: "Atend.", cls: "num" }, { k: "cancel_atendimentos", t: "Canc.+faltas", cls: "num" }, { k: "horarios_ocup_manha", t: "Ocup. manhã", cls: "num" }, { k: "horarios_ocup_tarde", t: "Ocup. tarde", cls: "num" }], porSemana))) : null,
      el("div", { class: "form-acoes" }, btn, status), barra,
      el("p", { class: "nota" }, "Reimportar o mesmo período atualiza os registros (não duplica). Leads totais, gastos, impostos, marketing, metas, reunião e plano de ação continuam vindo da planilha ou de Lançar Semana."));
  }
}

// ------------------------------------------------------------------ planilha padronizada
function planilha(root, ctx, historico) {
  const preview = el("div");
  root.append(secao("Planilha padronizada", el("p", { class: "nota" }, "Use o modelo Base_Dados_Clinica.xlsx. Semanas já existentes são atualizadas; contratos, lançamentos e ações das semanas presentes no arquivo são substituídos."),
    el("p", {}, el("a", { href: "Base_Dados_Clinica.xlsx", download: "" }, "Baixar o modelo da planilha")),
    zonaArquivo("Arraste a planilha aqui ou clique para selecionar (.xlsx)", ".xlsx,.xlsm", processar), preview));

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
        preview.append(el("p", { class: "ok" }, `Importado: ${r.base_semanal} semanas, ${r.contratos} contratos, ${r.lancamentos} lançamentos, ${r.leads_canal} leads por canal, ${r.reunioes} reuniões, ${r.acoes} ações.`), el("p", {}, el("a", { href: "#/painel" }, "Abrir Resultados →")));
        await historico();
      } catch (e) { erro(e); btn.disabled = false; }
    });
    preview.replaceChildren(el("h3", {}, `Pré-visualização — ${f.name}`), resumo, avisos, el("div", { class: "form-acoes" }, total ? btn : el("span", { class: "ruim" }, "Nenhum registro reconhecido. Confira se o arquivo segue o modelo."), status), barra);
  }
}
