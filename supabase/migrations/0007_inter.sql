-- Integração Banco Inter Empresas (API Banking + API Cobrança)
-- Credenciais ficam em inter_integracoes; as colunas sensíveis NÃO são legíveis pelo front-end
-- (privilégio por coluna) — só a Edge Function `inter-sync`, com a chave secreta do projeto, as lê.

create table if not exists public.inter_integracoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  nome text default 'Banco Inter',
  conta_corrente text,                 -- informar só se o CNPJ tiver mais de uma conta
  client_id text,
  client_secret text,                  -- sensível
  certificado text,                    -- sensível (Inter_API_Certificado.crt, PEM)
  chave_privada text,                  -- sensível (Inter_API_Chave.key, PEM)
  escopos text not null default 'extrato.read boleto-cobranca.read',
  sync_desde date not null default '2025-07-01',
  ativo boolean not null default true,
  ultima_sync timestamptz,
  ultimo_erro text,
  saldo numeric(14,2),
  saldo_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id)
);
alter table public.inter_integracoes enable row level security;
create policy "inter_integracoes: admin" on public.inter_integracoes for all to authenticated
  using (clinica_id = public.current_clinica_id() and public.current_papel() = 'admin')
  with check (clinica_id = public.current_clinica_id() and public.current_papel() = 'admin');
-- editores leem o status (sem as colunas sensíveis)
create policy "inter_integracoes: editores leem" on public.inter_integracoes for select to authenticated
  using (clinica_id = public.current_clinica_id() and public.pode_editar());
revoke all on public.inter_integracoes from anon, authenticated;
grant select (id, clinica_id, unidade_id, nome, conta_corrente, client_id, escopos, sync_desde, ativo, ultima_sync, ultimo_erro, saldo, saldo_em, created_at, updated_at) on public.inter_integracoes to authenticated;
grant insert, update on public.inter_integracoes to authenticated;

-- ------------------------------------------------------------ extrato
create table if not exists public.inter_extrato (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  integracao_id uuid not null references public.inter_integracoes(id) on delete cascade,
  id_transacao text not null,
  data date not null,
  id_semana text generated always as (public.semana_de(data)) stored,
  mes text generated always as (public.mes_de(data)) stored,
  tipo_operacao text not null check (tipo_operacao in ('C','D')),   -- crédito / débito
  tipo_transacao text,                                              -- PIX, BOLETO_COBRANCA, PAGAMENTO, TRANSFERENCIA, ...
  valor numeric(14,2) not null,
  titulo text,
  descricao text,
  contraparte text,
  detalhes jsonb,
  categoria text check (categoria in ('Receita','Gasto','Imposto','Marketing','Transferência','Ignorar')),
  tipo_custo text check (tipo_custo in ('Fixo','Variável')),
  lancamento_id uuid,        -- lançamento gerado a partir deste item (gastos)
  conciliado_id uuid,        -- parcela (lancamentos rec:*) conciliada com este crédito
  created_at timestamptz not null default now(),
  unique (integracao_id, id_transacao)
);
create index if not exists inter_extrato_unidade_data on public.inter_extrato (unidade_id, data);
alter table public.inter_extrato enable row level security;
create policy "inter_extrato: leitura" on public.inter_extrato for select to authenticated using (clinica_id = public.current_clinica_id());
create policy "inter_extrato: update" on public.inter_extrato for update to authenticated
  using (clinica_id = public.current_clinica_id() and public.pode_editar()) with check (clinica_id = public.current_clinica_id() and public.pode_editar());

-- ------------------------------------------------------------ cobranças (boletos / pix cobrança emitidos pelo Inter)
create table if not exists public.inter_cobrancas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  integracao_id uuid not null references public.inter_integracoes(id) on delete cascade,
  codigo_solicitacao text not null,
  seu_numero text,
  nosso_numero text,
  pagador text,
  pagador_doc text,
  valor numeric(14,2),
  valor_recebido numeric(14,2),
  data_emissao date,
  data_vencimento date,
  data_situacao date,
  situacao text,                 -- A_RECEBER, RECEBIDO, MARCADO_RECEBIDO, ATRASADO, CANCELADO, EXPIRADO, ...
  origem_recebimento text,       -- BOLETO / PIX
  detalhes jsonb,
  lancamento_id uuid,
  updated_at timestamptz not null default now(),
  unique (integracao_id, codigo_solicitacao)
);
create index if not exists inter_cobrancas_unidade_venc on public.inter_cobrancas (unidade_id, data_vencimento);
alter table public.inter_cobrancas enable row level security;
create policy "inter_cobrancas: leitura" on public.inter_cobrancas for select to authenticated using (clinica_id = public.current_clinica_id());

