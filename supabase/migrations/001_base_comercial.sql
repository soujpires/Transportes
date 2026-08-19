create extension if not exists pg_trgm with schema extensions;

create table if not exists public.empresas (
  id bigint generated always as identity primary key,
  cnpj text not null unique,
  razao_social text,
  nome_fantasia text,
  segmento text,
  cnae_principal text,
  descricao_cnae_principal text,
  porte text,
  cidade text,
  uf text,
  colaboradores_faixa text,
  faturamento_faixa text,
  capital_social numeric(18,2),
  idade_empresa_anos integer,
  nome_socio text,
  telefone text,
  celular text,
  email text,
  is_cliente boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresas_cnpj_formato check (cnpj ~ '^\d{14}$'),
  constraint empresas_uf_formato check (uf is null or uf ~ '^[A-Z]{2}$'),
  constraint empresas_idade_valida check (idade_empresa_anos is null or idade_empresa_anos between 0 and 500),
  constraint empresas_capital_valido check (capital_social is null or capital_social >= 0),
  constraint empresas_cnae_principal_formato check (cnae_principal is null or cnae_principal ~ '^\d{7}$'),
  constraint empresas_segmento_valido check (segmento is null or segmento in ('Transportadora', 'Construção Civil', 'Condomínio', 'Parceiro Contábil', 'Outros')),
  constraint empresas_porte_valido check (porte is null or porte in ('Micro', 'Pequeno', 'Médio', 'Grande'))
);

create table if not exists public.historico_importacoes (
  id bigint generated always as identity primary key,
  arquivo text not null,
  data_importacao timestamptz not null default now(),
  empresas_importadas integer not null default 0 check (empresas_importadas >= 0),
  empresas_atualizadas integer not null default 0 check (empresas_atualizadas >= 0),
  novos_cnpjs integer not null default 0 check (novos_cnpjs >= 0),
  usuario_id uuid references auth.users(id) on delete set null
);

create table if not exists public.transportes_usuarios (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint transportes_usuarios_email_formato check (email = lower(email) and position('@' in email) > 1)
);

create index if not exists empresas_razao_social_idx on public.empresas (razao_social);
create index if not exists empresas_segmento_porte_idx on public.empresas (segmento, porte);
create index if not exists empresas_cnae_principal_prefix_idx on public.empresas (cnae_principal text_pattern_ops);
create index if not exists empresas_descricao_cnae_trgm_idx on public.empresas using gin (descricao_cnae_principal extensions.gin_trgm_ops);
create index if not exists empresas_uf_cidade_idx on public.empresas (uf, cidade);
create index if not exists empresas_idade_idx on public.empresas (idade_empresa_anos);
create index if not exists empresas_email_presente_idx on public.empresas (email) where email is not null;
create index if not exists empresas_telefone_presente_idx on public.empresas (telefone) where telefone is not null;
create index if not exists empresas_celular_presente_idx on public.empresas (celular) where celular is not null;
create index if not exists historico_importacoes_data_idx on public.historico_importacoes (data_importacao desc);
create index if not exists historico_importacoes_usuario_idx on public.historico_importacoes (usuario_id);
create unique index if not exists transportes_usuarios_email_idx on public.transportes_usuarios (lower(email));

alter table public.empresas enable row level security;
alter table public.historico_importacoes enable row level security;
alter table public.transportes_usuarios enable row level security;

revoke all on table public.empresas from anon, authenticated;
revoke all on table public.historico_importacoes from anon, authenticated;
revoke all on table public.transportes_usuarios from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update on table public.empresas to service_role;
grant select, insert on table public.historico_importacoes to service_role;
grant select, insert, update, delete on table public.transportes_usuarios to service_role;
grant usage, select on all sequences in schema public to service_role;
