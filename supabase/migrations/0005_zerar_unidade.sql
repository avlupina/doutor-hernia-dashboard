-- Função para zerar os dados de uma unidade (somente admin). Usada pelo botão em Cadastros.
-- Aplicar pelo SQL Editor do Supabase.

create or replace function public.zerar_unidade(p_unidade uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cid uuid := public.current_clinica_id(); r jsonb := '{}'::jsonb; n int;
begin
  if public.current_papel() is distinct from 'admin' then raise exception 'Apenas administradores podem zerar dados.'; end if;
  if not exists (select 1 from public.unidades where id = p_unidade and clinica_id = v_cid) then raise exception 'Unidade inválida.'; end if;
  delete from public.acoes where clinica_id = v_cid and unidade_id = p_unidade; get diagnostics n = row_count; r := r || jsonb_build_object('acoes', n);
  delete from public.reunioes where clinica_id = v_cid and unidade_id = p_unidade; get diagnostics n = row_count; r := r || jsonb_build_object('reunioes', n);
  delete from public.leads_canal where clinica_id = v_cid and unidade_id = p_unidade; get diagnostics n = row_count; r := r || jsonb_build_object('leads_canal', n);
  delete from public.lancamentos where clinica_id = v_cid and unidade_id = p_unidade; get diagnostics n = row_count; r := r || jsonb_build_object('lancamentos', n);
  delete from public.contratos where clinica_id = v_cid and unidade_id = p_unidade; get diagnostics n = row_count; r := r || jsonb_build_object('contratos', n);
  delete from public.base_semanal_fisio where clinica_id = v_cid and unidade_id = p_unidade; get diagnostics n = row_count; r := r || jsonb_build_object('base_semanal_fisio', n);
  delete from public.base_semanal where clinica_id = v_cid and unidade_id = p_unidade; get diagnostics n = row_count; r := r || jsonb_build_object('base_semanal', n);
  delete from public.importacoes where clinica_id = v_cid and unidade_id = p_unidade; get diagnostics n = row_count; r := r || jsonb_build_object('importacoes', n);
  return r;
end $$;
revoke execute on function public.zerar_unidade(uuid) from anon, public;
