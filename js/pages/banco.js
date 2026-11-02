// Conciliação Bancária — extrato do Banco Inter classificado, cobranças, regras e comparação banco × franquia.
import { Inter, Resumo, mesesDisponiveis } from "../api.js";
import { el, kpi, fmt, secao, tabela, grafico, input, campo, botao, select, toast, erro, seletorPeriodo } from "../ui.js";
import { LISTAS } from "../config.js";

const CATS = ["Receita", "Gasto", "Imposto", "Marketing", "Transferência", "Ignorar"];
const TIPO_TX = { PIX: "Pix", BOLETO_COBRANCA: "Boleto cobrança", PAGAMENTO: "Pagamento", TRANSFERENCIA: "Transferência", CARTAO: "Cartão", DEBITO: "Débito", CREDITO: "Crédito", TARIFA: "Tarifa", DEPOSITO: "Depósito", JUROS: "Juros", MULTA: "Multa", OUTROS: "Outros" };

export async function render(root, ctx) {
  const aba = (ctx.params[0] || "extrato").split("?")[0];
  const integs = await Inter.integracoes(ctx.clinica_id);
  const integ = ctx.unidade_id ? integs.find(i => i.unidade_id === ctx.unidade_id) : null;

  root.append(el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Conciliação Bancária" + (ctx.unidade ? " — " + ctx.unidade.nome : " — consolidado")),
    el("p", { class: "sub", style: "margin:0" }, "Extrato do Banco Inter classificado em receitas, gastos, impostos e marketing; créditos conciliados com as parcelas da franquia.")),
    el("div", { class: "subnav" }, ...[["extrato", "Extrato"], ["cobrancas", "Cobranças"], ["comparar", "Banco × Franquia"], ["regras", "Regras"]].map(([k, t]) => el("a", { href: "#/banco/" + k, class: aba === k ? "ativo" : "" }, t)))));

  if (!integs.length) {
    root.append(secao("Integração não configurada", el("p", {}, "Nenhuma unidade tem a conta do Banco Inter cadastrada. ", ctx.admin ? el("a", { href: "#/cadastros" }, "Cadastrar em Cadastros → Banco Inter") : "Peça a um administrador para cadastrar em Cadastros.")));
    return;
  }

  // ---- status + sincronização
  const alvo = integ || (ctx.unidade_id ? null : integs[0]);
  const btnSync = botao("Sincronizar agora", async () => {
    if (!alvo) return toast("Selecione uma unidade com integração cadastrada.", "erro");
    btnSync.disabled = true; btnSync.textContent = "Sincronizando…";
    try { const r = await Inter.sincronizar(alvo.unidade_id); toast(`Sincronizado: ${r.extrato} itens de extrato, ${r.cobrancas} cobranças, ${r.conciliados} créditos conciliados.`, "ok"); location.reload(); }
    catch (e) { erro(e); btnSync.disabled = false; btnSync.textContent = "Sincronizar agora"; }
  }, "btn");
  const saldoTotal = integs.filter(i => !ctx.unidade_id || i.unidade_id === ctx.unidade_id).reduce((a, i) => a + Number(i.saldo || 0), 0);
  const ultima = integs.filter(i => !ctx.unidade_id || i.unidade_id === ctx.unidade_id).map(i => i.ultima_sync).filter(Boolean).sort().pop();
  root.append(secao("Conta", el("div", { class: "grid grid-kpi" },
    kpi({ titulo: "Saldo disponível", valor: saldoTotal, formato: fmt.brl, sub: alvo?.saldo_em ? "em " + fmt.data(alvo.saldo_em) : undefined }),
    kpi({ titulo: "Última sincronização", valor: ultima ? new Date(ultima).toLocaleString("pt-BR") : "nunca", formato: v => v }),
    el("div", { class: "kpi" }, el("div", { class: "kpi-titulo" }, "Sincronização"), el("div", { style: "margin-top:8px" }, ctx.editor && alvo ? btnSync : el("span", { class: "nota" }, ctx.unidade_id ? "Sem integração nesta unidade." : "Selecione uma unidade para sincronizar.")),
      alvo?.ultimo_erro ? el("div", { class: "kpi-linhas" }, el("span", { class: "kpi-sub", style: "color:var(--ruim)" }, "Último erro: " + alvo.ultimo_erro)) : null))));

  // sincroniza sozinho se a última foi há mais de 12 h
  if (ctx.editor && alvo && (!alvo.ultima_sync || Date.now() - new Date(alvo.ultima_sync) > 12 * 3600e3) && !sessionStorage.getItem("inter:auto:" + alvo.id)) {
    sessionStorage.setItem("inter:auto:" + alvo.id, "1");
    Inter.sincronizar(alvo.unidade_id).then(r => toast(`Extrato atualizado automaticamente (${r.extrato} itens).`, "ok")).catch(e => console.warn("auto-sync", e.message));
  }

  const area = el("div"); root.append(area);
  if (aba === "extrato") await extrato(area, ctx, alvo);
  else if (aba === "cobrancas") await cobrancas(area, ctx);
  else if (aba === "comparar") await comparar(area, ctx);
  else await regras(area, ctx);
}

