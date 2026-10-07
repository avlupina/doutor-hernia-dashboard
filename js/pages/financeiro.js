// Financeiro — margem, ponto de equilíbrio, projeções de cenários e classificação dos lançamentos.
import { Resumo, Lancamentos } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico, input, campo, botao, select, toast, erro, hoje, addDias } from "../ui.js";
import { LISTAS } from "../config.js";
import { agregarMeses } from "./mensal.js";

export async function render(root, ctx) {
  const meses = agregarMeses(await Resumo.mensal(ctx.u));
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Financeiro" + (ctx.unidade ? " — " + ctx.unidade.nome : " — consolidado")),
    el("p", { class: "sub", style: "margin:0" }, "Margem de contribuição, ponto de equilíbrio e lançamentos. Classifique os gastos em fixos ou variáveis para o cálculo do ponto de equilíbrio."))));

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

  // ---------------------------------------------------------------- lançamentos (classificação)
  const de = input({ type: "date", value: addDias(hoje(), -60) }), ate = input({ type: "date", value: hoje() });
  const cat = select([["", "Todas as categorias"], ...LISTAS.categorias], {}, "");
  const lista = el("div");
  const sec = secao("Lançamentos", el("div", { class: "form-grid" }, campo("De", de), campo("Até", ate), campo("Categoria", cat)),
    el("div", { class: "form-acoes" }, botao("Filtrar", carregarLanc, "btn sec"), ctx.editor ? botao("+ Novo lançamento", novo) : null), lista);
  root.append(sec);
  await carregarLanc();

  async function carregarLanc() {
    const rows = await Lancamentos.listar(ctx.u, { de: de.value, ate: ate.value, categoria: cat.value || undefined });
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
          await Lancamentos.salvar({ clinica_id: ctx.clinica_id, unidade_id: ctx.unidadePrincipal, data: n.data.value, categoria: n.categoria.value, tipo_custo: n.categoria.value === "Gasto" ? (n.tipo.value || null) : null,
            descricao: n.descricao.value, valor: Number(n.valor.value || 0), status: n.status.value, vencimento: n.venc.value || null, contraparte: n.contraparte.value });
          toast("Lançamento salvo.", "ok"); box.remove(); carregarLanc();
        } catch (e) { erro(e); }
      }), botao("Cancelar", () => box.remove(), "btn sec")));
    sec.insertBefore(box, lista);
  }
}
