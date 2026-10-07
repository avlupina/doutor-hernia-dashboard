// Lançar semana — entrada manual dos dados de uma semana (alternativa à planilha).
import { Semanas, BaseSemanal, Fisios, LeadsCanal, Reunioes, Acoes, Contratos } from "../api.js";
import { el, fmt, secao, tabela, input, select, textarea, campo, botao, toast, erro, hoje } from "../ui.js";
import { LISTAS } from "../config.js";

export async function render(root, ctx) {
  if (!ctx.editor) { root.append(secao("Acesso", el("p", {}, "Apenas administradores e gestores lançam dados."))); return; }
  const semanas = await Semanas.listar("2025-01-01", "2028-12-31");
  const id0 = ctx.params[0] || Semanas.atual();
  const sel = select(semanas.map(s => [s.id_semana, `${s.id_semana}  (${fmt.data(s.inicio)} – ${fmt.data(s.fim)})`]), {}, id0);
  root.append(el("div", { class: "topo" },
    el("div", {}, el("h1", {}, "Lançar semana"), el("p", { class: "sub", style: "margin:0" }, "Preencha os dados coletados na semana. Cada bloco salva separadamente.")),
    el("div", { class: "acoes" }, el("span", { class: "nota" }, "Semana:"), sel, botao("Ver no painel", () => location.hash = "#/painel/" + sel.value, "btn sec"))));
  const corpo = el("div"); root.append(corpo);
  sel.onchange = () => { history.replaceState(null, "", "#/semana/" + sel.value); carregar(sel.value); };
  await carregar(id0);

  async function carregar(id) {
    corpo.replaceChildren(el("p", { class: "sub" }, "Carregando…"));
    const [fisios, { base, fisios: bf }, leads, reuniao, acoes, contratos] = await Promise.all([
      Fisios.listar(ctx.clinica_id), BaseSemanal.obter(ctx.clinica_id, id), LeadsCanal.listar(ctx.clinica_id, id),
      Reunioes.obter(ctx.clinica_id, id), Acoes.listar(ctx.clinica_id, id), Contratos.listar(ctx.clinica_id),
    ]);
    corpo.replaceChildren();
    if (!fisios.length) corpo.append(el("p", { class: "nota" }, "Cadastre os fisioterapeutas em “Metas e equipe” para lançar os números por profissional."));
    const sem = semanas.find(s => s.id_semana === id);

    // --- base semanal
    const b = base || {};
    const num = (k, v) => input({ type: "number", min: 0, step: k.startsWith("tempo") || k.startsWith("desvio") ? 0.1 : 1, value: v ?? "" });
    const F = {
      leads: num("leads", b.leads), aval_agendadas: num("a", b.aval_agendadas), aval_canceladas: num("a", b.aval_canceladas),
      cancel_atendimentos: num("a", b.cancel_atendimentos), novos_pacientes: num("a", b.novos_pacientes),
      horarios_disp_manha: num("a", b.horarios_disp_manha), horarios_ocup_manha: num("a", b.horarios_ocup_manha),
      horarios_disp_tarde: num("a", b.horarios_disp_tarde), horarios_ocup_tarde: num("a", b.horarios_ocup_tarde),
      observacoes: input({ value: b.observacoes || "" }),
    };
    const FF = fisios.map(f => { const r = bf.find(x => x.fisioterapeuta_id === f.id) || {}; return { f, aval: num("a", r.aval_realizadas), contratos: num("a", r.contratos), atend: num("a", r.atendimentos), tempo: num("tempo", r.tempo_medio_min), desvio: num("desvio", r.desvio_min) }; });
    corpo.append(secao(`Dados da base — ${id} (${fmt.data(sem?.inicio)} a ${fmt.data(sem?.fim)})`,
      el("div", { class: "form-grid" },
        campo("Total de leads recebidos", F.leads), campo("Avaliações agendadas", F.aval_agendadas), campo("Avaliações canceladas", F.aval_canceladas),
        campo("Novos pacientes", F.novos_pacientes), campo("Cancelamentos de atendimentos", F.cancel_atendimentos),
        campo("Horários disponíveis — manhã", F.horarios_disp_manha), campo("Horários ocupados — manhã", F.horarios_ocup_manha),
        campo("Horários disponíveis — tarde", F.horarios_disp_tarde), campo("Horários ocupados — tarde", F.horarios_ocup_tarde), campo("Observações", F.observacoes)),
      ...FF.map(x => el("div", {}, el("h3", {}, x.f.nome), el("div", { class: "form-grid" },
        campo("Avaliações realizadas", x.aval), campo("Contratos fechados", x.contratos), campo("Atendimentos realizados", x.atend),
        campo("Tempo médio de atendimento (min)", x.tempo), campo("Desvio padrão (min)", x.desvio)))),
      el("div", { class: "form-acoes" }, botao("Salvar dados da base", async () => {
        try {
          const row = { clinica_id: ctx.clinica_id, id_semana: id };
          for (const k of Object.keys(F)) row[k] = k === "observacoes" ? F[k].value : Number(F[k].value || 0);
          const rowsF = FF.map(x => ({ clinica_id: ctx.clinica_id, id_semana: id, fisioterapeuta_id: x.f.id, aval_realizadas: Number(x.aval.value || 0), contratos: Number(x.contratos.value || 0),
            atendimentos: Number(x.atend.value || 0), tempo_medio_min: x.tempo.value === "" ? null : Number(x.tempo.value), desvio_min: x.desvio.value === "" ? null : Number(x.desvio.value) }));
          await BaseSemanal.salvar(row, rowsF); toast("Dados da base salvos.", "ok");
        } catch (e) { erro(e); }
      }))));

    // --- leads por canal
    const canais = [...new Set([...LISTAS.canais, ...leads.map(l => l.canal)])];
    const LC = canais.map(c => ({ c, i: num("a", leads.find(l => l.canal === c)?.quantidade ?? "") }));
    const soma = el("span", { class: "nota" });
    const atualizaSoma = () => { const s = LC.reduce((a, x) => a + Number(x.i.value || 0), 0); soma.textContent = `Soma dos canais: ${s} · total de leads informado: ${F.leads.value || 0}`; };
    LC.forEach(x => x.i.oninput = atualizaSoma); F.leads.oninput = atualizaSoma; atualizaSoma();
    corpo.append(secao("Leads por canal de ingresso", el("div", { class: "form-grid" }, ...LC.map(x => campo(x.c, x.i))), soma,
      el("div", { class: "form-acoes" }, botao("Salvar leads por canal", async () => {
        try { await LeadsCanal.salvar(LC.map(x => ({ clinica_id: ctx.clinica_id, id_semana: id, canal: x.c, quantidade: Number(x.i.value || 0) }))); toast("Leads por canal salvos.", "ok"); } catch (e) { erro(e); }
      }))));

    // --- contratos da semana
    const ctSem = contratos.filter(c => c.id_semana === id);
    const ctLista = el("div");
    const desenharCt = () => ctLista.replaceChildren(el("div", { class: "tabela-wrap" }, tabela([
      { k: "data", t: "Data", f: fmt.data }, { k: "paciente", t: "Paciente" }, { k: "tipo", t: "Tipo" }, { k: r => r.fisioterapeutas?.nome, t: "Fisio" }, { k: "descricao", t: "Descrição" },
      { k: "valor", t: "Valor", cls: "num", f: fmt.brl }, { k: "condicao", t: "Condição" }, { k: "forma_pagamento", t: "Forma" }, { k: "parcelas", t: "Parc.", cls: "num" }, { k: "status_pagamento", t: "Status" }, { k: "canal", t: "Canal" },
      { k: "id", t: "", f: v => botao("excluir", async () => { if (confirm("Excluir contrato?")) { try { await Contratos.excluir(v); const i = ctSem.findIndex(c => c.id === v); ctSem.splice(i, 1); desenharCt(); } catch (e) { erro(e); } } }, "btn perigo mini") },
    ], ctSem, { vazio: "Nenhum contrato registrado nesta semana." })));
    desenharCt();
    const N = { data: input({ type: "date", value: sem?.inicio || hoje() }), paciente: input(), tipo: select(["Avaliação", "Protocolo"]), fisio: select(fisios.map(f => [f.id, f.nome])), desc: input(), sessoes: input({ type: "number", min: 1 }),
      valor: input({ type: "number", step: 0.01 }), cond: select(LISTAS.condicoes), forma: select(LISTAS.formasPagamento), parc: input({ type: "number", min: 1, value: 1 }), status: select(LISTAS.statusPagamento), canal: select(LISTAS.canais) };
    corpo.append(secao("Avaliações e protocolos contratados na semana", ctLista, el("h3", {}, "Adicionar contrato"),
      el("div", { class: "form-grid" }, campo("Data", N.data), campo("Paciente", N.paciente), campo("Tipo", N.tipo), campo("Fisioterapeuta", N.fisio), campo("Protocolo / descrição", N.desc), campo("Nº sessões", N.sessoes),
        campo("Valor (R$)", N.valor), campo("Condição", N.cond), campo("Forma de pagamento", N.forma), campo("Parcelas", N.parc), campo("Status pagamento", N.status), campo("Canal de ingresso", N.canal)),
      el("div", { class: "form-acoes" }, botao("Adicionar", async () => {
        try {
          const r = await Contratos.salvar({ clinica_id: ctx.clinica_id, data: N.data.value, paciente: N.paciente.value, tipo: N.tipo.value, fisioterapeuta_id: N.fisio.value || null, descricao: N.desc.value,
            n_sessoes: N.sessoes.value ? Number(N.sessoes.value) : null, valor: Number(N.valor.value || 0), condicao: N.cond.value, forma_pagamento: N.forma.value, parcelas: Number(N.parc.value || 1), status_pagamento: N.status.value, canal: N.canal.value });
          r.fisioterapeutas = { nome: fisios.find(f => f.id === r.fisioterapeuta_id)?.nome };
          if (r.id_semana === id) ctSem.unshift(r); else toast(`Contrato salvo na semana ${r.id_semana}.`);
          desenharCt(); N.paciente.value = ""; N.valor.value = ""; toast("Contrato adicionado.", "ok");
        } catch (e) { erro(e); }
      }))));

    // --- reunião
    const R = reuniao || {};
    const RF = { resultado_geral: select([["", "—"], ...["Melhor", "Igual", "Pior"]], {}, R.resultado_geral || ""), pontos_positivos: textarea({}, R.pontos_positivos), pontos_melhorar: textarea({}, R.pontos_melhorar),
      pacientes_criticos: textarea({}, R.pacientes_criticos), pontos_pertinentes: textarea({}, R.pontos_pertinentes), problemas_atendimento: textarea({}, R.problemas_atendimento),
      prejudica_experiencia: select([["", "—"], ["true", "Sim"], ["false", "Não"]], {}, R.prejudica_experiencia == null ? "" : String(R.prejudica_experiencia)), prejudica_descricao: textarea({}, R.prejudica_descricao),
      demandas_equipe: textarea({}, R.demandas_equipe), pontos_proxima_semana: textarea({}, R.pontos_proxima_semana), outros: textarea({}, R.outros), metas_semana: textarea({}, R.metas_semana), solucoes: textarea({}, R.solucoes) };
    corpo.append(secao("Registro da reunião semanal", el("div", { class: "form-grid" },
      campo("Resultado geral (vs. semana anterior)", RF.resultado_geral), campo("Pontos positivos", RF.pontos_positivos), campo("Pontos a melhorar", RF.pontos_melhorar),
      campo("Pacientes críticos | riscos de desistência", RF.pacientes_criticos), campo("Pontos pertinentes", RF.pontos_pertinentes), campo("Problemas no atendimento", RF.problemas_atendimento),
      campo("Algo prejudicando a experiência do paciente?", RF.prejudica_experiencia), campo("Descrição", RF.prejudica_descricao),
      campo("Demandas da recepção e equipe", RF.demandas_equipe), campo("Pontos relevantes (próxima semana)", RF.pontos_proxima_semana), campo("O que mais ocorrer", RF.outros),
      campo("Metas da semana", RF.metas_semana), campo("Soluções para os problemas identificados", RF.solucoes)),
      el("div", { class: "form-acoes" }, botao("Salvar reunião", async () => {
        try {
          const row = { clinica_id: ctx.clinica_id, id_semana: id };
          for (const k of Object.keys(RF)) row[k] = k === "prejudica_experiencia" ? (RF[k].value === "" ? null : RF[k].value === "true") : (RF[k].value || null);
          await Reunioes.salvar(row); toast("Reunião salva.", "ok");
        } catch (e) { erro(e); }
      }))));

    // --- ações 5W2H
    const acLista = el("div");
    const desenharAc = () => acLista.replaceChildren(el("div", { class: "tabela-wrap" }, tabela([
      { k: "ordem", t: "#", cls: "num" }, { k: "problema", t: "Problema / meta" }, { k: "o_que", t: "O quê" }, { k: "por_que", t: "Por quê" }, { k: "onde", t: "Onde" }, { k: "quando", t: "Quando", f: fmt.data },
      { k: "quem", t: "Quem" }, { k: "como", t: "Como" }, { k: "quanto", t: "Quanto", cls: "num", f: fmt.brl },
      { k: "status", t: "Status", f: (v, r) => { const s = select(LISTAS.statusAcao, { style: "padding:3px 6px;width:auto" }, v); s.onchange = async () => { try { await Acoes.salvar({ ...r, status: s.value }); toast("Status atualizado.", "ok"); } catch (e) { erro(e); } }; return s; } },
      { k: "id", t: "", f: v => botao("excluir", async () => { if (confirm("Excluir ação?")) { try { await Acoes.excluir(v); acoes.splice(acoes.findIndex(a => a.id === v), 1); desenharAc(); } catch (e) { erro(e); } } }, "btn perigo mini") },
    ], acoes, { vazio: "Nenhuma ação nesta semana." })));
    desenharAc();
    const A = { problema: input(), o_que: input(), por_que: input(), onde: input(), quando: input({ type: "date" }), quem: input(), como: input(), quanto: input({ type: "number", step: 0.01 }), status: select(LISTAS.statusAcao) };
    corpo.append(secao("Plano de ação (5W2H)", acLista, el("h3", {}, "Nova ação"),
      el("div", { class: "form-grid" }, campo("Problema / meta", A.problema), campo("O quê (What)", A.o_que), campo("Por quê (Why)", A.por_que), campo("Onde (Where)", A.onde), campo("Quando (When)", A.quando),
        campo("Quem (Who)", A.quem), campo("Como (How)", A.como), campo("Quanto (How much, R$)", A.quanto), campo("Status", A.status)),
      el("div", { class: "form-acoes" }, botao("Adicionar ação", async () => {
        try {
          const r = await Acoes.salvar({ clinica_id: ctx.clinica_id, id_semana: id, ordem: acoes.length + 1, problema: A.problema.value, o_que: A.o_que.value, por_que: A.por_que.value, onde: A.onde.value,
            quando: A.quando.value || null, quem: A.quem.value, como: A.como.value, quanto: A.quanto.value ? Number(A.quanto.value) : null, status: A.status.value });
          acoes.push(r); desenharAc(); Object.values(A).forEach(i => { if (i.tagName === "INPUT") i.value = ""; }); toast("Ação adicionada.", "ok");
        } catch (e) { erro(e); }
      }))));
  }
}
