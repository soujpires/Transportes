const { createClient } = require('@supabase/supabase-js');

let adminClient;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return adminClient;
}

async function requireUser(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Não autenticado');
    error.statusCode = 401;
    throw error;
  }

  const { data, error } = await getSupabaseAdmin().auth.getUser(match[1]);
  if (error || !data.user) {
    const authError = new Error('Sessão inválida ou expirada');
    authError.statusCode = 401;
    throw authError;
  }

  const { data: access, error: accessError } = await getSupabaseAdmin()
    .from('transportes_usuarios')
    .select('usuario_id')
    .eq('usuario_id', data.user.id)
    .eq('ativo', true)
    .maybeSingle();

  if (accessError) throw accessError;
  if (!access) {
    const forbiddenError = new Error('Usuário sem acesso ao sistema de Transportes');
    forbiddenError.statusCode = 403;
    throw forbiddenError;
  }

  return data.user;
}

function handleApiError(res, error, context) {
  console.error(context, error);
  return res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : 'Erro interno do servidor',
  });
}

module.exports = { getSupabaseAdmin, requireUser, handleApiError };
