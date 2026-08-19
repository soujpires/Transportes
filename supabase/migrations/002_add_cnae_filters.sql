create extension if not exists pg_trgm with schema extensions;

alter table public.empresas
  add column if not exists cnae_principal text,
  add column if not exists descricao_cnae_principal text;

alter table public.empresas
  drop constraint if exists empresas_segmento_valido,
  drop constraint if exists empresas_cnae_principal_formato;

alter table public.empresas
  add constraint empresas_segmento_valido
  check (
    segmento is null
    or segmento in ('Transportadora', 'Construção Civil', 'Condomínio', 'Parceiro Contábil', 'Outros')
  ) not valid;

alter table public.empresas
  add constraint empresas_cnae_principal_formato
  check (cnae_principal is null or cnae_principal ~ '^\d{7}$') not valid;

alter table public.empresas validate constraint empresas_segmento_valido;
alter table public.empresas validate constraint empresas_cnae_principal_formato;

create index if not exists empresas_cnae_principal_prefix_idx
  on public.empresas (cnae_principal text_pattern_ops);

create index if not exists empresas_descricao_cnae_trgm_idx
  on public.empresas using gin (descricao_cnae_principal extensions.gin_trgm_ops);
