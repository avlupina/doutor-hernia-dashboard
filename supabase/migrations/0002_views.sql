-- Views de cálculo (security_invoker: respeitam o RLS do usuário)

create or replace view public.v_resumo_semanal with (security_invoker = true) as
with f as (
  select clinica_id, id_semana,
         sum(aval_realizadas) aval_realizadas, sum(contratos) contratos, sum(atendimentos) atendimentos
  from public.base_semanal_fisio group by 1,2
), c as (
  select clinica_id, id_semana,
         count(*) filter (where tipo='Avaliação') aval_contratadas,
         coalesce(sum(valor) filter (where tipo='Avaliação'),0) valor_avaliacoes,
         count(*) filter (where tipo='Protocolo') protocolos_contratados,
         coalesce(sum(valor) filter (where tipo='Protocolo'),0) valor_protocolos,
         count(*) filter (where condicao='À vista') contratos_a_vista,
         count(*) filter (where condicao='Parcelado') contratos_parcelados
  from public.contratos where status_pagamento <> 'Cancelado' group by 1,2
), l as (
  select clinica_id, id_semana,
         coalesce(sum(valor) filter (where categoria='Receita'),0) receitas,
         coalesce(sum(valor) filter (where categoria='Gasto'),0) gastos,
         coalesce(sum(valor) filter (where categoria='Imposto'),0) impostos,
         coalesce(sum(valor) filter (where categoria='Marketing'),0) marketing,
         coalesce(sum(valor) filter (where categoria='Gasto' and tipo_custo='Fixo'),0) gastos_fixos,
         coalesce(sum(valor) filter (where categoria='Gasto' and tipo_custo='Variável'),0) gastos_variaveis
  from public.lancamentos where status <> 'Cancelado' group by 1,2
), lc as (
  select clinica_id, id_semana, sum(quantidade) leads_por_canal from public.leads_canal group by 1,2
), base as (
  select b.clinica_id, b.id_semana, s.inicio, s.fim, s.mes,
         b.leads, b.aval_agendadas, b.aval_canceladas, b.cancel_atendimentos, b.novos_pacientes,
         b.horarios_disp_manha, b.horarios_ocup_manha, b.horarios_disp_tarde, b.horarios_ocup_tarde,
         coalesce(f.aval_realizadas,0) aval_realizadas, coalesce(f.contratos,0) contratos, coalesce(f.atendimentos,0) atendimentos,
         coalesce(c.aval_contratadas,0) aval_contratadas, coalesce(c.valor_avaliacoes,0) valor_avaliacoes,
         coalesce(c.protocolos_contratados,0) protocolos_contratados, coalesce(c.valor_protocolos,0) valor_protocolos,
         coalesce(c.contratos_a_vista,0) contratos_a_vista, coalesce(c.contratos_parcelados,0) contratos_parcelados,
         coalesce(l.receitas,0) receitas, coalesce(l.gastos,0) gastos, coalesce(l.impostos,0) impostos, coalesce(l.marketing,0) marketing,
         coalesce(l.gastos_fixos,0) gastos_fixos, coalesce(l.gastos_variaveis,0) gastos_variaveis,
         coalesce(lc.leads_por_canal,0) leads_por_canal
  from public.base_semanal b
  join public.semanas s using (id_semana)
  left join f on f.clinica_id=b.clinica_id and f.id_semana=b.id_semana
  left join c on c.clinica_id=b.clinica_id and c.id_semana=b.id_semana
  left join l on l.clinica_id=b.clinica_id and l.id_semana=b.id_semana
  left join lc on lc.clinica_id=b.clinica_id and lc.id_semana=b.id_semana
)
select *,
  case when aval_agendadas>0 then round(aval_canceladas::numeric/aval_agendadas,4) end taxa_cancel_aval,
  case when aval_realizadas>0 then round(contratos::numeric/aval_realizadas,4) end conversao_aval_contrato,
  case when leads>0 then round(aval_agendadas::numeric/leads,4) end conversao_lead_aval,
  case when horarios_disp_manha>0 then round(horarios_ocup_manha::numeric/horarios_disp_manha,4) end ocupacao_manha,
  case when horarios_disp_tarde>0 then round(horarios_ocup_tarde::numeric/horarios_disp_tarde,4) end ocupacao_tarde,
  case when horarios_disp_manha+horarios_disp_tarde>0
       then round((horarios_ocup_manha+horarios_ocup_tarde)::numeric/(horarios_disp_manha+horarios_disp_tarde),4) end ocupacao_total,
  valor_avaliacoes+valor_protocolos valor_total_contratado,
  receitas-gastos-impostos-marketing resultado,
  case when leads>0 then round(marketing/leads,2) end custo_por_lead,
  case when aval_agendadas>0 then round(marketing/aval_agendadas,2) end custo_por_mql,   -- MQL = avaliação agendada
  case when aval_realizadas>0 then round(marketing/aval_realizadas,2) end custo_por_sql,  -- SQL = avaliação realizada
  case when novos_pacientes>0 then round(marketing/novos_pacientes,2) end cac,
  case when atendimentos>0 then round(receitas/atendimentos,2) end ticket_por_atendimento,
  sum(receitas) over (partition by clinica_id, mes order by inicio) receita_acum_mes,
  sum(gastos) over (partition by clinica_id, mes order by inicio) gastos_acum_mes
