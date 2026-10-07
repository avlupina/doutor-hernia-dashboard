// Financeiro — margem, ponto de equilíbrio, projeções de cenários e classificação dos lançamentos.
import { Resumo, Lancamentos } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico, input, campo, botao, select, toast, erro, hoje, addDias } from "../ui.js";
import { LISTAS } from "../config.js";

export async function render(root, ctx) {
  const meses = await Resumo.mensal(ctx.clinica_id);
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Financeiro & projeções"),
    el("p", { class: "sub", style: "margin:0" }, "Margem de contribuição, ponto de equilíbrio e simulação de cenários. Classifique os gastos em fixos ou variáveis para o cálculo do ponto de equilíbrio."))));

  const u = meses[meses.length - 1];
  if (u) {
    const semClass = Number(u.gastos) - Number(u.gastos_fixos) - Number(u.gastos_variaveis);
    root.append(secao(`Mês mais recente — ${fmt.mes(u.mes)}`,
      el("div", { class: "grid grid-kpi" },
        kpi({ titulo: "Receita", valor: u.receitas, formato: fmt.brl }),
        kpi({ titulo: "Gastos fixos", valor: u.gastos_fixos, formato: fmt.brl }),
        kpi({ titulo: "Gastos variáveis", valor: u.gastos_variaveis, formato: fmt.brl }),
        kpi({ titulo: "Impostos", valor: u.impostos, formato: fmt.brl }),
        kpi({ titulo: "Marketing", valor: u.marketing, formato: fmt.brl }),
        kpi({ titulo: "Resultado", valor: u.resultado, formato: fmt.brl }),
        kpi({ titulo: "Margem de contribuição", valor: u.margem_contribuicao, formato: fmt.pct, sub: "(receita − variáveis − impostos) ÷ receita" }),
        kpi({ titulo: "Margem líquida", valor: u.margem_liquida, formato: fmt.pct }),
        kpi({ titulo: "Ponto de equilíbrio (receita/mês)", valor: u.ponto_equilibrio, formato: fmt.brl, sub: "(fixos + marketing) ÷ margem de contribuição" }),
        kpi({ titulo: "Folga sobre o ponto de equilíbrio", valor: u.ponto_equilibrio ? Number(u.receitas) / Number(u.ponto_equilibrio) - 1 : null, formato: fmt.pct })),
      semClass > 0.005 ? el("p", { class: "nota" }, `⚠ ${fmt.brl(semClass)} em gastos sem classificação (fixo/variável) neste mês — classifique na lista abaixo para o ponto de equilíbrio ficar correto.`) : null));
  }

  if (meses.length) {
    const g = secao("Evolução mensal");
    grafico(g, { tipo: "bar", labels: meses.map(m => fmt.mes(m.mes)), formatoY: fmt.brl, empilhado: false, datasets: [
      { label: "Receita", data: meses.map(m => m.receitas) }, { label: "Gastos fixos + marketing", data: meses.map(m => Number(m.gastos_fixos) + Number(m.marketing)) },
      { label: "Variáveis + impostos", data: meses.map(m => Number(m.gastos_variaveis) + Number(m.impostos)) }, { label: "Ponto de equilíbrio", data: meses.map(m => m.ponto_equilibrio), cor: "#8a8984" }] });
    g.append(el("div", { class: "tabela-wrap" }, tabela([
      { k: "mes", t: "Mês", f: fmt.mes }, { k: "receitas", t: "Receita", cls: "num", f: fmt.brl }, { k: "gastos_fixos", t: "Fixos", cls: "num", f: fmt.brl },
      { k: "gastos_variaveis", t: "Variáveis", cls: "num", f: fmt.brl }, { k: "impostos", t: "Impostos", cls: "num", f: fmt.brl }, { k: "marketing", t: "Marketing", cls: "num", f: fmt.brl },
      { k: "resultado", t: "Resultado", cls: "num", f: fmt.brl }, { k: "margem_contribuicao", t: "Margem contrib.", cls: "num", f: fmt.pct },
      { k: "margem_liquida", t: "Margem líquida", cls: "num", f: fmt.pct }, { k: "ponto_equilibrio", t: "Ponto de equilíbrio", cls: "num", f: fmt.brl },
    ], [...meses].reverse())));
    root.append(g);
  }

  // ---------------------------------------------------------------- projeções
  const base = u || {};
  const rec = Number(base.receitas) || 30000, fix = Number(base.gastos_fixos) || 12000, varPct = base.receitas ? Number(base.gastos_variaveis) / Number(base.receitas) : 0.15,
        impPct = base.receitas ? Number(base.impostos) / Number(base.receitas) : 0.06, mkt = Number(base.marketing) || 2500;
  const f = {
    receita: input({ type: "number", step: 100, value: rec.toFixed(0) }), cresc: input({ type: "number", step: 0.5, value: 3 }),
    fixos: input({ type: "number", step: 100, value: fix.toFixed(0) }), crescFix: input({ type: "number", step: 0.5, value: 0 }),
    varPct: input({ type: "number", step: 0.5, value: (varPct * 100).toFixed(1) }), impPct: input({ type: "number", step: 0.5, value: (impPct * 100).toFixed(1) }),
    mkt: input({ type: "number", step: 100, value: mkt.toFixed(0) }), meses: input({ type: "number", min: 1, max: 36, value: 12 }),
  };
  const saida = el("div");
  const proj = secao("Simulador de cenários",
    el("p", { class: "nota" }, "Valores iniciais sugeridos a partir do mês mais recente. Altere as premissas para comparar cenários; nada é gravado."),
    el("div", { class: "form-grid" },
      campo("Receita inicial (R$/mês)", f.receita), campo("Crescimento da receita (%/mês)", f.cresc),
      campo("Gastos fixos (R$/mês)", f.fixos), campo("Crescimento dos fixos (%/mês)", f.crescFix),
      campo("Gastos variáveis (% da receita)", f.varPct), campo("Impostos (% da receita)", f.impPct),
      campo("Marketing (R$/mês)", f.mkt), campo("Horizonte (meses)", f.meses)),
    el("div", { class: "form-acoes" }, botao("Recalcular", simular), el("span", { class: "nota" }, "Cenários rápidos: "),
      botao("Pessimista", () => preset(-2, 2), "btn sec mini"), botao("Base", () => preset(3, 0), "btn sec mini"), botao("Otimista", () => preset(6, 0), "btn sec mini")),
    saida);
  root.append(proj);
  simular();

  function preset(c, cf) { f.cresc.value = c; f.crescFix.value = cf; simular(); }
  function simular() {
    const n = Math.min(36, Math.max(1, Number(f.meses.value) || 12));
    const rows = []; let r = Number(f.receita.value), fx = Number(f.fixos.value);
    const vp = Number(f.varPct.value) / 100, ip = Number(f.impPct.value) / 100, m = Number(f.mkt.value);
    const mesBase = base.mes ? new Date(base.mes + "-01T00:00:00") : new Date();
    let acumulado = 0;
    for (let i = 1; i <= n; i++) {
      const d = new Date(mesBase.getFullYear(), mesBase.getMonth() + i, 1);
      const variaveis = r * vp, impostos = r * ip, resultado = r - fx - variaveis - impostos - m;
      const mc = r ? (r - variaveis - impostos) / r : 0, pe = mc > 0 ? (fx + m) / mc : null;
      acumulado += resultado;
      rows.push({ mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, receita: r, fixos: fx, variaveis, impostos, marketing: m, resultado, acumulado, margem: r ? resultado / r : null, pe });
      r *= 1 + Number(f.cresc.value) / 100; fx *= 1 + Number(f.crescFix.value) / 100;
    }
    saida.replaceChildren();
    const g = el("div");
    grafico(g, { tipo: "line", labels: rows.map(x => fmt.mes(x.mes)), formatoY: fmt.brl, datasets: [
      { label: "Receita", data: rows.map(x => x.receita) }, { label: "Resultado", data: rows.map(x => x.resultado) },
      { label: "Ponto de equilíbrio", data: rows.map(x => x.pe), cor: "#8a8984" }] }, 240);
    const primeiroPos = rows.find(x => x.resultado > 0);
    saida.append(el("div", { class: "grid grid-kpi", style: "margin:10px 0" },
      kpi({ titulo: "Resultado acumulado no horizonte", valor: rows[rows.length - 1].acumulado, formato: fmt.brl }),
      kpi({ titulo: "Ponto de equilíbrio (1º mês)", valor: rows[0].pe, formato: fmt.brl }),
      kpi({ titulo: "Primeiro mês com resultado positivo", valor: null, formato: () => primeiroPos ? fmt.mes(primeiroPos.mes) : "nenhum no horizonte" }),
      kpi({ titulo: "Margem líquida no último mês", valor: rows[rows.length - 1].margem, formato: fmt.pct })),
      g, el("div", { class: "tabela-wrap" }, tabela([
        { k: "mes", t: "Mês", f: fmt.mes }, { k: "receita", t: "Receita", cls: "num", f: fmt.brl }, { k: "fixos", t: "Fixos", cls: "num", f: fmt.brl },
        { k: "variaveis", t: "Variáveis", cls: "num", f: fmt.brl }, { k: "impostos", t: "Impostos", cls: "num", f: fmt.brl }, { k: "marketing", t: "Marketing", cls: "num", f: fmt.brl },
        { k: "resultado", t: "Resultado", cls: "num", f: fmt.brl }, { k: "acumulado", t: "Acumulado", cls: "num", f: fmt.brl }, { k: "margem", t: "Margem", cls: "num", f: fmt.pct }, { k: "pe", t: "Ponto de equilíbrio", cls: "num", f: fmt.brl },
      ], rows)));
  }

  // ---------------------------------------------------------------- lançamentos (classificação)
  const de = input({ type: "date", value: addDias(hoje(), -60) }), ate = input({ type: "date", value: hoje() });
  const cat = select([["", "Todas as categorias"], ...LISTAS.categorias], {}, "");
  const lista = el("div");
  const sec = secao("Lançamentos", el("div", { class: "form-grid" }, campo("De", de), campo("Até", ate), campo("Categoria", cat)),
    el("div", { class: "form-acoes" }, botao("Filtrar", carregarLanc, "btn sec"), ctx.editor ? botao("+ Novo lançamento", novo) : null), lista);
  root.append(sec);
  await carregarLanc();

  async function carregarLanc() {
    const rows = await Lancamentos.listar(ctx.clinica_id, { de: de.value, ate: ate.value, categoria: cat.value || undefined });
    const cols = [
      { k: "data", t: "Data", f: fmt.data }, { k: "id_semana", t: "Semana" }, { k: "categoria", t: "Categoria" }, { k: "descricao", t: "Descrição" },
      { k: "valor", t: "Valor", cls: "num", f: fmt.brl },
      { k: "tipo_custo", t: "Tipo de custo", f: (v, r) => r.categoria !== "Gasto" ? "—" : ctx.editor ? editavel(r, "tipo_custo", [["", "(não classificado)"], ...LISTAS.tiposCusto]) : (v || "—") },
      { k: "status", t: "Status", f: (v, r) => ctx.editor ? editavel(r, "status", LISTAS.statusPagamento) : v },
      { k: "vencimento", t: "Vencimento", f: fmt.data }, { k: "contraparte", t: "Paciente / fornecedor" },
    ];
    if (ctx.editor) cols.push({ k: "id", t: "", f: (v) => botao("excluir", async () => { if (confirm("Excluir este lançamento?")) { try { await Lancamentos.excluir(v); toast("Excluído.", "ok"); carregarLanc(); } catch (e) { erro(e); } } }, "btn perigo mini") });
    lista.replaceChildren(el("div", { class: "tabela-wrap" }, tabela(cols, rows, { vazio: "Nenhum lançamento no filtro." })));
  }
  function editavel(r, campoNome, opcoes) {
    const s = select(opcoes, { class: "input", style: "padding:3px 6px;width:auto" }, r[campoNome] || "");
    s.onchange = async () => { try { await Lancamentos.atualizar(r.id, { [campoNome]: s.value || null }); toast("Atualizado.", "ok"); } catch (e) { erro(e); } };
    return s;
  }
  function novo() {
    const n = { data: input({ type: "date", value: hoje() }), categoria: select(LISTAS.categorias), tipo: select([["", "—"], ...LISTAS.tiposCusto]), descricao: input(), valor: input({ type: "number", step: 0.01 }),
      status: select(LISTAS.statusPagamento), venc: input({ type: "date" }), contraparte: input() };
    const box = secao("Novo lançamento", el("div", { class: "form-grid" }, campo("Data", n.data), campo("Categoria", n.categoria), campo("Tipo de custo (se gasto)", n.tipo), campo("Descrição", n.descricao),
      campo("Valor (R$)", n.valor), campo("Status", n.status), campo("Vencimento", n.venc), campo("Paciente / fornecedor", n.contraparte)),
      el("div", { class: "form-acoes" }, botao("Salvar", async () => {
        try {
          await Lancamentos.salvar({ clinica_id: ctx.clinica_id, data: n.data.value, categoria: n.categoria.value, tipo_custo: n.categoria.value === "Gasto" ? (n.tipo.value || null) : null,
            descricao: n.descricao.value, valor: Number(n.valor.value || 0), status: n.status.value, vencimento: n.venc.value || null, contraparte: n.contraparte.value });
          toast("Lançamento salvo.", "ok"); box.remove(); carregarLanc();
        } catch (e) { erro(e); }
      }), botao("Cancelar", () => box.remove(), "btn sec")));
    sec.insertBefore(box, lista);
  }
}
