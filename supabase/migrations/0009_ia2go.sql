-- Números do IA2GO (agente de IA de WhatsApp da franquia) coletados por semana na tela Conversas (filtro por data)
alter table public.base_semanal
  add column if not exists ia_quentes int,
  add column if not exists ia_mornas int,
  add column if not exists ia_frias int,
  add column if not exists ia_nao_classificadas int,
  add column if not exists ia_avaliacoes int,
  add column if not exists ia_ultimo_codigo int;
comment on column public.base_semanal.ia_ultimo_codigo is 'Último número de conversa (#IA-xxx-NNNNN) da semana; a diferença entre semanas confere o total de leads';

create or replace view public.v2_ia2go_semanal with (security_invoker = true) as
select b.clinica_id, b.unidade_id, b.id_semana, s.inicio, s.fim, s.mes,
       b.leads, b.aval_agendadas, b.ia_quentes, b.ia_mornas, b.ia_frias, b.ia_nao_classificadas, b.ia_avaliacoes, b.ia_ultimo_codigo,
       b.ia_ultimo_codigo - lag(b.ia_ultimo_codigo) over (partition by b.clinica_id, b.unidade_id order by s.inicio) as leads_por_codigo,
       case when b.leads > 0 then round(coalesce(b.ia_quentes,0)::numeric / b.leads, 4) end as taxa_quentes,
       case when b.leads > 0 then round((coalesce(b.ia_quentes,0) + coalesce(b.ia_mornas,0))::numeric / b.leads, 4) end as taxa_qualificados,
       case when b.leads > 0 then round(coalesce(b.ia_nao_classificadas,0)::numeric / b.leads, 4) end as taxa_nao_classificadas
from public.base_semanal b join public.semanas s using (id_semana);

-- leads por origem informados por mês (gráfico "Leads por Origem" do dashboard do IA2GO); distribuídos pelas semanas em leads_canal
create table if not exists public.ia2go_leads_origem_mes (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  mes text not null,
  canal text not null,
  quantidade int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (unidade_id, mes, canal)
);
alter table public.ia2go_leads_origem_mes enable row level security;
create policy "ia2go_leads_origem_mes: leitura" on public.ia2go_leads_origem_mes for select to authenticated using (clinica_id = public.current_clinica_id());
create policy "ia2go_leads_origem_mes: insert" on public.ia2go_leads_origem_mes for insert to authenticated with check (clinica_id = public.current_clinica_id() and public.pode_editar());
create policy "ia2go_leads_origem_mes: update" on public.ia2go_leads_origem_mes for update to authenticated using (clinica_id = public.current_clinica_id() and public.pode_editar()) with check (clinica_id = public.current_clinica_id() and public.pode_editar());
