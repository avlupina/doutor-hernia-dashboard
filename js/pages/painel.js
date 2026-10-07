// Painel semanal — segue a pauta da reunião semanal da clínica.
import { Semanas, Resumo, Metas, Reunioes, Acoes } from "../api.js";
import { el, kpi, fmt, secao, tabela, select, grafico, botao } from "../ui.js";

export async function render(root, ctx) {
  const todas = await Resumo.semanal(ctx.clinica_id);
  const idsComDados = new Set(todas.map(r => r.id_semana));
  const comAtividade = todas.filter(r => r.leads || r.atendimentos || r.receitas > 0 || r.contratos).map(r => r.id_semana).sort();
  const padrao = ctx.params[0] || comAtividade.pop() || [...idsComDados].sort().pop() || Semanas.atual();
  const semanas = await Semanas.janela(padrao, 26, 8);
  const topo = el("div", { class: "topo" },
    el("div", {}, el("h1", {}, "Painel semanal"), el("p", { class: "sub", style: "margin:0" }, "Pauta da reunião semanal com indicadores, agenda, financeiro e plano de ação.")),
    el("div", { class: "acoes" },
      el("span", { class: "nota" }, "Semana:"),
      select(semanas.map(s => [s.id_semana, `${s.id_semana}  (${fmt.data(s.inicio)} – ${fmt.data(s.fim)})${idsComDados.has(s.id_semana) ? "" : "  · sem dados"}`]), { id: "sel-semana" }, padrao),
      ctx.editor ? botao("Lançar / editar dados", () => location.hash = "#/semana/" + document.getElementById("sel-semana").value, "btn sec") : null));
  const corpo = el("div");
  root.append(topo, corpo);
  const sel = topo.querySelector("#sel-semana");
  sel.onchange = () => { history.replaceState(null, "", "#/painel/" + sel.value); carregar(sel.value); };
  await carregar(padrao);

  async function carregar(id) {
    corpo.replaceChildren(el("p", { class: "sub" }, "Carregando…"));
    const ant = Semanas.anterior(id), prox = Semanas.proxima(id);
    const [rows, metas, canais, reuniao, acoes, pend, fisios, historico] = await Promise.all([
      Resumo.semanal(ctx.clinica_id, { ids: [ant, id, prox] }),
      Metas.listar(ctx.clinica_id),
      Resumo.leadsCanal(ctx.clinica_id, [ant, id]),
      Reunioes.obter(ctx.clinica_id, id),
      Acoes.listar(ctx.clinica_id, id),
      Resumo.pendencias(ctx.clinica_id),
      Resumo.fisios(ctx.clinica_id, { ids: [ant, id] }),
      Resumo.semanal(ctx.clinica_id, { ate: semanas.find(s => s.id_semana === id)?.inicio }),
    ]);
    const a = rows.find(r => r.id_semana === id) || {}, p = rows.find(r => r.id_semana === ant) || {}, n = rows.find(r => r.id_semana === prox) || {};
    const M = k => metas[k]?.meta_semanal, MM = k => metas[k]?.meta_mensal;
    const fA = fisios.filter(f => f.id_semana === id), fP = fisios.filter(f => f.id_semana === ant);
    corpo.replaceChildren();

    if (!a.id_semana) {
      corpo.append(secao("Sem dados para esta semana", el("p", {}, "Nenhum lançamento encontrado para ", el("b", {}, id), ". ", ctx.editor ? "Use “Lançar semana” ou importe a planilha." : "Peça a um gestor para lançar os dados.")));
      return;
    }

    // 1. Abertura
    const score = sinal(a.leads, p.leads) + sinal(a.aval_realizadas, p.aval_realizadas) + sinal(a.contratos, p.contratos) + sinal(a.atendimentos, p.atendimentos) + sinal(a.receitas, p.receitas) - sinal(a.gastos, p.gastos);
    const auto = !p.id_semana ? "Sem semana anterior" : score > 0 ? "Melhor" : score < 0 ? "Pior" : "Igual";
    corpo.append(secao("1. Abertura",
      el("div", { class: "grid grid-2" },
        el("div", {}, el("h3", {}, "Resultado geral da clínica"),
          el("div", {}, badgeResultado(auto), " automático (6 indicadores vs. semana anterior)"), el("br"),
          el("div", {}, badgeResultado(reuniao?.resultado_geral || "—"), " registrado na reunião")),
        el("div", {}, el("h3", {}, "Pontos positivos"), el("div", { class: "texto-reuniao" }, reuniao?.pontos_positivos || "—"),
          el("h3", {}, "Pontos a melhorar"), el("div", { class: "texto-reuniao" }, reuniao?.pontos_melhorar || "—")))));

    // 2. Crescimento
    corpo.append(secao("2. Indicadores-chave — crescimento",
      el("div", { class: "grid grid-kpi" },
        kpi({ titulo: "Leads recebidos", valor: a.leads, anterior: p.leads, meta: M("Leads recebidos"), formato: fmt.int }),
        kpi({ titulo: "Novos pacientes", valor: a.novos_pacientes, anterior: p.novos_pacientes, meta: M("Novos pacientes"), formato: fmt.int }),
        kpi({ titulo: "Avaliações agendadas", valor: a.aval_agendadas, anterior: p.aval_agendadas, formato: fmt.int }),
        kpi({ titulo: "Avaliações canceladas", valor: a.aval_canceladas, anterior: p.aval_canceladas, formato: fmt.int, inverter: true, sub: `taxa ${fmt.pct(a.taxa_cancel_aval)} (máx. ${fmt.pct(M("Taxa máx. de cancelamento de avaliações"))})` }),
        kpi({ titulo: "Avaliações realizadas", valor: a.aval_realizadas, anterior: p.aval_realizadas, meta: M("Avaliações realizadas"), formato: fmt.int }),
        kpi({ titulo: "Tratamentos contratados", valor: a.contratos, anterior: p.contratos, meta: M("Contratos fechados (tratamentos)"), formato: fmt.int }),
        kpi({ titulo: "Conversão avaliação → contrato", valor: a.conversao_aval_contrato, anterior: p.conversao_aval_contrato, meta: M("Conversão avaliação → contrato"), formato: fmt.pct }),
        kpi({ titulo: "Valor contratado na semana", valor: a.valor_total_contratado, anterior: p.valor_total_contratado, formato: fmt.brl, sub: `${a.aval_contratadas} avaliações (${fmt.brl(a.valor_avaliacoes)}) · ${a.protocolos_contratados} protocolos (${fmt.brl(a.valor_protocolos)})` })),
      el("h3", {}, "Por fisioterapeuta"),
      tabela([
        { k: "fisioterapeuta", t: "Fisioterapeuta" },
        { k: "aval_realizadas", t: "Aval. realizadas", cls: "num", f: (v, r) => `${fmt.int(v)}  ${fmt.delta(v, fP.find(x => x.fisioterapeuta_id === r.fisioterapeuta_id)?.aval_realizadas, fmt.int)}` },
        { k: "contratos", t: "Contratos", cls: "num", f: (v, r) => `${fmt.int(v)}  ${fmt.delta(v, fP.find(x => x.fisioterapeuta_id === r.fisioterapeuta_id)?.contratos, fmt.int)}` },
        { k: "conversao", t: "Conversão", cls: "num", f: fmt.pct },
        { k: "valor_contratado", t: "Valor contratado", cls: "num", f: fmt.brl },
      ], fA),
      el("h3", {}, "Meios de comunicação de ingresso (leads por canal)"),
      el("div", { class: "grid grid-2" }, blocoCanais(canais, id, ant),
        el("div", { class: "nota" }, a.leads_por_canal && a.leads_por_canal !== a.leads ? `Atenção: a soma dos canais (${a.leads_por_canal}) difere do total de leads (${a.leads}).` : ""))));

    // 3. Agenda e atendimentos
    const ocMeta = M("Taxa de ocupação da agenda");
    corpo.append(secao("3. Agenda e atendimentos",
      el("div", { class: "grid grid-kpi" },
        ...fA.map(f => kpi({ titulo: `Atendimentos — ${f.fisioterapeuta}`, valor: f.atendimentos, anterior: fP.find(x => x.fisioterapeuta_id === f.fisioterapeuta_id)?.atendimentos, formato: fmt.int })),
        kpi({ titulo: "Atendimentos — total", valor: a.atendimentos, anterior: p.atendimentos, meta: M("Atendimentos realizados"), formato: fmt.int }),
        kpi({ titulo: "Cancelamentos de atendimentos", valor: a.cancel_atendimentos, anterior: p.cancel_atendimentos, formato: fmt.int, inverter: true }),
        kpi({ titulo: "Ocupação — manhã", valor: a.ocupacao_manha, anterior: p.ocupacao_manha, meta: ocMeta, formato: fmt.pct }),
        kpi({ titulo: "Ocupação — tarde", valor: a.ocupacao_tarde, anterior: p.ocupacao_tarde, meta: ocMeta, formato: fmt.pct }),
        kpi({ titulo: "Ocupação — total", valor: a.ocupacao_total, anterior: p.ocupacao_total, meta: ocMeta, formato: fmt.pct })),
      el("h3", {}, "Tempo médio de atendimento (min)"),
      tabela([
        { k: "fisioterapeuta", t: "Fisioterapeuta" },
        { k: "tempo_medio_min", t: "Média", cls: "num", f: fmt.num },
        { k: "desvio_min", t: "Desvio padrão", cls: "num", f: fmt.num },
        { k: r => fP.find(x => x.fisioterapeuta_id === r.fisioterapeuta_id)?.tempo_medio_min, t: "Média semana anterior", cls: "num", f: fmt.num },
      ], fA)));

    // 4. Financeiro
    const hist = historico.slice(-8);
    const finSec = secao("4. Indicadores financeiros",
      el("div", { class: "grid grid-kpi" },
        kpi({ titulo: "Receita semanal", valor: a.receitas, anterior: p.receitas, meta: M("Receita"), formato: fmt.brl }),
        kpi({ titulo: "Gastos semanais", valor: a.gastos, anterior: p.gastos, meta: M("Gastos"), formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Impostos", valor: a.impostos, anterior: p.impostos, formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Marketing", valor: a.marketing, anterior: p.marketing, meta: M("Investimento em marketing"), formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Resultado da semana", valor: a.resultado, anterior: p.resultado, formato: fmt.brl }),
        kpi({ titulo: `Receita acumulada em ${fmt.mes(a.mes)}`, valor: a.receita_acum_mes, meta: MM("Receita"), formato: fmt.brl }),
        kpi({ titulo: `Gastos acumulados em ${fmt.mes(a.mes)}`, valor: a.gastos_acum_mes, meta: MM("Gastos"), formato: fmt.brl, inverter: true }),
        kpi({ titulo: "Pendências (a receber)", valor: pend.pendente_valor, formato: fmt.brl, sub: `${pend.pendente_qtd} lançamento(s) pendente(s)` }),
        kpi({ titulo: "Inadimplência (em atraso)", valor: pend.atrasado_valor, formato: fmt.brl, sub: `${pend.atrasado_qtd} lançamento(s) em atraso` })),
      el("h3", {}, "Últimas 8 semanas"));
    grafico(finSec, { tipo: "bar", labels: hist.map(r => r.id_semana), formatoY: fmt.brl, datasets: [
      { label: "Receita", data: hist.map(r => r.receitas) }, { label: "Gastos", data: hist.map(r => r.gastos) },
      { label: "Resultado", data: hist.map(r => r.resultado) }] }, 240);
    corpo.append(finSec);

    // 5. Experiência do paciente
    corpo.append(secao("5. Experiência do paciente",
      el("div", { class: "grid grid-2" },
        el("div", {}, el("h3", {}, "Pacientes críticos | riscos de desistência"), el("div", { class: "texto-reuniao" }, reuniao?.pacientes_criticos || "—"),
          el("h3", {}, "Pontos pertinentes"), el("div", { class: "texto-reuniao" }, reuniao?.pontos_pertinentes || "—")),
        el("div", {}, el("h3", {}, "Problemas no atendimento"), el("div", { class: "texto-reuniao" }, reuniao?.problemas_atendimento || "—"),
          el("h3", {}, "Existe algo prejudicando a experiência do paciente?"),
          el("div", { class: "texto-reuniao" }, reuniao?.prejudica_experiencia == null ? "—" : (reuniao.prejudica_experiencia ? "Sim" : "Não") + (reuniao.prejudica_descricao ? " — " + reuniao.prejudica_descricao : ""))))));

    // 6. Operação
    corpo.append(secao("6. Operação da semana | próxima semana",
      el("div", { class: "grid grid-kpi" },
        kpi({ titulo: `Ocupação já agendada — manhã (${prox})`, valor: n.ocupacao_manha, meta: ocMeta, formato: fmt.pct }),
        kpi({ titulo: `Ocupação já agendada — tarde (${prox})`, valor: n.ocupacao_tarde, meta: ocMeta, formato: fmt.pct }),
        kpi({ titulo: `Ocupação já agendada — total (${prox})`, valor: n.ocupacao_total, meta: ocMeta, formato: fmt.pct })),
      n.id_semana ? null : el("p", { class: "nota" }, "Lance os horários disponíveis/ocupados da próxima semana para ver a ocupação já agendada."),
      el("div", { class: "grid grid-2" },
        el("div", {}, el("h3", {}, "Demandas da recepção e equipe"), el("div", { class: "texto-reuniao" }, reuniao?.demandas_equipe || "—")),
        el("div", {}, el("h3", {}, "Pontos relevantes"), el("div", { class: "texto-reuniao" }, reuniao?.pontos_proxima_semana || "—")))));

    corpo.append(secao("7. O que mais ocorrer", el("div", { class: "texto-reuniao" }, reuniao?.outros || "—")));

    // 8. Plano de ação
    corpo.append(secao("8. Plano de ação",
      el("div", { class: "grid grid-2" },
        el("div", {}, el("h3", {}, "Metas da semana"), el("div", { class: "texto-reuniao" }, reuniao?.metas_semana || "—")),
        el("div", {}, el("h3", {}, "Soluções para os problemas identificados"), el("div", { class: "texto-reuniao" }, reuniao?.solucoes || "—"))),
      el("h3", {}, "Ações para executar (5W2H)"),
      el("div", { class: "tabela-wrap" }, tabela([
        { k: "problema", t: "Problema / meta" }, { k: "o_que", t: "O quê" }, { k: "por_que", t: "Por quê" }, { k: "onde", t: "Onde" },
        { k: "quando", t: "Quando", f: fmt.data }, { k: "quem", t: "Quem" }, { k: "como", t: "Como" }, { k: "quanto", t: "Quanto", cls: "num", f: fmt.brl },
        { k: "status", t: "Status", f: v => el("span", { class: "badge " + (v === "Concluída" ? "ok" : v === "Em andamento" ? "warn" : "") }, v) },
      ], acoes, { vazio: "Nenhuma ação registrada para a semana." }))));
  }
}

function sinal(a, b) { if (a == null || b == null) return 0; return Math.sign(Number(a) - Number(b)); }
function badgeResultado(v) { return el("span", { class: "badge " + (v === "Melhor" ? "ok" : v === "Pior" ? "ruim" : v === "Igual" ? "warn" : "") }, v); }

function blocoCanais(canais, id, ant) {
  const atual = canais.filter(c => c.id_semana === id), anterior = canais.filter(c => c.id_semana === ant);
  const nomes = [...new Set([...atual, ...anterior].map(c => c.canal))];
  const rows = nomes.map(c => ({ canal: c, atual: atual.find(x => x.canal === c)?.quantidade || 0, ant: anterior.find(x => x.canal === c)?.quantidade || 0, part: atual.find(x => x.canal === c)?.participacao }))
    .sort((x, y) => y.atual - x.atual);
  return tabela([
    { k: "canal", t: "Canal" }, { k: "atual", t: "Semana atual", cls: "num", f: fmt.int }, { k: "ant", t: "Anterior", cls: "num", f: fmt.int },
    { k: r => r.atual - r.ant, t: "Variação", cls: "num", f: v => (v > 0 ? "+" : "") + v }, { k: "part", t: "% do total", cls: "num", f: fmt.pct },
  ], rows, { vazio: "Sem leads por canal nesta semana." });
}
