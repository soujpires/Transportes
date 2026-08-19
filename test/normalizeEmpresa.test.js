const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidCnpj,
  mergeForUpsert,
  normalizeCnae,
  normalizeEmpresa,
  normalizeHeader,
} = require('../lib/normalizeEmpresa');

test('normaliza cabeçalhos em português', () => {
  assert.equal(normalizeHeader('Razão Social'), 'razao_social');
  assert.equal(normalizeHeader('  CNPJ / CPF  '), 'cnpj_cpf');
});

test('valida os dígitos verificadores do CNPJ', () => {
  assert.equal(isValidCnpj('11222333000181'), true);
  assert.equal(isValidCnpj('11222333000182'), false);
  assert.equal(isValidCnpj('00000000000000'), false);
});

test('extrai e classifica uma transportadora', () => {
  const result = normalizeEmpresa({
    CNPJ: '11.222.333/0001-81',
    'Razão Social': 'Transportes Teste Ltda.',
    Estado: 'São Paulo',
    Município: 'Campinas',
    'CNAE Principal': '49.30-2/02',
    'Atividade Principal': '49.30-2/02 - Transporte rodoviário de carga, exceto produtos perigosos',
    Funcionários: 28,
    'Capital Social': 'R$ 150.000,50',
    Email: 'CONTATO@EXEMPLO.COM.BR',
  });

  assert.equal(result.error, undefined);
  assert.equal(result.value.cnpj, '11222333000181');
  assert.equal(result.value.segmento, 'Transportadora');
  assert.equal(result.value.cnae_principal, '4930202');
  assert.equal(result.value.descricao_cnae_principal, 'Transporte rodoviário de carga, exceto produtos perigosos');
  assert.equal(result.value.porte, 'Pequeno');
  assert.equal(result.value.uf, 'SP');
  assert.equal(result.value.cidade, 'Campinas');
  assert.equal(result.value.capital_social, 150000.5);
  assert.equal(result.value.email, 'contato@exemplo.com.br');
});

test('normaliza CNAE formatado, numérico e dentro da descrição', () => {
  assert.equal(normalizeCnae('49.30-2/02'), '4930202');
  assert.equal(normalizeCnae(4120400), '4120400');
  assert.equal(normalizeCnae('8112500 - Condomínios prediais'), '8112500');
  assert.equal(normalizeCnae('sem código'), null);
});

test('classifica segmentos pelo CNAE principal', () => {
  const casos = [
    ['41.20-4/00', 'Construção de edifícios', 'Construção Civil'],
    ['81.12-5/00', 'Condomínios prediais', 'Condomínio'],
    ['69.20-6/01', 'Atividades de contabilidade', 'Parceiro Contábil'],
    ['47.11-3/02', 'Comércio varejista de mercadorias', 'Outros'],
  ];

  for (const [cnae, descricao, segmento] of casos) {
    const result = normalizeEmpresa({
      CNPJ: '11.222.333/0001-81',
      'Razão Social': `Empresa ${segmento}`,
      'CNAE Principal': cnae,
      'Descrição CNAE Principal': descricao,
    });
    assert.equal(result.value.segmento, segmento);
  }
});

test('não inventa porte quando a planilha não informa dados suficientes', () => {
  const result = normalizeEmpresa({ CNPJ: '11.222.333/0001-81', 'Razão Social': 'Teste' });
  assert.equal(result.value.porte, null);
  assert.equal(result.value.idade_empresa_anos, null);
});

test('preserva valores antigos quando a nova linha deixa a célula vazia', () => {
  const merged = mergeForUpsert(
    { cnpj: '11222333000181', email: 'antigo@exemplo.com', cidade: 'Goiânia', cnae_principal: '4930202' },
    { cnpj: '11222333000181', email: null, cidade: 'Anápolis', cnae_principal: null }
  );
  assert.equal(merged.email, 'antigo@exemplo.com');
  assert.equal(merged.cidade, 'Anápolis');
  assert.equal(merged.cnae_principal, '4930202');
});