// ------------------------------------------------------------------ extrato
async function extrato(area, ctx, alvo) {
  const filtro = select([["", "Todos os itens"], ["C", "Só entradas"], ["D", "Só saídas"], ["sem_categoria", "Saídas a classificar"], ["sem_parcela", "Entradas sem parcela correspondente"]], { style: "width:auto" }, sessionStorage.getItem("inter:filtro") || "");
  const busca = input({ placeholder: "buscar na descrição / contraparte", style: "width:260px" });
  const lista = el("div"); let periodoAtual;
  const periodo = seletorPeriodo(mesesDisponiveis(), p => { periodoAtual = p; carregar(); }, { chave: "banco", padraoMeses: 3 });
  periodoAtual = periodo.valor();
  const acoes = ctx.editor && alvo ? el("div", { class: "form-acoes" },
    botao("Aplicar regras", async () => { try { const n = await Inter.classificar(alvo.unidade_id); toast(`${n} itens classificados pelas regras.`, "ok"); carregar(); } catch (e) { erro(e); } }, "btn sec"),
    botao("Gerar lançamentos dos gastos", async () => { try { const r = await Inter.gerarLancamentos(alvo.unidade_id); toast(`Lançamentos: ${r.novos} novos, ${r.atualizados} atualizados, ${r.cancelados} cancelados.`, "ok"); carregar(); } catch (e) { erro(e); } }, "btn sec"),
    botao("Conciliar entradas com parcelas", async () => { try { const n = await Inter.conciliar(alvo.unidade_id); toast(`${n} créditos conciliados com parcelas da franquia.`, "ok"); carregar(); } catch (e) { erro(e); } }, "btn sec"),
    el("span", { class: "nota" }, "Saídas classificadas como Gasto, Imposto ou Marketing viram lançamentos no Financeiro automaticamente ao salvar a categoria.")) : null;
  area.append(secao("Extrato", el("div", { class: "periodo" }, periodo, campo("Mostrar", filtro), campo("Buscar", busca)), acoes, lista));
  filtro.onchange = () => { sessionStorage.setItem("inter:filtro", filtro.value); carregar(); };
  busca.oninput = () => { clearTimeout(busca._t); busca._t = setTimeout(carregar, 300); };
  await carregar();

  async function carregar() {
    const f = filtro.value;
    let rows = await Inter.extrato(ctx.u, { de: periodoAtual.de, ate: periodoAtual.ate, tipo: f === "C" || f === "D" ? f : undefined, filtro: f === "sem_categoria" || f === "sem_parcela" ? f : undefined });
    if (f === "sem_categoria") rows = rows.filter(r => r.tipo_operacao === "D");
    const q = busca.value.trim().toLowerCase();
    if (q) rows = rows.filter(r => `${r.titulo || ""} ${r.descricao || ""} ${r.contraparte || ""}`.toLowerCase().includes(q));
    const parcelas = await Inter.parcelas([...new Set(rows.map(r => r.conciliado_id).filter(Boolean))]);
    const ent = rows.filter(r => r.tipo_operacao === "C").reduce((a, r) => a + Number(r.valor), 0), sai = rows.filter(r => r.tipo_operacao === "D").reduce((a, r) => a + Number(r.valor), 0);
    const semCat = rows.filter(r => r.tipo_operacao === "D" && !r.categoria).length, semParc = rows.filter(r => r.tipo_operacao === "C" && !r.conciliado_id && (r.categoria || "Receita") === "Receita").length;
    lista.replaceChildren(
      el("div", { class: "grid grid-kpi", style: "margin:10px 0" },
        kpi({ titulo: "Entradas", valor: ent, formato: fmt.brl }), kpi({ titulo: "Saídas", valor: sai, formato: fmt.brl }), kpi({ titulo: "Saldo do período", valor: ent - sai, formato: fmt.brl }),
        kpi({ titulo: "Saídas a classificar", valor: semCat, formato: fmt.int }), kpi({ titulo: "Entradas sem parcela", valor: semParc, formato: fmt.int })),
      el("div", { class: "tabela-wrap" }, tabela([
        { k: "data", t: "Data", f: fmt.data },
        { k: "tipo_operacao", t: "", f: v => el("span", { class: "badge " + (v === "C" ? "ok" : "ruim") }, v === "C" ? "entrada" : "saída") },
        { k: "tipo_transacao", t: "Tipo", f: v => TIPO_TX[v] || v || "—" },
        { k: r => [r.titulo, r.descricao].filter(Boolean).join(" — "), t: "Descrição" },
        { k: "contraparte", t: "Contraparte", f: v => v || "—" },
        { k: "valor", t: "Valor", cls: "num", f: (v, r) => el("span", { style: r.tipo_operacao === "C" ? "color:#0a6a0a" : "" }, (r.tipo_operacao === "C" ? "+" : "−") + fmt.brl(v)) },
        { k: "categoria", t: "Categoria", f: (v, r) => ctx.editor ? selCat(r) : (v || "—") },
        { k: "tipo_custo", t: "Fixo/Variável", f: (v, r) => r.categoria !== "Gasto" ? "—" : ctx.editor ? selTipo(r) : (v || "—") },
        { k: "conciliado_id", t: "Conciliação", f: (v, r) => {
          if (r.tipo_operacao === "D") return r.lancamento_id ? el("span", { class: "badge ok" }, "no Financeiro") : el("span", { class: "nota" }, "—");
          const p = v && parcelas[v]; return p ? el("span", { class: "badge ok", title: `${p.descricao || ""} ${fmt.data(p.data || p.vencimento)}` }, "parcela: " + (p.contraparte || "—")) : el("span", { class: "badge warn" }, "sem parcela");
        } },
        ctx.editor ? { k: "id", t: "", f: (v, r) => botao("regra", () => location.hash = `#/banco/regras?padrao=${encodeURIComponent((r.contraparte || r.titulo || r.descricao || "").slice(0, 40))}&op=${r.tipo_operacao}`, "btn sec mini") } : null,
      ].filter(Boolean), rows, { vazio: "Nenhum item no filtro. Sincronize a conta ou amplie o período." })));
  }
  function selCat(r) {
    const s = select([["", "(a classificar)"], ...CATS], { class: "input", style: "padding:3px 6px;width:auto" }, r.categoria || "");
    s.onchange = async () => { try { await Inter.atualizarExtrato(r.id, { categoria: s.value || null, tipo_custo: s.value === "Gasto" ? r.tipo_custo : null }); r.categoria = s.value || null; if (alvo) await Inter.gerarLancamentos(alvo.unidade_id); toast("Classificado.", "ok"); carregar(); } catch (e) { erro(e); } };
    return s;
  }
  function selTipo(r) {
    const s = select([["", "(não classificado)"], ...LISTAS.tiposCusto], { class: "input", style: "padding:3px 6px;width:auto" }, r.tipo_custo || "");
    s.onchange = async () => { try { await Inter.atualizarExtrato(r.id, { tipo_custo: s.value || null }); if (alvo) await Inter.gerarLancamentos(alvo.unidade_id); toast("Atualizado.", "ok"); } catch (e) { erro(e); } };
    return s;
  }
}

