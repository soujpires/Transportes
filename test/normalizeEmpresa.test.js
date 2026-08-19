const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidCnpj,
  mergeForUpsert,
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
    'Atividade Principal': 'Transporte rodoviário de carga',
    Funcionários: 28,
    'Capital Social': 'R$ 150.000,50',
    Email: 'CONTATO@EXEMPLO.COM.BR',
  });

  assert.equal(result.error, undefined);
  assert.equal(result.value.cnpj, '11222333000181');
  assert.equal(result.value.segmento, 'Transportadora');
  assert.equal(result.value.porte, 'Pequeno');
  assert.equal(result.value.uf, 'SP');
  assert.equal(result.value.cidade, 'Campinas');
  assert.equal(result.value.capital_social, 150000.5);
  assert.equal(result.value.email, 'contato@exemplo.com.br');
});

test('não inventa porte quando a planilha não informa dados suficientes', () => {
  const result = normalizeEmpresa({ CNPJ: '11.222.333/0001-81', 'Razão Social': 'Teste' });
  assert.equal(result.value.porte, null);
  assert.equal(result.value.idade_empresa_anos, null);
});

test('preserva valores antigos quando a nova linha deixa a célula vazia', () => {
  const merged = mergeForUpsert(
    { cnpj: '11222333000181', email: 'antigo@exemplo.com', cidade: 'Goiânia' },
    { cnpj: '11222333000181', email: null, cidade: 'Anápolis' }
  );
  assert.equal(merged.email, 'antigo@exemplo.com');
  assert.equal(merged.cidade, 'Anápolis');
});
