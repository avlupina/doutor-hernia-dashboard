// Teste de ponta a ponta do importador fora do navegador:
//   node tools/test_import.mjs <email> <senha> [arquivo.xlsx]
import { readFileSync } from "node:fs";
import * as supabase from "@supabase/supabase-js";
import * as XLSX from "xlsx";

globalThis.window = { supabase, XLSX, location: { href: "" } };
const { sb, getPerfil } = await import("../js/supabase.js");
const { analisar, gravar } = await import("../js/importer.js");
const { Resumo } = await import("../js/api.js");

const [email, senha, arquivo = "Base_Dados_Clinica.xlsx"] = process.argv.slice(2);
const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
if (error) { console.error("login:", error.message); process.exit(1); }
const perfil = await getPerfil(true);
console.log("logado como", perfil.email, "| papel", perfil.papel, "| clínica", perfil.clinica_nome);

const dados = analisar(readFileSync(arquivo).buffer);
console.log("analisado:", { base: dados.base.length, contratos: dados.contratos.length, lancamentos: dados.lancamentos.length, leads: dados.leads.length, reunioes: dados.reunioes.length, acoes: dados.acoes.length, semanas: dados.semanas, fisios: dados.fisios, avisos: dados.avisos });
const ctx = { clinica_id: perfil.clinica_id, session: data.session };
const resumo = await gravar(dados, ctx, arquivo, (t, p) => console.log(`  ${Math.round(p * 100)}% ${t}`));
console.log("gravado:", resumo);

const sem = await Resumo.semanal(perfil.clinica_id);
console.table(sem.map(s => ({ semana: s.id_semana, leads: s.leads, aval: s.aval_realizadas, contratos: s.contratos, atend: s.atendimentos, ocup: s.ocupacao_total, receita: s.receitas, gastos: s.gastos, cac: s.cac, cpl: s.custo_por_lead })));
const mes = await Resumo.mensal(perfil.clinica_id);
console.table(mes.map(m => ({ mes: m.mes, receita: m.receitas, fixos: m.gastos_fixos, var: m.gastos_variaveis, resultado: m.resultado, mc: m.margem_contribuicao, pe: m.ponto_equilibrio, cac: m.cac })));
console.table(await Resumo.fisios(perfil.clinica_id));
await sb.auth.signOut();