-- ------------------------------------------------------------ saldo diário
create table if not exists public.inter_saldos (
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  data date not null,
  disponivel numeric(14,2),
  detalhes jsonb,
  primary key (unidade_id, data)
);
alter table public.inter_saldos enable row level security;
create policy "inter_saldos: leitura" on public.inter_saldos for select to authenticated using (clinica_id = public.current_clinica_id());

-- ------------------------------------------------------------ regras de classificação (por clínica)
create table if not exists public.inter_regras (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  padrao text not null,               -- trecho procurado (ilike) em título/descrição/contraparte
  tipo_operacao text check (tipo_operacao in ('C','D')),  -- nulo = qualquer
  categoria text not null check (categoria in ('Receita','Gasto','Imposto','Marketing','Transferência','Ignorar')),
  tipo_custo text check (tipo_custo in ('Fixo','Variável')),
  ordem int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.inter_regras enable row level security;
create policy "inter_regras: leitura" on public.inter_regras for select to authenticated using (clinica_id = public.current_clinica_id());
create policy "inter_regras: insert" on public.inter_regras for insert to authenticated with check (clinica_id = public.current_clinica_id() and public.pode_editar());
create policy "inter_regras: update" on public.inter_regras for update to authenticated using (clinica_id = public.current_clinica_id() and public.pode_editar()) with check (clinica_id = public.current_clinica_id() and public.pode_editar());
create policy "inter_regras: delete" on public.inter_regras for delete to authenticated using (clinica_id = public.current_clinica_id() and public.pode_editar());

-- ------------------------------------------------------------ classificação automática
-- Aplica as regras da clínica aos itens ainda sem categoria. Créditos sem regra viram 'Receita';
-- impostos conhecidos (DAS, DARF, ISS, INSS, FGTS) viram 'Imposto'; o resto fica para classificar.
create or replace function public.inter_classificar(p_unidade uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; m int;
begin
  if not (public.pode_editar() and exists (select 1 from public.unidades where id = p_unidade and clinica_id = public.current_clinica_id())) then
    raise exception 'sem permissão';
  end if;
  for r in select * from public.inter_regras where clinica_id = public.current_clinica_id() order by ordem, created_at loop
    update public.inter_extrato e set categoria = r.categoria, tipo_custo = case when r.categoria = 'Gasto' then r.tipo_custo else null end
    where e.unidade_id = p_unidade and e.categoria is null and (r.tipo_operacao is null or e.tipo_operacao = r.tipo_operacao)
      and (coalesce(e.titulo,'') || ' ' || coalesce(e.descricao,'') || ' ' || coalesce(e.contraparte,'')) ilike '%' || r.padrao || '%';
    get diagnostics m = row_count; n := n + m;
  end loop;
  update public.inter_extrato set categoria = 'Imposto' where unidade_id = p_unidade and categoria is null and tipo_operacao = 'D'
    and (coalesce(titulo,'') || ' ' || coalesce(descricao,'')) ~* '\m(DAS|DARF|ISS|ISSQN|INSS|FGTS|SIMPLES NACIONAL|RECEITA FEDERAL|TRIBUTO)\M';
  get diagnostics m = row_count; n := n + m;
  update public.inter_extrato set categoria = 'Receita' where unidade_id = p_unidade and categoria is null and tipo_operacao = 'C';
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;

-- ------------------------------------------------------------ gerar lançamentos a partir do extrato
-- Débitos classificados como Gasto/Imposto/Marketing viram lançamentos (ref_externa 'inter:<id>'), status Pago.
-- Se o item mudar para Receita/Transferência/Ignorar, o lançamento gerado é marcado como Cancelado (não entra nos totais).
create or replace function public.inter_gerar_lancamentos(p_unidade uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; n_novos int := 0; n_atual int := 0; n_canc int := 0; r record; v_id uuid; v_ins boolean;
begin
  select clinica_id into v_cid from public.unidades where id = p_unidade;
  if v_cid is null or v_cid <> public.current_clinica_id() or not public.pode_editar() then raise exception 'sem permissão'; end if;

  for r in select * from public.inter_extrato where unidade_id = p_unidade and tipo_operacao = 'D' and categoria in ('Gasto','Imposto','Marketing') loop
    insert into public.lancamentos (clinica_id, unidade_id, data, categoria, tipo_custo, descricao, valor, status, contraparte, ref_externa)
    values (v_cid, p_unidade, r.data, r.categoria, case when r.categoria = 'Gasto' then r.tipo_custo else null end,
            coalesce(nullif(r.descricao,''), r.titulo, r.tipo_transacao), r.valor, 'Pago', r.contraparte, 'inter:' || r.id_transacao)
    on conflict (clinica_id, ref_externa) do update set categoria = excluded.categoria, tipo_custo = excluded.tipo_custo, valor = excluded.valor,
            data = excluded.data, status = 'Pago', contraparte = excluded.contraparte, unidade_id = excluded.unidade_id
    returning id, (xmax = 0) into v_id, v_ins;
    if v_ins then n_novos := n_novos + 1; else n_atual := n_atual + 1; end if;
    update public.inter_extrato set lancamento_id = v_id where id = r.id and lancamento_id is distinct from v_id;
  end loop;

  update public.lancamentos l set status = 'Cancelado'
  from public.inter_extrato e
  where e.unidade_id = p_unidade and l.id = e.lancamento_id and l.status <> 'Cancelado'
    and (e.tipo_operacao = 'C' or e.categoria is null or e.categoria not in ('Gasto','Imposto','Marketing'));
  get diagnostics n_canc = row_count;

  return jsonb_build_object('novos', n_novos, 'atualizados', n_atual, 'cancelados', n_canc);
end $$;

-- ------------------------------------------------------------ conciliação de créditos com parcelas da franquia
-- Para cada crédito ainda não conciliado procura uma parcela (lancamentos Receita rec:*) de mesmo valor,
-- com data (ou vencimento) até `p_tolerancia` dias de distância, ainda não usada por outro crédito.
create or replace function public.inter_conciliar(p_unidade uuid, p_tolerancia int default 5) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; v_id uuid;
begin
  if not (public.pode_editar() and exists (select 1 from public.unidades where id = p_unidade and clinica_id = public.current_clinica_id())) then
    raise exception 'sem permissão';
  end if;
  for r in select * from public.inter_extrato where unidade_id = p_unidade and tipo_operacao = 'C' and conciliado_id is null
           and coalesce(categoria,'Receita') = 'Receita' order by data loop
    select l.id into v_id from public.lancamentos l
    where l.unidade_id = p_unidade and l.categoria = 'Receita' and l.ref_externa like 'rec:%' and l.status <> 'Cancelado'
      and l.valor = r.valor and abs(coalesce(l.data, l.vencimento) - r.data) <= p_tolerancia
      and not exists (select 1 from public.inter_extrato x where x.conciliado_id = l.id)
    order by abs(coalesce(l.data, l.vencimento) - r.data), l.data limit 1;
    if v_id is not null then
      update public.inter_extrato set conciliado_id = v_id where id = r.id;
      update public.lancamentos set status = 'Pago' where id = v_id and status in ('Pendente','Atrasado');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function public.inter_classificar(uuid) from anon, public;
revoke execute on function public.inter_gerar_lancamentos(uuid) from anon, public;
revoke execute on function public.inter_conciliar(uuid, int) from anon, public;

-- ------------------------------------------------------------ resumo mensal banco × franquia
create or replace view public.v2_inter_mensal with (security_invoker = true) as
select e.clinica_id, e.unidade_id, e.mes,
       coalesce(sum(valor) filter (where tipo_operacao = 'C' and coalesce(categoria,'Receita') = 'Receita'), 0) as entradas,
       coalesce(sum(valor) filter (where tipo_operacao = 'D' and categoria in ('Gasto','Imposto','Marketing')), 0) as saidas,
       coalesce(sum(valor) filter (where tipo_operacao = 'D' and categoria is null), 0) as saidas_sem_classificacao,
       count(*) filter (where tipo_operacao = 'C' and conciliado_id is not null) as creditos_conciliados,
       count(*) filter (where tipo_operacao = 'C' and conciliado_id is null and coalesce(categoria,'Receita') = 'Receita') as creditos_sem_parcela
from public.inter_extrato e group by 1,2,3;