// ------------------------------------------------------------------ cobranças
async function cobrancas(area, ctx) {
  const lista = el("div"); let periodoAtual;
  const periodo = seletorPeriodo(mesesDisponiveis(), p => { periodoAtual = p; carregar(); }, { chave: "banco-cob", padraoMeses: 3 });
  periodoAtual = periodo.valor();
  area.append(secao("Cobranças emitidas pelo Inter (boletos e Pix cobrança)", el("p", { class: "nota" }, "Período pelo vencimento. Situação informada pelo banco."), periodo, lista));
  await carregar();
  async function carregar() {
    const rows = await Inter.cobrancas(ctx.u, { de: periodoAtual.de, ate: periodoAtual.ate });
    const soma = f => rows.filter(f).reduce((a, r) => a + Number(r.valor || 0), 0);
    const hoje = new Date().toISOString().slice(0, 10);
    const receb = r => /RECEBIDO/.test(r.situacao || ""), aberto = r => /A_RECEBER|EM_PROCESSAMENTO|ATRASADO/.test(r.situacao || ""), atras = r => aberto(r) && r.data_vencimento < hoje;
    lista.replaceChildren(
      el("div", { class: "grid grid-kpi", style: "margin:10px 0" },
        kpi({ titulo: "Cobranças", valor: rows.length, formato: fmt.int }), kpi({ titulo: "Recebido", valor: soma(receb), formato: fmt.brl }),
        kpi({ titulo: "A receber", valor: soma(r => aberto(r) && !atras(r)), formato: fmt.brl }), kpi({ titulo: "Vencido em aberto", valor: soma(atras), formato: fmt.brl }),
        kpi({ titulo: "Cancelado / expirado", valor: soma(r => /CANCELADO|EXPIRADO/.test(r.situacao || "")), formato: fmt.brl })),
      el("div", { class: "tabela-wrap" }, tabela([
        { k: "data_vencimento", t: "Vencimento", f: fmt.data }, { k: "pagador", t: "Pagador", f: v => v || "—" }, { k: "seu_numero", t: "Seu número", f: v => v || "—" },
        { k: "valor", t: "Valor", cls: "num", f: fmt.brl }, { k: "valor_recebido", t: "Recebido", cls: "num", f: fmt.brl },
        { k: "situacao", t: "Situação", f: (v, r) => el("span", { class: "badge " + (receb(r) ? "ok" : atras(r) ? "ruim" : aberto(r) ? "warn" : "") }, (v || "—").replace(/_/g, " ").toLowerCase()) },
        { k: "origem_recebimento", t: "Origem", f: v => v || "—" }, { k: "data_situacao", t: "Data situação", f: fmt.data },
      ], rows, { vazio: "Nenhuma cobrança no período (ou a integração não inclui a API Cobrança)." })));
  }
}

