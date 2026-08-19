# Base Comercial — Transportes

Aplicação interna para importar planilhas `.xlsx`, normalizar empresas por CNPJ,
pesquisar a base e exportar listas comerciais.

## Configuração

1. Crie um projeto Supabase dedicado.
2. Execute `supabase/migrations/001_base_comercial.sql`.
3. Crie ao menos um usuário em **Authentication → Users**.
4. Configure na Vercel as variáveis listadas em `.env.example` para Production e Preview.
5. Faça o deploy e valide o login antes de promover para produção.

O navegador nunca recebe a `SUPABASE_SERVICE_ROLE_KEY`. Todas as leituras e
gravações passam pelas funções em `api/`, que validam o token do usuário.
