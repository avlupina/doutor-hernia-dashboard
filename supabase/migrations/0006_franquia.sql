-- Integração com relatórios da franqueadora
alter table public.contratos add column if not exists ref_externa text;
alter table public.lancamentos add column if not exists ref_externa text;
create unique index if not exists contratos_ref_externa_uk on public.contratos (clinica_id, ref_externa);
create unique index if not exists lancamentos_ref_externa_uk on public.lancamentos (clinica_id, ref_externa);
alter table public.unidades add column if not exists cap_manha_semana int, add column if not exists cap_tarde_semana int;
alter table public.base_semanal add column if not exists faltas int not null default 0;
-- calendário estendido até 2031
insert into public.semanas (id_semana, inicio, fim, mes)
select public.semana_de(d::date), d::date, (d::date + 6), public.mes_de(d::date)
from generate_series(date '2028-12-25', date '2031-12-29', interval '7 days') d on conflict do nothing;