// ------------------------------------------------------------------ banco × franquia
async function comparar(area, ctx) {
  const banco = await Inter.mensal(ctx.u), fr = await Resumo.mensal(ctx.u);
  const porMes = {};
  for (const b of banco) { const m = porMes[b.mes] ||= { mes: b.mes, entradas: 0, saidas: 0, sem_class: 0, conc: 0, sem_parc: 0, receita: 0, gastos: 0 }; m.entradas += Number(b.entradas); m.saidas += Number(b.saidas); m.sem_class += Number(b.saidas_sem_classificacao); m.conc += Number(b.creditos_conciliados); m.sem_parc += Number(b.creditos_sem_parcela); }
  for (const f of fr) { const m = porMes[f.mes] ||= { mes: f.mes, entradas: 0, saidas: 0, sem_class: 0, conc: 0, sem_parc: 0, receita: 0, gastos: 0 }; m.receita += Number(f.receitas || 0); m.gastos += Number(f.gastos || 0) + Number(f.impostos || 0) + Number(f.marketing || 0); }
  const rows = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes));
  const sec = secao("Receita registrada × entradas no banco, por mês", el("p", { class: "nota" }, "Receita registrada = parcelas pagas no contas a receber da franquia (e lançamentos manuais). Entradas no banco = créditos do extrato classificados como Receita. Diferenças apontam parcelas marcadas como pagas sem crédito correspondente (ou recebidas em outra conta/caixa) e créditos sem parcela registrada."));
  if (rows.length) grafico(sec, { tipo: "bar", labels: rows.map(r => fmt.mes(r.mes)), formatoY: fmt.brl, datasets: [
    { label: "Receita registrada (franquia)", data: rows.map(r => r.receita) }, { label: "Entradas no banco", data: rows.map(r => r.entradas) },
    { label: "Gastos registrados", data: rows.map(r => r.gastos) }, { label: "Saídas no banco", data: rows.map(r => r.saidas) }] }, 280);
  sec.append(el("div", { class: "tabela-wrap" }, tabela([
    { k: "mes", t: "Mês", f: fmt.mes }, { k: "receita", t: "Receita registrada", cls: "num", f: fmt.brl }, { k: "entradas", t: "Entradas banco", cls: "num", f: fmt.brl },
    { k: r => r.entradas - r.receita, t: "Diferença", cls: "num", f: v => el("span", { style: Math.abs(v) > 1 ? "color:var(--ruim);font-weight:600" : "" }, fmt.brl(v)) },
    { k: "conc", t: "Créditos conciliados", cls: "num", f: fmt.int }, { k: "sem_parc", t: "Créditos sem parcela", cls: "num", f: fmt.int },
    { k: "gastos", t: "Gastos registrados", cls: "num", f: fmt.brl }, { k: "saidas", t: "Saídas banco (classif.)", cls: "num", f: fmt.brl }, { k: "sem_class", t: "Saídas a classificar", cls: "num", f: fmt.brl },
  ], [...rows].reverse(), { vazio: "Sem dados. Sincronize a conta." })));
  area.append(sec);
}

