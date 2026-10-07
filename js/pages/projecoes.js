// Projeções — simulador de cenários financeiros (premissas a partir do mês mais recente).
import { Resumo } from "../api.js";
import { el, kpi, fmt, tabela, grafico, input, campo, botao, secao } from "../ui.js";
import { agregarMeses } from "./mensal.js";

export async function render(root, ctx) {
  const meses = agregarMeses(await Resumo.mensal(ctx.u));
  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Projeções" + (ctx.unidade ? " — " + ctx.unidade.nome : " — consolidado")),
    el("p", { class: "sub", style: "margin:0" }, "Simulação de cenários: receita, custos, resultado e ponto de equilíbrio nos próximos meses."))));
  const u = meses[meses.length - 1];
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

}
