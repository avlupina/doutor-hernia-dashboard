-- Unidades (filiais) por clínica + configurações da clínica (chave do assistente de IA)

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  cidade text,
  uf text,
  ativa boolean not null default true,
  inicio date,
  created_at timestamptz not null default now(),
  unique (clinica_id, nome)
);
alter table public.unidades enable row level security;
create policy "unidades: leitura" on public.unidades for select to authenticated using (clinica_id = public.current_clinica_id());
create policy "unidades: insert" on public.unidades for insert to authenticated with check (clinica_id = public.current_clinica_id() and public.pode_editar());
create policy "unidades: update" on public.unidades for update to authenticated using (clinica_id = public.current_clinica_id() and public.pode_editar()) with check (clinica_id = public.current_clinica_id() and public.pode_editar());
create policy "unidades: delete" on public.unidades for delete to authenticated using (clinica_id = public.current_clinica_id() and public.pode_editar());

-- unidade padrão para quem já tem dados: "Barreiras"
insert into public.unidades (clinica_id, nome, cidade, uf, ativa)
select id, 'Barreiras', 'Barreiras', 'BA', true from public.clinicas
on conflict do nothing;

-- coluna unidade_id nas tabelas de dados (nullable para compatibilidade; o app sempre preenche)
alter table public.fisioterapeutas add column unidade_id uuid references public.unidades(id) on delete set null;
alter table public.base_semanal add column unidade_id uuid references public.unidades(id) on delete cascade;
alter table public.base_semanal_fisio add column unidade_id uuid references public.unidades(id) on delete cascade;
alter table public.contratos add column unidade_id uuid references public.unidades(id) on delete set null;
alter table public.lancamentos add column unidade_id uuid references public.unidades(id) on delete set null;
alter table public.leads_canal add column unidade_id uuid references public.unidades(id) on delete cascade;
alter table public.reunioes add column unidade_id uuid references public.unidades(id) on delete cascade;
alter table public.acoes add column unidade_id uuid references public.unidades(id) on delete cascade;
alter table public.metas add column unidade_id uuid references public.unidades(id) on delete cascade;
alter table public.importacoes add column unidade_id uuid references public.unidades(id) on delete set null;

-- preenche dados existentes com a unidade padrão
update public.fisioterapeutas f set unidade_id = u.id from public.unidades u where u.clinica_id = f.clinica_id and f.unidade_id is null;
update public.base_semanal t set unidade_id = u.id from public.unidades u where u.clinica_id = t.clinica_id and t.unidade_id is null;
update public.base_semanal_fisio t set unidade_id = u.id from public.unidades u where u.clinica_id = t.clinica_id and t.unidade_id is null;
update public.contratos t set unidade_id = u.id from public.unidades u where u.clinica_id = t.clinica_id and t.unidade_id is null;
update public.lancamentos t set unidade_id = u.id from public.unidades u where u.clinica_id = t.clinica_id and t.unidade_id is null;
update public.leads_canal t set unidade_id = u.id from public.unidades u where u.clinica_id = t.clinica_id and t.unidade_id is null;
update public.reunioes t set unidade_id = u.id from public.unidades u where u.clinica_id = t.clinica_id and t.unidade_id is null;
update public.acoes t set unidade_id = u.id from public.unidades u where u.clinica_id = t.clinica_id and t.unidade_id is null;
update public.metas t set unidade_id = u.id from public.unidades u where u.clinica_id = t.clinica_id and t.unidade_id is null;

-- chaves primárias passam a incluir a unidade
alter table public.base_semanal alter column unidade_id set not null;
alter table public.base_semanal drop constraint base_semanal_pkey, add primary key (clinica_id, unidade_id, id_semana);
alter table public.base_semanal_fisio alter column unidade_id set not null;
alter table public.base_semanal_fisio drop constraint base_semanal_fisio_pkey, add primary key (clinica_id, unidade_id, id_semana, fisioterapeuta_id);
alter table public.leads_canal alter column unidade_id set not null;
alter table public.leads_canal drop constraint leads_canal_pkey, add primary key (clinica_id, unidade_id, id_semana, canal);
alter table public.reunioes alter column unidade_id set not null;
alter table public.reunioes drop constraint reunioes_pkey, add primary key (clinica_id, unidade_id, id_semana);
alter table public.metas alter column unidade_id set not null;
alter table public.metas drop constraint metas_pkey, add primary key (clinica_id, unidade_id, indicador);
alter table public.fisioterapeutas drop constraint fisioterapeutas_clinica_id_slot_key;
create unique index fisioterapeutas_unidade_slot on public.fisioterapeutas (clinica_id, unidade_id, slot);

-- configurações da clínica (chave do Gemini etc.) — só admin lê/escreve
create table public.clinica_config (
  clinica_id uuid primary key references public.clinicas(id) on delete cascade,
  gemini_api_key text,
  gemini_model text default 'gemini-2.0-flash',
  assistente_instrucoes text,
  updated_at timestamptz not null default now()
);
alter table public.clinica_config enable row level security;
create policy "clinica_config: admin" on public.clinica_config for all to authenticated
  using (clinica_id = public.current_clinica_id() and public.current_papel() = 'admin')
  with check (clinica_id = public.current_clinica_id() and public.current_papel() = 'admin');
-- editores podem ler para usar o assistente (sem ver a chave: o app usa uma função)
create or replace function public.assistente_config() returns table(gemini_api_key text, gemini_model text, assistente_instrucoes text)
language sql stable security definer set search_path = public as $$
  select gemini_api_key, gemini_model, assistente_instrucoes from public.clinica_config
  where clinica_id = public.current_clinica_id() and public.current_papel() is not null;
$$;
revoke execute on function public.assistente_config() from anon, public;
