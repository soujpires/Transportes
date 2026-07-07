const { CAMPOS_TRIAGEM } = require('./templates');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

async function callClaude(systemPrompt, userMessage) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// Classifica a primeira resposta do lead ao e-mail de prospecção
async function classificarPrimeiraResposta(corpoEmail) {
  const systemPrompt = `Você classifica respostas de transportadores rodoviários a um e-mail de prospecção de seguros (RCTR-C, RC-DC, RC-V, exigidos pela ANTT).

Responda APENAS com um JSON válido, sem nenhum texto antes ou depois, no formato:
{"intencao": "interessado" | "sem_interesse" | "duvida"}

- "interessado": o lead quer saber mais, pede cotação, passa contato, demonstra interesse.
- "sem_interesse": o lead pede para não ser contatado, diz que não tem interesse, ou similar.
- "duvida": o lead fez uma pergunta genérica antes de decidir (ex: "quem são vocês", "como funciona").`;

  const result = await callClaude(systemPrompt, corpoEmail);
  return extractJson(result);
}

// Extrai os campos estruturados da triagem a partir do texto do e-mail do lead
async function extrairCamposTriagem(corpoEmail, camposJaPreenchidos) {
  const systemPrompt = `Você extrai dados estruturados de e-mails de transportadores rodoviários respondendo a um questionário de triagem para seguro de frota (RCTR-C, RC-DC, RC-V).

Os campos possíveis são exatamente estes: ${CAMPOS_TRIAGEM.join(', ')}.

Campos já preenchidos anteriormente (não sobrescreva a menos que o e-mail traga uma correção explícita): ${JSON.stringify(camposJaPreenchidos)}

Tipos de cada campo:
- cnpj, nome_responsavel: texto
- transporta_carga_propria, transporta_carga_terceiros, possui_gerenciamento_risco, possui_apolice_ativa, teve_sinistro_2anos: booleano (true/false)
- n_caminhoes, viagens_mes, n_motoristas_proprios, n_motoristas_terceirizados, n_motoristas_agregados: número inteiro
- valor_medio_carga: número
- tipos_carga, rotas: array de objetos, ex: [{"tipo": "grãos", "percentual": 60}]

Responda APENAS com um JSON válido, sem texto antes ou depois, no formato:
{"campos_extraidos": { ... apenas os campos que você conseguiu identificar no e-mail ... }}

Se não conseguir identificar nenhum campo novo, responda {"campos_extraidos": {}}.`;

  const result = await callClaude(systemPrompt, corpoEmail);
  return extractJson(result);
}

module.exports = { classificarPrimeiraResposta, extrairCamposTriagem };
