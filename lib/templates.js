// Rótulos legíveis de cada campo, usados tanto no e-mail de triagem
// quanto na notificação final para o Jefferson.
const FIELD_LABELS = {
  cnpj: 'CNPJ',
  nome_responsavel: 'Nome do Responsável',
  transporta_carga_propria: 'Transporta carga própria',
  transporta_carga_terceiros: 'Transporta carga de terceiros',
  tipos_carga: 'Carga(s) transportada(s) e % de cada',
  valor_medio_carga: 'Valor médio da carga por viagem',
  viagens_mes: 'Nº de viagens/mês',
  rotas: 'Principais rotas (UF/UF) e % de cada',
  n_motoristas_proprios: 'Nº de motoristas próprios',
  n_motoristas_terceirizados: 'Nº de motoristas terceirizados',
  n_motoristas_agregados: 'Nº de motoristas agregados',
  possui_gerenciamento_risco: 'Possui gerenciamento de risco',
  possui_apolice_ativa: 'Possui apólice ativa',
  teve_sinistro_2anos: 'Teve sinistro nos últimos 2 anos',
  n_caminhoes: 'Nº de caminhões',
};

// Ordem em que os campos aparecem no e-mail de triagem
const CAMPOS_TRIAGEM = [
  'cnpj',
  'nome_responsavel',
  'transporta_carga_propria',
  'transporta_carga_terceiros',
  'n_caminhoes',
  'tipos_carga',
  'valor_medio_carga',
  'viagens_mes',
  'rotas',
  'n_motoristas_proprios',
  'n_motoristas_terceirizados',
  'n_motoristas_agregados',
  'possui_gerenciamento_risco',
  'possui_apolice_ativa',
  'teve_sinistro_2anos',
];

function emailTriagemCompleta() {
  return `Olá,

Para darmos continuidade e já avaliarmos a melhor cobertura para sua operação, conforme exigido pela nova legislação da ANTT (Lei nº 14.599/2023 - RCTR-C, RC-DC e RC-V), preciso das informações abaixo:

CADASTRO TRANSPORTADOR
1. CNPJ:
2. Nome do responsável:
3. Transporta carga própria ou de terceiros?
4. Número de caminhões da frota:

SOBRE A CARGA
5. Qual(is) carga(s) transportada(s)? (informe o % de cada, se houver mais de uma)
6. Valor médio da carga por viagem:
7. Número de viagens/mês:
8. Principais rotas (UF/UF), com % de cada:

SOBRE A OPERAÇÃO
9. Número de motoristas próprios:
10. Número de motoristas terceirizados:
11. Número de motoristas agregados:
12. Possui gerenciamento de risco?
13. Possui apólice ativa atualmente?
14. Teve sinistro nos últimos 2 anos?

Assim que retornar, já consigo avançar com a análise da sua cotação.

Atenciosamente.`;
}

function emailCamposFaltantes(missingFields) {
  const linhas = missingFields
    .map((campo, i) => `${i + 1}. ${FIELD_LABELS[campo] || campo}:`)
    .join('\n');

  return `Olá,

Obrigado pelo retorno! Para concluir a análise, ainda preciso das seguintes informações:

${linhas}

Assim que enviar, já consigo finalizar o levantamento.

Atenciosamente.`;
}

function emailNotificacaoJefferson(lead) {
  const linhas = CAMPOS_TRIAGEM.map((campo) => {
    const valor = lead[campo];
    const label = FIELD_LABELS[campo];
    let valorFormatado = valor;
    if (valor === null || valor === undefined || valor === '') valorFormatado = '(não informado)';
    if (typeof valor === 'object') valorFormatado = JSON.stringify(valor);
    if (typeof valor === 'boolean') valorFormatado = valor ? 'Sim' : 'Não';
    return `${label}: ${valorFormatado}`;
  }).join('\n');

  return `Lead com triagem completa - pronto para sua decisão.

E-mail do lead: ${lead.email}

${linhas}

---
Acesse a tabela leads_caminhoneiros no Supabase (projeto LeadMap) para decidir o próximo passo:
enviar proposta padrão ou agendar reunião.`;
}

module.exports = {
  FIELD_LABELS,
  CAMPOS_TRIAGEM,
  emailTriagemCompleta,
  emailCamposFaltantes,
  emailNotificacaoJefferson,
};
