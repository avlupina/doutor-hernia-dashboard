// Desempenho dos fisioterapeutas — comparação por período.
import { Resumo, Fisios } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico, select } from "../ui.js";

export async function render(root, ctx) {
  const [todos, fisios] = await Promise.all([Resumo.fisios(ctx.clinica_id), Fisios.listar(ctx.clinica_id)]);
  const meses = [...new Set(todos.map(r => r.mes))].sort();
  const padrao = [...new Set(todos.filter(r => r.atendimentos || r.aval_realizadas).map(r => r.mes))].sort().pop() || meses[meses.length - 1];
  const sel = select([["todos", "Todo o período"], ...meses.map(m => [m, fmt.mes(m)])], {}, padrao || "todos");
  root.append(el("div", { class: "topo" },
    el("div", {}, el("h1", {}, "Fisioterapeutas"), el("p", { class: "sub", style: "margin:0" }, "Avaliações, conversão, contratos, atendimentos e tempo de atendimento por profissional.")),
    el("div", { class: "acoes" }, el("span", { class: "nota" }, "Período:"), sel)));
  const corpo = el("div"); root.append(corpo);
  sel.onchange = () => desenhar(sel.value);
  desenhar(sel.value);

  function desenhar(periodo) {
    corpo.replaceChildren();
    const rows = periodo === "todos" ? todos : todos.filter(r => r.mes === periodo);
    if (!rows.length) { corpo.append(secao("Sem dados", el("p", {}, "Nenhum lançamento por fisioterapeuta no período."))); return; }
    const porFisio = {};
    for (const r of rows) {
      const f = porFisio[r.fisioterapeuta_id] ||= { nome: r.fisioterapeuta, aval: 0, contratos: 0, atend: 0, valor: 0, semanas: 0, tempos: [], desvios: [] };
      f.aval += r.aval_realizadas; f.contratos += r.contratos; f.atend += r.atendimentos; f.valor += Number(r.valor_contratado); f.semanas++;
      if (r.tempo_medio_min != null) { f.tempos.push(Number(r.tempo_medio_min)); if (r.desvio_min != null) f.desvios.push(Number(r.desvio_min)); }
    }
    const lista = Object.values(porFisio).map(f => ({ ...f,
      conversao: f.aval ? f.contratos / f.aval : null,
      ticket: f.contratos ? f.valor / f.contratos : null,
      atendSemana: f.semanas ? f.atend / f.semanas : null,
      tempo: f.tempos.length ? f.tempos.reduce((a, b) => a + b, 0) / f.tempos.length : null,
      desvio: f.desvios.length ? f.desvios.reduce((a, b) => a + b, 0) / f.desvios.length : null,
    }));
    const total = lista.reduce((a, f) => ({ aval: a.aval + f.aval, contratos: a.contratos + f.contratos, atend: a.atend + f.atend, valor: a.valor + f.valor }), { aval: 0, contratos: 0, atend: 0, valor: 0 });

    corpo.append(secao("Comparativo",
      el("div", { class: "grid grid-kpi" }, ...lista.map(f => kpi({ titulo: f.nome, valor: f.conversao, formato: fmt.pct, sub: `${f.contratos} contratos / ${f.aval} avaliações · ${fmt.brl(f.valor)} contratado` }))),
      el("div", { class: "tabela-wrap" }, tabela([
        { k: "nome", t: "Fisioterapeuta" },
        { k: "aval", t: "Avaliações", cls: "num", f: fmt.int },
        { k: "contratos", t: "Contratos", cls: "num", f: fmt.int },
        { k: "conversao", t: "Conversão", cls: "num", f: fmt.pct },
        { k: "valor", t: "Valor contratado", cls: "num", f: fmt.brl },
        { k: "ticket", t: "Ticket médio", cls: "num", f: fmt.brl },
        { k: "atend", t: "Atendimentos", cls: "num", f: fmt.int },
        { k: "atendSemana", t: "Atend./semana", cls: "num", f: fmt.num },
        { k: "tempo", t: "Tempo médio (min)", cls: "num", f: fmt.num },
        { k: "desvio", t: "Desvio (min)", cls: "num", f: fmt.num },
        { k: f => total.atend ? f.atend / total.atend : null, t: "% dos atend.", cls: "num", f: fmt.pct },
      ], lista))));

    // evolução semanal por fisio
    const semanas = [...new Set(rows.map(r => r.id_semana))].sort();
    const nomes = [...new Set(rows.map(r => r.fisioterapeuta))];
    const serie = (campo) => nomes.map(n => ({ label: n, data: semanas.map(s => rows.find(r => r.id_semana === s && r.fisioterapeuta === n)?.[campo] ?? null) }));
    const g1 = secao("Atendimentos por semana"); grafico(g1, { tipo: "bar", labels: semanas, datasets: serie("atendimentos") });
    const g2 = secao("Conversão avaliação → contrato por semana"); grafico(g2, { tipo: "line", labels: semanas, formatoY: fmt.pct, max: 1, datasets: serie("conversao") });
    const g3 = secao("Tempo médio de atendimento (min)"); grafico(g3, { tipo: "line", labels: semanas, datasets: serie("tempo_medio_min") });
    const g4 = secao("Avaliações realizadas por semana"); grafico(g4, { tipo: "bar", labels: semanas, datasets: serie("aval_realizadas") });
    corpo.append(el("div", { class: "grid grid-2" }, g1, g2, g3, g4));
    if (fisios.length > nomes.length) corpo.append(el("p", { class: "nota" }, `Profissionais cadastrados sem lançamentos no período: ${fisios.filter(f => !nomes.includes(f.nome)).map(f => f.nome).join(", ")}.`));
  }
}
