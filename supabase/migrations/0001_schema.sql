-- Doutor Hérnia Dashboard — schema inicial
-- Espelha a planilha Base_Dados_Clinica.xlsx (coleta) e adiciona views de cálculo,
-- perfis/permissões e isolamento por clínica (RLS).

create extension if not exists pgcrypto;

-- ------------------------------------------------------------ funções utilitárias
create or replace function public.semana_de(d date) returns text
language sql immutable as $$
  select extract(isoyear from d)::int::text || '-S' || lpad(extract(week from d)::int::text, 2, '0');
$$;

create or replace function public.mes_de(d date) returns text
language sql immutable as $$
  select extract(year from d)::int::text || '-' || lpad(extract(month from d)::int::text, 2, '0');
$$;

-- ------------------------------------------------------------ clínicas e usuários
create table public.clinicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  clinica_id uuid references public.clinicas(id) on delete set null,
  nome text,
  email text,
  papel text not null default 'leitura' check (papel in ('admin','gestor','fisio','leitura')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- convites: e-mail pré-autorizado para entrar numa clínica com um papel
create table public.convites (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  email text not null,
  papel text not null default 'leitura' check (papel in ('admin','gestor','fisio','leitura')),
  criado_por uuid references auth.users(id),
  usado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (clinica_id, email)
);

create or replace function public.current_clinica_id() returns uuid
language sql stable security definer set search_path = public as $$
  select clinica_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.profiles where id = auth.uid() and ativo;
$$;

create or replace function public.pode_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_papel() in ('admin','gestor'), false);
$$;

-- novo usuário: usa convite se existir; senão cria uma clínica própria e vira admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_convite public.convites%rowtype;
  v_clinica uuid;
  v_papel text := 'admin';
begin
  select * into v_convite from public.convites
   where lower(email) = lower(new.email) and usado_em is null
   order by created_at desc limit 1;
  if found then
    v_clinica := v_convite.clinica_id; v_papel := v_convite.papel;
    update public.convites set usado_em = now() where id = v_convite.id;
  else
    insert into public.clinicas (nome)
      values (coalesce(new.raw_user_meta_data->>'clinica', 'Minha clínica'))
      returning id into v_clinica;
  end if;
  insert into public.profiles (id, clinica_id, nome, email, papel)
    values (new.id, v_clinica, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email, v_papel);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ calendário de semanas (ISO)
create table public.semanas (
  id_semana text primary key,
  inicio date not null,
  fim date not null,
  mes text not null
);
insert into public.semanas (id_semana, inicio, fim, mes)
select public.semana_de(d::date), d::date, (d::date + 6), public.mes_de(d::date)
from generate_series(date '2024-12-30', date '2028-12-25', interval '7 days') d
on conflict do nothing;

-- ------------------------------------------------------------ cadastros da clínica
create table public.fisioterapeutas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  slot int check (slot between 1 and 9),      -- "Fisio 1", "Fisio 2" na planilha
  ativo boolean not null default true,
  unique (clinica_id, slot)
);

create table public.metas (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  indicador text not null,
  meta_semanal numeric,
  meta_mensal numeric,
  primary key (clinica_id, indicador)
);

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  user_id uuid references auth.users(id),
  arquivo text,
  resumo jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ coleta semanal (Base_Semanal)
create table public.base_semanal (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  id_semana text not null references public.semanas(id_semana),
  leads int not null default 0,
  aval_agendadas int not null default 0,
  aval_canceladas int not null default 0,
  cancel_atendimentos int not null default 0,
  novos_pacientes int not null default 0,
  horarios_disp_manha int not null default 0,
  horarios_ocup_manha int not null default 0,
  horarios_disp_tarde int not null default 0,
  horarios_ocup_tarde int not null default 0,
  observacoes text,
  updated_at timestamptz not null default now(),
  primary key (clinica_id, id_semana)
);

-- números por fisioterapeuta na semana
create table public.base_semanal_fisio (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  id_semana text not null references public.semanas(id_semana),
  fisioterapeuta_id uuid not null references public.fisioterapeutas(id) on delete cascade,
  aval_realizadas int not null default 0,
  contratos int not null default 0,
  atendimentos int not null default 0,
  tempo_medio_min numeric,
  desvio_min numeric,
  primary key (clinica_id, id_semana, fisioterapeuta_id)
);

-- ------------------------------------------------------------ contratos (avaliações e protocolos)
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  data date not null,
  id_semana text generated always as (public.semana_de(data)) stored,
  mes text generated always as (public.mes_de(data)) stored,
  paciente text,
  tipo text not null check (tipo in ('Avaliação','Protocolo')),
  fisioterapeuta_id uuid references public.fisioterapeutas(id) on delete set null,
  descricao text,
  n_sessoes int,
  valor numeric(12,2) not null default 0,
  condicao text check (condicao in ('À vista','Parcelado')),
  forma_pagamento text,
  parcelas int default 1,
  status_pagamento text default 'Pago' check (status_pagamento in ('Pago','Pendente','Atrasado','Cancelado')),
  canal text,
  observacoes text,
  importacao_id uuid references public.importacoes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.contratos (clinica_id, id_semana);