from base;

create or replace view public.v_fisio_semanal with (security_invoker = true) as
select bf.clinica_id, bf.id_semana, s.inicio, s.mes, bf.fisioterapeuta_id, ft.nome fisioterapeuta, ft.slot,
       bf.aval_realizadas, bf.contratos, bf.atendimentos, bf.tempo_medio_min, bf.desvio_min,
       case when bf.aval_realizadas>0 then round(bf.contratos::numeric/bf.aval_realizadas,4) end conversao,
       coalesce(c.valor_contratado,0) valor_contratado,
       coalesce(c.n_contratos,0) contratos_registrados
from public.base_semanal_fisio bf
join public.semanas s using (id_semana)
join public.fisioterapeutas ft on ft.id = bf.fisioterapeuta_id
left join lateral (
  select sum(valor) valor_contratado, count(*) n_contratos from public.contratos ct
  where ct.clinica_id=bf.clinica_id and ct.id_semana=bf.id_semana and ct.fisioterapeuta_id=bf.fisioterapeuta_id
    and ct.status_pagamento <> 'Cancelado'
) c on true;

create or replace view public.v_resumo_mensal with (security_invoker = true) as
with b as (
  select clinica_id, mes,
         sum(leads) leads, sum(aval_agendadas) aval_agendadas, sum(aval_canceladas) aval_canceladas,
         sum(aval_realizadas) aval_realizadas, sum(contratos) contratos, sum(atendimentos) atendimentos,
         sum(cancel_atendimentos) cancel_atendimentos, sum(novos_pacientes) novos_pacientes,
         sum(horarios_disp_manha) hdm, sum(horarios_ocup_manha) hom, sum(horarios_disp_tarde) hdt, sum(horarios_ocup_tarde) hot,
         count(*) semanas
  from public.v_resumo_semanal group by 1,2
), c as (
  select clinica_id, mes,
         count(*) filter (where tipo='Avaliação') aval_contratadas,
         coalesce(sum(valor) filter (where tipo='Avaliação'),0) valor_avaliacoes,
         count(*) filter (where tipo='Protocolo') protocolos_contratados,
         coalesce(sum(valor) filter (where tipo='Protocolo'),0) valor_protocolos
  from public.contratos where status_pagamento <> 'Cancelado' group by 1,2
), l as (
  select clinica_id, mes,
         coalesce(sum(valor) filter (where categoria='Receita'),0) receitas,
         coalesce(sum(valor) filter (where categoria='Gasto'),0) gastos,
         coalesce(sum(valor) filter (where categoria='Imposto'),0) impostos,
         coalesce(sum(valor) filter (where categoria='Marketing'),0) marketing,
         coalesce(sum(valor) filter (where categoria='Gasto' and tipo_custo='Fixo'),0) gastos_fixos,
         coalesce(sum(valor) filter (where categoria='Gasto' and tipo_custo='Variável'),0) gastos_variaveis
  from public.lancamentos where status <> 'Cancelado' group by 1,2
), m as (
  select coalesce(b.clinica_id, c.clinica_id, l.clinica_id) clinica_id, coalesce(b.mes, c.mes, l.mes) mes,
         coalesce(b.leads,0) leads, coalesce(b.aval_agendadas,0) aval_agendadas, coalesce(b.aval_canceladas,0) aval_canceladas,
         coalesce(b.aval_realizadas,0) aval_realizadas, coalesce(b.contratos,0) contratos, coalesce(b.atendimentos,0) atendimentos,
         coalesce(b.cancel_atendimentos,0) cancel_atendimentos, coalesce(b.novos_pacientes,0) novos_pacientes,
         coalesce(b.hdm,0) hdm, coalesce(b.hom,0) hom, coalesce(b.hdt,0) hdt, coalesce(b.hot,0) hot, coalesce(b.semanas,0) semanas,
         coalesce(c.aval_contratadas,0) aval_contratadas, coalesce(c.valor_avaliacoes,0) valor_avaliacoes,
         coalesce(c.protocolos_contratados,0) protocolos_contratados, coalesce(c.valor_protocolos,0) valor_protocolos,
         coalesce(l.receitas,0) receitas, coalesce(l.gastos,0) gastos, coalesce(l.impostos,0) impostos, coalesce(l.marketing,0) marketing,
         coalesce(l.gastos_fixos,0) gastos_fixos, coalesce(l.gastos_variaveis,0) gastos_variaveis
  from b full join c on c.clinica_id=b.clinica_id and c.mes=b.mes
         full join l on l.clinica_id=coalesce(b.clinica_id,c.clinica_id) and l.mes=coalesce(b.mes,c.mes)
)
select *,
  case when aval_agendadas>0 then round(aval_canceladas::numeric/aval_agendadas,4) end taxa_cancel_aval,
  case when aval_realizadas>0 then round(contratos::numeric/aval_realizadas,4) end conversao_aval_contrato,
  case when hdm>0 then round(hom::numeric/hdm,4) end ocupacao_manha,
  case when hdt>0 then round(hot::numeric/hdt,4) end ocupacao_tarde,
  case when hdm+hdt>0 then round((hom+hot)::numeric/(hdm+hdt),4) end ocupacao_total,
  receitas-gastos-impostos-marketing resultado,
  case when receitas>0 then round((receitas-gastos-impostos-marketing)/receitas,4) end margem_liquida,
  case when receitas>0 then round((receitas-gastos_variaveis-impostos)/receitas,4) end margem_contribuicao,
  -- ponto de equilíbrio: custos fixos (gastos fixos + marketing) / margem de contribuição
  case when receitas-gastos_variaveis-impostos>0
       then round((gastos_fixos+marketing)/((receitas-gastos_variaveis-impostos)/receitas),2) end ponto_equilibrio,
  case when leads>0 then round(marketing/leads,2) end custo_por_lead,
  case when aval_agendadas>0 then round(marketing/aval_agendadas,2) end custo_por_mql,
  case when aval_realizadas>0 then round(marketing/aval_realizadas,2) end custo_por_sql,
  case when novos_pacientes>0 then round(marketing/novos_pacientes,2) end cac,
  case when novos_pacientes>0 then round(valor_protocolos/novos_pacientes,2) end ticket_medio_novo_paciente
from m;

create or replace view public.v_pendencias with (security_invoker = true) as
select clinica_id,
       coalesce(sum(valor) filter (where status='Pendente'),0) pendente_valor,
       count(*) filter (where status='Pendente') pendente_qtd,
       coalesce(sum(valor) filter (where status='Atrasado'),0) atrasado_valor,
       count(*) filter (where status='Atrasado') atrasado_qtd
from public.lancamentos where categoria='Receita' group by 1;

create or replace view public.v_leads_canal_semanal with (security_invoker = true) as
select lc.clinica_id, lc.id_semana, s.mes, lc.canal, lc.quantidade,
       round(lc.quantidade::numeric / nullif(sum(lc.quantidade) over (partition by lc.clinica_id, lc.id_semana),0),4) participacao
from public.leads_canal lc join public.semanas s using (id_semana);

-- hardening (avisos do linter do Supabase)
alter function public.semana_de(date) set search_path = public;
alter function public.mes_de(date) set search_path = public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.current_clinica_id() from anon, public;
revoke execute on function public.current_papel() from anon, public;
revoke execute on function public.pode_editar() from anon, public;
