const { getSupabaseAdmin, requireUser, handleApiError } = require('../lib/supabaseClient');
const { IMPORT_FIELDS, mergeForUpsert, normalizeEmpresa } = require('../lib/normalizeEmpresa');

const MAX_ROWS_PER_BATCH = 250;

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const user = await requireUser(req);
    const supabase = getSupabaseAdmin();
    const body = req.body || {};

    if (body.action === 'finalize') {
      const arquivo = String(body.arquivo || '').trim().slice(0, 255);
      if (!arquivo) return res.status(400).json({ error: 'Nome do arquivo obrigatório' });

      const { error } = await supabase.from('historico_importacoes').insert({
        arquivo,
        empresas_importadas: nonNegativeInteger(body.totalImportadas),
        empresas_atualizadas: nonNegativeInteger(body.totalAtualizadas),
        novos_cnpjs: nonNegativeInteger(body.totalNovos),
        usuario_id: user.id,
      });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return res.status(400).json({ error: 'Nenhuma linha recebida' });
    }
    if (body.rows.length > MAX_ROWS_PER_BATCH) {
      return res.status(413).json({ error: `Máximo de ${MAX_ROWS_PER_BATCH} linhas por lote` });
    }

    const unique = new Map();
    let ignoradas = 0;
    for (const row of body.rows) {
      const normalized = normalizeEmpresa(row);
      if (normalized.error) {
        ignoradas += 1;
        continue;
      }
      unique.set(normalized.value.cnpj, normalized.value);
    }

    const incoming = [...unique.values()];
    if (incoming.length === 0) {
      return res.status(400).json({ error: 'O lote não contém nenhum CNPJ válido' });
    }

    const cnpjs = incoming.map((row) => row.cnpj);
    const selectFields = ['cnpj', ...IMPORT_FIELDS].join(',');
    const { data: existingRows, error: selectError } = await supabase
      .from('empresas')
      .select(selectFields)
      .in('cnpj', cnpjs);
    if (selectError) throw selectError;

    const existingByCnpj = new Map((existingRows || []).map((row) => [row.cnpj, row]));
    const records = incoming.map((row) => mergeForUpsert(existingByCnpj.get(row.cnpj), row));
    const { error: upsertError } = await supabase
      .from('empresas')
      .upsert(records, { onConflict: 'cnpj', ignoreDuplicates: false, defaultToNull: false });
    if (upsertError) throw upsertError;

    const atualizadas = records.filter((row) => existingByCnpj.has(row.cnpj)).length;
    const novos = records.length - atualizadas;
    return res.status(200).json({
      processadas: records.length,
      novos,
      atualizadas,
      ignoradas: ignoradas + (body.rows.length - unique.size - ignoradas),
    });
  } catch (error) {
    return handleApiError(res, error, 'Erro em /api/importar-empresas');
  }
};