create index on public.contratos (clinica_id, mes);

-- ------------------------------------------------------------ financeiro (lançamentos)
create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  data date not null,
  id_semana text generated always as (public.semana_de(data)) stored,
  mes text generated always as (public.mes_de(data)) stored,
  categoria text not null check (categoria in ('Receita','Gasto','Imposto','Marketing')),
  tipo_custo text check (tipo_custo in ('Fixo','Variável')),   -- usado no ponto de equilíbrio
  descricao text,
  valor numeric(12,2) not null default 0,
  status text default 'Pago' check (status in ('Pago','Pendente','Atrasado','Cancelado')),
  vencimento date,
  contraparte text,
  observacoes text,
  importacao_id uuid references public.importacoes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.lancamentos (clinica_id, id_semana);
create index on public.lancamentos (clinica_id, mes);

-- ------------------------------------------------------------ leads por canal
create table public.leads_canal (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  id_semana text not null references public.semanas(id_semana),
  canal text not null,
  quantidade int not null default 0,
  observacoes text,
  primary key (clinica_id, id_semana, canal)
);

-- ------------------------------------------------------------ reunião semanal (qualitativo)
create table public.reunioes (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  id_semana text not null references public.semanas(id_semana),
  resultado_geral text check (resultado_geral in ('Melhor','Igual','Pior')),
  pontos_positivos text,
  pontos_melhorar text,
  pacientes_criticos text,
  pontos_pertinentes text,
  problemas_atendimento text,
  prejudica_experiencia boolean,
  prejudica_descricao text,
  demandas_equipe text,
  pontos_proxima_semana text,
  outros text,
  metas_semana text,
  solucoes text,
  updated_at timestamptz not null default now(),
  primary key (clinica_id, id_semana)
);

-- ------------------------------------------------------------ plano de ação 5W2H
create table public.acoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  id_semana text not null references public.semanas(id_semana),
  ordem int,
  problema text,
  o_que text,
  por_que text,
  onde text,
  quando date,
  quem text,
  como text,
  quanto numeric(12,2),
  status text default 'A fazer' check (status in ('A fazer','Em andamento','Concluída','Cancelada')),
  created_at timestamptz not null default now()
);
create index on public.acoes (clinica_id, id_semana);

-- ------------------------------------------------------------ RLS
alter table public.clinicas enable row level security;
alter table public.profiles enable row level security;
alter table public.convites enable row level security;
alter table public.fisioterapeutas enable row level security;
alter table public.metas enable row level security;
alter table public.importacoes enable row level security;
alter table public.base_semanal enable row level security;
alter table public.base_semanal_fisio enable row level security;
alter table public.contratos enable row level security;
alter table public.lancamentos enable row level security;
alter table public.leads_canal enable row level security;
alter table public.reunioes enable row level security;
alter table public.acoes enable row level security;
alter table public.semanas enable row level security;

create policy "semanas: leitura autenticada" on public.semanas for select to authenticated using (true);

create policy "clinicas: membros leem" on public.clinicas for select to authenticated using (id = public.current_clinica_id());
create policy "clinicas: admin edita" on public.clinicas for update to authenticated
  using (id = public.current_clinica_id() and public.current_papel() = 'admin');

create policy "profiles: ver a própria clínica" on public.profiles for select to authenticated
  using (clinica_id = public.current_clinica_id() or id = auth.uid());
create policy "profiles: editar o próprio" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and papel = (select papel from public.profiles p where p.id = auth.uid()));
create policy "profiles: admin gerencia" on public.profiles for update to authenticated
  using (clinica_id = public.current_clinica_id() and public.current_papel() = 'admin')
  with check (clinica_id = public.current_clinica_id());

create policy "convites: admin gerencia" on public.convites for all to authenticated
  using (clinica_id = public.current_clinica_id() and public.current_papel() = 'admin')
  with check (clinica_id = public.current_clinica_id() and public.current_papel() = 'admin');

-- padrão para as tabelas de dados: leitura para membros; escrita para admin/gestor
do $$
declare t text;
begin
  foreach t in array array['fisioterapeutas','metas','importacoes','base_semanal','base_semanal_fisio',
                           'contratos','lancamentos','leads_canal','reunioes','acoes'] loop
    execute format('create policy "%1$s: leitura" on public.%1$I for select to authenticated using (clinica_id = public.current_clinica_id())', t);
    execute format('create policy "%1$s: insert" on public.%1$I for insert to authenticated with check (clinica_id = public.current_clinica_id() and public.pode_editar())', t);
    execute format('create policy "%1$s: update" on public.%1$I for update to authenticated using (clinica_id = public.current_clinica_id() and public.pode_editar()) with check (clinica_id = public.current_clinica_id() and public.pode_editar())', t);
    execute format('create policy "%1$s: delete" on public.%1$I for delete to authenticated using (clinica_id = public.current_clinica_id() and public.pode_editar())', t);
  end loop;
end $$;
