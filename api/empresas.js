const { getSupabaseAdmin, requireUser, handleApiError } = require('../lib/supabaseClient');

const SEGMENTOS_PERMITIDOS = new Set([
  'Parceiro Contábil|',
  'Transportadora|Micro',
  'Transportadora|Pequeno',
  'Transportadora|Médio',
  'Transportadora|Grande',
]);

function safeSearch(value, max = 120) {
  return String(value || '')
    .replace(/[,%()'"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseFilters(query) {
  const segmentos = String(query.segmentos || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => SEGMENTOS_PERMITIDOS.has(value));

  return {
    segmentos,
    uf: /^[A-Za-z]{2}$/.test(query.uf || '') ? String(query.uf).toUpperCase() : '',
    cidade: safeSearch(query.cidade),
    idade: ['ate2', '2a5', 'acima5'].includes(query.idade) ? query.idade : '',
    comEmail: query.comEmail === '1',
    comTelefone: query.comTelefone === '1',
    comCelular: query.comCelular === '1',
    q: safeSearch(query.q),
  };
}

function applyFilters(query, filters) {
  if (filters.q) {
    const term = `%${filters.q}%`;
    query = query.or(`cnpj.ilike.${term},razao_social.ilike.${term},nome_fantasia.ilike.${term},nome_socio.ilike.${term}`);
  }

  if (filters.segmentos.length > 0) {
    const parts = filters.segmentos.map((value) => {
      const [segmento, porte] = value.split('|');
      return porte ? `and(segmento.eq.${segmento},porte.eq.${porte})` : `segmento.eq.${segmento}`;
    });
    query = query.or(parts.join(','));
  }

  if (filters.uf) query = query.eq('uf', filters.uf);
  if (filters.cidade) query = query.ilike('cidade', `%${filters.cidade}%`);
  if (filters.idade === 'ate2') query = query.lte('idade_empresa_anos', 2);
  if (filters.idade === '2a5') query = query.gte('idade_empresa_anos', 2).lte('idade_empresa_anos', 5);
  if (filters.idade === 'acima5') query = query.gt('idade_empresa_anos', 5);
  if (filters.comEmail) query = query.not('email', 'is', null);
  if (filters.comTelefone) query = query.not('telefone', 'is', null);
  if (filters.comCelular) query = query.not('celular', 'is', null);
  return query;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const string = String(value);
  return /[,"\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

module.exports = async function handler(req, res) {
  try {
    await requireUser(req);
    const supabase = getSupabaseAdmin();

    if (req.method === 'POST') {
      const { action, cnpj } = req.body || {};
      if (action !== 'marcar_cliente') return res.status(400).json({ error: 'Ação inválida' });
      if (!/^\d{14}$/.test(String(cnpj || ''))) return res.status(400).json({ error: 'CNPJ inválido' });

      const { error } = await supabase
        .from('empresas')
        .update({ is_cliente: true, updated_at: new Date().toISOString() })
        .eq('cnpj', cnpj);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

    const mode = req.query.mode || 'list';
    const filters = parseFilters(req.query);

    if (mode === 'historico') {
      const { data, error } = await supabase
        .from('historico_importacoes')
        .select('id,arquivo,data_importacao,empresas_importadas,empresas_atualizadas,novos_cnpjs')
        .order('data_importacao', { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json({ rows: data || [] });
    }

    if (mode === 'list') {
      const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize || '50', 10) || 50));
      const from = (page - 1) * pageSize;

      let query = supabase
        .from('empresas')
        .select('cnpj,razao_social,nome_fantasia,segmento,porte,cidade,uf,colaboradores_faixa,faturamento_faixa,capital_social,idade_empresa_anos,nome_socio,telefone,celular,email,is_cliente', { count: 'exact' })
        .order('razao_social', { ascending: true, nullsFirst: false })
        .range(from, from + pageSize - 1);
      query = applyFilters(query, filters);

      const { data, count, error } = await query;
      if (error) throw error;
      return res.status(200).json({ rows: data || [], total: count || 0, page, pageSize });
    }

    if (mode === 'search') {
      const countWith = async (column) => {
        let query = supabase.from('empresas').select('cnpj', { count: 'exact', head: true });
        if (column) query = query.not(column, 'is', null);
        query = applyFilters(query, filters);
        const { count, error } = await query;
        if (error) throw error;
        return count || 0;
      };

      let previewQuery = supabase
        .from('empresas')
        .select('cnpj,razao_social,segmento,porte,cidade,uf,nome_socio,email,telefone,celular')
        .order('razao_social', { ascending: true, nullsFirst: false })
        .limit(20);
      previewQuery = applyFilters(previewQuery, filters);

      const [total, comEmail, comTelefone, comCelular, previewResult] = await Promise.all([
        countWith(null),
        countWith('email'),
        countWith('telefone'),
        countWith('celular'),
        previewQuery,
      ]);
      if (previewResult.error) throw previewResult.error;

      return res.status(200).json({
        stats: { total, comEmail, comTelefone, comCelular },
        preview: previewResult.data || [],
      });
    }

    if (mode === 'emails') {
      let query = supabase.from('empresas').select('email').not('email', 'is', null).limit(50000);
      query = applyFilters(query, filters);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ emails: (data || []).map((row) => row.email) });
    }

    if (mode === 'export') {
      let query = supabase
        .from('empresas')
        .select('cnpj,razao_social,nome_fantasia,segmento,porte,cidade,uf,nome_socio,telefone,celular,email,idade_empresa_anos')
        .limit(50000);
      query = applyFilters(query, filters);
      const { data, error } = await query;
      if (error) throw error;

      const headers = ['CNPJ', 'Razão Social', 'Nome Fantasia', 'Segmento', 'Porte', 'Cidade', 'UF', 'Sócio', 'Telefone', 'Celular', 'E-mail', 'Idade (anos)'];
      const fields = ['cnpj', 'razao_social', 'nome_fantasia', 'segmento', 'porte', 'cidade', 'uf', 'nome_socio', 'telefone', 'celular', 'email', 'idade_empresa_anos'];
      const lines = (data || []).map((row) => fields.map((field) => csvEscape(row[field])).join(','));
      const csv = `\uFEFF${[headers.join(','), ...lines].join('\n')}`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="lista-base-comercial.csv"');
      return res.status(200).send(csv);
    }

    return res.status(400).json({ error: 'Modo inválido' });
  } catch (error) {
    return handleApiError(res, error, 'Erro em /api/empresas');
  }
};