// ------------------------------------------------------------------ regras
async function regras(area, ctx) {
  const params = new URLSearchParams((location.hash.split("?")[1] || ""));
  const lista = el("div");
  const f = { padrao: input({ value: params.get("padrao") || "", placeholder: "trecho da descrição ou contraparte, ex.: ALUGUEL" }), op: select([["", "entradas e saídas"], ["D", "só saídas"], ["C", "só entradas"]], {}, params.get("op") || ""), cat: select(CATS, {}, params.get("op") === "C" ? "Receita" : "Gasto"), tipo: select([["", "—"], ...LISTAS.tiposCusto]), ordem: input({ type: "number", value: 100 }) };
  area.append(secao("Regras de classificação", el("p", { class: "nota" }, "Aplicadas em ordem a cada sincronização aos itens ainda sem categoria (busca o trecho em título, descrição e contraparte, sem diferenciar maiúsculas). Impostos conhecidos (DAS, DARF, ISS, INSS, FGTS) e entradas sem regra são classificados automaticamente."),
    ctx.editor ? el("div", { class: "form-grid" }, campo("Trecho procurado", f.padrao), campo("Aplicar a", f.op), campo("Categoria", f.cat), campo("Fixo/Variável (se gasto)", f.tipo), campo("Ordem", f.ordem)) : null,
    ctx.editor ? el("div", { class: "form-acoes" }, botao("+ Adicionar regra", async () => {
      if (!f.padrao.value.trim()) return toast("Informe o trecho procurado.", "erro");
      try { await Inter.salvarRegra({ clinica_id: ctx.clinica_id, padrao: f.padrao.value.trim(), tipo_operacao: f.op.value || null, categoria: f.cat.value, tipo_custo: f.cat.value === "Gasto" ? (f.tipo.value || null) : null, ordem: Number(f.ordem.value || 100) }); f.padrao.value = ""; toast("Regra adicionada. Use “Aplicar regras” no extrato para reclassificar.", "ok"); carregar(); } catch (e) { erro(e); }
    })) : null, lista));
  await carregar();
  async function carregar() {
    const rows = await Inter.regras(ctx.clinica_id);
    lista.replaceChildren(tabela([
      { k: "ordem", t: "Ordem", cls: "num" }, { k: "padrao", t: "Trecho" }, { k: "tipo_operacao", t: "Aplicar a", f: v => v === "C" ? "entradas" : v === "D" ? "saídas" : "ambas" },
      { k: "categoria", t: "Categoria" }, { k: "tipo_custo", t: "Fixo/Variável", f: v => v || "—" },
      ctx.editor ? { k: "id", t: "", f: v => botao("excluir", async () => { try { await Inter.excluirRegra(v); carregar(); } catch (e) { erro(e); } }, "btn perigo mini") } : null,
    ].filter(Boolean), rows, { vazio: "Nenhuma regra ainda." }));
  }
}
