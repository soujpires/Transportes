const IMPORT_FIELDS = [
  'razao_social',
  'nome_fantasia',
  'segmento',
  'porte',
  'cidade',
  'uf',
  'colaboradores_faixa',
  'faturamento_faixa',
  'capital_social',
  'idade_empresa_anos',
  'nome_socio',
  'telefone',
  'celular',
  'email',
];

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function indexRow(row) {
  const indexed = {};
  for (const [key, value] of Object.entries(row || {})) {
    indexed[normalizeHeader(key)] = value;
  }
  return indexed;
}

function pick(indexed, aliases) {
  for (const alias of aliases) {
    const value = indexed[normalizeHeader(alias)];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return null;
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeCnpj(indexed) {
  let value = pick(indexed, ['cnpj', 'cnpj_cpf', 'documento', 'numero_cnpj']);
  let normalized = digits(value);

  if (!normalized) {
    const base = digits(pick(indexed, ['cnpj_basico', 'cnpj_base']));
    const ordem = digits(pick(indexed, ['cnpj_ordem', 'ordem']));
    const dv = digits(pick(indexed, ['cnpj_dv', 'digito_verificador', 'dv']));
    if (base || ordem || dv) normalized = base.padStart(8, '0') + ordem.padStart(4, '0') + dv.padStart(2, '0');
  }

  if (normalized.length > 0 && normalized.length < 14) normalized = normalized.padStart(14, '0');
  return normalized;
}

function isValidCnpj(cnpj) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculate = (length) => {
    let sum = 0;
    let weight = length - 7;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cnpj[i]) * weight;
      weight -= 1;
      if (weight === 1) weight = 9;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return calculate(12) === Number(cnpj[12]) && calculate(13) === Number(cnpj[13]);
}

function text(value, max = 500) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function normalizeMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100;
  let raw = String(value).replace(/R\$/gi, '').replace(/\s/g, '');
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  else raw = raw.replace(/,/g, '');
  raw = raw.replace(/[^0-9.-]/g, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  const br = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  const date = br ? new Date(`${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}T00:00:00Z`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function companyAge(value) {
  const date = normalizeDate(value);
  if (!date) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const beforeAnniversary = now.getUTCMonth() < date.getUTCMonth()
    || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
  if (beforeAnniversary) age -= 1;
  return age >= 0 && age < 500 ? age : null;
}

function normalizeEmail(value) {
  const email = text(value, 320)?.toLowerCase() || null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePhone(value) {
  const phone = digits(value);
  return phone.length >= 8 && phone.length <= 13 ? phone : null;
}

function normalizeSegment(raw, activity) {
  const combined = `${raw || ''} ${activity || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const activityDigits = digits(activity);
  if (/contabil|contabilidade|contador/.test(combined) || activityDigits.startsWith('69206')) return 'Parceiro Contábil';
  if (/transport|logistic|frete|carga/.test(combined) || activityDigits.startsWith('49302')) return 'Transportadora';
  return null;
}

function normalizeUf(value) {
  const raw = text(value, 80);
  if (!raw) return null;
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const states = {
    acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
    'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
    'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
    paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
    'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
  };
  if (states[normalized]) return states[normalized];
  return /^[a-z]{2}$/i.test(raw) ? raw.toUpperCase() : null;
}

function normalizePorte(raw, collaborators, revenue) {
  const value = String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/micro|mei/.test(value)) return 'Micro';
  if (/pequen/.test(value)) return 'Pequeno';
  if (/medi/.test(value)) return 'Médio';
  if (/grand/.test(value)) return 'Grande';

  const count = normalizeInteger(collaborators);
  if (count !== null) {
    if (count <= 9) return 'Micro';
    if (count <= 49) return 'Pequeno';
    if (count <= 99) return 'Médio';
    return 'Grande';
  }

  const amount = normalizeMoney(revenue);
  if (amount !== null) {
    if (amount <= 360000) return 'Micro';
    if (amount <= 4800000) return 'Pequeno';
    if (amount <= 300000000) return 'Médio';
    return 'Grande';
  }
  return null;
}

function normalizeEmpresa(row) {
  const indexed = indexRow(row);
  const cnpj = normalizeCnpj(indexed);
  if (!isValidCnpj(cnpj)) return { error: 'CNPJ inválido ou ausente' };

  const activity = pick(indexed, ['atividade_principal', 'descricao_cnae', 'cnae_principal', 'cnae_fiscal_descricao', 'cnae']);
  const collaborators = pick(indexed, ['colaboradores', 'numero_colaboradores', 'qtd_funcionarios', 'funcionarios', 'colaboradores_faixa']);
  const revenue = pick(indexed, ['faturamento', 'faturamento_anual', 'receita_anual', 'faturamento_faixa']);
  const rawSegment = pick(indexed, ['segmento', 'segmento_comercial']);
  const rawPorte = pick(indexed, ['porte', 'porte_empresa', 'porte_da_empresa']);
  const openingDate = pick(indexed, ['data_abertura', 'data_de_abertura', 'inicio_atividade', 'data_inicio_atividade']);

  return {
    value: {
      cnpj,
      razao_social: text(pick(indexed, ['razao_social', 'nome_empresarial', 'empresa', 'nome']), 300),
      nome_fantasia: text(pick(indexed, ['nome_fantasia', 'fantasia', 'titulo_estabelecimento']), 300),
      segmento: normalizeSegment(rawSegment, activity),
      porte: normalizePorte(rawPorte, collaborators, revenue),
      cidade: text(pick(indexed, ['cidade', 'municipio', 'nome_municipio']), 150),
      uf: normalizeUf(pick(indexed, ['uf', 'estado', 'sigla_uf'])),
      colaboradores_faixa: text(pick(indexed, ['colaboradores_faixa', 'faixa_colaboradores', 'faixa_funcionarios', 'numero_colaboradores']), 100),
      faturamento_faixa: text(pick(indexed, ['faturamento_faixa', 'faixa_faturamento', 'faturamento_estimado']), 100),
      capital_social: normalizeMoney(pick(indexed, ['capital_social', 'valor_capital_social'])),
      idade_empresa_anos: normalizeInteger(pick(indexed, ['idade_empresa_anos', 'idade_empresa'])) ?? companyAge(openingDate),
      nome_socio: text(pick(indexed, ['nome_socio', 'socio', 'socio_administrador', 'nome_do_socio']), 300),
      telefone: normalizePhone(pick(indexed, ['telefone', 'telefone_1', 'fone', 'ddd_telefone_1'])),
      celular: normalizePhone(pick(indexed, ['celular', 'telefone_2', 'whatsapp', 'ddd_telefone_2'])),
      email: normalizeEmail(pick(indexed, ['email', 'e_mail', 'correio_eletronico'])),
    },
  };
}

function mergeForUpsert(existing, incoming) {
  const record = { cnpj: incoming.cnpj };
  for (const field of IMPORT_FIELDS) {
    record[field] = incoming[field] ?? existing?.[field] ?? null;
  }
  record.updated_at = new Date().toISOString();
  return record;
}

module.exports = {
  IMPORT_FIELDS,
  isValidCnpj,
  mergeForUpsert,
  normalizeEmpresa,
  normalizeHeader,
};
